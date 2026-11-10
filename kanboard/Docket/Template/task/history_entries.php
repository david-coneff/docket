<?php
/*
 * The <li> entries of one history page (Lib/Journal::page), for history.php and for
 * JournalController::history. Every word is escaped: journal text is shown as written, never as
 * markup. Variables: $task, $entries, $system.
 */
foreach ($entries as $e):
    $full = $this->url->href('JournalController', 'entry', array(
        'plugin' => 'Docket', 'task_id' => $task['id'], 'project_id' => $task['project_id'], 'seq' => $e['seq']));
?>
    <li class="docket-entry docket-<?= $this->text->e($e['cls']) ?><?= $e['run'] ? ' docket-run' : '' ?>" data-seq="<?= (int) $e['seq'] ?>">
        <div class="docket-entry-head">
            <span class="docket-ts"><?= $this->text->e($e['ts']) ?></span>
            <span class="docket-actor"><?= $this->text->e($e['actor']) ?></span>
            <?php if ($e['run']): ?>
                <strong><?= t('%s ×%d, latest %s', $e['grp'], $e['count'], $e['ts']) ?></strong>
            <?php else: ?>
                <strong><?= $this->text->e($e['head']) ?></strong>
            <?php endif ?>
        </div>
        <?php if ($e['run']): ?>
            <div class="docket-entry-text"><?= $this->text->e($e['head']) ?>: <?= $this->text->e($e['text']) ?><?= $e['truncated'] ? '…' : '' ?></div>
            <button type="button" class="btn docket-run-open"
                    data-url="<?= $this->url->href('JournalController', 'history', array(
                        'plugin' => 'Docket', 'task_id' => $task['id'], 'project_id' => $task['project_id'],
                        'system' => 1, 'collapse' => 0, 'lo' => $e['from_seq'])) ?>"
                    data-before="<?= (int) $e['to_seq'] + 1 ?>"><?= t('show the %d rows', $e['count']) ?></button>
            <ol class="docket-run-rows"></ol>
        <?php else: ?>
            <div class="docket-entry-text"><?= $this->text->e($e['text']) ?><?= $e['truncated'] ? '…' : '' ?></div>
            <?php if ($e['truncated']): ?>
                <button type="button" class="btn docket-full" data-url="<?= $full ?>">
                    <?= t('show all (%s KB)', number_format($e['size'] / 1024, 1)) ?>
                </button>
            <?php endif ?>
        <?php endif ?>
    </li>
<?php endforeach ?>
