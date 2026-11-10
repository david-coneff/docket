<?php

namespace Kanboard\Plugin\Docket\Model;

use Kanboard\Core\Base;
use Kanboard\Plugin\Docket\Lib\Journal;

/**
 * A work item's journal as rhizome's render synced it into `docket_journal` (Schema/*.php;
 * rhizome pando-0544). rhizome writes it through `saveDocketJournal` and owns it: git stays the
 * source, and the render replaces a task's rows whenever they no longer prove its journal.
 */
class JournalModel extends Base
{
    const TABLE = 'docket_journal';

    /** How many rows the task holds (seq runs 1..n, so the count is the highest seq). */
    public function count($task_id)
    {
        return (int) $this->db->table(self::TABLE)->eq('task_id', (int) $task_id)->count();
    }

    /** [{task_id, n, key}] for every task of the project that holds rows: n rows, the last key. */
    public function heads($project_id)
    {
        $rows = $this->db->execute(
            'SELECT j.task_id, j.seq, j.jkey FROM '.self::TABLE.' j JOIN tasks t ON t.id = j.task_id'
            .' WHERE t.project_id = ? AND j.seq = (SELECT MAX(m.seq) FROM '.self::TABLE.' m WHERE m.task_id = j.task_id)',
            array((int) $project_id)
        )->fetchAll(\PDO::FETCH_ASSOC);
        return array_map(function ($r) {
            return array('task_id' => (int) $r['task_id'], 'n' => (int) $r['seq'], 'key' => $r['jkey']);
        }, $rows);
    }

    /**
     * Store rows after the ones the task holds, or in place of them all when $replace: the number
     * of rows the task then holds. Throws \InvalidArgumentException when the rows do not run on
     * from what is held (Lib/Journal::problem), and writes nothing then.
     */
    public function save($task_id, array $rows, $replace)
    {
        $task_id = (int) $task_id;
        if (! $this->taskFinderModel->exists($task_id)) {
            throw new \InvalidArgumentException("no task $task_id");
        }
        $this->db->startTransaction();
        try {
            $have = $replace ? 0 : $this->count($task_id);
            $why = Journal::problem($rows, $have, $replace);
            if ($why !== '') {
                throw new \InvalidArgumentException($why);
            }
            if ($replace) {
                $this->db->table(self::TABLE)->eq('task_id', $task_id)->remove();
            }
            foreach ($rows as $r) {
                $body = isset($r['text']) ? (string) $r['text'] : '';
                $ok = $this->db->table(self::TABLE)->insert(array(
                    'task_id' => $task_id,
                    'seq' => (int) $r['seq'],
                    'jkey' => substr((string) $r['key'], 0, 16),
                    'ts' => substr(isset($r['ts']) ? (string) $r['ts'] : '', 0, 32),
                    'actor' => self::clip(isset($r['actor']) ? $r['actor'] : '', 64),
                    'kind' => self::clip(isset($r['kind']) ? $r['kind'] : '', 32),
                    'cls' => (string) $r['cls'],
                    'grp' => self::clip(isset($r['grp']) ? $r['grp'] : '', 64),
                    'head' => self::clip(isset($r['head']) ? $r['head'] : '', 255),
                    'body' => $body,
                    'size' => strlen($body),
                ));
                if (! $ok) {
                    throw new \RuntimeException('row '.$r['seq'].' could not be stored');
                }
            }
            $this->db->closeTransaction();
        } catch (\Exception $e) {
            $this->db->cancelTransaction();
            throw $e;
        }
        return $this->count($task_id);
    }

    /**
     * One page of the task's history, newest first (Lib/Journal::page): only meaningful rows
     * unless $system; runs of system rows folded when $collapse; only rows with $lo <= seq < $before
     * ($before 0: from the newest).
     */
    public function page($task_id, $system, $collapse, $before, $lo, $limit)
    {
        $task_id = (int) $task_id;
        $lo = max(0, (int) $lo);
        // the column is a 32-bit integer on every driver: PHP_INT_MAX overflows PostgreSQL's
        $before = (int) $before > 0 ? min((int) $before, Journal::NO_BOUND) : Journal::NO_BOUND;
        $db = $this->db;
        $fetch = function ($below, $n) use ($db, $task_id, $system, $lo) {
            $q = $db->table(self::TABLE)
                ->columns('seq', 'ts', 'actor', 'kind', 'cls', 'grp', 'head', 'body', 'size')
                ->eq('task_id', $task_id)->lt('seq', $below)->gte('seq', $lo);
            if (! $system) {
                $q->eq('cls', Journal::MEANINGFUL);
            }
            return $q->desc('seq')->limit($n)->findAll();
        };
        $limit = max(1, min(Journal::PAGE, (int) $limit));
        return Journal::page($fetch, $before, $collapse && $system, $limit);
    }

    /** The full words of one row, or null. */
    public function row($task_id, $seq)
    {
        return $this->db->table(self::TABLE)
            ->columns('seq', 'ts', 'actor', 'kind', 'cls', 'grp', 'head', 'body', 'size')
            ->eq('task_id', (int) $task_id)->eq('seq', (int) $seq)->findOne();
    }

    private static function clip($s, $n)
    {
        list($cut) = Journal::cap($s, $n);
        return $cut;
    }
}
