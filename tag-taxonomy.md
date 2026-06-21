---
cid-short: 5f5fbc37
adopted: 2026-06-21T19:33:58+00:00
schema-version: "1"
---

# docket Tag Taxonomy

**Canonical default taxonomy for docket.**  
Projects may override by placing a `tag-taxonomy.md` in their
`rhiz-proposals/` directory. The UI loads the project-local file if
present; otherwise falls back to this file.

This file follows rhiz-Core §1 identity governance. The `cid-short`
and `adopted` fields in the YAML front matter are excluded from the
hash (they are above the `CONTENT HASHING SCOPE START` marker). The
hash covers everything from the marker through end-of-file.

To compute and stamp the hash on first formal adoption, or after any
content change:
```
python docket-propose.py stamp-taxonomy [--file path/to/tag-taxonomy.md]
```
This updates `cid-short` and `adopted` in the front matter in-place.

=====================================================================
CONTENT HASHING SCOPE START
=====================================================================

## Tag Categories

Tags are organized into four categories. The UI renders each category
in a distinct color derived from the active theme's CSS custom
properties. Custom (freeform) tags that do not match any predefined
value are rendered in a neutral chip style.

---

## Category: bug-lifecycle

Covers the lifecycle of defects and fixes: from discovery through
hypothesis, attempted fix, and confirmation. Maps directly to the
confirmed/hypothetical distinction in rhiz-State §6.7.

| Tag | Meaning |
|---|---|
| `known-bug` | Documents a confirmed defect; fix not yet attempted or applied |
| `attempted-fix` | A fix was applied; operator confirmation pending (Hypothetical in §6.7) |
| `hypothetical-fix` | A fix is proposed but root-cause confidence is low |
| `confirmed-working` | Operator has verified the fix works in the target environment |
| `regression` | A previously working behavior has broken |
| `root-cause-identified` | Root cause is known; fix not yet written |
| `partial-fix` | Addresses part of the problem; further work needed |
| `needs-user-test` | Fix requires operator verification in a specific environment |
| `needs-ci-run` | Awaiting a CI build result to confirm or deny |

---

## Category: hypothesis

Covers the nature of a proposed change in terms of *what level of the
system it operates on*. These two tags are mutually exclusive within a
single hunk — a change either questions intent or refines
implementation, not both.

| Tag | Meaning |
|---|---|
| `intent-hypothesis` | Proposes a change to *what* the system should do: design direction, goals, or scope. Questions or revises intent itself. Warrants deliberation before implementation follows. |
| `implementation-hypothesis` | Proposes a change to *how* intent is achieved: a specific mechanism, code approach, or technical choice, without questioning the underlying intent. Can often be evaluated on technical merit once intent is settled. |

**Mutual exclusion rule**: a single hunk should not carry both
`intent-hypothesis` and `implementation-hypothesis`. The UI warns
when both are present on the same hunk.

---

## Category: prose-governance

Covers the quality and status of prose knowledge articles: drafts,
evidentiary gaps, structural concerns, and cross-cutting patterns.

| Tag | Meaning |
|---|---|
| `working-draft` | Approved as good enough for now; not the final word. Added automatically on Approve — working draft. |
| `needs-evidence` | A claim is made without supporting evidence cited |
| `supersedes-prior` | This revision replaces or corrects a prior record |
| `cross-cutting` | A lesson or pattern that applies beyond the scoped feature |
| `needs-split` | Article is approaching the size ceiling; should be split per §6.8.4 |
| `qualitative-hypothesis` | A stated direction or intent not yet validated by observation |

---

## Category: process

Covers workflow and queue state: blockers, staleness, and items
awaiting external resolution.

| Tag | Meaning |
|---|---|
| `blocked` | Cannot proceed; depends on an external event or decision |
| `stale` | Proposal reflects a state that may have changed; review before approving |
| `reviewer-edited` | Reviewer made a direct edit to the hunk content. Added automatically on both `Edited — commit as-is` and `Edited — for agent`. |
| `needs-agent-analysis` | Reviewer's direct edit is feedback, not a final version; the agent must diff `after` vs `reviewer_edit` and reason further. Added automatically on `Edited — for agent`. |

---

## Machine Form

The YAML block below is the machine-readable projection of the
taxonomy above. docket and docket-propose load this block for
autocomplete and validation. On any disagreement between this block
and the prose tables above, the prose tables govern (rhiz-Core §9).

```yaml
taxonomy:
  schema-version: "1"
  categories:
    - id: bug-lifecycle
      label: Bug & Fix Lifecycle
      color-token: "--rhiz-tag-bug"
      tags:
        - id: known-bug
        - id: attempted-fix
        - id: hypothetical-fix
        - id: confirmed-working
        - id: regression
        - id: root-cause-identified
        - id: partial-fix
        - id: needs-user-test
        - id: needs-ci-run
    - id: hypothesis
      label: Hypothesis
      color-token: "--rhiz-tag-hypothesis"
      mutual-exclusion-groups:
        - [intent-hypothesis, implementation-hypothesis]
      tags:
        - id: intent-hypothesis
        - id: implementation-hypothesis
    - id: prose-governance
      label: Prose & Governance
      color-token: "--rhiz-tag-prose"
      tags:
        - id: working-draft
        - id: needs-evidence
        - id: supersedes-prior
        - id: cross-cutting
        - id: needs-split
        - id: qualitative-hypothesis
    - id: process
      label: Process
      color-token: "--rhiz-tag-process"
      tags:
        - id: blocked
        - id: stale
        - id: reviewer-edited
        - id: needs-agent-analysis
```
