<?php
// The Docket plugin's journal paging rules (kanboard/Docket/Lib/Journal.php, rhizome pando-0544),
// with no Kanboard: run as `php test/php/journal_test.php`; exit 0 when every check holds.
// test/test_kanboard_plugin.py runs it with the PHP that rhizome's setup-kanboard-env.sh installs.

require __DIR__.'/../../kanboard/Docket/Lib/Journal.php';

use Kanboard\Plugin\Docket\Lib\Journal;

$failed = 0;
$ran = 0;
function check($what, $got, $want)
{
    global $failed, $ran;
    $ran++;
    if ($got !== $want) {
        $failed++;
        fwrite(STDERR, "FAIL $what\n  got:  ".var_export($got, true)."\n  want: ".var_export($want, true)."\n");
    }
}

/** Rows seq 1..n from a list of [cls, grp, body]; and a fetch over them as the model's query. */
function rows(array $spec)
{
    $out = array();
    foreach ($spec as $i => $s) {
        $out[] = array('seq' => $i + 1, 'ts' => sprintf('t%04d', $i + 1), 'actor' => 'a', 'kind' => 'k',
            'cls' => $s[0], 'grp' => $s[1], 'head' => 'h'.($i + 1), 'body' => $s[2], 'size' => strlen($s[2]));
    }
    return $out;
}
function fetcher(array $rows, $system = true, $lo = 0)
{
    return function ($before, $n) use ($rows, $system, $lo) {
        $sel = array_values(array_filter($rows, function ($r) use ($before, $system, $lo) {
            return $r['seq'] < $before && $r['seq'] >= $lo && ($system || $r['cls'] === 'meaningful');
        }));
        return array_slice(array_reverse($sel), 0, $n);
    };
}
function seqs($page)
{
    return array_map(function ($e) { return $e['seq']; }, $page['entries']);
}
$M = 'meaningful';
$S = 'system';

// option 3: the cap
check('a short text is whole', Journal::cap('abc'), array('abc', false));
list($t, $cut) = Journal::cap(str_repeat('é', 700));
check('a long text is cut at 600 characters, not bytes', array(preg_match_all('/./su', $t), $cut), array(600, true));
check('a text of 600 two-byte characters is whole', Journal::cap(str_repeat('é', 600))[1], false);

// option 1: the newest three meaningful rows, system rows left out by the query
$r = rows(array(array($M, '', 'made'), array($S, 'recheck', 'r'), array($M, '', 'moved'),
    array($M, '', 'said'), array($S, 'workable', 'w'), array($M, '', 'ruled'), array($S, 'recheck', 'r')));
$p = Journal::page(fetcher($r, false), PHP_INT_MAX, false, 3);
check('the default shows the newest three meaningful rows', seqs($p), array(6, 4, 3));
check('and says there is more, from where', array($p['more'], $p['next_before']), array(true, 3));
$p2 = Journal::page(fetcher($r, false), $p['next_before'], false, 3);
check('the next page goes on from there and ends', array(seqs($p2), $p2['more']), array(array(1), false));

// option 2: runs of one system group fold into one entry
$r = rows(array(array($M, '', 'made'), array($S, 'recheck', 'r1'), array($S, 'recheck', 'r2'),
    array($S, 'recheck', 'r3'), array($S, 'workable', 'w'), array($M, '', 'said')));
$p = Journal::page(fetcher($r), PHP_INT_MAX, true, 20);
$shape = array_map(function ($e) { return $e['run'] ? array($e['grp'], $e['count'], $e['from_seq'], $e['to_seq']) : $e['seq']; }, $p['entries']);
check('a run is one entry; a single system row is not a run', $shape, array(6, 5, array('recheck', 3, 2, 4), 1));
check('a run shows its newest row', $p['entries'][2]['text'], 'r3');
$p = Journal::page(fetcher($r), PHP_INT_MAX, false, 20);
check('without folding every row is its own entry', count($p['entries']), 6);
$p = Journal::page(fetcher($r, true, 2), 5, false, 20);
check('one run opened: its rows only, newest first', seqs($p), array(4, 3, 2));

// a run longer than one fetch (200 rows) is still one entry, and the page after it goes on
$spec = array(array($M, '', 'first'));
for ($i = 0; $i < 450; $i++) {
    $spec[] = array($S, 'recheck', 'r');
}
$spec[] = array($M, '', 'last');
$p = Journal::page(fetcher(rows($spec)), PHP_INT_MAX, true, 2);
check('450 rechecks across three fetches fold into one run', array($p['entries'][1]['count'], $p['entries'][1]['from_seq']), array(450, 2));
check('the page is full at two entries, the creation still to come', array($p['more'], $p['next_before']), array(true, 2));

// option 4: pages are bounded by count and by bytes, and walking them shows every row once
$spec = array();
for ($i = 0; $i < 450; $i++) {
    $spec[] = array($i % 3 ? $M : $S, 'g'.($i % 2), str_repeat('x', 1000));
}
$rows = rows($spec);
$p = Journal::page(fetcher($rows), PHP_INT_MAX, false);
check('a page holds at most 20 entries', count($p['entries']), 20);
check('each entry is capped', strlen($p['entries'][0]['text']), 600);
$p = Journal::page(fetcher($rows), PHP_INT_MAX, false, 20, 2000);
check('a page stops once its bytes reach the budget', count($p['entries']), 4);
$seen = array();
$before = PHP_INT_MAX;
$pages = 0;
do {
    $p = Journal::page(fetcher($rows, false), $before, false);
    $seen = array_merge($seen, seqs($p));
    $before = $p['next_before'];
    $pages++;
} while ($p['more'] && $pages < 100);
$want = array_values(array_map(function ($r) { return $r['seq']; }, array_reverse(array_filter($rows, function ($r) { return $r['cls'] === 'meaningful'; }))));
check('walking the pages shows every meaningful row once, newest first', $seen, $want);
check('in ceil(300 / 20) pages', $pages, 15);

// what saveDocketJournal accepts
$ok = array(array('seq' => 4, 'key' => 'k4', 'cls' => $M), array('seq' => 5, 'key' => 'k5', 'cls' => $S));
check('rows running on from those held are taken', Journal::problem($ok, 3, false), '');
check('a gap is refused', Journal::problem($ok, 2, false), 'row 0 has seq 4, expected 3');
check('a replacement starts at 1', Journal::problem($ok, 3, true), 'row 0 has seq 4, expected 1');
check('an unknown class is refused', Journal::problem(array(array('seq' => 1, 'key' => 'k', 'cls' => 'x')), 0, true), 'row 0 has class x');
check('a row with no key is refused', Journal::problem(array(array('seq' => 1, 'cls' => $M)), 0, true), 'row 0 has no key');

echo "$ran checks, $failed failed\n";
exit($failed ? 1 : 0);
