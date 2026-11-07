<?php

namespace Kanboard\Plugin\Docket\Model;

use Kanboard\Core\Base;
use Kanboard\Model\TaskModel;
use Kanboard\Plugin\Docket\Lib\Ruling;

/**
 * A task's decision as the board holds it, and the operator's submission of a ruling.
 *
 * rhizome's render (`rhiz work project --to kanboard`) writes the `rhiz_*` metadata and owns it;
 * this plugin writes only `docket_*` keys and one comment per submission. The importer
 * (`--rulings`) reads `docket_ruling` back, records `rhiz work rule`, and sets
 * `docket_ruling_state` to `applied` or `refused` (docs/kanboard-docket-design.md 3.1-3.2).
 */
class DecisionModel extends Base
{
    const COMMENT_REFERENCE = 'docket:ruling';
    const SUBMITTED = 'submitted';
    const APPLIED = 'applied';
    const REFUSED = 'refused';
    // TaskMetadataModel names its table through getTable(), not a constant.
    const META_TABLE = 'task_has_metadata';

    /** The decision on this task, or null when it carries none. */
    public function forTask($task_id)
    {
        $meta = Ruling::joinChunks($this->taskMetadataModel->getAll($task_id));
        $state = isset($meta['rhiz_decision']) ? $meta['rhiz_decision'] : '';
        if ($state === '') {
            return null;
        }
        $brief = isset($meta['rhiz_decision_brief']) ? $meta['rhiz_decision_brief'] : '';
        $record = isset($meta['docket_ruling']) ? $meta['docket_ruling'] : '';
        $decoded = json_decode($record, true);
        return array(
            'pending' => $state === 'pending',
            'options' => Ruling::options(isset($meta['rhiz_decision_options']) ? $meta['rhiz_decision_options'] : ''),
            'brief' => $brief,
            'ruling' => is_array($decoded) ? $decoded : null,
            'ruling_state' => isset($meta['docket_ruling_state']) ? $meta['docket_ruling_state'] : '',
            'stale' => $record !== '' && Ruling::isStale($record, $brief),
            'ruled_option' => isset($meta['rhiz_ruled_option']) ? $meta['rhiz_ruled_option'] : '',
        );
    }

    /**
     * Submit a ruling: [true, comment id] or [false, problems]. The comment holds the operator's
     * words (BG-25's source for them); `docket_ruling` names it.
     */
    public function submit(array $task, array $user, array $values)
    {
        $decision = $this->forTask($task['id']);
        if ($decision === null || ! $decision['pending']) {
            return array(false, array('This task has no pending decision.'));
        }
        $picked = Ruling::picked(isset($values['options']) && is_array($values['options']) ? $values['options'] : array());
        $other = ! empty($values['other']);
        $words = isset($values['words']) ? $values['words'] : '';
        $problems = Ruling::problems($decision['options'], $picked, $other, $words);
        if ($problems) {
            return array(false, $problems);
        }
        $comment_id = $this->commentModel->create(array(
            'task_id' => $task['id'],
            'user_id' => $user['id'],
            'comment' => Ruling::commentText($picked, $other, $words),
            'reference' => self::COMMENT_REFERENCE,
        ));
        if ($comment_id === false) {
            return array(false, array('The ruling comment could not be saved.'));
        }
        $this->taskMetadataModel->save($task['id'], array(
            'docket_ruling' => Ruling::record($picked, $other, $comment_id, $user['username'],
                gmdate('Y-m-d\TH:i:s\Z'), $decision['brief']),
            'docket_ruling_state' => self::SUBMITTED,
        ));
        return array(true, $comment_id);
    }

    /**
     * The inbox: every open task with a pending decision in the given projects, highest priority
     * first, then oldest brief, as `rhiz work ready` orders work. Each row carries its decision.
     */
    public function pending(array $project_ids)
    {
        if (! $project_ids) {
            return array(array(), array());
        }
        $task_ids = $this->db->table(self::META_TABLE)
            ->eq('name', 'rhiz_decision')
            ->eq('value', 'pending')
            ->findAllByColumn('task_id');
        if (! $task_ids) {
            return array(array(), array());
        }
        $tasks = $this->db->table(TaskModel::TABLE)
            ->columns(TaskModel::TABLE.'.id', TaskModel::TABLE.'.title', TaskModel::TABLE.'.reference',
                TaskModel::TABLE.'.priority', TaskModel::TABLE.'.project_id', TaskModel::TABLE.'.swimlane_id',
                'swimlanes.name AS swimlane_name', 'projects.name AS project_name')
            ->join('swimlanes', 'id', 'swimlane_id', TaskModel::TABLE)
            ->join('projects', 'id', 'project_id', TaskModel::TABLE)
            ->in(TaskModel::TABLE.'.id', $task_ids)
            ->in(TaskModel::TABLE.'.project_id', $project_ids)
            ->eq(TaskModel::TABLE.'.is_active', TaskModel::STATUS_OPEN)
            ->findAll();
        $open = array();
        $submitted = array();
        foreach ($tasks as $task) {
            $task['decision'] = $this->forTask($task['id']);
            if ($task['decision'] === null) {
                continue;
            }
            if ($task['decision']['ruling_state'] === self::SUBMITTED && ! $task['decision']['stale']) {
                $submitted[] = $task;
            } else {
                $open[] = $task;
            }
        }
        $order = function ($a, $b) {
            if ((int) $a['priority'] !== (int) $b['priority']) {
                return (int) $b['priority'] - (int) $a['priority'];
            }
            return strcmp($a['decision']['brief'], $b['decision']['brief']) ?: strcmp($a['reference'], $b['reference']);
        };
        usort($open, $order);
        usort($submitted, $order);
        return array($open, $submitted);
    }

    /**
     * The read-back (docs/kanboard-docket-design.md 3.5): every task in `$project_ids` (null: every
     * project) whose `docket_ruling_state` is `submitted`, with its reference, its ruling and the
     * brief the task now carries, so the importer needs one call instead of one per task. `stale`
     * says the ruling answered an earlier brief, which the importer does not record.
     */
    public function submittedRulings($project_ids = null)
    {
        if (is_array($project_ids) && ! $project_ids) {
            return array();
        }
        $task_ids = $this->db->table(self::META_TABLE)
            ->eq('name', 'docket_ruling_state')
            ->eq('value', self::SUBMITTED)
            ->findAllByColumn('task_id');
        if (! $task_ids) {
            return array();
        }
        $query = $this->db->table(TaskModel::TABLE)
            ->columns('id', 'project_id', 'reference', 'title', 'is_active')
            ->in('id', $task_ids)
            ->asc('id');
        if (is_array($project_ids)) {
            $query->in('project_id', $project_ids);
        }
        $out = array();
        foreach ($query->findAll() as $task) {
            $meta = Ruling::joinChunks($this->taskMetadataModel->getAll($task['id']));
            $record = isset($meta['docket_ruling']) ? $meta['docket_ruling'] : '';
            $brief = isset($meta['rhiz_decision_brief']) ? $meta['rhiz_decision_brief'] : '';
            $decoded = json_decode($record, true);
            $out[] = array(
                'task_id' => (int) $task['id'],
                'project_id' => (int) $task['project_id'],
                'reference' => $task['reference'],
                'title' => $task['title'],
                'is_active' => (int) $task['is_active'],
                'docket_ruling' => is_array($decoded) ? $decoded : null,
                'brief' => $brief,
                'stale' => $record !== '' && Ruling::isStale($record, $brief),
            );
        }
        return $out;
    }

    /** The projects this user may see: all active ones for an administrator. */
    public function visibleProjectIds(array $user)
    {
        if ($user['role'] === \Kanboard\Core\Security\Role::APP_ADMIN) {
            return $this->db->table('projects')->eq('is_active', 1)->findAllByColumn('id');
        }
        return $this->projectPermissionModel->getActiveProjectIds($user['id']);
    }
}
