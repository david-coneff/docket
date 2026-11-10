<?php

namespace Kanboard\Plugin\Docket\Lib;

/**
 * How a work item's journal is shown, with no Kanboard in it (test/php/journal_test.php).
 *
 * rhizome's render sends every journal row (rhizome pando-0544); the operator ruled how a long one
 * stays readable and bounded (2026-11-10, options 1-4):
 *   1. by default only MEANINGFUL rows (creation, status moves, amends, plain comments, briefs,
 *      rulings) are counted and shown; system rows appear when the viewer asks for them;
 *   2. with system rows shown, a run of consecutive system rows of one group is ONE entry
 *      ("recheck x9, latest <ts>"), opened on request;
 *   3. each entry shows at most CAP characters, the rest fetched on a click;
 *   4. older history comes a page at a time, newest first: at most PAGE entries or PAGE_BYTES of
 *      shown text, whichever is reached first.
 */
class Journal
{
    const MEANINGFUL = 'meaningful';
    const SYSTEM = 'system';
    const FIRST = 3;
    const PAGE = 20;
    const PAGE_BYTES = 65536;
    const CAP = 600;
    const FETCH = 200;
    // "no upper bound" for seq, as a 32-bit integer column holds it
    const NO_BOUND = 2147483647;

    /**
     * The first $cap characters of $text: [shown, truncated]. Characters, not bytes, and never a
     * split UTF-8 sequence; PCRE's /u needs no mbstring.
     */
    public static function cap($text, $cap = self::CAP)
    {
        $text = (string) $text;
        if (strlen($text) <= $cap) {
            return array($text, false);
        }
        if (! preg_match('/^.{0,'.(int) $cap.'}/su', $text, $m)) {
            // not valid UTF-8: cut by bytes, which is all such text has
            return array(substr($text, 0, $cap), true);
        }
        return array($m[0], strlen($m[0]) < strlen($text));
    }

    /** One stored row as an entry: its words capped, with the full size in bytes. */
    public static function entry(array $row, $cap = self::CAP)
    {
        list($text, $cut) = self::cap(isset($row['body']) ? $row['body'] : '', $cap);
        return array(
            'run' => false,
            'seq' => (int) $row['seq'],
            'ts' => (string) $row['ts'],
            'actor' => (string) $row['actor'],
            'kind' => (string) $row['kind'],
            'cls' => (string) $row['cls'],
            'grp' => (string) $row['grp'],
            'head' => (string) $row['head'],
            'text' => $text,
            'truncated' => $cut,
            'size' => (int) (isset($row['size']) ? $row['size'] : strlen((string) $row['body'])),
        );
    }

    /**
     * One page of entries, newest first.
     *
     * $fetch($before, $n) returns at most $n stored rows with seq < $before, highest seq first
     * (the caller has already left out system rows when they are not shown, and any row below the
     * page's floor). $collapse folds runs of system rows. Returns
     * ['entries' => [...], 'more' => bool, 'next_before' => the seq to fetch older entries before].
     */
    public static function page($fetch, $before, $collapse, $limit = self::PAGE, $budget = self::PAGE_BYTES, $cap = self::CAP)
    {
        $entries = array();
        $bytes = 0;
        $run = null;
        $more = false;
        $next = $before;
        $full = function () use (&$entries, &$bytes, $limit, $budget) {
            return count($entries) >= $limit || $bytes >= $budget;
        };
        $flush = function () use (&$run, &$entries, &$bytes, $cap) {
            if ($run === null) {
                return;
            }
            $e = self::entry($run['newest'], $cap);
            if ($run['count'] > 1) {
                $e['run'] = true;
                $e['count'] = $run['count'];
                $e['from_seq'] = $run['from'];
                $e['to_seq'] = (int) $run['newest']['seq'];
            }
            $entries[] = $e;
            $bytes += strlen($e['text']) + strlen($e['head']);
            $run = null;
        };
        $cursor = $before;
        while (true) {
            $rows = $fetch($cursor, self::FETCH);
            if (! $rows) {
                break;
            }
            foreach ($rows as $row) {
                $seq = (int) $row['seq'];
                if ($collapse && $row['cls'] === self::SYSTEM) {
                    if ($run !== null && $run['grp'] === $row['grp']) {
                        $run['count']++;
                        $run['from'] = $seq;
                        $next = $seq;
                        continue;
                    }
                    $flush();
                    if ($full()) {
                        $more = true;
                        break 2;
                    }
                    $run = array('grp' => $row['grp'], 'count' => 1, 'from' => $seq, 'newest' => $row);
                    $next = $seq;
                    continue;
                }
                $flush();
                if ($full()) {
                    $more = true;
                    break 2;
                }
                $e = self::entry($row, $cap);
                $entries[] = $e;
                $bytes += strlen($e['text']) + strlen($e['head']);
                $next = $seq;
            }
            $cursor = (int) $rows[count($rows) - 1]['seq'];
            if (count($rows) < self::FETCH) {
                break;
            }
        }
        $flush();
        return array('entries' => $entries, 'more' => $more, 'next_before' => $next);
    }

    /**
     * Whether a batch of rows from rhizome may be stored after the $have rows the task holds:
     * '' when it may, else why not. seq must run on from $have + 1 with no gap (from 1 when
     * $replace), and every row carry the fields the table needs.
     */
    public static function problem(array $rows, $have, $replace)
    {
        $expect = $replace ? 1 : ((int) $have + 1);
        foreach ($rows as $i => $row) {
            if (! is_array($row)) {
                return "row $i is not an object";
            }
            foreach (array('seq', 'key', 'cls') as $k) {
                if (! isset($row[$k]) || $row[$k] === '') {
                    return "row $i has no $k";
                }
            }
            if ((int) $row['seq'] !== $expect) {
                return "row $i has seq ".$row['seq'].", expected $expect";
            }
            if (! in_array($row['cls'], array(self::MEANINGFUL, self::SYSTEM), true)) {
                return "row $i has class ".$row['cls'];
            }
            $expect++;
        }
        return '';
    }
}
