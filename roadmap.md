# Roadmap: docket — Knowledge Article Approval Workflow

**Status**: Active — implemented (Phases 1–6) at repo root. Phase 7 (native Tauri) remains deferred.  
**Recorded**: 2026-06-21  
**Category**: Governance tooling  
**Depends on**: Vite, `rhiz-lint.py` (david-coneff/rhizome), `docket-propose.py`, `tag-taxonomy.md`, rhiz-State §6.8  

> **Implementation note (2026-06-21)**: built as a zero-runtime-dependency
> Vite app at repo root of david-coneff/docket. Theme tokens (`--rhiz-tag-*`) mirror the
> taxonomy so Shoelace form elements can be substituted later without
> restructuring. All seven open questions below are resolved. The diff engine
> and resolution state machine ship with passing unit tests (`npm test`).

---

## Problem Statement

When an agent proposes changes to rhizome knowledge articles, the human reviewer
currently has no structured way to:
- Review prose edits with track-changes visibility (additions/deletions)
- Approve or reject individual article-scoped hunks atomically
- Edit the proposed content directly and signal whether that edit is final or is
  feedback for the agent to reason about further
- Attach screenshots, logs, or binary blobs to feedback comments
- Return structured feedback to the agent for the next revision round

The existing git PR workflow is code-diff-paradigm (line-level) and is not
suitable for qualitative prose governance work. The goal is a review interface
that feels closer to MS Word's track-changes/review mode than to a code diff.

---

## Decided Architecture

### 1. Proposal Format — JSON artifacts, agent-generated via CLI tool

Proposals are JSON files committed to a `rhiz-proposals/` directory in the
governed project repository. The agent uses a CLI tool (`docket-propose.py`)
to generate and validate the JSON — so that the agent's output tokens go to
the *content* of the proposal, and the tool handles schema enforcement,
file naming, timestamps, and directory hygiene.

**Why a CLI tool rather than raw JSON output:**  
JSON structure errors in a proposal artifact would silently corrupt the review
queue. The CLI tool accepts content strings as arguments or stdin, validates
them against the proposal schema, and writes the file. The agent only needs to
produce the content; the tool produces the artifact.

**Proposal artifact schema** (`rhiz-proposals/<id>.proposal.json`):
```json
{
  "$schema": "../schemas/proposal.schema.json",
  "id": "prop-2026-06-21-001",
  "title": "Add F-WIN-05: satellite focus race on multi-monitor",
  "created": "2026-06-21T18:00:00Z",
  "status": "open",
  "tags": ["hypothetical-fix", "needs-user-test"],
  "agent_notes": "Free text: why these changes, what was the triggering observation.",
  "hunks": [
    {
      "id": "hunk-01",
      "article": "rhiz-memory/state/failure-paths/tauri-window-management.md",
      "index_context": "rhiz-memory/state/lessons-learned-synthesis.md",
      "before": "...full original article content...",
      "after":  "...full proposed article content...",
      "status": "pending",
      "tags": ["attempted-fix"],
      "reviewer_edit": null,
      "reviewer_edit_mode": null,
      "reviewer_edit_notes": null,
      "comments": []
    }
  ]
}
```

**Hunk fields:**

- `before` / `after` — agent-authored content, full file strings. The diff
  between them is computed by the UI at render time.
- `reviewer_edit` — the reviewer's direct edit of the proposed content, stored
  as a full file string. `null` when no direct edit has been made. Set only
  by the docket UI; never by the agent.
- `reviewer_edit_mode` — `"commit-as-is"` or `"agent-feedback"`. See §3.
  `null` when `reviewer_edit` is null.
- `reviewer_edit_notes` — optional free-text note from the reviewer explaining
  the intent of their edit (e.g. "fixed the wording in para 3" or "marked the
  section that needs deeper thought"). `null` when no edit has been made.

`reviewer_edit` is intentionally separate from `after` — the agent's proposal
is preserved verbatim alongside the reviewer's version, so the agent can diff
them and understand exactly what changed and why.

**`docket-propose` CLI (docket-propose.py) — interface:**

Short scalar fields (`--title`, `--tags`, `--proposal`) are passed as CLI args.
Large multi-line content (`--before`, `--after`, `--agent-notes`) is passed as
`--file` path references — the tool reads the file — to avoid shell-escaping
multi-KB article bodies. No interactive `$EDITOR` mode; the agent is not
interactive.

```
# Create a new proposal (before/after supplied as file paths)
python docket-propose.py new \
  --title "Add F-WIN-05" \
  --tags hypothetical-fix needs-user-test \
  --agent-notes-file path/to/notes.txt \
  --article path/to/article.md \
  --after path/to/proposed-article.md

# Add a hunk to an existing open proposal
python docket-propose.py add-hunk \
  --proposal prop-2026-06-21-001 \
  --article path/to/another.md \
  --after path/to/proposed-another.md \
  --tags attempted-fix

# Validate an existing proposal file
python docket-propose.py validate --proposal prop-2026-06-21-001

# List open proposals, optionally filtered by tag
python docket-propose.py list --status open

# Compute and stamp the CID hash on a tag taxonomy file
python docket-propose.py stamp-taxonomy [--file path/to/tag-taxonomy.md]
```

---

### 2. Tag Taxonomy Versioning

The tag vocabulary is defined in a versioned canonical file:
[`tag-taxonomy.md`](./tag-taxonomy.md).

A project may override by placing its own `tag-taxonomy.md` in its
`rhiz-proposals/` directory. The UI loads the project-local file if present;
otherwise falls back to `tag-taxonomy.md` at repo root.

**Version identity** follows rhiz-Core §1 (Content Identity Governance).
The taxonomy file carries YAML frontmatter (rhiz-Core §1.6) excluded from the
hash:

```yaml
---
cid-short: <first 8 hex chars of SHA-256 of content after SCOPE START marker>
adopted: <ISO-8601 timestamp to the second of formal adoption>
schema-version: "1"
---
```

When the taxonomy changes, the hash changes and `adopted` is updated.
Previous versions are recoverable from git history.

**Stamping**: `python docket-propose.py stamp-taxonomy` computes the hash
and writes `cid-short` and `adopted` back into the frontmatter in-place.

**Tag validation**: `docket-propose` and `rhiz-lint` warn (not error) when a
proposal uses a tag not in the active taxonomy. Freeform tags are always
accepted.

#### Tag Categories (summary)

| Category | Color token | Purpose |
|---|---|---|
| `bug-lifecycle` | `--rhiz-tag-bug` | Defect and fix lifecycle; maps to §6.7 confirmed/hypothetical |
| `hypothesis` | `--rhiz-tag-hypothesis` | Intent change vs. implementation change — mutually exclusive |
| `prose-governance` | `--rhiz-tag-prose` | Article quality, drafts, structural concerns |
| `process` | `--rhiz-tag-process` | Queue workflow: blockers, staleness |

See [`tag-taxonomy.md`](./tag-taxonomy.md) for full definitions.

**On the intent / implementation distinction** (`hypothesis` category):
`intent-hypothesis` and `implementation-hypothesis` are mutually exclusive at
the hunk level. Intent changes require deliberation before implementation
follows; implementation changes can be evaluated on technical merit once intent
is settled. The tags make this visible in the queue without opening the hunk.

---

### 3. Approval States and Feedback Mechanisms

#### 3.1 Six hunk resolution states

A hunk resolves to one of six states. All six include an optional notes /
feedback field.

| State | Content committed | Agent action |
|---|---|---|
| **Approved** | Agent's `after` | Apply `after` and commit. |
| **Approved — working draft** | Agent's `after` | Apply `after`, record confirmation status as Hypothetical. Tags `working-draft` automatically. |
| **Edited — commit as-is** | Reviewer's `reviewer_edit` | Apply `reviewer_edit` and commit. No further agent analysis needed. |
| **Edited — for agent** | *(not committed yet)* | Read `reviewer_edit` as annotated feedback. Diff `after` vs `reviewer_edit` to understand what the reviewer changed and why. Re-propose. |
| **Request changes** | *(not committed yet)* | Read comments. Revise and re-propose. |
| **Rejected** | *(nothing)* | Do not re-propose unless framing changes substantially. |

#### 3.2 Commit mode

The interface operates in one of two commit modes, selectable as a persistent
UI preference:

- **Immediate mode**: each hunk is committed the moment it is approved or
  resolved as `Edited — commit as-is`. No batch action required. Suitable for
  single-hunk proposals or when the reviewer wants to land each change
  independently.

- **Batch mode**: approved and edited-commit hunks are staged but not committed
  until the reviewer clicks a **Commit batch** button. The button is disabled
  until at least one hunk is in a committable state. Suitable for multi-hunk
  proposals where partial application would leave articles in an inconsistent
  state mid-review.

The current mode is displayed persistently in the toolbar. Switching modes
during an active review is allowed; already-committed hunks (in Immediate mode)
are not affected.

#### 3.3 Direct Edit — the reviewer edit mechanism

The direct edit states (`Edited — commit as-is` and `Edited — for agent`)
fill a gap that comments alone cannot fill: they let the reviewer express
feedback *within the text itself*, rather than quoting it in a separate comment
box.

**When to use each:**

- **Edited — commit as-is**: the reviewer has made a complete, final correction
  to the proposal — a wording fix, a factual correction, a restructuring that
  does not need further agent analysis. The reviewer's version replaces the
  agent's. The agent treats this exactly like an Approve, except it commits
  `reviewer_edit` instead of `after`.

- **Edited — for agent**: the reviewer has marked up the proposal to show what
  they want changed — crossing out a paragraph, rewriting a sentence they want
  reconsidered, annotating a section with `[TODO: expand this]` inline. This
  is not a final version; it is a richer form of feedback than a comment. The
  agent diffs `after` vs `reviewer_edit`, reads `reviewer_edit_notes`, and
  uses the combination to understand what requires further analysis before
  re-proposing. No content is committed from this state.

**Why keep `after` intact rather than overwriting it:**  
The agent needs to see both what it proposed (`after`) and what the reviewer
changed (`reviewer_edit`) to understand the delta. Overwriting `after` would
destroy that signal.

**Auto-tagging:**
- `Edited — commit as-is` adds `reviewer-edited` to the hunk's tags.
- `Edited — for agent` adds `reviewer-edited` and `needs-agent-analysis`.

#### 3.4 Comment schema within a hunk

```json
{
  "id": "comment-01",
  "created": "2026-06-21T20:00:00Z",
  "role": "approval-note | change-request | rejection-rationale | edit-note | general",
  "text": "Markdown text from the reviewer.",
  "attachments": [
    {
      "filename": "ci-log.txt",
      "mime_type": "text/plain",
      "path": "/absolute/or/relative/path/to/ci-log.txt"
    }
  ]
}
```

**Attachment handling**: attachments are stored as file-path references, not
base64-encoded blobs. The reviewer drags and drops a file onto the attachment
zone; the UI records the file's absolute path (from the File System Access API)
in the JSON. The agent resolves the path when reading the export package.
This keeps JSON artifacts compact regardless of attachment size, and avoids
base64 inflation in both the file and the agent's context window.

`edit-note` is the role used when `reviewer_edit_notes` is non-null and the
reviewer chooses to elaborate further in a comment alongside their direct edit.
`reviewer_edit_notes` is the short inline note; a full comment with
`role: edit-note` is for longer explanation.

---

### 4. Commit Flow

- **Agent commits proposals**: `rhiz-proposals/<id>.proposal.json` committed.
- **Human reviews in docket UI**: resolves each hunk to one of six states.
  UI writes updated proposal JSON (to the working directory; see §5) including
  `reviewer_edit`, `reviewer_edit_mode`, `reviewer_edit_notes` when present.
- **Agent applies resolved hunks**:
  - `Approved` / `Approved — working draft`: commits `after`.
  - `Edited — commit as-is`: commits `reviewer_edit`. Diffs `after` vs
    `reviewer_edit` and records the delta in a brief commit note for
    auditability.
  - `Edited — for agent`: does *not* commit. Reads the diff between `after`
    and `reviewer_edit` plus `reviewer_edit_notes` and any comments as the
    combined feedback signal. Revises and re-proposes.
  - `Request changes` / `Rejected`: reads comments. Revises or closes.
- **No manual commit by the human** — agent owns both proposal commit and
  approval-application commit.

---

### 5. Deployment Target — Standalone HTML first

The first deployment target is a standalone `index.html` in Chromium.

**Working directory**: the user selects a working directory via the native file
picker (`showDirectoryPicker()`). The selection is persisted in `localStorage`
so the folder opens automatically on next launch. The working directory is the
root for reading `rhiz-proposals/` and writing resolved proposal JSON — no
drag-and-drop of the folder is required after the first pick.

**Attachments**: drag-and-drop of individual files onto the attachment zone
stores the file's absolute path as a path reference in the JSON (see §3.4).
No base64 encoding; the file stays on disk.

**Export**: resolved proposal JSON is written back to the working directory
(`rhiz-proposals/<id>.resolved.json`) automatically. No separate export/download
action required. The agent is told the path.

**Native Tauri as "nice to have"**: auto-load folder on launch, direct CLI
invocation. Promote only if the file-picker + localStorage workflow becomes
real friction.

---

## UI Layout

Three panels, following Tessel's dock pattern:

```
┌──────────────────┬───────────────────────────────────┬────────────────────┐
│   Queue Panel    │         Review Panel              │  Context + Feedback│
│  [sort ▾]        │  [Composed][Review mode][Edit ✎]  │                    │
│                  │                                   │ ── Index context ──│
│ prop-001         │  Article content here             │  lessons-learned.. │
│  [hypothetical]  │  with ~~deletions~~ and           │  > tauri-window-mg │
│  [needs-test]    │  ==additions== rendered           │                    │
│                  │  inline at word granularity       │ ── Tags ──────────│
│ prop-002         │                                   │  [intent-hyp] x    │
│  [intent-hyp]    │  < Hunk 1 of 2 >                  │  [+ add tag]       │
│  [working-draft] │                                   │ ── Feedback ───────│
│                  │                                   │  [comment editor]  │
│                  │                                   │  [attachments]     │
│                  │                                   │  [Approve ▾]       │
│                  │                                   │  [Edit ▾]          │
│                  │                                   │  [Request changes] │
│                  │                                   │  [Reject]          │
└──────────────────┴───────────────────────────────────┴────────────────────┘
```

**Toolbar** (above all panels):
- Working directory path + **Change folder** button  
- Commit mode toggle: **Immediate** | **Batch** (persisted in localStorage)  
- **Commit batch** button (Batch mode only; disabled until at least one hunk is committable)  

**Menu bar** `File` menu:
- Open working directory  
- ─────────────────  
- **Tag Taxonomy** — Taxonomy Inspector

### Queue Panel — Sorting

The queue is reviewer-reorderable (drag to reorder) with a **Sort ▾** control
offering the following sort modes:

- **Manual** (default, drag-reorderable)
- **By date** — ascending or descending by `created`
- **By tag** — groups proposals sharing a selected tag together
- **By severity / importance** — ordered by an `importance` tag value when
  present (agent-applied or reviewer-applied); untagged proposals sort last

Sort preference is persisted in localStorage. Drag-reorder is only available
in Manual mode; switching to a sort mode locks drag handles.

### Review Panel — Three Tabs

**Composed**: rendered Markdown preview of `after` (the agent's proposal) with
all changes applied. Clean reading, no diff markup.

**Review mode**: word-level track-changes diff between `before` and `after`.
- Removed text: `<del>` styling, muted red, strikethrough
- Added text: `<ins>` styling, muted green highlight
- Code/YAML/JSON blocks: line-level diff

**Edit ✎**: the reviewer's direct editing surface. Displays `after` content
in a plain textarea (v1; WYSIWYG Markdown deferred to a later phase).

- If `reviewer_edit` already exists (reviewer returned to the hunk), the
  editor loads `reviewer_edit`, not `after`, so edits are additive.
- A "Diff my edits" toggle within this tab shows the diff between `after`
  and the current editor content — so the reviewer can see exactly what
  they have changed relative to the agent's proposal before submitting.
- Switching away from Edit tab preserves unsaved editor content in session
  state (OPFS); it is not written to the resolved JSON until an edit action
  is taken.

### Context + Feedback Panel

Four sections, present regardless of which review tab is active:

**Context**: parent index document with the affected article's entry
highlighted.

**Tags**: editable tag chips. Autocomplete from active taxonomy. Warns on
`intent-hypothesis` + `implementation-hypothesis` mutual exclusion.

**Feedback**: Markdown comment editor + drag-and-drop attachment zone.
Present for all six resolution states. Labeled "Notes (optional)" on
Approve and edit states; "Required feedback" on Request Changes and Reject.

**Actions:**

- **Approve ▾** (dropdown):
  - Approve
  - Approve — working draft

- **Edit ▾** (dropdown, active only when Edit tab has content differing from `after`):
  - **Commit my edit** — resolves hunk as `Edited — commit as-is`. The
    reviewer's edited content becomes what will be committed. Tags
    `reviewer-edited` automatically.
  - **Send edit as feedback** — resolves hunk as `Edited — for agent`. The
    reviewer's edit is handed to the agent as annotated feedback for further
    analysis; nothing is committed. Tags `reviewer-edited` +
    `needs-agent-analysis` automatically. The `reviewer_edit_notes` field
    (a short inline note, distinct from the full comment box) can be filled
    here before submitting.

- **Request changes**: requires non-empty feedback comment.
- **Reject**: requires non-empty feedback comment.

The Edit ▾ dropdown is disabled (greyed out) when the Edit tab has no
content differing from `after`. This prevents accidentally submitting an
empty or unchanged "edit."

### Taxonomy Inspector (File > Tag Taxonomy)

```
┌─────────────────────────────────────────────────────────────┐
│  Tag Taxonomy                                               │
│                                                             │
│  Source:  rhiz-proposals/tag-taxonomy.md  (project-local)  │
│  Version:  2026-06-21T19:15:00Z  ·  cid-short: a1b2c3d4   │
│  Schema:   v1                                               │
│                                                             │
│  ── bug-lifecycle ───────────────────────────────────────── │
│  [known-bug]       Documents a confirmed defect…           │
│  …                                                          │
│  ── hypothesis ──────────────────────────────────────────── │
│  [intent-hypothesis]         Proposes a change to what…    │
│  [implementation-hypothesis] Proposes a change to how…     │
│    ⚠ Mutually exclusive within a single hunk               │
│  ── prose-governance ────────────────────────────────────── │
│  …                                                          │
│  ── process ─────────────────────────────────────────────── │
│  …                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

| Concern | Solution |
|---|---|
| Build | Vite, one component per file, no monolith JS or HTML |
| Form elements | Shoelace (theme-aware, consistent with Tessel) |
| Icons | Same SVG icon library as Tessel |
| Theme | `ThemeManager.js` / CSS custom properties from Tessel |
| Storage | OPFS via `StorageEngine.js` for UI state, drafts, unsaved edit tab content |
| Persistent prefs | `localStorage` for working directory path, commit mode, sort order |
| File access | File System Access API (`showDirectoryPicker`); selection persisted in localStorage |
| Resolved output | Written to working directory (`rhiz-proposals/<id>.resolved.json`) automatically |
| Attachments | File path references; drag-and-drop stores absolute path, not base64 |
| Taxonomy loading | Load `rhiz-proposals/tag-taxonomy.md` if present; else `tag-taxonomy.md` at repo root |
| Taxonomy version display | Parse frontmatter `cid-short` + `adopted`; show in File > Tag Taxonomy |
| Tag validation | Warn (not error) on tags not in active taxonomy; freeform always accepted |
| Queue ordering | Drag-reorderable (Manual mode) + sort by date / tag / importance; persisted in localStorage |
| Commit mode | Immediate (commit per hunk) or Batch (stage until Commit batch button); persisted in localStorage |
| Diff engine | Myers diff, word-level prose / line-level code fences. Used for both Review mode (before→after) and "Diff my edits" within Edit tab (after→reviewer_edit) |
| Direct edit surface | Plain textarea in Edit ✎ tab (v1); WYSIWYG Markdown deferred to later phase |
| Edit state tracking | `reviewer_edit` written to resolved JSON only when Edit ▾ action is taken; unsaved editor content stays in OPFS session state |
| Proposal artifacts | JSON in `rhiz-proposals/`, validated by `docket-propose.py` |
| Tag rendering | Shoelace `<sl-tag>` chips, color by `--rhiz-tag-<category>` tokens |
| Lint gate | `rhiz-lint.py` (david-coneff/rhizome) result shown before final hunk approval |

---

## FOSS Alternative Evaluation

**Phorge** — queue + approval state machine is the right shape; PHP monolith,
line-level diff, not Markdown-native. Value: study queue state machine design.

**Gitea PR review** — lightweight and in use, but code-diff paradigm, no
structured feedback artifact for agent consumption.

**OnlyOffice Community** — closest visual match for track-changes rendering;
not Markdown-native, no repo integration, very heavy.

**Verdict**: Build docket. No existing tool covers prose track-changes +
repo-backed proposal artifacts + direct reviewer edit with commit-vs-feedback
disambiguation + tag taxonomy versioning + agent feedback loop + standalone HTML.

---

## Open Questions Before Implementation

All open questions are now resolved. No blockers to implementation.

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | `docket-propose.py` interface | **Resolved** | Scalar fields as CLI args; large content (`before`, `after`, `agent-notes`) via `--file` path. No `$EDITOR`. |
| 2 | Export package handoff UX | **Resolved** | Working directory selected via native file picker; path persisted in localStorage. Resolved JSON written to working directory automatically. Agent is told the path. |
| 3 | Attachment handling | **Resolved** | File-path references preferred. Drag-and-drop stores the absolute path, not base64. JSON stays compact; agent reads the file directly. |
| 4 | Hunk ordering | **Resolved** | Viewer-reorderable (drag in Manual mode). Sort options: Manual, by date, by tag, by importance. Preference persisted in localStorage. |
| 5 | Partial approval commit | **Resolved** | Mode-based: Immediate (commit per hunk on approval) or Batch (stage until explicit Commit batch button). User selects mode; persisted in localStorage. |
| 6 | Tag taxonomy ownership | **Resolved** | Versioned by CID hash + adopted timestamp per rhiz-Core §1. Projects override via `rhiz-proposals/tag-taxonomy.md`. UI exposes version in File > Tag Taxonomy. |
| 7 | Edit tab surface | **Resolved** | Plain textarea for v1. WYSIWYG Markdown (contenteditable) deferred to a later phase. |

---

## Implementation Phases (when deferred status is lifted)

1. **Phase 1 — Tooling**: `docket-propose.py` CLI + JSON schema (tags, comment
   schema, `reviewer_edit` fields, `stamp-taxonomy` subcommand). File-path
   argument handling for large content fields. Validate proposal artifact
   format for real agent use.

2. **Phase 2 — Diff engine**: Port or vendor `jsdiff`, write
   mixed-granularity (word/line) prose renderer. Unit tests against known
   before/after pairs. The same module is used for Review mode (before→after)
   and "Diff my edits" (after→reviewer_edit).

3. **Phase 3 — Standalone HTML shell**: Working directory picker with
   localStorage persistence. Queue panel with tag chips, sorting (date / tag /
   importance / manual drag), and commit mode toggle. Review panel Composed
   tab. Resolved JSON written to working directory. File > Tag Taxonomy
   inspector.

4. **Phase 4 — Review mode rendering**: Wire diff engine into Review mode tab.
   Style deletions/additions with Tessel CSS custom properties.

5. **Phase 5 — Edit tab + Context + Feedback panel**: Edit ✎ tab with plain
   textarea, "Diff my edits" toggle, OPFS persistence of unsaved content.
   Edit ▾ dropdown with "Commit my edit" and "Send edit as feedback" options.
   `reviewer_edit_notes` inline note field. Index context rendering, tag
   editor with taxonomy autocomplete and mutual-exclusion warning, comment
   editor, attachment drag-and-drop (stores path reference), all six
   resolution states.

6. **Phase 6 — rhiz-lint gate**: Lint proposed state in memory (using
   `reviewer_edit` when present, else `after`) before final hunk approval.
   Show results inline.

7. **Phase 7 (if needed) — Tauri native app**: Auto-load folder on launch,
   auto-save resolved JSON, direct agent CLI invocation.

---

## Evolution: Web Service with Server-Side Claude CLI Integration (Phase 8+)

The current docket architecture is desktop-first — the user operates the UI on
their local machine and the proposal artifacts stay in git. A future evolution
would integrate docket with a backend web service to create a cohesive
human-Claude feedback loop, where human judgment and agent action are tightly
coupled and traceable.

### Vision: Structured Lifecycle for Agent-Driven Change

**Current cycle** (docket phases 1–7):
```
Agent proposes (JSON) → Human reviews (UI) → Human disposes → Human applies
                       (feedback in JSON)     (approves/rejects)     (commits)
```

**Proposed cycle** (Phase 8+):
```
Proposal → Human feedback/disposition → Claude acts → Structured result artifact
         (judgment gate)                (execution)   (status, notes, commit hash)
                                                      ↓
                                         Enables human confirmation:
                                         "Did the fix work?" → new proposal
                                         (closes hypothesis loop)
```

### Phase 8 — Web Backend + Server-Side Claude CLI Integration

**Infrastructure:**
- Web-based docket UI served from a backend server (localhost or cloud-hosted)
- Server provisions dedicated repository clones and a Claude CLI instance
  per user session or workspace
- User maintains single URL entry point; repositories and CLI are provisioned
  server-side

**Disposition → Action flow:**
1. User approves or disposes a hunk in the docket UI (browser)
2. UI writes disposition to `dispositioned.json` in the working repo
3. Server detects file change (inotify or polling)
4. Server invokes Claude CLI against the repository with the proposal + disposition
5. Claude reads the proposal JSON, the `reviewer_edit` fields, and feedback
6. Claude performs the action (commits, updates files, runs tests, etc.)
7. Claude writes result artifact (`actioned.json`) with:
   - `status`: "success" | "partial" | "failed"
   - `summary`: Brief description of action taken
   - `git_commit`: Hash of committed changes (if applicable)
   - `timestamp`: ISO-8601 completion time
   - `output`: Execution logs, test results, or error messages
8. Server detects result artifact and notifies UI
9. User sees closure: "This disposition was actioned on 2026-06-22T14:30:00Z
   (commit abc1234). Summary: …"

**Result artifact schema** (`dispositioned.json` → `actioned.json`):
```json
{
  "proposal_id": "prop-2026-06-21-001",
  "disposition_id": "disp-001",
  "status": "success",
  "timestamp": "2026-06-22T14:30:00Z",
  "git_commit": "abc1234567890abcdef1234567890abcdef123456",
  "summary": "Applied approved changes to tauri-window-management.md; no linting errors.",
  "actions_taken": [
    {
      "hunk_id": "hunk-01",
      "action": "commit",
      "file": "rhiz-memory/state/failure-paths/tauri-window-management.md",
      "commit_msg": "docs: add F-WIN-05 satellite focus race scenario"
    }
  ],
  "notes": "All linting gates passed. No blocking issues detected.",
  "logs": {
    "lint_output": "…",
    "test_output": "…",
    "agent_notes": "…"
  }
}
```

### Phase 9 — Closed Feedback Loop & Hypothesis Confirmation

**Extending the lifecycle to include confirmation:**

Once an action is complete (result artifact written), the user can propose
a follow-up:
- "I deployed the fix. Here are the production logs."
- "I ran the test suite and here's the output."
- "The hypothesis was incorrect; we need to revisit."

Each follow-up is a new proposal that references the prior one:
```json
{
  "id": "prop-2026-06-22-001",
  "title": "Confirm: satellite focus fix resolves race condition",
  "parent_proposal": "prop-2026-06-21-001",
  "parent_action": "disp-001",
  "tags": ["confirmation", "user-tested"],
  "agent_notes": "User reports: ran test_multi_monitor.py in isolation 50x, no failures. Deployed to staging.",
  "evidence": [
    { "type": "log_file", "path": "test-run-2026-06-22.log" },
    { "type": "note", "text": "Test passed in isolation but need to verify under real load." }
  ]
}
```

Claude can then analyze the evidence and confirm or refute the hypothesis:
- **Confirmed**: `actioned.json` status = "confirmed"; tags the original proposal as `hypothesis-confirmed`
- **Refuted**: Creates a new proposal based on the new evidence; cycle restarts
- **Partial**: Status = "partial-success"; suggests refinements in `summary`

This closes the loop: proposal → feedback → action → evidence → confirmation
(or pivot to new hypothesis).

### Comparison: Why This Pattern

**vs. GitHub Issues** — Issues are freeform discussion. Without structured
disposition states and result artifacts, there's no clear "human approved →
agent executed → human confirmed" boundary. The feedback loop is implicit and
must be manually tracked across comments.

**vs. ADRs/RFCs** — Good for documenting architectural decisions and rationale.
But they are typically written *after* a decision is made and do not include
an agent-driven execution phase or result feedback loop. They also do not
capture the iterative hypothesis-test-confirm cycle.

**vs. Linear/Jira** — Issue tracking with custom fields and automation rules.
However, these tools are designed for human-to-human workflow coordination,
not human-agent feedback loops. They also do not naturally support hypothesis
testing with structured confirmation artifacts.

**vs. Git commit history** — Commits are immutable and include messages, but
the qualitative notes about *why* a change was proposed, *how* the human
evaluated it, and *whether* it solved the problem are lost or relegated to
commit message prose (which does not parse well in code review). docket
proposes structured artifacts at each stage.

**vs. Codeium experiment tracking** — Some AI tools log experiments and results.
However, they typically focus on model/data pipeline trials, not decision
cycles in text or qualitative domains. docket is domain-agnostic.

**vs. Langchain experiment tracking** — Similar to Codeium; good for tracking
agent tool use and token counts, but not designed for human-agent decision
loops with structured disposition states.

**Unique aspects of docket's approach:**

1. **Structured disposition gate** — Not every proposal is auto-executed. The
   human explicitly disposes it (approve, request changes, edit, reject),
   creating a clear boundary between judgment and action.

2. **Immutable feedback artifacts** — The reviewer's edits, comments, and
   disposition are all recorded alongside the proposal, creating an
   audit trail.

3. **Agent-readble feedback** — The `reviewer_edit`, `reviewer_edit_mode`,
   and `comments` are designed for Claude to parse and act on, not just for
   human reading.

4. **Hypothesis closure** — The result artifact enables confirmation: did the
   fix work? This is rarely captured in traditional tools.

5. **Prose-native** — Designed for qualitative work (articles, design docs,
   notes) rather than code review. Track-changes and word-level diff are
   the focus, not line-level code diff.

6. **Artifact lineage** — Each proposal, disposition, action, and result is
   immutable and linked. The chain of evidence is preserved.

### Implementation considerations for Phase 8+

- **Server architecture**: Minimal web framework (Flask, FastAPI); inotify for
  file change detection; queue for Claude CLI tasks.
- **Claude CLI integration**: Each workspace has a dedicated CLI instance;
  Claude reads proposal JSON and executes against the local repo clone.
- **Result artifact handling**: Written by Claude CLI; server detects change
  and notifies UI via WebSocket or polling.
- **Authentication**: User session tied to a workspace/repo pair; server
  manages file permissions and isolates workspaces.
- **Offline fallback**: If server is down, docket still works as a standalone
  app (read-only on result artifacts; can still disposition proposals that
  are applied later).

---

## Structured Feedback on the Proposed Lifecycle

The sections above describe a *new* integration opportunity, not a critique of
existing docket functionality. Here is structured feedback on the proposed
lifecycle concept itself, comparing it to patterns in current use.

### Pattern analysis: Proposal → Feedback → Disposition → Action → Confirmation

**Strengths:**

1. **Clear state boundaries** — Each phase (proposal, feedback, disposition,
   action, confirmation) is explicit and auditable. No ambiguity about
   whether a human has judged the change or whether an action is pending.

2. **Artifact lineage** — Every intermediate stage produces a JSON artifact:
   proposal (agent), feedback (human + agent), disposition (human),
   result (agent), confirmation (human + agent). The full chain of reasoning
   and decisions is preserved.

3. **Hypothesis-driven** — Proposes a fix ("F-WIN-05 race condition") with
   tags indicating confidence ("hypothetical-fix"). Confirmation phase
   allows hypothesis to be validated or refuted. This is rare in tools; most
   just track "done" or "not done."

4. **Qualitative work native** — Designed for prose and qualitative judgment,
   not code line-level changes. Track-changes and reviewer edits fit the
   domain better than unified diffs.

5. **Minimal assumptions** — Does not assume agent is infallible or
   omniscient. Human feedback, re-proposal, and confirmation loop in
   naturally.

**Challenges:**

1. **Overhead for simple changes** — A one-line typo fix goes through proposal
   → feedback → disposition → action → confirmation (at least 5 phases).
   For lightweight changes, this may feel bureaucratic.

   *Mitigations:*
   - Batch mode: multiple hunks → single disposition → single action.
   - Auto-approve heuristics: e.g., obvious formatting fixes can auto-approve
     if no feedback is attached.
   - Fast-track tags: e.g., `[quick-fix]` → disposition auto-generated.

2. **Broken feedback loop if agent is offline** — If Claude CLI is unavailable,
   dispositions queue but cannot execute. User is blocked waiting for results.

   *Mitigations:*
   - Offline queue: dispositions are queued locally; agent executes them
     when available.
   - Explicit retry UI: user can see pending dispositions and retry.
   - Async notifications: server notifies user of results via email/webhook.

3. **Complex for exploratory work** — If the human and agent are exploring
   ideas (not implementing), the proposal-feedback cycle can become lengthy.

   *Mitigations:*
   - Tags to distinguish exploratory vs. actionable proposals.
   - Grouped proposals: e.g., "5 exploratory ideas for improving X"
     → grouped UI view → single batch disposition.

4. **Result artifact schema must be stable** — If the actioned.json format
   changes, old actions become harder to parse. Version the schema and
   provide migrations.

### Decided design principles (adopted 2026-06-22)

The first three challenges above are resolved as adopted design principles for
Phase 8+. They are no longer open: the lifecycle is built around them from the
start, not retrofitted.

#### DP-1 — Reduce overhead: the full lifecycle is opt-in, not mandatory

The five-phase cycle (proposal → feedback → disposition → action →
confirmation) is the *maximum* path, reserved for changes that warrant it.
Most changes take a shorter path.

- **Tiered proposals.** Every proposal carries a `weight` field:
  `"trivial" | "standard" | "significant"`. The agent sets an initial value;
  the reviewer can override it in the UI.
  - `trivial` (typo, formatting, link fix): single-click approve commits
    immediately; no separate disposition artifact, no confirmation phase.
    The action is recorded inline on the proposal rather than in a separate
    `actioned.json`.
  - `standard`: proposal → disposition → action. Confirmation optional.
  - `significant` (intent change, architectural, hypothesis-bearing): full
    five-phase cycle, confirmation expected.
- **Batch dispositions.** Multiple hunks resolved in one pass produce a single
  disposition artifact and a single Claude action invocation (one commit, or
  one commit per hunk by preference) — not N round-trips.
- **Auto-disposition heuristics (conservative).** A `[quick-fix]` tag plus an
  Approve with no attached feedback may auto-generate the disposition. Never
  auto-approves; the human still clicks Approve. Heuristics only remove the
  *artifact-authoring* step, never the *judgment* step.

#### DP-2 — Offline queue + retry UI

The UI must never block on agent or server availability. Dispositions are
durable and replayable.

- **Local durable queue.** A disposition is written to the working repo
  (`rhiz-proposals/<id>.dispositioned.json`) the instant the human acts,
  independent of whether the server/CLI is reachable. The human's judgment is
  never lost to a network failure.
- **Queue state machine.** Each queued disposition has a `delivery` field:
  `"pending" | "in-flight" | "actioned" | "failed"`. The server transitions it
  as it picks up, executes, and writes the result artifact.
- **Retry UI.** A dedicated "Pending actions" view lists every disposition not
  yet `actioned`, with its delivery state, last attempt time, and any error
  from a `failed` attempt. Each row has a manual **Retry** control; the server
  also retries `failed`/`pending` items with backoff when it reconnects.
- **Offline-first parity.** With no server at all, docket still functions as
  today's standalone tool: dispositions accumulate in the queue and are applied
  whenever an agent/CLI next runs against the repo. The server is an
  accelerator, not a dependency.

#### DP-3 — Exploratory vs. actionable work are first-class, distinct modes

Not every proposal wants to become a commit. The lifecycle distinguishes
deliberation from execution explicitly so exploratory threads don't get forced
through an action gate.

- **`mode` field on every proposal:** `"exploratory" | "actionable"`.
  - `exploratory`: no action gate, no `actionable` execution path. Dispositions
    on exploratory proposals capture the human's *thinking* (notes, direction,
    "pursue this / drop this / merge with prop-X") and never invoke the Claude
    CLI to commit. The output is a recorded decision, not a code change.
    Closing an exploratory thread can *spawn* an actionable proposal that
    references it (`parent_proposal`).
  - `actionable`: eligible for the disposition → action path described in
    Phase 8.
- **Grouped exploratory proposals.** Related exploratory ideas ("5 options for
  improving X") render as a single grouped card in the queue, dispositioned
  together, so exploration doesn't flood the queue with one-off items.
- **Promotion, not duplication.** Promoting an exploratory thread to actionable
  creates a new `actionable` proposal linked to the explored one — preserving
  the reasoning trail rather than mutating the original's mode in place.

These three principles share one rule: **the human's judgment step is never
removed or automated away** — only the surrounding ceremony (artifact authoring,
round-trips, action gating) is scaled to the weight and mode of the change.

### Comparison to decision record patterns

| Pattern | docket approach | Tradeoff |
|---|---|---|
| **ADRs** | docket is more executable (agent acts); ADR is more deliberative (humans decide). | docket requires immediate action readiness; ADR allows long-term documentation. |
| **RFCs** | docket has tighter human-agent loop; RFC is typically human-to-human. | docket closes feedback faster; RFC builds broader consensus. |
| **GitHub PR + comments** | docket has explicit disposition states; PR review is implicit. | docket is more structured; PRs are more flexible and informal. |
| **Issue + labels** | docket is proposal-centric (agent initiates); issues are typically human-initiated. | docket is AI-first; issues are human-first. |
| **Experiment logs (Codeium)** | docket is qualitative + hypothesis-driven; experiment logs are quantitative + test-driven. | docket is for prose/strategy; experiment logs are for model/data. |

### Recommendation: Hybrid adoption path

**Phase 0 (current):** docket as a standalone review UI, no server integration.
This is working and valuable. Keep it.

**Phase 8 (future):** Introduce server + Claude CLI integration *only for
workflows where*:
- The proposal's `mode` is `actionable` (per DP-3) — exploratory proposals
  never reach the execution path.
- The disposition is "Approved" (not "Request changes" or "Rejected").
- The agent CLI is confirmed available and healthy — and when it is not, the
  disposition still lands in the durable offline queue (per DP-2) for later
  replay.

This keeps the feedback loop optional and does not require immediate
infrastructure changes. Trivial-weight proposals (per DP-1) continue to commit
in a single click as they do today.

**Phase 9 (future):** Add confirmation phase with result artifacts, gating
the human's ability to close the loop on "Did this fix work?"

**Not recommended:** Requiring all proposals to go through the full lifecycle.
Some proposals are advisory (no action needed); some are exploratory (no
single right answer). Tagging and filtering let the user choose when to
invoke the full cycle vs. when to use docket as a lightweight review tool.

---

## Shared UI/UX Layer — `rootstock` (decided 2026-06-22)

docket, tessel, and other apps in this family repeatedly re-fix the same
*modular UI* bugs — focus loss on re-render, theme-unaware components
(white-on-grey pills), pane/dock behavior, single-file build packaging — none
of which are about any one app's domain. Today docket's UI shell is a hand
*copy* of tessel's patterns, so every shared fix has to be re-ported by hand
and drifts out of sync.

**Decision:** extract the shared, domain-agnostic UI/UX layer into its own
dedicated repository, **`rootstock`**, consumed as a package by docket, tessel,
broodforge, and future apps. Central fixes then flow to every app at once.

**Scope of `rootstock`** (the reusable shell, no app domain logic):
- ThemeManager + the full CSS-var token contract + A/B theme pill
- Top-level menu / toolbar + dropdown system
- Dockable / undockable / floating / collapsible pane system
- Theme-aware primitives: buttons, tag/chip pills, form controls, badges,
  scrollbars, focus rings — all referencing tokens, never hardcoded colors
- StorageEngine, icon factory, the `el()` DOM helper

**Sequencing — hybrid (stabilize in tessel, then mirror, then extract):**
1. Treat **tessel** as the canonical source of the shared patterns.
2. **Mirror** docket's shared UI to match tessel exactly so the two are aligned
   where shared (in progress: token contract, tinted theme-aware chips,
   semantic status tokens, focus convention, theme-pill behavior).
3. **Extract** the aligned baseline into `rootstock`; switch tessel and docket
   to consume it. Decide distribution (npm workspace / package / submodule) at
   extraction time.

**Token contract (mirrored from tessel):** `--bg`, `--surface`, `--surface2`,
`--border`, `--text`, `--muted`, `--accent`, `--accent-text`, `--field-bg`,
`--field-border`; semantic status tokens kept constant in `:root`
(`--green`, `--gold`, `--orange`, `--red`, `--info`). Rule: any colored
background pairs with a matching foreground token (`--accent` → `--accent-text`;
tinted chips use a translucent hue tint + `--text`). Never literal
white-on-grey.

**Still to mirror before extraction:** the dock/floating-pane system
(PaneFactory / DockSystem / FloatingPane) — docket currently uses a static
CSS-grid three-panel layout; tessel uses flex dock zones with
collapse/float/PiP. This is the largest remaining gap and is best ported as
part of standing up `rootstock` rather than bolted onto docket's grid.

---
