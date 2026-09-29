import test from 'node:test';
import assert from 'node:assert/strict';

import { collectWideRepRangeFlags, normalizeWideRepRange } from '../engine/rep_range_decision_rule.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (ex, reps, rpe, note = 'Clean work.') =>
  ['Mon', ex, 'Bodyweight', '3', reps, '3 min', String(rpe), note, ''].join('\t');
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;

const program = (rows) => [1, 2, 3, 4].map((w) => block(w, rows)).join('\n\n');

test('a wide range on hard skill work is flagged', () => {
  // "Week 3 OAP says 3x1-3 per arm. That's too broad for a high-skill,
  // high-intensity movement. One versus three reps per set represents radically
  // different loading."
  const flags = collectWideRepRangeFlags(program([row('One-Arm Pull-up', '1-3 per arm', 8)]), {});
  assert.equal(flags.length, 4);
  assert.equal(flags[0].code, 'V103_WIDE_REP_RANGE_WITHOUT_RULE');
  assert.equal(flags[0].reps, '1-3');
});

test('an ordinary accessory range is not the problem and is left alone', () => {
  // Demanding a decision rule on an 8-12 rep accessory at RPE 6 would bury the
  // row that actually needs one.
  assert.deepEqual(collectWideRepRangeFlags(program([row('Cable Row', '8-12', 6)]), {}), []);
  // Nor is a narrow range on hard work: 4-5 reps is one session, not two.
  assert.deepEqual(collectWideRepRangeFlags(program([row('Back Squat', '4-5', 8)]), {}), []);
});

test('a range that already carries a decision rule is left alone', () => {
  const withRule = program([row('One-Arm Pull-up', '1-3 per arm', 8,
    'Attempt 3 only if two clean reps are owned; otherwise use doubles and singles.')]);
  assert.deepEqual(collectWideRepRangeFlags(withRule, {}), []);
  assert.equal(normalizeWideRepRange(withRule, {}).repaired, false);
});

test('the rule written is a decision, not a sentence', () => {
  const out = normalizeWideRepRange(program([row('One-Arm Pull-up', '1-2 per arm', 8)]), {});
  const note = out.program.split('\n').find((l) => l.includes('\tOne-Arm Pull-up\t')).split('\t')[7];
  // A template produced "take the top only if a clean 1 is already owned;
  // otherwise stay at 1" for this range, which decides nothing.
  assert.doesNotMatch(note, /a clean 1 is already owned/);
  assert.match(note, /opening rep is clean and unhurried/);
  assert.match(note, /keep every set to singles/);
  assert.match(note, /ceiling to earn, not a target to hit/);
});

test('a range with a bottom above one names the set it has to follow', () => {
  const out = normalizeWideRepRange(program([row('Weighted Pull-up', '2-5', 8.5)]), {});
  const note = out.program.split('\n').find((l) => l.includes('\tWeighted Pull-up\t')).split('\t')[7];
  assert.match(note, /previous set closed at 4 with the standard intact/);
  assert.match(note, /otherwise stay at 2/);
});

test('the repair converges in one pass, is idempotent and changes no prescription', () => {
  const before = program([row('One-Arm Pull-up', '1-3 per arm', 8)]);
  const once = normalizeWideRepRange(before, {});
  assert.deepEqual(collectWideRepRangeFlags(once.program, {}), []);
  const twice = normalizeWideRepRange(once.program, {});
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
  const fields = (p) => p.split('\n').filter((l) => l.includes('\t')).map((l) => l.split('\t').slice(0, 7).join('\t'));
  assert.deepEqual(fields(once.program), fields(before));
});

test('the production bundle applies it', async () => {
  const fs = await import('node:fs');
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizeWideRepRange\(candidate, intake\)/);
});
