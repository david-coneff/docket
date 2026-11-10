<?php

namespace Kanboard\Plugin\Docket\Controller;

use Kanboard\Controller\BaseController;
use Kanboard\Plugin\Docket\Lib\Journal;

/**
 * A task's journal history, a page at a time (rhizome pando-0544; Lib/Journal.php says what is
 * shown and why). Both actions answer JSON for Assets/docket.js; a project viewer may read them
 * (Plugin.php), and `getTask()` refuses a task of a project the viewer cannot see.
 */
class JournalController extends BaseController
{
    /**
     * One page of entries, as HTML for the history list: task_id; system (1: system rows too);
     * collapse (1: fold their runs); before (seq, 0 for the newest); lo (lowest seq, for one
     * folded run); limit (at most Journal::PAGE).
     */
    public function history()
    {
        $task = $this->getTask();
        $system = $this->request->getIntegerParam('system') === 1;
        $page = $this->journalModel->page(
            $task['id'],
            $system,
            $this->request->getIntegerParam('collapse', 1) === 1,
            $this->request->getIntegerParam('before'),
            $this->request->getIntegerParam('lo'),
            $this->request->getIntegerParam('limit', Journal::PAGE)
        );
        $this->response->json(array(
            'html' => $this->template->render('docket:task/history_entries', array(
                'task' => $task, 'entries' => $page['entries'], 'system' => $system)),
            'count' => count($page['entries']),
            'more' => $page['more'],
            'next_before' => $page['next_before'],
        ));
    }

    /** The full words of one entry: task_id, seq. */
    public function entry()
    {
        $task = $this->getTask();
        $row = $this->journalModel->row($task['id'], $this->request->getIntegerParam('seq'));
        if (! $row) {
            $this->response->json(array('error' => 'no such entry'), 404);
            return;
        }
        $this->response->json(array('seq' => (int) $row['seq'], 'text' => (string) $row['body']));
    }
}
