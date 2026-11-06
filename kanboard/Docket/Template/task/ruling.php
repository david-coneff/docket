<?php
/*
 * Attached at template:task:show:before-description. Shows nothing on a task without a decision.
 * Variables (from the hook): $task, $project.
 */
$decision = $this->app->decisionModel->forTask($task['id']);
if ($decision === null) {
    return;
}
$state = $decision['ruling_state'];
?>
<section class="docket-decision" id="docket-decision">
    <div class="page-header"><h2><?= t('Decision') ?></h2></div>
    <?php if (! $decision['pending']): ?>
        <p class="docket-state docket-applied">
            <?= t('Ruled: option %s.', $this->text->e($decision['ruled_option'])) ?>
        </p>
    <?php else: ?>
        <?php if ($decision['stale']): ?>
            <p class="docket-state docket-stale">
                <?= t('A ruling was submitted against an earlier brief. The brief has changed since: rule again.') ?>
            </p>
        <?php elseif ($state === 'submitted'): ?>
            <p class="docket-state docket-submitted">
                <?= t('Submitted: option %s, by %s at %s. rhizome records it at its next import; you may still change it.',
                    $this->text->e(implode(',', array_merge(array_map('strval', $decision['ruling']['options']),
                        ! empty($decision['ruling']['other']) ? array('other') : array()))),
                    $this->text->e($decision['ruling']['user']), $this->text->e($decision['ruling']['at'])) ?>
            </p>
        <?php elseif ($state === 'refused'): ?>
            <p class="docket-state docket-refused">
                <?= t('rhizome refused the last ruling; its reason is in the comments. Rule again.') ?>
            </p>
        <?php elseif ($state === 'applied'): ?>
            <p class="docket-state docket-applied">
                <?= t('rhizome recorded your ruling (option %s). This task leaves the decision column at the next render.',
                    $this->text->e(implode(',', array_merge(array_map('strval', $decision['ruling']['options']),
                        ! empty($decision['ruling']['other']) ? array('other') : array())))) ?>
            </p>
        <?php endif ?>
        <?php if ($state !== 'applied' || $decision['stale']): ?>
            <?= $this->render('docket:decision/form', array('task' => $task, 'decision' => $decision, 'back' => 'task')) ?>
        <?php endif ?>
    <?php endif ?>
</section>
