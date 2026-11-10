# Docket — a decision inbox for Kanboard

A Kanboard plugin (Kanboard >= 1.2.56). rhizome renders its work items into Kanboard with
`rhiz work project --to kanboard`. This plugin adds what stock Kanboard lacks for ruling on a
decision brief. The design is [`docs/kanboard-docket-design.md`](../../docs/kanboard-docket-design.md).

**What it adds:**
- **The ruling form**, on any task whose metadata says `rhiz_decision = pending`.
  - One checkbox per option, so you can pick one or several.
  - Options that exclude each other can't be ticked together. The page greys them out, and the
    server refuses the pair anyway.
  - OTHER is always offered, and it needs your words.
  - A submission writes two things. Your words become a comment (reference `docket:ruling`), which
    BG-25 accepts as the source of an operator ruling. `docket_ruling` is a short JSON record:
    options, other, comment id, user, time, and the brief it answers.
- **The delivery state**, `docket_ruling_state`.
  - The form sets `submitted`.
  - rhizome's importer sets `applied` or `refused`.
  - A submission made against an older brief is shown as stale.
- **The inbox**, at Dashboard > Decisions (`/docket/inbox`).
  - It lists every pending decision you can see, highest priority first, then oldest brief.
  - You can rule from each row.
  - Submissions not yet recorded by rhizome are listed separately.
- **`decision:pending`** as a search filter on the board.
- **The rhizome fields panel**, in the task sidebar under Information.
  - It shows every `rhiz_*` key on the task, without the prefix, its parts joined. JSON values
    are indented.
  - It is read-only: rhizome writes these, and its work store in git is their source.
- **The history**, on the task page above the comments (rhizome `pando-0544`).
  - It shows the newest three people's entries from the item's journal: creation, status moves,
    amends, plain comments, briefs and rulings.
  - "show system entries" adds the machine rows: rechecks, claims, workable and live-check marks,
    field changes, commit evidence. A run of one kind is folded into one line, e.g. `recheck ×9`,
    that opens on a click.
  - Each entry shows at most 600 characters; "show all (N KB)" fetches the rest.
  - "show older" loads 20 entries, or 64 KB, at a time, newest first.
  - The rules are `Lib/Journal.php`; a project viewer may read the history.
- **`getDocketJournalHeads(project_id)`** and **`saveDocketJournal(task_id, rows, replace)`**,
  JSON-RPC procedures for rhizome's render only (the application token; a user's login is
  refused with HTTP 403).
  - The heads say how many rows each task holds and the last row's key, a hash chained over every
    row before it. The render then sends only the rows a task lacks, or all of them when the
    prefix changed.
  - Rows that do not continue from what is held are refused whole.
- **A Re-brief button** under a pending decision (rhizome `pando-0555`): a project member asks for
  a fresh, re-verified brief on that one decision.
  - The request is stored on the task as `docket_rebrief`: its state, who asked, when, and a note of
    at most 100 characters. States: `requested` (not yet picked up), `queued` (handed to rhizome's
    briefing stream), `done` (a new brief was filed; it reaches the task with the next render),
    `failed` (the note says why).
  - While a request is `requested` or `queued`, the task shows its state instead of the button.
  - **`getDocketRebriefRequests(project_id?)`** returns every open request, oldest first, and
    **`setDocketRebriefState(task_id, state, note?)`** moves one on. Both take the application
    token only: they are for rhizome's poll.
- **`getDocketRulings(project_id?)`**, a JSON-RPC procedure.
  - It returns every task whose `docket_ruling_state` is `submitted`, in one call: task id,
    project, reference, title, the `docket_ruling` record, the task's current brief, and `stale`.
  - With the application token it reads every project, or the one named.
  - With a user's own login it reads only that user's projects. Naming a project the user cannot
    see is refused with HTTP 403.

**Data it reads and writes:**
- **Reads:** rhizome's `rhiz_*` task metadata. A long value arrives in parts
  (`rhiz:chunks:<n>`, then `#1`..`#n`), because PostgreSQL holds a value in 255 characters.
- **Writes:** only `docket_*` keys and the ruling comment.
- **Its own table:** `docket_journal` (`Schema/`; Kanboard migrates it when the plugin loads). It
  holds every journal row rhizome sent. A task's rows are deleted with the task.

**Install:** copy or link this directory to Kanboard's `plugins/Docket`.

**Test:**
- `python3 test/test_kanboard_plugin.py` runs end to end against the local Kanboard that
  `setup-kanboard-env.sh` installs. It skips when that Kanboard is absent.
- `test/php/ruling_test.php` checks the ruling rules with plain PHP, and
  `test/php/journal_test.php` checks the history's paging rules.
