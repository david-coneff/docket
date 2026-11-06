<?php

namespace Kanboard\Plugin\Docket;

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
