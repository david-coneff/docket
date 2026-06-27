# docket

Knowledge article approval workflow UI. Reviews agent-proposed changes to prose
articles with word-level track-changes diffs, six-state file-change resolution,
direct reviewer editing, and structured feedback artifacts for the agent.

## Quick start

```sh
npm install
npm run build    # roll src/ up into the single-file docket.html (one command)
npm run dev      # same build in --watch mode (rebuild on change)
npm test         # unit tests
```

`npm run build` runs `node build.mjs`: esbuild bundles + minifies the modular
`src/` tree and inlines it into one self-contained **`docket.html`** that opens
straight from `file://` with zero network. There is no dev server and no config
file — a single non-interactive command an AI agent or a human runs identically
(rhiz-Partition modality B / DS-002).

`docket.html` is a **generated build output, not source** — only `src/` is
canonical. Open the built `docket.html` in Chromium, select a working directory
(the root of the governed repo), and the proposal queue loads automatically from
`rhiz-proposals/`.

## Creating proposals

Agents use `docket-propose.py` to generate and validate proposal artifacts:

```sh
# New proposal (before/after supplied as file paths)
python docket-propose.py new \
  --title "Add F-WIN-05: satellite focus race" \
  --path path/to/article.md \
  --after path/to/proposed.md \
  --rationale "Closes gap identified in audit; aligns with F-WIN-04 invariant." \
  --tags hypothetical-fix needs-user-test

# Add a file change to an existing open proposal
python docket-propose.py add-file \
  --proposal prop-2026-06-21-001 \
  --path path/to/other.md \
  --after path/to/proposed-other.md \
  --rationale "Supporting change required for consistency."

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

- **Build**: esbuild single-file roll-up (`build.mjs`) → `docket.html`; the
  taxonomy is bundled via esbuild's `.md` text loader (the `?raw` equivalent)
- **UI**: Vanilla JS ES modules, `initX(deps)` dependency-injection pattern
- **Storage**: File System Access API (`showDirectoryPicker`) + localStorage for
  working directory persistence; OPFS for unsaved Edit-tab draft state
- **Diff**: Mixed-granularity LCS engine — word-level for prose, line-level for
  code fences
- **Resolution states**: approved, approved-working-draft, edited-commit-as-is,
  edited-for-agent, changes-requested, rejected
- **Panels**: Queue | Review (file list + Composed / Review / Edit ✎ tabs) | Context + Feedback
- **Proposal model**: each proposal is a "commit" containing one or more `file_changes`;
  file-list pane shows all affected files with per-file status icons; bulk apply
  convenience aliases the same resolution across all pending files
- **Multi-select dispose**: queue items show a ready indicator (green dashed border + ✓ badge)
  when all file changes are resolved; select multiple and dispose in one action
- **Proposal artifacts**: `rhiz-proposals/<id>.proposal.json` in governed repos
- **Static lint**: browser-side lint gate mirrors `rhiz-lint.py`
  (in [david-coneff/rhizome](https://github.com/david-coneff/rhizome))

## Governed child repos

See `rhiz-child-repo-convention.md` in
[david-coneff/rhizome](https://github.com/david-coneff/rhizome) for how child
repos reference the rhizome protocol and the `rhiz-proposals/` directory
convention.
