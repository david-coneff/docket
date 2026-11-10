<?php
/*
 * Attached at template:task:show:before-comments. The task's journal as rhizome synced it
 * (rhizome pando-0544): the newest Journal::FIRST meaningful entries rendered here, the rest a
 * page at a time from JournalController (Assets/docket.js). Shows nothing on a task with no rows.
 * Variables (from the hook): $task.
 */
use Kanboard\Plugin\Docket\Lib\Journal;

$total = $this->app->journalModel->count($task['id']);
if ($total === 0) {
    return;
}
$first = $this->app->journalModel->page($task['id'], false, false, 0, 0, Journal::FIRST);
$base = function ($system) use ($task) {
    return $this->url->href('JournalController', 'history', array(
        'plugin' => 'Docket', 'task_id' => $task['id'], 'project_id' => $task['project_id'],
        'system' => $system ? 1 : 0, 'collapse' => 1));
};
?>
<section class="docket-history" id="docket-history"
         data-url-meaningful="<?= $base(false) ?>" data-url-system="<?= $base(true) ?>"
         data-first="<?= Journal::FIRST ?>" data-page="<?= Journal::PAGE ?>">
    <div class="page-header">
        <h2><?= t('History') ?></h2>
        <label class="docket-history-toggle">
            <input type="checkbox" class="docket-show-system"> <?= t('show system entries') ?>
        </label>
    </div>
    <p class="docket-history-note">
        <?= t('%d journal rows in all. Shown: the newest people\'s entries (creation, status moves, amends, comments, briefs, rulings); system entries (rechecks, marks, field changes, commit evidence) are behind the toggle.', $total) ?>
    </p>
    <ol class="docket-history-list">
        <?= $this->render('docket:task/history_entries', array('task' => $task, 'entries' => $first['entries'], 'system' => false)) ?>
    </ol>
    <button type="button" class="btn docket-older" data-before="<?= (int) $first['next_before'] ?>"
            <?= $first['more'] ? '' : 'hidden' ?>><?= t('show older') ?></button>
</section>
