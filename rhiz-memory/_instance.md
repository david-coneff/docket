# rhiz-memory — Docket Instance

**Protocol**: david-coneff/rhizome  
**Instance type**: Child repository **and** capability provider  
**Project**: Docket — knowledge-article approval workflow

---

## Session startup

When starting a session on docket under the Rhizome methodology:

1. `david-coneff/rhizome` — `protocol/core/rhiz-core.md` (always loaded)
2. `david-coneff/rhizome` — `protocol/core/rhiz-core.manifest.yaml` (select modules for task)
3. `rhiz-memory/_instance.md` (this file — project identity + the capability it provides)
4. `rhiz-memory/state/SESSION_HANDOFF.md` (current work context — create when first needed)

The Rhizome protocol specs and tooling live in `david-coneff/rhizome`. This
repository contains only project work and its own instance state under
`rhiz-memory/`.

---

## Project identity

Docket is a single-file HTML application for reviewing agent-proposed changes to
prose/knowledge articles: word-level track-changes diffs, a six-state
file-change resolution model, direct reviewer editing, and structured feedback
artifacts the agent reads on its next pass.

| Area | Directories | Description |
|------|-------------|-------------|
| App source | `src/` | Modular ESM + CSS (the source of truth) |
| Build | `build.mjs` | esbuild single-file roll-up → `docket.html` (rhiz-Partition modality B) |
| Proposal tooling | `docket-propose.py`, `tag-taxonomy.md` | Generate/validate `rhiz-proposals/*.proposal.json`; the tag vocabulary |
| Examples | `examples/rhiz-proposals/` | Sample proposal artifacts |
| Tests | `test/` | Diff + resolution unit tests |
| Roadmap | `roadmap.md` | Product roadmap (UI/UX direction) |

---

## Capability provided  →  rhizome CAP-001

Docket is the authoritative home of the **knowledge-article review** capability
that Rhizome's methodology depends on. It is registered in rhizome at
[`protocol/docs/ecosystem-dependencies.md`](https://github.com/david-coneff/rhizome) **CAP-001**;
this section is the provider side of that bidirectional link.

- **Capability**: human review of agent-proposed knowledge/prose changes —
  propose → lint → track-changes review → six-state resolve → structured feedback.
- **Authoritative contract (owned here)**: the proposal artifact format
  (`rhiz-proposals/*.proposal.json`), defined by `docket-propose.py` and the
  `examples/rhiz-proposals/` samples, plus the six resolution states and the tag
  taxonomy (`tag-taxonomy.md`). Rhizome **points at** this contract rather than
  copying it, so docket can evolve the format with its UI/UX without desyncing a
  rhizome-held copy.
- **What stayed in rhizome**: the *linting* half — `tools/rhiz-lint.py` and
  rhiz-State §6.8.6 (knowledge-base linkage integrity). Docket's browser-side
  lint gate (`src/lib/lint.js`) mirrors that tool.
- **Origin**: docket began life as `rhiz-review` inside the rhizome repo and was
  migrated out to its own repo (and renamed) on 2026-06-21.

When the proposal contract changes here, update rhizome CAP-001's pointer note if
the *boundary* of what docket owns changes (not for every format tweak — the
point of the pointer is that routine evolution needs no rhizome edit).

---

## Memory structure

| Category | Location |
|---|---|
| Governance | `rhiz-memory/_instance.md` (this file) |
| Decisions | `rhiz-memory/state/decisions.md` (create when needed) |
| Evidence | Cited inline in session handoffs / audits |
| Planning | `roadmap.md`, `rhiz-memory/state/SESSION_HANDOFF.md` |
| State | `rhiz-memory/state/SESSION_HANDOFF.md` |
| Risk / Debt | Named inline in audit findings (`rhiz-memory/audits/`) |
| Research | `rhiz-memory/audits/` |
| Assumptions | Named inline where made |
| Contracts | The proposal artifact format (`docket-propose.py`, `examples/rhiz-proposals/`) — see Capability provided above |
| Testing | `test/` |
| Dependencies | `package.json` (esbuild, lucide); rhizome `tools/rhiz-lint.py` (mirrored) |
| Documentation | `README.md`, `roadmap.md` |
| Oversight | `rhiz-memory/audits/` |
