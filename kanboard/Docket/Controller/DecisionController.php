<?php

namespace Kanboard\Plugin\Docket\Controller;

use Kanboard\Controller\BaseController;

/**
 * The decision inbox and the ruling form's submission (docs/kanboard-docket-design.md 3.1, 3.3).
 */
class DecisionController extends BaseController
{
    /** Every pending decision the user can see, across projects. */
    public function inbox()
    {
        $user = $this->sessionUser();
        list($open, $submitted) = $this->decisionModel->pending($this->decisionModel->visibleProjectIds($user));
        $this->response->html($this->helper->layout->app('docket:decision/inbox', array(
            'title' => t('Decisions'),
            'open' => $open,
            'submitted' => $submitted,
            'user' => $user,
        )));
    }

    /** Record a ruling on one task; back to where the form was. */
    public function save()
    {
        $task = $this->getTask();
        $values = $this->request->getValues();
        if (! $values) {
            throw new \Kanboard\Core\Controller\AccessForbiddenException();
        }
        list($ok, $result) = $this->decisionModel->submit($task, $this->sessionUser(), $values);
        if ($ok) {
            $this->flash->success(t('Ruling submitted. rhizome records it at its next import.'));
        } else {
            $this->flash->failure(implode(' ', $result));
        }
        $back = $this->request->getStringParam('back') === 'inbox'
            ? $this->helper->url->to('DecisionController', 'inbox', array('plugin' => 'Docket'))
            : $this->helper->url->to('TaskViewController', 'show', array('task_id' => $task['id']));
        $this->response->redirect($back);
    }

    /**
     * The signed-in user. Not `getUser()`, which honours a `user_id` parameter for an
     * administrator: a ruling is always the words of whoever is signed in.
     */
    private function sessionUser()
    {
        $user = $this->userModel->getById($this->userSession->getId());
        if (empty($user)) {
            throw new \Kanboard\Core\Controller\AccessForbiddenException();
        }
        return $user;
    }
}
