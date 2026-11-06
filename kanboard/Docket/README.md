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

**Install:** copy or link this directory to Kanboard's `plugins/Docket`.

**Test:**
- `python3 test/test_kanboard_plugin.py` runs end to end against the local Kanboard that
  `setup-kanboard-env.sh` installs. It skips when that Kanboard is absent.
- `test/php/ruling_test.php` checks the ruling rules with plain PHP.
