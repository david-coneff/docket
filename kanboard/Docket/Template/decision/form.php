<?php
/*
 * The ruling form for one decision: one checkbox per option, OTHER last, and the operator's
 * words. `data-excludes` lets docket.js grey out what a ticked option rules out; the server
 * checks the same rules (Lib/Ruling.php) whatever the browser did.
 * Variables: $task, $decision (DecisionModel::forTask), $back ('task' or 'inbox').
 */
$ruling = $decision['ruling'];
$current = $ruling && ! $decision['stale'] ? $ruling : null;
$ticked = $current ? array_map('intval', $current['options']) : array();
?>
<form class="docket-ruling" method="post" action="<?= $this->url->href('DecisionController', 'save', array(
    'plugin' => 'Docket', 'task_id' => $task['id'], 'project_id' => $task['project_id'], 'back' => $back)) ?>" autocomplete="off">
    <?= $this->form->csrf() ?>
    <fieldset>
        <legend><?= t('Your ruling') ?> <span class="docket-hint"><?= t('tick one or several') ?></span></legend>
        <?php foreach ($decision['options'] as $option): ?>
            <?php if ($option['other']): ?>
                <label class="docket-option docket-other">
                    <input type="checkbox" name="other" value="1" <?= $current && ! empty($current['other']) ? 'checked' : '' ?>>
                    <?= $option['n'] ? $this->text->e($option['n']).'. ' : '' ?><strong><?= t('OTHER') ?></strong>
                    <span class="docket-hint"><?= t('your words below are the option') ?></span>
                </label>
            <?php else: ?>
                <label class="docket-option">
                    <input type="checkbox" name="options[]" value="<?= $this->text->e($option['n']) ?>"
                           data-excludes="<?= $this->text->e(implode(',', $option['excludes'])) ?>"
                           <?= in_array($option['n'], $ticked, true) ? 'checked' : '' ?>>
                    <?= $this->text->e($option['n']) ?>. <?= $this->text->e($option['title']) ?>
                    <?php if ($option['excludes']): ?>
                        <span class="docket-hint"><?= t('not with %s', implode(', ', $option['excludes'])) ?></span>
                    <?php endif ?>
                </label>
            <?php endif ?>
        <?php endforeach ?>
        <label for="docket-words-<?= $task['id'] ?>"><?= t('Your words (required for OTHER; otherwise optional)') ?></label>
        <textarea id="docket-words-<?= $task['id'] ?>" name="words" rows="4"></textarea>
        <div class="form-actions">
            <button type="submit" class="btn btn-blue"><?= $current ? t('Change ruling') : t('Rule') ?></button>
        </div>
    </fieldset>
</form>
