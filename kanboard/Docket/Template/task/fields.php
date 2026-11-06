<?php
/*
 * Attached at template:task:sidebar:information, inside the sidebar's list. Shows every rhiz_*
 * metadata key on the task, read-only: rhizome's render writes them and git stays the source of
 * truth (docs/kanboard-docket-design.md 3.4). Shows nothing on a task rhizome did not render.
 * Variables (from the hook): $task.
 */
use Kanboard\Plugin\Docket\Lib\Ruling;

$fields = Ruling::fields($this->app->taskMetadataModel->getAll($task['id']));
if (! $fields) {
    return;
}
?>
<li class="docket-fields">
    <details>
        <summary><?= t('rhizome fields (%d)', count($fields)) ?></summary>
        <dl>
            <?php foreach ($fields as $f): ?>
                <dt><?= $this->text->e($f['name']) ?></dt>
                <?php if ($f['json'] !== null): ?>
                    <dd><pre><?= $this->text->e($f['json']) ?></pre></dd>
                <?php else: ?>
                    <dd><?= $this->text->e($f['value']) ?></dd>
                <?php endif ?>
            <?php endforeach ?>
        </dl>
        <p class="docket-fields-note"><?= t('Read-only: rhizome writes these, and its work store in git is their source.') ?></p>
    </details>
</li>
