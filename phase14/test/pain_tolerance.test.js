// The safety rule that was computed and then ignored.
//
// painToleranceGate() answers three ways for a client reporting sciatica, and
// its only caller read one of them. The refusal branch was dropped entirely.
// The tolerance-gate branch was read, but only to raise
// PAIN_TOLERANCE_NOT_ACKNOWLEDGED, which had no repair -- four attempts, then
// a dead build, on exactly the clients least able to absorb one.
//
// Worth knowing which half matters. The refusal pattern reaches exactly one
// canonical movement, "Deep Squat Hold", so in practice it almost never fires.
// The tolerance gate covers the Romanian deadlift family and the good morning,
// which appear in most intermediate programs, so the flag with no repair was
// the one clients would actually meet. Both are covered here; only one of them
// was ever likely.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairPainTolerance, collectPainToleranceFlags, governsPainTolerance } from '../engine/pain_tolerance.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { matchDictionary } from '../engine/exercise_dictionary.js';
import { painToleranceGate } from '../engine/phase15_quality_rules.js';

const BACK = {
  age: 41, language: 'en', experience: 'intermediate', days_per_week: 2,
  available_gym_days: ['Tue', 'Fri'], training_location: 'commercial_gym',
  equipment: 'Full commercial gym.', primary_goals: ['Get back to lifting without flare-ups'],
  current_numbers: 'Back Squat: 100 kg x 5', qa_diagnostics: true,
  pain: { active: true, description: 'Sciatica down the right leg after heavy hinging', severity: '4/10' },
};
const NO_PAIN = { ...BACK, pain: { active: false, description: '' } };

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (d, n, note = '') => [d, n, 'RPE-selected load', '3', '8', '2 min', '7', note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

test('a client with no lumbar history is left entirely alone', () => {
  const p = wk(1, [row('Tue', 'Deep Squat Hold'), row('Fri', 'Romanian Deadlift')]);
  assert.equal(governsPainTolerance(NO_PAIN), false);
  assert.equal(repairPainTolerance(p, NO_PAIN), p);
  assert.deepEqual(collectPainToleranceFlags(p, NO_PAIN), []);
});

test('a refused movement is replaced with one the rule itself names', () => {
  const p = wk(1, [row('Tue', 'Deep Squat Hold', 'Hold the bottom position for 30 seconds.')]);
  assert.equal(collectPainToleranceFlags(p, BACK).length, 1, 'the fixture is unsafe to begin with');
  const fixed = repairPainTolerance(p, BACK);
  assert.deepEqual(collectPainToleranceFlags(fixed, BACK), [], 'the repair must answer its own flag');
  assert.ok(!/Deep Squat Hold\t/.test(fixed));
  const name = fixed.split('\n').find((l) => l.startsWith('Tue\t')).split('\t')[1];
  assert.ok(matchDictionary(name)?.status === 'hit', `${name} must be a real exercise`);
  assert.match(fixed, /lower-back symptoms/);
  // A weight computed for a different movement is not carried across.
  assert.match(fixed, /RPE-selected load/);
});

test('a substitute the day already trains is not stacked on top of it', () => {
  const p = wk(1, [row('Tue', 'Hip Thrust'), row('Tue', 'Deep Squat Hold')]);
  const fixed = repairPainTolerance(p, BACK);
  const names = fixed.split('\n').filter((l) => l.startsWith('Tue\t')).map((l) => l.split('\t')[1]);
  assert.equal(new Set(names).size, names.length, `duplicated a movement: ${names.join(', ')}`);
});

test('the gate\'s own contract is what the repair answers', () => {
  // SPINAL_LOAD_REQUIRES_TOLERANCE_CHECK is the gate's middle answer: the
  // movement is allowed, conditionally. Naming it here ties the repair to the
  // rule rather than to the wording of one flag message.
  assert.equal(painToleranceGate('Romanian Deadlift', BACK).code, 'SPINAL_LOAD_REQUIRES_TOLERANCE_CHECK');
  assert.equal(painToleranceGate('Deep Squat Hold', BACK).code, 'PAIN_TOLERANCE_CONFLICT');
  assert.equal(painToleranceGate('Chest-Supported Row', BACK).allowed, true);
});

test('a tolerance-gated movement keeps its place and gains its condition', () => {
  const p = wk(1, [row('Fri', 'Romanian Deadlift', 'Three sets of eight, controlled.')]);
  const fixed = repairPainTolerance(p, BACK);
  assert.match(fixed, /Romanian Deadlift/, 'the movement is gated, not banned');
  assert.match(fixed, /Three sets of eight, controlled\./, 'the original coaching note survives');
  assert.match(fixed, /(toler|pain.?free|symptom|stop if)/i);
});

test('the repair is idempotent', () => {
  const p = wk(1, [row('Tue', 'Deep Squat Hold'), row('Fri', 'Good Morning')]);
  const once = repairPainTolerance(p, BACK);
  assert.equal(repairPainTolerance(once, BACK), once);
});

test('the full bundle ships a program for a client with sciatica', () => {
  // The shape that used to spend four attempts and deliver nothing.
  const session = (d) => [
    row(d, 'Deep Squat Hold', 'Hold the bottom position for 30 seconds.'),
    row(d, 'Romanian Deadlift', 'Three sets of eight, controlled.'),
    row(d, 'Chest-Supported Row', 'Three sets of ten.'),
    row(d, 'Pallof Press', 'Two sets each side.'),
  ];
  const program = [1, 2, 3, 4].map((n) => wk(n, [...session('Tue'), ...session('Fri')])).join('\n\n');
  const res = collectRepairableValidationFailures(program, BACK, { skipSkillCalibration: true });
  assert.ok(!(res.flags || []).some((f) => /PAIN_TOLERANCE/.test(f.code || '')),
    `pain flags survived: ${(res.flags || []).map((f) => f.code).join(', ')}`);
  // The name still appears in the note that explains the substitution, which is
  // the point of the note. What must not survive is the prescription.
  const prescribed = res.program.split('\n')
    .filter((l) => l.includes('\t')).map((l) => l.split('\t')[1]);
  assert.ok(!prescribed.includes('Deep Squat Hold'), 'the refused movement must not be prescribed');
  assert.ok(!/Hold the bottom position/.test(res.program),
    'the replaced movement\'s coaching note must not be carried onto its substitute');
});
