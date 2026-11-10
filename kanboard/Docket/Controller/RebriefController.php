<?php

namespace Kanboard\Plugin\Docket\Controller;

use Kanboard\Controller\BaseController;

/**
 * The Re-brief button (rhizome pando-0555): a project member asks for a fresh, re-verified brief
 * on one pending decision. The request is recorded on the task; rhizome's poll picks it up.
 */
class RebriefController extends BaseController
{
    public function request()
    {
        $task = $this->getTask();
        $this->checkReusableGETCSRFParam();
        $user = $this->userModel->getById($this->userSession->getId());
        if (empty($user)) {
            throw new \Kanboard\Core\Controller\AccessForbiddenException();
        }
        list($ok, $result) = $this->rebriefModel->request($task, $user);
        if ($ok) {
            $this->flash->success(t('Re-brief requested. rhizome\'s briefing stream picks it up within a minute; the new brief appears on this task after it lands.'));
        } else {
            $this->flash->failure($result);
        }
        $this->response->redirect($this->helper->url->to('TaskViewController', 'show', array('task_id' => $task['id'])));
    }
}
