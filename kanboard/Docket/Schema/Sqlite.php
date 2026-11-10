<?php

namespace Kanboard\Plugin\Docket\Schema;

use PDO;

/*
 * The Docket plugin's own table (Kanboard runs version_N in order, once each; DB_DRIVER picks this
 * file). docket_journal holds every journal row of a rhizome work item as rhizome's render sent it
 * (`saveDocketJournal`, rhizome pando-0544, option 5(a)): seq is the row's file position, 1..n
 * with no gap; jkey a hash chained over every row up to it; cls meaningful or system; grp the run
 * a system row collapses under. A task's rows go with the task.
 */
const VERSION = 1;

function version_1(PDO $pdo)
{
    $pdo->exec('CREATE TABLE docket_journal (
        id INTEGER PRIMARY KEY,
        task_id INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        jkey VARCHAR(16) NOT NULL,
        ts VARCHAR(32) NOT NULL DEFAULT \'\',
        actor VARCHAR(64) NOT NULL DEFAULT \'\',
        kind VARCHAR(32) NOT NULL DEFAULT \'\',
        cls VARCHAR(16) NOT NULL DEFAULT \'\',
        grp VARCHAR(64) NOT NULL DEFAULT \'\',
        head VARCHAR(255) NOT NULL DEFAULT \'\',
        body TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        UNIQUE (task_id, seq),
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )');
    $pdo->exec('CREATE INDEX docket_journal_cls_idx ON docket_journal(task_id, cls, seq)');
}
