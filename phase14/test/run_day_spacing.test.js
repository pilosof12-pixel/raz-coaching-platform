// "No two running days are consecutive" protects a tendon. Run #161 gave the
// sprint triathlete -- whose achilles flared "after adding two running days in
// one week" -- three consecutive running days every week and five running days
// in Week 2, by putting a brick run on Tuesday between Monday's intervals and
// Wednesday's easy run. No rule caught it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { collectRunDaySpacingFlags, normalizeRunDaySpacing, statesNoConsecutiveRunDays } from '../engine/run_day_spacing.js';
import { detectIntakeClarifications } from '../intake_clarification.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const r = (day, ex, load, sets, reps, notes) => [day, ex, load, sets, reps, '90 sec', '6', notes, ''].join('\t');
const prog = (rows) => [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, H, ...rows, `END_WEEK${w}_TSV`].join('\n')).join('\n\n');

const INTAKE = {
  notes: 'No two running days are consecutive, which is deliberate: the achilles does not tolerate back-to-back ones.',
  sport_schedule: [
    { day: 'Mon', type: 'Run intervals' }, { day: 'Tue', type: 'Swim' }, { day: 'Wed', type: 'Run easy' },
    { day: 'Thu', type: 'Bike' }, { day: 'Fri', type: 'Swim technique' }, { day: 'Sat', type: 'Run long' }, { day: 'Sun', type: 'Bike long' },
  ],
};

// Monday's intervals are four times ninety seconds: six minutes of work, and the
// primary run session of her week. A first version of this repair removed them
// for being short.
const MON_INTERVALS = r('Mon', 'Run', '4:37/km', '4', '90 sec', 'Primary run-quality session.');
const TUE_BIKE = r('Tue', 'Bike', '175 W', '2', '8 min', 'Pre-run race-order primer; stay smooth and seated, then go straight to the run.');
const TUE_BRICK = r('Tue', 'Run', '4:37/km', '1', '8 min', 'Brick run straight off the bike.');
const WED_EASY = r('Wed', 'Run', '5:30/km', '1', '40 min', 'Easy run.');
const FRI_BRICK_SET = r('Fri', 'Run', '4:40/km', '3', '4 min', 'Three bike-to-run pairs.');
const FRI_BIKE = r('Fri', 'Bike', '180 W', '3', '6 min', 'Bike-to-run pairs in race order.');
const SAT_LONG = r('Sat', 'Run', '5:20/km', '1', '60 min', 'Long run.');

test('the stated rule is recognised and the brick is caught', () => {
  assert.equal(statesNoConsecutiveRunDays(INTAKE), true);
  const flags = collectRunDaySpacingFlags(prog([MON_INTERVALS, TUE_BIKE, TUE_BRICK, WED_EASY, SAT_LONG]), INTAKE);
  assert.equal(flags.length, 4);
  assert.equal(flags[0].code, 'STATED_RUN_SPACING_VIOLATED');
  assert.deepEqual(flags[0].pairs, [['mon', 'tue'], ['tue', 'wed']]);
});

test('the runs she scheduled stay; the runs the model added go, whatever their shape', () => {
  const before = prog([MON_INTERVALS, TUE_BIKE, TUE_BRICK, WED_EASY, FRI_BIKE, FRI_BRICK_SET, SAT_LONG]);
  const out = normalizeRunDaySpacing(before, INTAKE);
  assert.equal(out.repaired, true);
  assert.deepEqual(collectRunDaySpacingFlags(out.program, INTAKE), []);
  assert.match(out.program, /^Mon\tRun\t4:37\/km\t4\t90 sec/m, 'six minutes of intervals on a scheduled run day are her main session');
  assert.match(out.program, /^Wed\tRun\t/m);
  assert.match(out.program, /^Sat\tRun\t/m);
  assert.doesNotMatch(out.program, /^Tue\tRun\t/m);
  assert.doesNotMatch(out.program, /^Fri\tRun\t/m, 'a three-pair brick set is still an added running day');
});

// A note left over a changed row is the defect V107 shipped.
test('the ride stops promising a run that no longer follows it', () => {
  const out = normalizeRunDaySpacing(prog([MON_INTERVALS, TUE_BIKE, TUE_BRICK, WED_EASY, FRI_BIKE, FRI_BRICK_SET, SAT_LONG]), INTAKE);
  const bikeNotes = out.program.split('\n').map((l) => l.split('\t')).filter((c) => /^(Tue|Fri)$/.test(c[0]) && c[1] === 'Bike').map((c) => c[7]);
  assert.ok(bikeNotes.length >= 2);
  // The replacement may say WHY there is no run; what it must not do is promise
  // one follows.
  for (const n of bikeNotes) assert.doesNotMatch(n, /\bto the run\b|\bbrick\b|bike-to-run|\bthen run\b|straight (?:in)?to/i, n);
});

test('without the stated rule nothing moves', () => {
  const p = prog([MON_INTERVALS, TUE_BIKE, TUE_BRICK, WED_EASY, SAT_LONG]);
  const out = normalizeRunDaySpacing(p, { sport_schedule: INTAKE.sport_schedule, notes: 'Works full time.' });
  assert.equal(out.repaired, false);
  assert.equal(out.program, p);
});

// One source of wording for both checks: the intake question asked before any
// call, and this repair on what comes back.
test('the intake check reads the same statement', () => {
  const contradictory = { ...INTAKE, sport_schedule: [{ day: 'Sun', type: 'Run long' }, { day: 'Mon', type: 'Run intervals' }] };
  assert.ok(detectIntakeClarifications(contradictory).some((q) => q.id === 'run_day_spacing_conflict'));
});
