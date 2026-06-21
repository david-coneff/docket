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

VALID_STATUSES = {"open", "approved", "changes-requested", "rejected", "superseded"}
VALID_FILE_STATUSES = {
    "pending", "approved", "approved-working-draft",
    "edited-commit-as-is", "edited-for-agent",
    "changes-requested", "rejected",
}
VALID_EDIT_MODES = {"commit-as-is", "agent-feedback"}

# rhiz-Core §1.2 — canonical hashing scope marker.
HASH_SCOPE_MARKER = "CONTENT HASHING SCOPE START"


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

def validate_proposal(obj: dict) -> list[str]:
    """Return a list of validation errors. Empty list = valid."""
    errors = []

    for field in ("id", "title", "created", "status", "file_changes"):
        if field not in obj:
            errors.append(f"Missing required field: {field}")

    if "status" in obj and obj["status"] not in VALID_STATUSES:
        errors.append(f"Invalid status '{obj['status']}'. Must be one of: {VALID_STATUSES}")

    if "file_changes" in obj:
        if not isinstance(obj["file_changes"], list) or len(obj["file_changes"]) == 0:
            errors.append("'file_changes' must be a non-empty array")
        else:
            for i, fc in enumerate(obj["file_changes"]):
                prefix = f"file_changes[{i}]"
                for field in ("id", "path", "before", "after", "status"):
                    if field not in fc:
                        errors.append(f"{prefix}: missing required field '{field}'")
                if "status" in fc and fc["status"] not in VALID_FILE_STATUSES:
                    errors.append(
                        f"{prefix}: invalid status '{fc['status']}'. "
                        f"Must be one of: {VALID_FILE_STATUSES}"
                    )
                if "comments" in fc and not isinstance(fc["comments"], list):
                    errors.append(f"{prefix}: 'comments' must be an array")
                mode = fc.get("reviewer_edit_mode")
                if mode is not None and mode not in VALID_EDIT_MODES:
                    errors.append(
                        f"{prefix}: invalid reviewer_edit_mode '{mode}'. "
                        f"Must be one of: {VALID_EDIT_MODES}"
                    )
                if mode is not None and not fc.get("reviewer_edit"):
                    errors.append(
                        f"{prefix}: reviewer_edit_mode set but reviewer_edit is empty"
                    )

    return errors


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
        "agent_notes": resolve_agent_notes(args),
        "file_changes": [fc],
    }

    path = write_proposal(pdir, proposal)
    print(f"Created: {path}")
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
    return 0


def cmd_validate(args, root: Path) -> int:
    pdir = proposals_dir(root, args.proposals_dir)
    _, proposal = load_proposal(pdir, args.proposal)
    errors = validate_proposal(proposal)
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
