<?php
/*
 * The Re-brief control under a pending decision (rhizome pando-0555). Shows the request's state
 * while one is open, and the button otherwise. Variables: $task.
 */
use Kanboard\Plugin\Docket\Model\RebriefModel;

$rebrief = $this->app->rebriefModel->forTask($task['id']);
?>
<div class="docket-rebrief">
    <?php if (RebriefModel::isOpen($rebrief)): ?>
        <p class="docket-state docket-submitted">
            <?= $rebrief['state'] === RebriefModel::QUEUED
                ? t('Re-brief in progress: rhizome\'s briefing stream took the request of %s (%s).', $this->text->e($rebrief['by']), $this->text->e($rebrief['at']))
                : t('Re-brief requested by %s at %s; waiting for rhizome to pick it up.', $this->text->e($rebrief['by']), $this->text->e($rebrief['at'])) ?>
        </p>
    <?php else: ?>
        <?php if ($rebrief !== null && $rebrief['state'] === RebriefModel::FAILED): ?>
            <p class="docket-state docket-refused"><?= t('The last re-brief failed: %s', $this->text->e($rebrief['note'])) ?></p>
        <?php elseif ($rebrief !== null && $rebrief['state'] === RebriefModel::DONE): ?>
            <p class="docket-state docket-applied"><?= t('Re-briefed (requested by %s at %s).', $this->text->e($rebrief['by']), $this->text->e($rebrief['at'])) ?></p>
        <?php endif ?>
        <?php if ($this->user->hasProjectAccess('RebriefController', 'request', $task['project_id'])): ?>
            <?= $this->url->link(t('Re-brief this decision'), 'RebriefController', 'request',
                array('plugin' => 'Docket', 'task_id' => $task['id'], 'project_id' => $task['project_id'], 'csrf_token' => $this->app->token->getReusableCSRFToken()),
                false, 'btn docket-rebrief-button', t('Ask rhizome for a fresh, re-verified brief on this one decision')) ?>
        <?php endif ?>
    <?php endif ?>
</div>
