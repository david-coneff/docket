# docket

Knowledge article approval workflow UI. Reviews agent-proposed changes to prose
articles with word-level track-changes diffs, six-state hunk resolution, direct
reviewer editing, and structured feedback artifacts for the agent.

## Quick start

```sh
npm install
npm run dev      # Vite dev server at http://localhost:5173
npm test         # Vitest unit tests
npm run build    # Production build → dist/
```

Open the app in Chromium, select a working directory (the root of the governed
repo), and the proposal queue loads automatically from `rhiz-proposals/`.

## Creating proposals

Agents use `docket-propose.py` to generate and validate proposal artifacts:

```sh
# New proposal (before/after supplied as file paths)
python docket-propose.py new \
  --title "Add F-WIN-05: satellite focus race" \
  --article path/to/article.md \
  --after path/to/proposed.md \
  --tags hypothetical-fix needs-user-test

# Add a hunk to an existing open proposal
python docket-propose.py add-hunk \
  --proposal prop-2026-06-21-001 \
  --article path/to/other.md \
  --after path/to/proposed-other.md

# Validate a proposal file
python docket-propose.py validate --proposal prop-2026-06-21-001

# List proposals
python docket-propose.py list --status open
```

Proposals are JSON files committed to `rhiz-proposals/` in the governed repo.

## Tag taxonomy

The default tag vocabulary is in `tag-taxonomy.md` at repo root. A governed
project may override it by placing its own `tag-taxonomy.md` in its
`rhiz-proposals/` directory.

To re-stamp the CID hash after editing the taxonomy:

```sh
python docket-propose.py stamp-taxonomy
```

## Architecture

- **Build**: Vite 5, zero runtime dependencies, `?raw` import for taxonomy bundling
- **UI**: Vanilla JS ES modules, `initX(deps)` dependency-injection pattern
- **Storage**: File System Access API (`showDirectoryPicker`) + localStorage for
  working directory persistence; OPFS for unsaved Edit-tab draft state
- **Diff**: Mixed-granularity LCS engine — word-level for prose, line-level for
  code fences
- **Resolution states**: approved, approved-working-draft, edited-commit-as-is,
  edited-for-agent, changes-requested, rejected
- **Panels**: Queue | Review (Composed / Review mode / Edit ✎ tabs) | Context + Feedback
- **Proposal artifacts**: `rhiz-proposals/<id>.proposal.json` in governed repos
- **Static lint**: browser-side lint gate mirrors `rhiz-lint.py`
  (in [david-coneff/rhizome](https://github.com/david-coneff/rhizome))

## Governed child repos

See `rhiz-child-repo-convention.md` in
[david-coneff/rhizome](https://github.com/david-coneff/rhizome) for how child
repos reference the rhizome protocol and the `rhiz-proposals/` directory
convention.
