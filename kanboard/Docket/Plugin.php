<?php

namespace Kanboard\Plugin\Docket;

use JsonRPC\Exception\AccessDeniedException;
use Kanboard\Core\Plugin\Base;
use Kanboard\Core\Security\Role;
use Kanboard\Plugin\Docket\Filter\DecisionFilter;

/**
 * docket on Kanboard: the decision inbox (docs/kanboard-docket-design.md).
 *
 * rhizome renders its work items into Kanboard (`rhiz work project --to kanboard`); this plugin
 * adds what stock Kanboard lacks for ruling on a decision brief: a form that picks one or several
 * options, enforces the options' exclusions, and requires words for OTHER; the state of a
 * submitted ruling; and one inbox of every pending decision.
 */
class Plugin extends Base
{
    public function initialize()
    {
        $this->template->hook->attach('template:task:show:before-description', 'docket:task/ruling');
        $this->template->hook->attach('template:dashboard:sidebar', 'docket:dashboard/sidebar');
        $this->template->hook->attach('template:task:sidebar:information', 'docket:task/fields');
        $this->hook->on('template:layout:css', array('template' => 'plugins/Docket/Assets/docket.css'));
        $this->hook->on('template:layout:js', array('template' => 'plugins/Docket/Assets/docket.js'));

        $this->route->addRoute('/docket/inbox', 'DecisionController', 'inbox', 'Docket');

        // A viewer may read a decision; ruling on one takes a project member.
        $this->projectAccessMap->add('DecisionController', 'save', Role::PROJECT_MEMBER);
        $this->applicationAccessMap->add('DecisionController', 'inbox', Role::APP_USER);

        $this->container->extend('taskLexer', function ($builder, $c) {
            $builder->withFilter(DecisionFilter::getInstance()->setDatabase($c['db']));
            return $builder;
        });

        $this->api->getProcedureHandler()->withClassAndMethod('getDocketRulings', $this);
    }

    /**
     * JSON-RPC `getDocketRulings(project_id?)`: every submitted ruling, in one call (design 3.5).
     * A plugin procedure gets no project ACL from Kanboard, so this checks it: with a user's
     * credentials only that user's projects are read, and a named project they cannot see is
     * refused; the application token reads every project, as Kanboard's own procedures do.
     */
    public function getDocketRulings($project_id = null)
    {
        $project_ids = $project_id === null || $project_id === '' ? null : array((int) $project_id);
        if ($this->userSession->isLogged()) {
            $user = $this->userSession->getAll();
            $visible = $this->decisionModel->visibleProjectIds($user);
            if ($project_ids === null) {
                $project_ids = $visible;
            } elseif (! in_array($project_ids[0], array_map('intval', $visible), true)) {
                throw new AccessDeniedException('Project Access Denied');
            }
        }
        return $this->decisionModel->submittedRulings($project_ids);
    }

    public function getClasses()
    {
        return array(
            'Plugin\Docket\Model' => array('DecisionModel'),
        );
    }

    public function getPluginName()
    {
        return 'Docket';
    }

    public function getPluginDescription()
    {
        return t('A decision inbox for rhizome\'s work items: rule on a brief by picking one or several options, or OTHER in your own words.');
    }

    public function getPluginAuthor()
    {
        return 'docket';
    }

    public function getPluginVersion()
    {
        return '0.1.0';
    }

    public function getPluginHomepage()
    {
        return '';
    }

    public function getCompatibleVersion()
    {
        return '>=1.2.56';
    }
}
