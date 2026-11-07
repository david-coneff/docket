<li <?= $this->app->checkMenuSelection('DecisionController', 'inbox') ?>>
    <?= $this->url->link(t('Decisions'), 'DecisionController', 'inbox', array('plugin' => 'Docket')) ?>
</li>
