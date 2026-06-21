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
      --article ARTICLE_PATH
      --after PROPOSED_PATH
      [--proposals-dir DIR]

  python docket-propose.py add-hunk
      --proposal PROPOSAL_ID
      --article ARTICLE_PATH
      --after PROPOSED_PATH
      [--index-context INDEX_PATH]
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
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_PROPOSALS_DIR = "rhiz-proposals"
DEFAULT_TAXONOMY = "tag-taxonomy.md"

VALID_STATUSES = {"open", "approved", "changes-requested", "rejected", "superseded"}
VALID_HUNK_STATUSES = {
    "pending", "approved", "approved-working-draft",
    "edited-commit-as-is", "edited-for-agent",
    "changes-requested", "rejected",
}
VALID_EDIT_MODES = {"commit-as-is", "agent-feedback"}

# rhiz-Core §1.2 — canonical hashing scope marker. The CID covers everything
# from the line *following* this marker through end-of-file.
HASH_SCOPE_MARKER = "CONTENT HASHING SCOPE START"


# ---------------------------------------------------------------------------
# Schema validation (no external deps)
# ---------------------------------------------------------------------------

def validate_proposal(obj: dict) -> list[str]:
    """Return a list of validation errors. Empty list = valid."""
    errors = []

    for field in ("id", "title", "created", "status", "hunks"):
        if field not in obj:
            errors.append(f"Missing required field: {field}")

    if "status" in obj and obj["status"] not in VALID_STATUSES:
        errors.append(f"Invalid status '{obj['status']}'. Must be one of: {VALID_STATUSES}")

    if "hunks" in obj:
        if not isinstance(obj["hunks"], list) or len(obj["hunks"]) == 0:
            errors.append("'hunks' must be a non-empty array")
        else:
            for i, hunk in enumerate(obj["hunks"]):
                prefix = f"hunks[{i}]"
                for field in ("id", "article", "before", "after", "status"):
                    if field not in hunk:
                        errors.append(f"{prefix}: missing required field '{field}'")
                if "status" in hunk and hunk["status"] not in VALID_HUNK_STATUSES:
                    errors.append(
                        f"{prefix}: invalid status '{hunk['status']}'. "
                        f"Must be one of: {VALID_HUNK_STATUSES}"
                    )
                if "comments" in hunk and not isinstance(hunk["comments"], list):
                    errors.append(f"{prefix}: 'comments' must be an array")

                mode = hunk.get("reviewer_edit_mode")
                if mode is not None and mode not in VALID_EDIT_MODES:
                    errors.append(
                        f"{prefix}: invalid reviewer_edit_mode '{mode}'. "
                        f"Must be one of: {VALID_EDIT_MODES}"
                    )
                if mode is not None and not hunk.get("reviewer_edit"):
                    errors.append(
                        f"{prefix}: reviewer_edit_mode set but reviewer_edit is empty"
                    )

    return errors


def new_hunk(hunk_id: str, article: str, index_ctx: str,
             before: str, after: str, tags: list[str] | None) -> dict:
    """Construct a hunk with the full docket field set."""
    return {
        "id": hunk_id,
        "article": article,
        "index_context": index_ctx or "",
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
    existing = [
        p.stem for p in pdir.glob(f"{prefix}*.proposal.json")
    ]
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
    """Agent notes may be inline (--agent-notes) or a file (--agent-notes-file)."""
    if getattr(args, "agent_notes_file", None):
        return read_content(args.agent_notes_file, "--agent-notes-file")
    return args.agent_notes or ""


def compute_cid(text: str) -> str | None:
    """SHA-256 of everything after the HASH_SCOPE_MARKER line (rhiz-Core §1.2).

    Returns the full hex digest, or None if the marker is absent.
    """
    lines = text.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if HASH_SCOPE_MARKER in line:
            scope = "".join(lines[i + 1:])
            return hashlib.sha256(scope.encode("utf-8")).hexdigest()
    return None


def infer_index_context(article_path: str, root: Path) -> str | None:
    """Walk up from the article's directory looking for a likely index file."""
    INDEX_NAMES = [
        "lessons-learned-synthesis.md",
        "index.md",
        "decision-records-index.md",
        "README.md",
    ]
    p = (root / article_path).resolve().parent
    while True:
        for name in INDEX_NAMES:
            candidate = p / name
            if candidate.exists():
                try:
                    return str(candidate.relative_to(root))
                except ValueError:
                    return str(candidate)
        parent = p.parent
        if parent == p:
            return None
        p = parent


# ---------------------------------------------------------------------------
# Sub-commands
# ---------------------------------------------------------------------------

def cmd_new(args, root: Path) -> int:
    pdir = proposals_dir(root, args.proposals_dir)
    proposal_id = next_proposal_id(pdir)

    before_content = read_content(args.article, "--article (before)")
    after_content  = read_content(args.after,   "--after (proposed)")
    index_ctx = args.index_context or infer_index_context(args.article, root)

    hunk = new_hunk("hunk-01", args.article, index_ctx, before_content,
                    after_content, args.tags)

    proposal = {
        "id": proposal_id,
        "title": args.title,
        "created": datetime.now(timezone.utc).isoformat(),
        "status": "open",
        "tags": args.proposal_tags or [],
        "agent_notes": resolve_agent_notes(args),
        "hunks": [hunk],
    }

    path = write_proposal(pdir, proposal)
    print(f"Created: {path}")
    return 0


def cmd_add_hunk(args, root: Path) -> int:
    pdir = proposals_dir(root, args.proposals_dir)
    path, proposal = load_proposal(pdir, args.proposal)

    if proposal["status"] not in ("open", "changes-requested"):
        print(
            f"Error: cannot add hunk to proposal with status '{proposal['status']}'",
            file=sys.stderr,
        )
        sys.exit(1)

    before_content = read_content(args.article, "--article (before)")
    after_content  = read_content(args.after,   "--after (proposed)")
    index_ctx = args.index_context or infer_index_context(args.article, root)

    seq = len(proposal["hunks"]) + 1
    hunk = new_hunk(f"hunk-{seq:02d}", args.article, index_ctx,
                    before_content, after_content, args.tags)
    proposal["hunks"].append(hunk)

    path = write_proposal(pdir, proposal)
    print(f"Updated: {path}  ({seq} hunks total)")
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
        hunk_count = len(obj.get("hunks", []))
        pending = sum(1 for h in obj.get("hunks", []) if h.get("status") == "pending")
        print(f"  {obj.get('id','?'):30s}  {s:20s}  {hunk_count} hunk(s), {pending} pending  — {obj.get('title','')}")
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
        print(f"Error: no '{HASH_SCOPE_MARKER}' marker found in {path}",
              file=sys.stderr)
        return 1
    cid_short = cid[:8]
    adopted = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\n") != "---":
        print("Error: file does not begin with a YAML frontmatter block ('---')",
              file=sys.stderr)
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
    p_new.add_argument("--agent-notes",      default="", help="Inline agent notes")
    p_new.add_argument("--agent-notes-file", default=None, help="Path to agent notes (overrides --agent-notes)")
    p_new.add_argument("--article",          required=True, help="Path to existing article (before state)")
    p_new.add_argument("--after",            required=True, help="Path to proposed article content")
    p_new.add_argument("--index-context",    default=None,  help="Path to parent index (auto-detected if omitted)")
    p_new.add_argument("--tags",             nargs="*", default=None, help="Hunk-level tags")
    p_new.add_argument("--proposal-tags",    nargs="*", default=None, help="Proposal-level tags")
    p_new.add_argument("--proposals-dir",    default=None)

    # add-hunk
    p_add = sub.add_parser("add-hunk", help="Add a hunk to an existing open proposal")
    p_add.add_argument("--proposal",      required=True, help="Proposal ID")
    p_add.add_argument("--article",       required=True)
    p_add.add_argument("--after",         required=True)
    p_add.add_argument("--index-context", default=None)
    p_add.add_argument("--tags",          nargs="*", default=None, help="Hunk-level tags")
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
    p_lst.add_argument("--status",        default="all",
                       choices=["open", "changes-requested", "approved", "rejected", "all"])
    p_lst.add_argument("--proposals-dir", default=None)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 1

    root = Path(args.root).resolve() if args.root else find_repo_root(Path.cwd())

    dispatch = {
        "new":            cmd_new,
        "add-hunk":       cmd_add_hunk,
        "validate":       cmd_validate,
        "list":           cmd_list,
        "stamp-taxonomy": cmd_stamp_taxonomy,
    }
    return dispatch[args.command](args, root)


if __name__ == "__main__":
    sys.exit(main())
