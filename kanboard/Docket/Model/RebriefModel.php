<?php

namespace Kanboard\Plugin\Docket\Model;

use Kanboard\Core\Base;
use Kanboard\Model\TaskModel;

/**
 * A request to re-brief one decision (rhizome pando-0555, the operator's ruling of 2026-11-10,
 * option 1): the Re-brief button on a pending decision records who asked and when, in the task's
 * metadata; rhizome's poll reads every open request in one call, hands each to its standing
 * briefing stream, and reports back here as the request moves on.
 *
 * One short record per task, under `docket_rebrief` (a metadata value is a short column, so the
 * note is capped): {"state", "by", "at", "note"}. States:
 *   requested  the button was pressed; rhizome has not picked it up yet
 *   queued     rhizome's poll took it and handed it to the briefing stream
 *   done       a re-verified brief was filed on the item (it reaches the board by the render)
 *   failed     the briefing stream could not brief it; the note says why
 * A request that is requested or queued is open: the button is not offered again until it ends.
 */
class RebriefModel extends Base
{
    const KEY = 'docket_rebrief';
    const REQUESTED = 'requested';
    const QUEUED = 'queued';
    const DONE = 'done';
    const FAILED = 'failed';
    const NOTE_MAX = 100;
    const META_TABLE = 'task_has_metadata';

    public static function states()
    {
        return array(self::REQUESTED, self::QUEUED, self::DONE, self::FAILED);
    }

    public static function isOpen($record)
    {
        return is_array($record) && in_array($record['state'], array(self::REQUESTED, self::QUEUED), true);
    }

    /** The task's request record, or null when none was ever made. */
    public function forTask($task_id)
    {
        $raw = $this->taskMetadataModel->get($task_id, self::KEY, '');
        $rec = $raw === '' ? null : json_decode($raw, true);
        return is_array($rec) && isset($rec['state']) ? $rec : null;
    }

    /** Record a request by `$user`: [true, record], or [false, why] while one is still open. */
    public function request(array $task, array $user)
    {
        $current = $this->forTask($task['id']);
        if (self::isOpen($current)) {
            return array(false, t('A re-brief was already requested by %s at %s.', $current['by'], $current['at']));
        }
        $rec = array('state' => self::REQUESTED, 'by' => $user['username'], 'at' => gmdate('Y-m-d\TH:i:s\Z'), 'note' => '');
        $this->taskMetadataModel->save($task['id'], array(self::KEY => json_encode($rec)));
        return array(true, $rec);
    }

    /** rhizome moves a request on. Refused: an unknown state, or a task with no request. */
    public function setState($task_id, $state, $note = '')
    {
        if (! in_array($state, self::states(), true)) {
            throw new \InvalidArgumentException('state must be one of '.implode(', ', self::states()));
        }
        $rec = $this->forTask($task_id);
        if ($rec === null) {
            throw new \InvalidArgumentException('task '.(int) $task_id.' has no re-brief request');
        }
        $rec['state'] = $state;
        $rec['note'] = preg_replace('/^(.{0,'.self::NOTE_MAX.'}).*$/su', '$1', (string) $note);
        $rec['updated'] = gmdate('Y-m-d\TH:i:s\Z');
        $this->taskMetadataModel->save($task_id, array(self::KEY => json_encode($rec)));
        return $rec;
    }

    /** Every OPEN request (requested or queued), oldest first: [{task_id, project_id, reference, title, request}]. */
    public function openRequests($project_ids = null)
    {
        if (is_array($project_ids) && ! $project_ids) {
            return array();
        }
        $rows = $this->db->table(self::META_TABLE)->eq('name', self::KEY)->findAll();
        $open = array();
        foreach ($rows as $row) {
            $rec = json_decode($row['value'], true);
            if (self::isOpen($rec)) {
                $open[(int) $row['task_id']] = $rec;
            }
        }
        if (! $open) {
            return array();
        }
        $query = $this->db->table(TaskModel::TABLE)
            ->columns('id', 'project_id', 'reference', 'title')
            ->in('id', array_keys($open));
        if (is_array($project_ids)) {
            $query->in('project_id', $project_ids);
        }
        $out = array();
        foreach ($query->findAll() as $task) {
            $out[] = array(
                'task_id' => (int) $task['id'],
                'project_id' => (int) $task['project_id'],
                'reference' => $task['reference'],
                'title' => $task['title'],
                'request' => $open[(int) $task['id']],
            );
        }
        usort($out, function ($a, $b) {
            return strcmp($a['request']['at'], $b['request']['at']) ?: $a['task_id'] - $b['task_id'];
        });
        return $out;
    }
}
