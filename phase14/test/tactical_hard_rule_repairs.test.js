// The two hard tactical rules, neither of which could answer itself.
//
// T3K-01 refuses a block whose key session never moves toward race demand.
// T3K-08 refuses a week that cuts the race work while accessory volume holds.
// Both name an ordering rather than a judgement, and an ordering is code.

import test from 'node:test';
import assert from 'node:assert/strict';

import { auditTacticalHardRules, repairTacticalHardRules } from '../engine/v40_tactical_hard_rules.js';

const TACTICAL = {
  age: 27, language: 'en', experience: 'advanced', days_per_week: 3,
  training_location: 'commercial_gym', equipment: 'Full gym, track access, 20 kg ruck.',
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  current_numbers: '3 km: 13:30', performance_markers: ['3 km: 13:30'], qa_diagnostics: true,
};
const NO_RACE = { ...TACTICAL, primary_goals: ['Add 20 kg to my squat'], current_numbers: 'Back Squat: 140 kg x 5', performance_markers: [] };

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (d, n, w, s, r, note) => [d, n, w, String(s), r, '2 min', '8', note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const hard = (p, intake = TACTICAL) => auditTacticalHardRules(p, intake).filter((f) => f.severity === 'hard').map((f) => f.code);

test('an athlete with no race is not governed by either rule', () => {
  const p = [1, 2, 3].map((n) => wk(n, [row('Tue', 'Run', '1:45', 6, '400 m', 'Key.')])).join('\n\n');
  assert.equal(repairTacticalHardRules(p, NO_RACE), p);
});

test('a key session that never changes is extended toward race demand', () => {
  const flat = [1, 2, 3, 4].map((n) => wk(n, [
    row('Tue', 'Run', '1:45', 6, '400 m', 'Key session.'),
    row('Fri', 'Back Squat', '120 kg', 3, '5', 'Strength.'),
  ])).join('\n\n');
  assert.deepEqual(hard(flat), ['COACH_SPEC_V1_T3K01_NO_RACE_DEMAND_PROGRESSION']);

  const fixed = repairTacticalHardRules(flat, TACTICAL);
  assert.deepEqual(hard(fixed), [], 'the repair must answer its own flag');
  const reps = fixed.split('\n').filter((l) => /\tRun\t/.test(l)).map((l) => l.split('\t')[4]);
  assert.equal(reps[0], '400 m', 'week 1 is the baseline and is left alone');
  assert.equal(reps[3], '400 m', 'and week 4 is a taper by design');
  assert.ok(Number(reps[1].match(/\d+/)[0]) > 400, 'the middle weeks extend');
  assert.match(fixed, /race specificity means/);
  assert.equal(repairTacticalHardRules(fixed, TACTICAL), fixed, 'repair is not idempotent');
});

test('a block that already progresses is left alone', () => {
  const p = [
    wk(1, [row('Tue', 'Run', '1:45', 6, '400 m', 'Key.')]),
    wk(2, [row('Tue', 'Run', '1:45', 6, '600 m', 'Key.')]),
    wk(3, [row('Tue', 'Run', '1:45', 6, '800 m', 'Key.')]),
  ].join('\n\n');
  assert.deepEqual(hard(p), []);
  assert.equal(repairTacticalHardRules(p, TACTICAL), p);
});

test('the accessories give way before the race work does', () => {
  const p = [
    wk(1, [row('Tue', 'Run', '1:45', 8, '400 m', 'Key.'), row('Fri', 'Back Squat', '120 kg', 4, '5', 'Strength.'), row('Fri', 'Leg Press', '200 kg', 4, '10', 'Accessory.')]),
    wk(2, [row('Tue', 'Run', '1:45', 4, '400 m', 'Key.'), row('Fri', 'Back Squat', '120 kg', 4, '5', 'Strength.'), row('Fri', 'Leg Press', '200 kg', 4, '10', 'Accessory.')]),
    wk(3, [row('Tue', 'Run', '1:45', 8, '400 m', 'Key.'), row('Fri', 'Back Squat', '120 kg', 4, '5', 'Strength.'), row('Fri', 'Leg Press', '200 kg', 4, '10', 'Accessory.')]),
  ].join('\n\n');
  assert.ok(hard(p).includes('COACH_SPEC_V1_T3K08_SACRIFICE_HIERARCHY_INVERTED'));

  const fixed = repairTacticalHardRules(p, TACTICAL);
  assert.deepEqual(hard(fixed), [], 'the repair must answer its own flags');
  const week2 = fixed.slice(fixed.indexOf('START_WEEK2'), fixed.indexOf('END_WEEK2'));
  const run = week2.split('\n').find((l) => /\tRun\t/.test(l));
  assert.equal(run.split('\t')[3], '4', 'the key session is not cut further to satisfy the rule');
  // Something secondary came down, and nothing went below a working set.
  const secondary = week2.split('\n').filter((l) => /Back Squat|Leg Press/.test(l)).map((l) => Number(l.split('\t')[3]));
  assert.ok(secondary.some((n) => n < 4), `accessory volume must fall: ${secondary.join(', ')}`);
  assert.ok(secondary.every((n) => n >= 1), 'and never below a single working set');
  assert.match(fixed, /before the key session does/);
  assert.equal(repairTacticalHardRules(fixed, TACTICAL), fixed, 'repair is not idempotent');
});
