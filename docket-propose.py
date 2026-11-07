#!/usr/bin/env python3
"""
docket-propose: generate and validate docket proposal artifacts.

A proposal is a JSON file in the rhiz-proposals/ directory of a governed
project. This tool constructs and validates proposals so that the agent
only needs to supply content, not JSON structure.

Usage:
  python docket-propose.py new
      --title TITLE
      --agent-notes NOTES
      --path FILE_PATH
      --after PROPOSED_PATH
      [--rationale TEXT]
      [--tags TAG ...]
      [--proposal-tags TAG ...]
      [--weight trivial|standard|significant]   (default standard)
      [--proposals-dir DIR]

  python docket-propose.py add-file
      --proposal PROPOSAL_ID
      --path FILE_PATH
      --after PROPOSED_PATH
      [--rationale TEXT]
      [--tags TAG ...]
      [--proposals-dir DIR]

  python docket-propose.py validate
      --proposal PROPOSAL_ID
      [--proposals-dir DIR]

  python docket-propose.py list
      [--status open|changes-requested|approved|all]
      [--proposals-dir DIR]

  python docket-propose.py stamp-taxonomy
      [--file path/to/tag-taxonomy.md]

Content fields (before/after/agent-notes) are supplied as file paths so the
agent never has to shell-escape multi-KB article bodies.

Schema: new, add-file and validate check the proposal against
schemas/proposal.schema.json beside this tool (the canonical format).

Tags: new, add-file and validate print a warning (exit code unchanged) for each
tag the active taxonomy does not list: rhiz-proposals/tag-taxonomy.md when it
exists, else the tag-taxonomy.md beside this tool. Freeform tags are accepted.

Exit codes:
  0  success
  1  validation error or missing input
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_PROPOSALS_DIR = "rhiz-proposals"
DEFAULT_TAXONOMY = "tag-taxonomy.md"

# The field vocabularies (statuses, weights, edit modes, comment roles) live in
# schemas/proposal.schema.json; validate_proposal reads them from there.
# Roadmap DP-1: how much of the lifecycle a proposal takes. The agent sets it; the reviewer
# may override it in the UI (which keeps the agent's value in `weight_agent`).
DEFAULT_WEIGHT = "standard"

# rhiz-Core §1.2 — canonical hashing scope marker.
HASH_SCOPE_MARKER = "CONTENT HASHING SCOPE START"


# ---------------------------------------------------------------------------
# Tag taxonomy (roadmap §2 "Tag validation": warn, never error; freeform tags
# are always accepted)
# ---------------------------------------------------------------------------

def active_taxonomy(pdir: Path) -> Path | None:
    """The project-local `<proposals dir>/tag-taxonomy.md` when it exists, else
    the default beside this tool; the same choice the UI makes."""
    for cand in (pdir / DEFAULT_TAXONOMY, Path(__file__).resolve().parent / DEFAULT_TAXONOMY):
        if cand.is_file():
            return cand
    return None


def taxonomy_tags(text: str) -> set[str]:
    """Tag ids from the taxonomy's fenced ```yaml Machine Form, read by the same
    shallow structure src/lib/taxonomy.js parses (a category is `- id:` at
    indent <= 4; its tags are `- id:` lines under its `tags:` key)."""
    start = text.find("```yaml\n")
    if start < 0:
        return set()
    end = text.find("\n```", start + 8)
    block = text[start + 8: end if end >= 0 else len(text)]
    tags: set[str] = set()
    in_tags = False
    seen_category = False
    for raw in block.split("\n"):
        if not raw.strip():
            continue
        indent = len(raw) - len(raw.lstrip())
        line = raw.strip()
        if line.startswith("- id:") and indent <= 4:
            seen_category, in_tags = True, False
        elif not seen_category:
            continue
        elif line.startswith("tags:"):
            in_tags = True
        elif line.startswith("mutual-exclusion-groups:"):
            in_tags = False
        elif in_tags and line.startswith("- id:"):
            tags.add(line[5:].strip())
    return tags


def warn_unknown_tags(proposal: dict, pdir: Path) -> int:
    """Print one warning per tag (proposal-level or per file change) that the
    active taxonomy does not list. Returns how many were printed; never fails."""
    tax = active_taxonomy(pdir)
    known = taxonomy_tags(tax.read_text(encoding="utf-8")) if tax else set()
    if not known:
        print(f"Warning: no taxonomy tags could be read "
              f"({tax or 'no tag-taxonomy.md found'}); tags not checked", file=sys.stderr)
        return 0
    n = 0
    places = [("proposal", proposal.get("tags") or [])]
    places += [(fc.get("id", "?"), fc.get("tags") or []) for fc in proposal.get("file_changes") or []]
    for where, tags in places:
        for tag in tags:
            if tag not in known:
                print(f"Warning: {where}: tag '{tag}' is not in the active taxonomy ({tax}); "
                      f"accepted as freeform", file=sys.stderr)
                n += 1
    return n


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "proposal.schema.json"

# The keywords the evaluator below implements. A schema that uses any other one is refused
# rather than half-checked (annotation keywords are skipped).
SCHEMA_KEYWORDS = {"type", "enum", "required", "properties", "items", "minItems",
                   "minLength", "$ref", "if", "then"}
SCHEMA_ANNOTATIONS = {"$schema", "$id", "$defs", "$comment", "title", "description"}
JSON_TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "null": lambda v: v is None,
}


def load_schema(path: Path = SCHEMA_PATH) -> dict:
    if not path.exists():
        print(f"Error: proposal schema not found: {path} (ships beside this tool)", file=sys.stderr)
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def schema_errors(value, node: dict, root: dict, where: str = "", key: str = "") -> list[str]:
    """Check `value` against schema `node`: a minimal JSON Schema (2020-12) evaluator for
    the keywords in SCHEMA_KEYWORDS. `where` is the JSON path for messages, `key` the name
    of the property being checked."""
    unknown = set(node) - SCHEMA_KEYWORDS - SCHEMA_ANNOTATIONS
    if unknown:
        raise ValueError(f"proposal schema uses unsupported keyword(s) {sorted(unknown)} at {where or '/'}")
    at = f"{where}: " if where else ""
    errors: list[str] = []
    if "$ref" in node:
        ref = node["$ref"]
        if not ref.startswith("#/$defs/"):
            raise ValueError(f"proposal schema: only local #/$defs/ refs are supported, got {ref}")
        errors += schema_errors(value, root["$defs"][ref[len("#/$defs/"):]], root, where, key)
    if "enum" in node and value not in node["enum"]:
        allowed = ", ".join("null" if v is None else str(v) for v in node["enum"])
        parent = where[: -len(key) - 1] if key and where.endswith(f".{key}") else ""
        lead = f"{parent}: invalid" if parent else "Invalid"
        errors.append(f"{lead} {key or where or 'value'} '{value}'. Must be one of: {allowed}")
        return errors
    if "type" in node:
        types = node["type"] if isinstance(node["type"], list) else [node["type"]]
        if not any(JSON_TYPES[t](value) for t in types):
            errors.append(f"{where or 'proposal'}: must be {' or '.join(types)}")
            return errors
    if isinstance(value, dict):
        for field in node.get("required", []):
            if field not in value:
                errors.append(f"{at}missing required field '{field}'" if where
                              else f"Missing required field: {field}")
        for name, sub in node.get("properties", {}).items():
            if name in value:
                child = f"{where}.{name}" if where else name
                errors += schema_errors(value[name], sub, root, child, name)
        if "if" in node and not schema_errors(value, node["if"], root, where, key):
            errors += schema_errors(value, node.get("then", {}), root, where, key)
    if isinstance(value, list):
        if len(value) < node.get("minItems", 0):
            errors.append(f"'{where}' must be a non-empty array" if node["minItems"] == 1
                          else f"'{where}' must have at least {node['minItems']} items")
        if "items" in node:
            for i, item in enumerate(value):
                errors += schema_errors(item, node["items"], root, f"{where}[{i}]")
    if isinstance(value, str) and len(value) < node.get("minLength", 0):
        errors.append(f"{where}: must not be empty")
    return errors


def validate_proposal(obj: dict, schema: dict | None = None) -> list[str]:
    """Return a list of validation errors against schemas/proposal.schema.json. Empty = valid."""
    schema = schema if schema is not None else load_schema()
    return schema_errors(obj, schema, schema)


def new_file_change(file_id: str, path: str, rationale: str,
                    before: str, after: str, tags: list[str] | None) -> dict:
    """Construct a file change entry."""
    return {
        "id": file_id,
        "path": path,
        "rationale": rationale or "",
        "before": before,
        "after": after,
        "status": "pending",
        "tags": tags or [],
        "reviewer_edit": None,
        "reviewer_edit_mode": None,
        "reviewer_edit_notes": None,
        "comments": [],
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def find_repo_root(start: Path) -> Path:
    candidate = start.resolve()
    while True:
        if (candidate / ".git").exists():
            return candidate
        parent = candidate.parent
        if parent == candidate:
            return start.resolve()
        candidate = parent


def proposals_dir(base: Path, override: str | None) -> Path:
    d = base / (override or DEFAULT_PROPOSALS_DIR)
    d.mkdir(parents=True, exist_ok=True)
    return d


def next_proposal_id(pdir: Path) -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prefix = f"prop-{today}-"
    existing = [p.stem for p in pdir.glob(f"{prefix}*.proposal.json")]
    seq = len(existing) + 1
    return f"{prefix}{seq:03d}"


def load_proposal(pdir: Path, proposal_id: str) -> tuple[Path, dict]:
    path = pdir / f"{proposal_id}.proposal.json"
    if not path.exists():
        print(f"Error: proposal file not found: {path}", file=sys.stderr)
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return path, json.load(f)


def write_proposal(pdir: Path, obj: dict) -> Path:
    errors = validate_proposal(obj)
    if errors:
        print("Validation errors:", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        sys.exit(1)
    path = pdir / f"{obj['id']}.proposal.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


def read_content(path_str: str, label: str) -> str:
    p = Path(path_str)
    if not p.exists():
        print(f"Error: {label} file not found: {p}", file=sys.stderr)
        sys.exit(1)
    return p.read_text(encoding="utf-8")


def resolve_agent_notes(args) -> str:
    if getattr(args, "agent_notes_file", None):
        return read_content(args.agent_notes_file, "--agent-notes-file")
    return args.agent_notes or ""


def compute_cid(text: str) -> str | None:
    """SHA-256 of everything after the HASH_SCOPE_MARKER line (rhiz-Core §1.2)."""
    lines = text.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if HASH_SCOPE_MARKER in line:
            scope = "".join(lines[i + 1:])
            return hashlib.sha256(scope.encode("utf-8")).hexdigest()
    return None


# ---------------------------------------------------------------------------
# Sub-commands
# ---------------------------------------------------------------------------

def cmd_new(args, root: Path) -> int:
    pdir = proposals_dir(root, args.proposals_dir)
    proposal_id = next_proposal_id(pdir)

    before_content = read_content(args.path, "--path (before state)")
    after_content  = read_content(args.after, "--after (proposed)")

    fc = new_file_change(
        "file-01", args.path, args.rationale or "",
        before_content, after_content, args.tags,
    )

    proposal = {
        "id": proposal_id,
        "title": args.title,
        "created": datetime.now(timezone.utc).isoformat(),
        "status": "open",
        "tags": args.proposal_tags or [],
        "weight": args.weight,
        "agent_notes": resolve_agent_notes(args),
        "file_changes": [fc],
    }

    path = write_proposal(pdir, proposal)
    print(f"Created: {path}")
    warn_unknown_tags(proposal, pdir)
    return 0


def cmd_add_file(args, root: Path) -> int:
    pdir = proposals_dir(root, args.proposals_dir)
    path, proposal = load_proposal(pdir, args.proposal)

    if proposal["status"] not in ("open", "changes-requested"):
        print(
            f"Error: cannot add file to proposal with status '{proposal['status']}'",
            file=sys.stderr,
        )
        sys.exit(1)

    before_content = read_content(args.path, "--path (before state)")
    after_content  = read_content(args.after, "--after (proposed)")

    seq = len(proposal["file_changes"]) + 1
    fc = new_file_change(
        f"file-{seq:02d}", args.path, args.rationale or "",
        before_content, after_content, args.tags,
    )
    proposal["file_changes"].append(fc)

    path = write_proposal(pdir, proposal)
    print(f"Updated: {path}  ({seq} file(s) total)")
    warn_unknown_tags(proposal, pdir)
    return 0


def cmd_validate(args, root: Path) -> int:
    pdir = proposals_dir(root, args.proposals_dir)
    _, proposal = load_proposal(pdir, args.proposal)
    errors = validate_proposal(proposal)
    warn_unknown_tags(proposal, pdir)
    if errors:
        print(f"Validation FAILED ({len(errors)} error(s)):")
        for e in errors:
            print(f"  {e}")
        return 1
    print(f"Validation passed: {args.proposal}")
    return 0


def cmd_list(args, root: Path) -> int:
    pdir = proposals_dir(root, args.proposals_dir)
    files = sorted(pdir.glob("*.proposal.json"))
    if not files:
        print("No proposals found.")
        return 0

    status_filter = args.status if args.status != "all" else None
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                obj = json.load(fh)
        except (json.JSONDecodeError, OSError) as e:
            print(f"  [UNREADABLE] {f.name}: {e}")
            continue
        s = obj.get("status", "?")
        if status_filter and s != status_filter:
            continue
        fc_count = len(obj.get("file_changes", []))
        pending = sum(1 for fc in obj.get("file_changes", []) if fc.get("status") == "pending")
        print(f"  {obj.get('id','?'):30s}  {s:20s}  {fc_count} file(s), {pending} pending  — {obj.get('title','')}")
    return 0


def cmd_stamp_taxonomy(args, root: Path) -> int:
    """Compute the CID over the hashing scope and write cid-short + adopted
    into the YAML frontmatter in place (rhiz-Core §1.2, §1.6)."""
    path = Path(args.file) if args.file else (root / DEFAULT_TAXONOMY)
    if not path.exists():
        print(f"Error: taxonomy file not found: {path}", file=sys.stderr)
        return 1

    text = path.read_text(encoding="utf-8")
    cid = compute_cid(text)
    if cid is None:
        print(f"Error: no '{HASH_SCOPE_MARKER}' marker found in {path}", file=sys.stderr)
        return 1
    cid_short = cid[:8]
    adopted = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\n") != "---":
        print("Error: file does not begin with a YAML frontmatter block ('---')", file=sys.stderr)
        return 1
    close = None
    for i in range(1, len(lines)):
        if lines[i].rstrip("\n") == "---":
            close = i
            break
    if close is None:
        print("Error: unterminated YAML frontmatter block", file=sys.stderr)
        return 1

    def replace_field(block, key, value):
        for i in range(1, close):
            if block[i].lstrip().startswith(f"{key}:"):
                block[i] = f"{key}: {value}\n"
                return True
        return False

    if not replace_field(lines, "cid-short", cid_short):
        lines.insert(close, f"cid-short: {cid_short}\n"); close += 1
    if not replace_field(lines, "adopted", adopted):
        lines.insert(close, f"adopted: {adopted}\n"); close += 1

    path.write_text("".join(lines), encoding="utf-8")
    print(f"Stamped {path}")
    print(f"  cid-short: {cid_short}")
    print(f"  adopted:   {adopted}")
    return 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="docket-propose: generate and validate docket proposal artifacts"
    )
    parser.add_argument("--root", default=None, help="Repository root (default: auto-detect)")
    sub = parser.add_subparsers(dest="command")

    # new
    p_new = sub.add_parser("new", help="Create a new proposal")
    p_new.add_argument("--title",            required=True)
    p_new.add_argument("--agent-notes",      default="", help="Inline agent notes (commit message)")
    p_new.add_argument("--agent-notes-file", default=None, help="Path to agent notes file (overrides --agent-notes)")
    p_new.add_argument("--path",             required=True, help="Path to the file being changed (current state on disk)")
    p_new.add_argument("--after",            required=True, help="Path to the proposed file content")
    p_new.add_argument("--rationale",        default="", help="Why this specific file is being changed")
    p_new.add_argument("--tags",             nargs="*", default=None, help="File-change-level tags")
    p_new.add_argument("--proposal-tags",    nargs="*", default=None, help="Proposal-level tags")
    p_new.add_argument("--weight",           choices=load_schema()["$defs"]["weight"]["enum"],
                       default=DEFAULT_WEIGHT,
                       help="DP-1 weight tier: trivial, standard (default) or significant")
    p_new.add_argument("--proposals-dir",    default=None)

    # add-file
    p_add = sub.add_parser("add-file", help="Add a file change to an existing open proposal")
    p_add.add_argument("--proposal",      required=True, help="Proposal ID")
    p_add.add_argument("--path",          required=True, help="Path to the file being changed")
    p_add.add_argument("--after",         required=True, help="Path to the proposed file content")
    p_add.add_argument("--rationale",     default="", help="Why this specific file is being changed")
    p_add.add_argument("--tags",          nargs="*", default=None, help="File-change-level tags")
    p_add.add_argument("--proposals-dir", default=None)

    # stamp-taxonomy
    p_stamp = sub.add_parser("stamp-taxonomy", help="Compute and stamp the CID hash on a tag taxonomy file")
    p_stamp.add_argument("--file", default=None, help=f"Path to taxonomy file (default: {DEFAULT_TAXONOMY})")

    # validate
    p_val = sub.add_parser("validate", help="Validate a proposal file")
    p_val.add_argument("--proposal",      required=True)
    p_val.add_argument("--proposals-dir", default=None)

    # list
    p_lst = sub.add_parser("list", help="List proposals")
    p_lst.add_argument("--status", default="all",
                       choices=["open", "changes-requested", "approved", "rejected", "all"])
    p_lst.add_argument("--proposals-dir", default=None)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 1

    root = Path(args.root).resolve() if args.root else find_repo_root(Path.cwd())

    dispatch = {
        "new":            cmd_new,
        "add-file":       cmd_add_file,
        "validate":       cmd_validate,
        "list":           cmd_list,
        "stamp-taxonomy": cmd_stamp_taxonomy,
    }
    return dispatch[args.command](args, root)


if __name__ == "__main__":
    sys.exit(main())
