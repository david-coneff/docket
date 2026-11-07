<?php
/*
 * Every pending decision the user can see, highest priority first, then oldest brief; the ones
 * already submitted and waiting for rhizome to record them are listed apart.
 * Variables: $open, $submitted (DecisionModel::pending), $user.
 */
?>
<div class="page-header">
    <h2><?= t('Decisions awaiting your ruling') ?> (<?= count($open) ?>)</h2>
</div>
<?php if (! $open): ?>
    <p class="alert"><?= t('No decision is waiting for you.') ?></p>
<?php endif ?>
<?php foreach ($open as $task): ?>
    <details class="docket-row" <?= count($open) === 1 ? 'open' : '' ?>>
        <summary>
            <span class="docket-ref"><?= $this->text->e($task['reference']) ?></span>
            <?= $this->text->e(preg_replace('/^.*? — /u', '', $task['title'])) ?>
            <span class="docket-meta">
                <?= $this->text->e($task['swimlane_name']) ?> ·
                <?= t('priority %d', $task['priority']) ?> ·
                <?= t('brief %s', $this->text->e($task['decision']['brief'])) ?>
                <?= $task['decision']['stale'] ? ' · '.t('stale submission') : '' ?>
            </span>
        </summary>
        <p><?= $this->url->link(t('Open the task and its brief'), 'TaskViewController', 'show', array('task_id' => $task['id'])) ?></p>
        <?= $this->render('docket:decision/form', array('task' => $task, 'decision' => $task['decision'], 'back' => 'inbox')) ?>
    </details>
<?php endforeach ?>

<?php if ($submitted): ?>
    <div class="page-header"><h3><?= t('Submitted, not yet recorded by rhizome') ?> (<?= count($submitted) ?>)</h3></div>
    <ul class="docket-submitted-list">
        <?php foreach ($submitted as $task): ?>
            <li>
                <?= $this->url->link($this->text->e($task['reference']), 'TaskViewController', 'show', array('task_id' => $task['id'])) ?>
                — <?= t('option %s', $this->text->e(implode(',', array_merge(array_map('strval', $task['decision']['ruling']['options']),
                    ! empty($task['decision']['ruling']['other']) ? array('other') : array())))) ?>,
                <?= $this->text->e($task['decision']['ruling']['at']) ?>
            </li>
        <?php endforeach ?>
    </ul>
<?php endif ?>
