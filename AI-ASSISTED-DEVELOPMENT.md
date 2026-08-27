# AI-assisted development files

docket was developed with AI assistance under a methodology called **rhizome**
(governance, doc-linting, and session-memory tooling shared across several of the
author's projects). docket runs rhizome's **two-branch model**
(`rhizome-protocol:protocol/docs/rhiz-child-repo-convention.md#5.5`): **`rhiz-working`**
carries the full tooling and is where all development happens; **`main`** is generated
from it by mechanically stripping every rhizome/AI file and carries none of it.

**If you just want clean code: you're probably already looking at it.** `main` is
this repo's default branch, and it never carries any of the files below — nothing to
run, nothing to download differently. This file only matters if you're on
`rhiz-working` (or a branch forked from it) and want a temporarily clean local copy
without switching to `main`.

## What's on `rhiz-working` and not on `main`

| Path | What it is |
|---|---|
| `.rhiz-binding.json` | Pins to the shared `rhizome-protocol` tooling repo and this project's own `docket-memory` notes repo. |
| `.rhiz-artifacts.json` | The registry below — declares exactly this list, with a reason per row. Read by `rhiz promote` when generating `main`. |
| `.rhiz-lint.json` | Config for `rhiz-lint`, used to check this repo's own knowledge roots for consistency. Checked on `rhiz-working` pre-promotion; `main`'s copy is proven byte-identical (see "Why `main` doesn't need its own configs" below), so nothing is lost by not carrying the config itself. |
| `.rhiz-orphans.json` | Config for rhiz's orphan-detection check. Same reasoning as `.rhiz-lint.json`. |
| `tools/rhiz.py` | A bootstrap/dispatcher script that fetches and forwards to the real tooling in `rhizome-protocol`. Also the entry point for Claude Code session hooks, if `.claude/` is present. |
| `.claude/` | Claude Code configuration (hooks, custom commands), if present. |
| `.github/workflows/governance.yml` | CI that runs the rhizome tooling against this repo and its sibling notes repo, and verifies `main` stays in sync with this list (see below). Only ever triggers on `rhiz-working`, never `main`. |
| `.gitattributes` | Marks the files in this list `export-ignore`, so a ZIP/tarball/archive download of `rhiz-working` specifically (not `main`) already excludes them. |
| `tools/strip-docket-artifacts.py` | A one-shot local purge script, for someone who wants a clean working copy of `rhiz-working` itself without switching to `main`. |
| This file | — |

## Why `main` doesn't need its own configs

`rhiz promote` guarantees that everything on `main` outside the list above is
**byte-identical** to `rhiz-working` — not just similar, the exact same bytes. So
anything already checked against `rhiz-working` (rhiz-lint, orphan checks, tests,
review) is transitively still true of `main`'s copy. `governance.yml` verifies this
guarantee on every push to `rhiz-working` and again on a weekly schedule, so a
violation — a stripped file leaking back in, or `main` diverging some other way — is
a CI failure, not a silent possibility.
