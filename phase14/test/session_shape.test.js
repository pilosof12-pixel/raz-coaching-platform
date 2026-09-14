// Three rules about what a session costs, in a module that raises eleven
// blocking codes, has no test file, and repairs none of them.
//
// A day that will not fit in the time the athlete said they have. Hard
// intervals given to someone who asked for aerobic work that costs them nothing
// the next day. An aerobic goal served by warm-up-sized doses. Each refuses the
// program; none of them could mend one, so each was four generations and
// nothing delivered.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairSessionTimeBudget, repairLowFatigueAerobic } from '../engine/session_shape.js';
import { validatePhase15Program } from '../engine/phase15_program_qa.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (d, n, sets, reps, rest, note) => [d, n, '80 kg', String(sets), reps, rest, '7', note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const cell = (l, i) => l.split('\t')[i];

const codesOf = (program, intake) => {
  try { validatePhase15Program(program, intake); return []; }
  catch (e) { return (e.flags || []).map((f) => f.code); }
};

const SHORT_SESSION = {
  age: 35, language: 'en', experience: 'intermediate', days_per_week: 2,
  session_duration_minutes: 40, available_gym_days: ['Tue', 'Fri'],
  training_location: 'commercial_gym', equipment: 'Full commercial gym.',
  primary_goals: ['Get stronger'], current_numbers: 'Back Squat: 120 kg x 5', qa_diagnostics: true,
};

test('a session that will not fit is made to fit', () => {
  const long = wk(1, [
    row('Tue', 'Back Squat', 6, '5', '3 min', 'Work sets.'),
    row('Tue', 'Bench Press', 6, '5', '3 min', 'Work sets.'),
    row('Tue', 'Chest-Supported Row', 6, '10', '2 min', 'Work sets.'),
    row('Tue', 'Pallof Press', 5, '10', '2 min', 'Trunk.'),
  ]);
  assert.ok(codesOf(long, SHORT_SESSION).includes('SESSION_TIME_BUDGET_EXCEEDED'),
    'the fixture overruns to begin with');

  const fixed = repairSessionTimeBudget(long, SHORT_SESSION);
  assert.ok(!codesOf(fixed, SHORT_SESSION).includes('SESSION_TIME_BUDGET_EXCEEDED'),
    'the repair must answer its own flag');
  // The session keeps its shape: every movement survives, none below a set.
  const names = fixed.split('\n').filter((l) => l.startsWith('Tue\t')).map((l) => cell(l, 1));
  assert.deepEqual(names, ['Back Squat', 'Bench Press', 'Chest-Supported Row', 'Pallof Press']);
  const sets = fixed.split('\n').filter((l) => l.startsWith('Tue\t')).map((l) => Number(cell(l, 3)));
  assert.ok(sets.every((n) => n >= 1), `no movement below a working set: ${sets.join(', ')}`);
  assert.equal(repairSessionTimeBudget(fixed, SHORT_SESSION), fixed, 'repair is not idempotent');
});

test('a session already inside the budget is untouched', () => {
  const p = wk(1, [row('Tue', 'Back Squat', 3, '5', '2 min', 'Work sets.')]);
  assert.equal(repairSessionTimeBudget(p, SHORT_SESSION), p);
});

test('an athlete who gave no session length is not trimmed', () => {
  const p = wk(1, [row('Tue', 'Back Squat', 8, '5', '3 min', 'Work sets.'), row('Tue', 'Bench Press', 8, '5', '3 min', 'Work.')]);
  const { session_duration_minutes, ...noLimit } = SHORT_SESSION;
  assert.equal(repairSessionTimeBudget(p, noLimit), p);
});

const AEROBIC_ONLY = {
  age: 52, language: 'en', experience: 'beginner', days_per_week: 3,
  training_location: 'commercial_gym', equipment: 'Full commercial gym.',
  primary_goals: ['Feel better day to day'],
  // The rule reads secondary goals, maintenance goals and notes -- not primary
  // goals -- and needs both halves of the request: the aerobic base, and the
  // condition that it stays low fatigue.
  secondary_goals: ['Build an aerobic base'],
  notes: 'Wants zone 2 work that keeps day to day energy up. Low fatigue: do not add hard conditioning.',
  current_numbers: 'Walks 30 minutes comfortably.', qa_diagnostics: true,
};

test('an athlete who asked for easy aerobic work is not given intervals', () => {
  const p = wk(1, [
    row('Mon', 'Zone-2 Bike', 1, '30 min', '-', 'Steady.'),
    row('Wed', 'Interval Run', 1, '6 x 400 m', '2 min', 'Hard conditioning.'),
    row('Wed', 'Zone-2 Bike', 1, '25 min', '-', 'Steady.'),
  ]);
  assert.ok(codesOf(p, AEROBIC_ONLY).includes('UNREQUESTED_CONDITIONING_INTERFERENCE'),
    'the fixture gives them what they asked not to be given');
  const fixed = repairLowFatigueAerobic(p, AEROBIC_ONLY);
  assert.ok(!codesOf(fixed, AEROBIC_ONLY).includes('UNREQUESTED_CONDITIONING_INTERFERENCE'),
    'the repair must answer its own flag');
  assert.ok(!/Interval Run/.test(fixed), 'the work they asked not to be given is not given');
  assert.match(fixed, /Zone-2 Bike/, 'and the work they did ask for stays');
  assert.equal(repairLowFatigueAerobic(fixed, AEROBIC_ONLY), fixed, 'repair is not idempotent');
});

test('a warm-up-sized aerobic dose is made big enough to do something', () => {
  const p = wk(1, [
    row('Mon', 'Zone-2 Bike', 1, '8 min', '-', 'Easy spin.'),
    row('Wed', 'Zone-2 Bike', 1, '10 min', '-', 'Easy spin.'),
  ]);
  assert.ok(codesOf(p, AEROBIC_ONLY).includes('ZONE2_DOSE_TOO_SMALL'), 'the fixture doses too small');
  const fixed = repairLowFatigueAerobic(p, AEROBIC_ONLY);
  assert.ok(!codesOf(fixed, AEROBIC_ONLY).includes('ZONE2_DOSE_TOO_SMALL'),
    'the repair must answer its own flag');
  const minutes = fixed.split('\n').filter((l) => /Zone-2 Bike/.test(l)).map((l) => Number(cell(l, 4).match(/\d+/)[0]));
  assert.ok(minutes.every((m) => m >= 20), `each exposure is meaningful: ${minutes.join(', ')}`);
  assert.match(fixed, /conversational/);
  assert.equal(repairLowFatigueAerobic(fixed, AEROBIC_ONLY), fixed, 'repair is not idempotent');
});

test('an athlete who did not ask for low-fatigue work is left alone', () => {
  const p = wk(1, [row('Wed', 'Interval Run', 1, '6 x 400 m', '2 min', 'Hard conditioning.')]);
  const racer = { ...AEROBIC_ONLY, primary_goals: ['Run a fast 5 km'], notes: 'Wants to race.' };
  assert.equal(repairLowFatigueAerobic(p, racer), p);
});
