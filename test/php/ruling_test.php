<?php
// The Docket plugin's ruling rules (kanboard/Docket/Lib/Ruling.php), with no Kanboard: run as
// `php test/php/ruling_test.php`; exit 0 when every check holds. test/test_kanboard_plugin.py runs
// it with the PHP that rhizome's setup-kanboard-env.sh installs.

require __DIR__.'/../../kanboard/Docket/Lib/Ruling.php';

use Kanboard\Plugin\Docket\Lib\Ruling;

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

$json = '[{"n":1,"title":"Go","excludes":[],"other":false},'
      .'{"n":2,"title":"Wait","excludes":[1],"other":false},'
      .'{"n":3,"title":"Both","excludes":[],"other":false},'
      .'{"n":4,"title":"OTHER","excludes":[],"other":true}]';
$opts = Ruling::options($json);

check('OTHER is listed last', array_map(function ($o) { return $o['other']; }, $opts), array(false, false, false, true));
$one = Ruling::options('[{"n":1,"title":"Go"}]');
check('a brief with no OTHER still offers one', $one[count($one) - 1]['other'], true);
check('unreadable options still offer OTHER', count(Ruling::options('not json')), 1);

check('one option', Ruling::problems($opts, array(1), false, ''), array());
check('several options', Ruling::problems($opts, array(1, 3), false, ''), array());
check('an exclusion binds whichever side declares it', Ruling::problems($opts, array(1, 2), false, ''),
    array('Option 1 cannot be taken with option 2.'));
check('a number the brief lacks', Ruling::problems($opts, array(9), false, ''),
    array('Option 9 is not one of this brief\'s options.'));
check('OTHER needs words', Ruling::problems($opts, array(1), true, '  '), array('OTHER needs your words.'));
check('OTHER with words', Ruling::problems($opts, array(1), true, 'and also X'), array());
check('nothing ticked and no words', Ruling::problems($opts, array(), false, ''),
    array('Tick at least one option, or write your words as OTHER.'));
check('words alone are OTHER', Ruling::problems($opts, array(), false, 'neither'), array());

check('picked: integers, sorted, once', Ruling::picked(array('3', '1', '3', 'x', array())), array(1, 3));
check('option string', Ruling::optionString(array(1, 3), false), '1,3');
check('option string with OTHER', Ruling::optionString(array(1), true), '1,other');
check('words alone', Ruling::optionString(array(), false), 'other');
check('comment text is the words', Ruling::commentText(array(1), false, ' go '), 'go');
check('comment text without words', Ruling::commentText(array(1, 3), false, ''), 'Ruled: option 1,3.');

$record = Ruling::record(array(1, 3), false, 42, 'admin', '2026-11-06T03:00:00Z', '2026-11-05T19:32:48Z');
check('the record fits PostgreSQL\'s 255-character column', strlen($record) <= 255, true);
check('the record names the comment, not the words', json_decode($record, true)['comment_id'], 42);
check('a record for the current brief is not stale', Ruling::isStale($record, '2026-11-05T19:32:48Z'), false);
check('a record for an older brief is stale', Ruling::isStale($record, '2026-11-06T09:00:00Z'), true);

$long = str_repeat('x', 300).'end';
check('parts join back', Ruling::joinChunks(array(
    'rhiz_decision_options' => 'rhiz:chunks:2',
    'rhiz_decision_options#1' => substr($long, 0, 255),
    'rhiz_decision_options#2' => substr($long, 255),
    'rhiz_decision' => 'pending',
)), array('rhiz_decision_options' => $long, 'rhiz_decision' => 'pending'));

$panel = Ruling::fields(array(
    'rhiz_uid' => 'abc123',
    'rhiz_decision_options' => 'rhiz:chunks:2',
    'rhiz_decision_options#1' => '[{"n":1,',
    'rhiz_decision_options#2' => '"title":"Go"}]',
    'docket_ruling_state' => 'submitted',
    'rhiz_assignee' => 'pando',
));
check('the panel shows only rhiz_ keys, sorted, without the prefix',
    array_map(function ($r) { return $r['name']; }, $panel), array('assignee', 'decision_options', 'uid'));
check('a value in parts is joined for the panel', $panel[1]['value'], '[{"n":1,"title":"Go"}]');
check('a JSON value is indented for reading', strpos($panel[1]['json'], "\n") !== false, true);
check('a plain value has no JSON form', $panel[2]['json'], null);

echo "ruling_test: $ran checks, $failed failed\n";
exit($failed ? 1 : 0);
