<?php

namespace Kanboard\Plugin\Docket\Lib;

/**
 * The ruling's rules, with no dependency on Kanboard, so they run under plain `php` in tests
 * (docs/kanboard-docket-design.md section 3.1).
 *
 * The options are rhizome's `custom.decision_options`, rendered as task metadata
 * `rhiz_decision_options`: a JSON list of {n, title, excludes[], other}. A long metadata value
 * arrives in parts (PostgreSQL holds a value in varchar(255)): `rhiz_<key>` = `rhiz:chunks:<n>`,
 * then `rhiz_<key>#1` .. `#<n>`, which `joinChunks` puts back together, as rhizome's
 * `unchunk_meta` does.
 */
class Ruling
{
    const CHUNK_MARK = 'rhiz:chunks:';

    /** The metadata with every value stored in parts joined back, and the parts dropped. */
    public static function joinChunks(array $meta)
    {
        $out = array();
        foreach ($meta as $key => $value) {
            if (preg_match('/#\d+$/', $key)) {
                continue;
            }
            $mark = strlen(self::CHUNK_MARK);
            if (is_string($value) && strncmp($value, self::CHUNK_MARK, $mark) === 0
                && preg_match('/^\d+$/', substr($value, $mark))) {
                $parts = '';
                for ($n = 1; $n <= (int) substr($value, $mark); $n++) {
                    $parts .= isset($meta[$key.'#'.$n]) ? $meta[$key.'#'.$n] : '';
                }
                $value = $parts;
            }
            $out[$key] = $value;
        }
        return $out;
    }

    /**
     * The decision's options, numbered ones first, OTHER last. A brief with no OTHER still offers
     * one: every ruling may be OTHER (the operator's rule of 2026-11-04 on `pando-0509`).
     */
    public static function options($json)
    {
        $list = json_decode((string) $json, true);
        $options = array();
        $other = null;
        foreach (is_array($list) ? $list : array() as $o) {
            if (! is_array($o) || ! isset($o['n'])) {
                continue;
            }
            $row = array(
                'n' => (int) $o['n'],
                'title' => isset($o['title']) ? (string) $o['title'] : '',
                'excludes' => array_map('intval', isset($o['excludes']) && is_array($o['excludes']) ? $o['excludes'] : array()),
                'other' => ! empty($o['other']),
            );
            if ($row['other']) {
                $other = $row;
            } else {
                $options[] = $row;
            }
        }
        $options[] = $other ?: array('n' => 0, 'title' => 'OTHER', 'excludes' => array(), 'other' => true);
        return $options;
    }

    /**
     * Why this pick cannot be submitted, one sentence each; empty when it can. The same rules as
     * rhizome's `rhiz work rule`: only offered numbers, no two options that exclude each other,
     * and OTHER (or nothing ticked) needs the operator's words.
     */
    public static function problems(array $options, array $picked, $other, $words)
    {
        $byNumber = array();
        foreach ($options as $o) {
            if (! $o['other']) {
                $byNumber[$o['n']] = $o;
            }
        }
        $problems = array();
        foreach ($picked as $n) {
            if (! isset($byNumber[$n])) {
                $problems[] = sprintf('Option %d is not one of this brief\'s options.', $n);
            }
        }
        // An exclusion binds whichever of the two options declares it.
        $pairs = array();
        foreach ($picked as $a) {
            foreach (isset($byNumber[$a]) ? $byNumber[$a]['excludes'] : array() as $b) {
                if (in_array($b, $picked, true)) {
                    $pairs[min($a, $b).','.max($a, $b)] = array(min($a, $b), max($a, $b));
                }
            }
        }
        ksort($pairs);
        foreach ($pairs as $p) {
            $problems[] = sprintf('Option %d cannot be taken with option %d.', $p[0], $p[1]);
        }
        if (($other || ! $picked) && trim((string) $words) === '') {
            $problems[] = $picked
                ? 'OTHER needs your words.'
                : 'Tick at least one option, or write your words as OTHER.';
        }
        return $problems;
    }

    /** The picked numbers, as integers, sorted and without repeats. */
    public static function picked(array $values)
    {
        $picked = array();
        foreach ($values as $v) {
            if (is_scalar($v) && preg_match('/^\d+$/', (string) $v)) {
                $picked[(int) $v] = true;
            }
        }
        $picked = array_keys($picked);
        sort($picked);
        return $picked;
    }

    /** The option string `rhiz work rule` takes: `1,3`, `1,other`, or `other`. */
    public static function optionString(array $picked, $other)
    {
        $parts = array_map('strval', $picked);
        if ($other || ! $picked) {
            $parts[] = 'other';
        }
        return implode(',', $parts);
    }

    /** The comment text: the operator's words, or the ruling stated when they wrote none. */
    public static function commentText(array $picked, $other, $words)
    {
        $words = trim((string) $words);
        return $words !== '' ? $words : sprintf('Ruled: option %s.', self::optionString($picked, $other));
    }

    /**
     * `docket_ruling`: what the importer reads back. The words are not repeated here: they are
     * the comment it names, which keeps the value within the 255-character column.
     */
    public static function record(array $picked, $other, $commentId, $user, $at, $brief)
    {
        return json_encode(array(
            'options' => $picked,
            'other' => (bool) ($other || ! $picked),
            'comment_id' => (int) $commentId,
            'user' => (string) $user,
            'at' => (string) $at,
            'brief' => (string) $brief,
        ), JSON_UNESCAPED_SLASHES);
    }

    /** A submission answers the brief it names; one made against an older brief is stale. */
    public static function isStale($recordJson, $brief)
    {
        $r = json_decode((string) $recordJson, true);
        return is_array($r) && isset($r['brief']) && (string) $r['brief'] !== (string) $brief;
    }
}
