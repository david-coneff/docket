# docket on Kanboard: the decision inbox as a Kanboard plugin

*Design for `docket-memory:pando-0016`, after the operator's ruling of 2026-11-06 (option OTHER):*

> "let's pivot to docket being a fork of the kanboard what implements any additional features that
> aren't stock to kanboard. I.e., if there isn't some native way to offer multiple choice (picking
> multiple options, vs. just radio button single options) of path forward, adding comments, etc. in
> a streamlined interface for the inbox of decisions, then add that to the kanboard as an
> integration on top of the existing stock features. [...] take the basic schema developed with
> docket as the forward idea [...] We do need to pivot also to a metadata schema that aligns with
> the natural vocabulary of kanboard, but if there's something missing that we did develop with the
> openproject-projection of metadata schema for work items, consider how to integrate it as the
> docket fork of kanboard."

Research behind this design was done on 2026-11-06. Sources are cited inline.

## 1. What stock Kanboard does and does not give us

Kanboard is MIT-licensed. Its latest release is v1.2.57 (2026-10-31). The README says the
application is "in maintenance mode": there are no new major features, but releases continue and
community pull requests are accepted (https://github.com/kanboard/kanboard).

| Need | Stock Kanboard | Gap |
|---|---|---|
| Show a brief and its options | Task description (Markdown), subtasks | None for display |
| Pick ONE option | No single-select field (custom fields are not native) | Yes |
| Pick SEVERAL options | Subtask ticks (todo / in progress / done) | No exclusion rules, no structured read-back, no OTHER text |
| OTHER with the operator's own words | A comment | Not tied to the pick |
| A streamlined inbox across projects | Search filters, "My dashboard" | No metadata filter; nothing lists pending decisions on their own |
| Typed fields beyond the core | Task metadata (`task_has_metadata`, a key and a text value), API only | Never shown in the UI |

rhizome's render today (`rhizome-protocol tools/rhiz_work_kanboard.py`, `pando-0524`..`0527`) uses
the stock features. It shows each option as a subtask and always adds an Other subtask. Its
importer reads the ticked subtasks plus the operator's newest comment. That works, but:
- `excludes` is invisible;
- a tick without a comment is ignored;
- nothing in the UI says a ruling was submitted, applied or refused;
- every `custom.*` field except `decision` and `workable` is dropped.

## 2. Shape: a plugin, shipped as docket's Kanboard distribution

Everything the ruling asks for fits Kanboard's plugin system
(https://docs.kanboard.org/v1/plugins/):
- template hooks, for the ruling form on the task page and an inbox panel on the dashboard;
- routes and controllers, for the inbox page;
- FormHelper `checkboxes`/`textarea`, for the ruling form;
- `$this->api->getProcedureHandler()->withCallback`, for read-back procedures;
- task metadata, for structured data;
- events and automatic actions.

Nothing found forces a hard fork. A fork would also take on merging every upstream security
release, of which there were three in October 2026.

So docket becomes:
- **`kanboard/Docket/`**, a Kanboard plugin (PHP, namespace `Kanboard\Plugin\Docket`). It is
  installed by copying it into Kanboard's `plugins/` directory. The web installer is off by
  default, and this design leaves it off.
- **A pinned distribution:** rhizome's `setup-kanboard-env.sh` installs the pinned Kanboard
  release and this plugin together, so "docket" means stock Kanboard plus the Docket plugin.

Whether the operator's word "fork" means this or a hard fork of Kanboard's source is filed as a
question (section 7). The plugin is the first step under either answer, because a hard fork would
carry the same code.

## 3. The decision inbox (the plugin's features)

### 3.1 The ruling form (task page)

The form is attached at `template:task:show:before-description` on any task whose metadata holds
`rhiz_decision = pending`. It renders:
- **One checkbox per option**, read from `rhiz_decision_options` (the JSON list rhizome stores in
  `custom.decision_options`: `{n, title, excludes[], other}`).
  - An option that excludes a ticked one is disabled while that one is ticked (client side).
  - The server re-checks the same rule on submit, as `rhiz work rule`'s `check_ruling` does, and
    refuses with the pair named.
- **OTHER**, always present. Its textarea becomes REQUIRED when it is ticked, or when nothing else
  is ticked.
- **A "your words" textarea**, always offered, so a note can go with numbered options.
- **Submit**, which writes two things:
  - a **comment** whose text is the operator's words and whose `reference` is `docket:ruling`.
    BG-25 already accepts a Kanboard comment as the source of the operator's words (`pando-0527`):
    it re-fetches the comment by id and compares author and text.
  - **metadata `docket_ruling`**, a JSON object:
    `{"options":[1,3],"other":false,"comment_id":N,"user":"<login>","at":"<ISO>","brief":"<rhiz_decision_brief>"}`.
    - `brief` binds the pick to the brief it answered. A pick made against an older brief is shown
      as stale and is not imported.
    - The operator's words are not repeated here: they are the comment `comment_id` names. That
      keeps the value under PostgreSQL's 255-character limit (section 4).

### 3.2 The ruling's delivery state

This is docket's DP-2 disposition states, carried forward. Metadata `docket_ruling_state` holds:
- `submitted`: written by the form;
- `applied`: written by rhizome's importer after `rhiz work rule` succeeds;
- `refused`: written by the importer on a `WorkError`, with the reason in a `REFUSED` comment, as
  today.

The task page shows the state, so the operator can see whether a ruling landed.

### 3.3 The inbox page

The page lives at the route `/docket/inbox`, with a link in the dashboard sidebar
(`template:dashboard:sidebar`). It lists every open task, in every project the user can see, whose
`rhiz_decision` is `pending` and whose `docket_ruling_state` is not `submitted`.
- **Columns:** reference, title, store (swimlane), priority, brief age.
- **Order:** by priority, then age, the same order as `rhiz work ready`.
- **Ruling from the inbox:** each row expands to the brief and the same ruling form, so the
  operator can rule without opening the task.
- **Submitted, not yet applied:** these show in a second section.

Kanboard's search has no metadata filter. To filter in the board itself, the plugin registers a
`decision:pending` lexer filter (the `taskLexer` container).

### 3.4 The rhizome fields panel

The panel is attached at `template:task:sidebar:information`. It renders every `rhiz_*` metadata
key on the task (section 4), so the fields the OpenProject projection carried are visible in the
board. It is read-only: git stays the source of truth.

### 3.5 Read-back API

The plugin adds one JSON-RPC procedure: `getDocketRulings(project_id?)`. It returns every task
whose `docket_ruling_state` is `submitted`, with its `docket_ruling` and `reference`, in one call
instead of one metadata call per task. Plugin procedures get no project ACL, so the callback checks
project access when it is called with user credentials.

## 4. Metadata schema in Kanboard's own vocabulary

Rule: a rhizome field goes to Kanboard's NATIVE field when one means the same thing. Otherwise it
becomes a `rhiz_*` task-metadata key, which the panel of 3.4 shows. Who writes each prefix:
- `rhiz_*` keys are written only by rhizome's render.
- `docket_*` keys are written only by the plugin. They are the operator's input, which the
  importer reads back.

| Work-item field | Kanboard native | Notes |
|---|---|---|
| id (store-qualified) | task `reference` | As today |
| title / body | task title / description | As today. The brief is appended to the description |
| status | column | As today. `Decision pending` comes first |
| store / product | **swimlane** (one per store) | Today every task goes in the first swimlane. A swimlane per store gives one board with a lane per product |
| type | **category** | Today a tag |
| priority | **task priority** (project range 0-3: low, normal, high, immediate) | Today a tag. Native priority sorts and filters (`priority:`) |
| assignee | metadata `rhiz_assignee` | Streams are not Kanboard users |
| workable | **owner**: the operator's account when `workable: operator`, otherwise unassigned; also `rhiz_workable` | "My dashboard" then lists exactly what is the operator's |
| parent | **internal link** "is a child of" / "is a parent of" | |
| relates (11 kinds) | **internal links**: blocks / is blocked by, duplicates / is duplicated by, relates to; the others as "relates to" plus `rhiz_relations` (JSON) holding the exact kind | Kanboard's link labels are configurable, so the plugin can add precedes/follows, includes/part of and requires/required by as labels. That makes the mapping exact |
| opened / closed | metadata `rhiz_opened`, `rhiz_closed` | The API cannot set Kanboard's own creation date |
| revision | metadata `rhiz_revision` | OpenProject's `lockVersion` |
| decision, decision_brief, decision_options, ruled_* | metadata `rhiz_decision`, `rhiz_decision_brief`, `rhiz_decision_options` (JSON), `rhiz_ruled_option`, `rhiz_ruled_by`, `rhiz_ruled_at` | Today only `rhiz_decision` is sent |
| live_check_*, reanalyze_*, closed-by, source, env_check, ... | metadata `rhiz_<key>`, one per field, with structured values as JSON | OpenProject's `customFields` carried the whole `custom` map; this restores it |
| uid | metadata `rhiz_uid` | |
| external.github | **external link** (web link) | |
| journal | comments, for **decision briefs and rulings only** (`reference` = `rhiz:journal:<ts>`) | OpenProject rendered the whole journal as activities. Here the full journal stays in git, and the panel links to it. Rendering all of it is filed as a question (section 7) |
| closed items | closed tasks | Already closed when their item closes |

The metadata keys follow Kanboard's advice to prefix by plugin
(https://docs.kanboard.org/v1/plugins/metadata/).

**Values in parts** (measured 2026-11-06, `pando-0544`):
- **The limit:** Kanboard's PostgreSQL schema stores a metadata name in `varchar(50)` and a value in
  `varchar(255)`. SQLite's are unbounded.
- **Why it matters:** 823 of 11,082 `custom.*` values in this stream's stores are longer than 255
  characters. The longest is 2,058, and decision options are often long.
- **How a long value is stored:**
  - `rhiz_<key>` holds `rhiz:chunks:<n>`;
  - `rhiz_<key>#1` to `rhiz_<key>#<n>` hold the text in order.
- **Who joins the parts:** the plugin's panel and ruling form join them before use, as
  `unchunk_meta` does in rhizome's `tools/rhiz_work_kanboard.py`.

## 5. docket's schema, carried forward

| docket (article review) | docket on Kanboard (decision inbox) |
|---|---|
| proposal (`prop-…`, status) | a decision task (`rhiz_decision`) |
| `file_changes[]`, each resolved on its own | `options[]` (`n`, `title`, `excludes`, `other`), each picked or not |
| file-change states (approved, …, edited-for-agent) | picked / not picked; OTHER is the `edited-for-agent` case, where the reviewer's own text is what the agent acts on |
| `comments[]` with a role (approval-note, change-request, …) | the ruling comment (`reference: docket:ruling`); later roles are possible as comment references |
| `<id>.resolved.json` | metadata `docket_ruling`, plus the ruling comment holding the words |
| DP-2 delivery states (pending, in-flight, actioned, failed) | `docket_ruling_state` (submitted, applied, refused) |
| weight tier (`weight`, `weight_agent`) | task priority, with `rhiz_priority` recording rhizome's value |
| tag taxonomy | Kanboard tags. The process tags (blocked, stale, needs-agent-analysis) become tags the render may set |
| queue: sort by importance, "ready" badge, multi-select | the inbox page's ordering and its submitted/applied sections |
| ready = nothing pending | a submission is valid when the exclusion rules hold and OTHER has words |

## 6. Split of the work

**docket** (this repo, store `docket-memory`):
- the plugin's skeleton, ruling form, delivery state and inbox page;
- the rhizome fields panel and the read-back procedure;
- the plugin's tests, run against a real Kanboard from rhizome's setup script.

**rhizome-protocol** (store `rhizome-protocol-revision-memory`):
- the render's move to the vocabulary of section 4 (swimlanes, categories, native priority, owner,
  links, the full `rhiz_*` metadata, briefs and rulings as comments);
- the importer reading `docket_ruling` first (subtask ticks stay as a fallback for a board without
  the plugin) and writing `docket_ruling_state`;
- `setup-kanboard-env.sh` installing the plugin.

## 7. Questions for the operator

These are filed as a decision item:
1. "Fork": the plugin, as distributed here, or a hard fork of Kanboard's source?
2. The existing article-review app (`docket.html`, `docket-propose.py`) and its open items: keep
   it, shelve it, or retire it?
3. The journal in the board: briefs and rulings only (the default above), or every entry?

**Ruled 2026-11-07** (`docket-memory:pando-0020`, options 1, 3 and 5, with a note):
1. **A plugin on a pinned stock Kanboard** (this design's section 2). No hard fork; changes
   Kanboard itself would need go upstream as pull requests.
2. **The article-review app stays, shelved.** Its unfinished items (`pando-0001`, `-0006`,
   `-0007`, `-0008`) wait on the operator's word; its roadmap items (`pando-0009`, `-0010`,
   `-0012` to `-0015`) are rejected as superseded by the plugin; its finished items (`pando-0003`,
   `-0004`, `-0011`) are released to run their live checks.
3. **Every journal entry may reach the board, lazily.** The operator's words: "let's make journal
   entries something that is not immediately retrieved in full, and instead lazy-loaded after the
   user chooses to uncollapse history past a certain default amount that is always
   retrieved/shown expanded to begin with (let's say three entries for a starting default)". How
   to keep that within bounds for long journals is a separate decision, filed on the protocol's
   render item (`pando-0544`) with measurements; until it is ruled, the board keeps rendering
   briefs and rulings only.

## 8. Licences

All of these were read on 2026-11-06.
- **Kanboard:** MIT (`LICENSE` in kanboard/kanboard). There are no paid editions and no CLA.
- **The Docket plugin:** no licence, like the rest of docket. `package.json` is `"private": true` and
  the repo has no LICENSE file. Kanboard's MIT licence lets a plugin carry any licence. Choosing one
  is the operator's decision, and it matters only if docket is published. (An earlier version of this
  design said "MIT, like docket". That was wrong, corrected 2026-11-06.)
- **No third-party plugin is needed.** MetaMagik (MIT) would add custom fields, but task metadata
  plus this plugin's panel covers the same need without a lightly maintained dependency.
