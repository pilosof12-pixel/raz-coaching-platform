// Four marathon rules that could refuse a program and had no way to answer it.
//
// All four sit in final QA, where the only response to a flag was a throw, and
// none had a repair. A marathon intake that tripped one spent four generations
// arguing with the model and then failed. Each message already stated its own
// fix; these assert the fix now happens in code.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairMarathonProgression } from '../engine/marathon_progression.js';
import {
  weekOneRunningVolumeFlags, marathonStackedProgressionFlags, marathonStrengthMaintenanceFlags,
} from '../engine/phase15_final_qa.js';

const RUNNER = {
  age: 34, language: 'en', experience: 'intermediate', days_per_week: 4,
  training_location: 'commercial_gym', equipment: 'Full commercial gym and road access.',
  primary_goals: ['Run a marathon in under 3:30'],
  secondary_goals: ['Maintain strength through the build'],
  notes: 'Currently running about 40 km per week across four runs.',
  current_numbers: 'Back Squat: 120 kg x 5', qa_diagnostics: true,
};
const NOT_A_RUNNER = { ...RUNNER, primary_goals: ['Add 20 kg to my squat'], secondary_goals: ['Stay lean'], notes: 'Lifts four times a week.' };

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const run = (d, reps, note) => [d, 'Easy Run', '', '1', reps, '-', '5', note, ''].join('\t');
const lift = (d, ex, reps, rpe) => [d, ex, '100 kg', '3', reps, '2 min', String(rpe), 'Maintenance dose.', ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

test('a client with no marathon goal is untouched', () => {
  const p = wk(1, [run('Mon', '20 km', 'Easy conversational.')]);
  assert.equal(repairMarathonProgression(p, NOT_A_RUNNER), p);
});

test('week 1 is brought back to the distance the athlete already runs', () => {
  // 60 km prescribed against 40 km/week reported.
  const p = [1, 2, 3, 4].map((n) => wk(n, [
    run('Mon', '10 km', 'Easy conversational.'), run('Wed', '10 km', 'Easy conversational.'),
    run('Fri', '15 km', 'Marathon pace quality work at 4:50/km.'), run('Sun', '25 km', 'Long run.'),
  ])).join('\n\n');
  assert.deepEqual(weekOneRunningVolumeFlags(p, RUNNER).map((f) => f.code), ['MARATHON_WEEK1_VOLUME_ABOVE_CURRENT'],
    'the fixture is over volume to begin with');

  const fixed = repairMarathonProgression(p, RUNNER);
  assert.deepEqual(weekOneRunningVolumeFlags(fixed, RUNNER), [], 'the repair must answer its own flag');
  // Frequency is preserved: four runs in, four runs out.
  const w1 = fixed.slice(fixed.indexOf('START_WEEK1_TSV'), fixed.indexOf('END_WEEK1_TSV'));
  assert.equal(w1.split('\n').filter((l) => l.includes('Easy Run')).length, 4);
  assert.equal(repairMarathonProgression(fixed, RUNNER), fixed, 'repair is not idempotent');
});

test('only one running category progresses across a transition', () => {
  const week = (n, easy, long, quality, pace) => wk(n, [
    run('Mon', `${easy} km`, 'Easy conversational.'),
    run('Fri', `${quality} km`, `Marathon pace quality work at ${pace}/km.`),
    run('Sun', `${long} km`, 'Long run.'),
  ]);
  // Everything climbs at once, and the quality run gets faster as well.
  const p = [week(1, 8, 16, 6, '4:55'), week(2, 10, 18, 8, '4:45'),
    week(3, 12, 20, 10, '4:40'), week(4, 14, 22, 12, '4:35')].join('\n\n');
  const stacked = marathonStackedProgressionFlags(p, RUNNER).map((f) => f.code);
  assert.ok(stacked.includes('MARATHON_STACKED_VOLUME_PROGRESSION'), 'the fixture stacks to begin with');
  assert.ok(stacked.includes('MARATHON_QUALITY_DOUBLE_PROGRESSION'),
    'and makes the quality run both longer and faster');

  const fixed = repairMarathonProgression(p, RUNNER);
  assert.deepEqual(marathonStackedProgressionFlags(fixed, RUNNER).map((f) => f.code), [],
    'the repair must answer its own flags');
  // The long run is the lever a marathon block is built on, so it keeps moving.
  assert.match(fixed, /22 km/, 'the long run still progresses');
  assert.equal(repairMarathonProgression(fixed, RUNNER), fixed, 'repair is not idempotent');
});

test('a maintenance lift does not become a progressive overload block', () => {
  const p = [
    wk(1, [lift('Tue', 'Back Squat', '5', 6), lift('Fri', 'Romanian Deadlift', '6', 6)]),
    wk(2, [lift('Tue', 'Back Squat', '6', 7), lift('Fri', 'Romanian Deadlift', '7', 7)]),
    wk(3, [lift('Tue', 'Back Squat', '7', 7), lift('Fri', 'Romanian Deadlift', '8', 7)]),
    wk(4, [lift('Tue', 'Back Squat', '8', 8), lift('Fri', 'Romanian Deadlift', '9', 8)]),
  ].join('\n\n');
  assert.deepEqual(marathonStrengthMaintenanceFlags(p, RUNNER).map((f) => f.code), ['MARATHON_STRENGTH_MAINTENANCE_OVERLOAD'],
    'the fixture overloads to begin with');

  const fixed = repairMarathonProgression(p, RUNNER);
  assert.deepEqual(marathonStrengthMaintenanceFlags(fixed, RUNNER), []);
  // The effort is given back; the movement and its place in the week are not.
  assert.match(fixed, /Back Squat/);
  assert.match(fixed, /Romanian Deadlift/);
  assert.equal(repairMarathonProgression(fixed, RUNNER), fixed, 'repair is not idempotent');
});

test('a program that already obeys all four rules is returned unchanged', () => {
  const p = [1, 2, 3, 4].map((n) => wk(n, [
    run('Mon', '8 km', 'Easy conversational.'),
    run('Fri', '6 km', 'Marathon pace quality work at 4:50/km.'),
    run('Sun', `${12 + n * 2} km`, 'Long run.'),
    lift('Tue', 'Back Squat', '5', 6),
  ])).join('\n\n');
  assert.deepEqual(weekOneRunningVolumeFlags(p, RUNNER), []);
  assert.deepEqual(marathonStackedProgressionFlags(p, RUNNER), []);
  assert.deepEqual(marathonStrengthMaintenanceFlags(p, RUNNER), []);
  assert.equal(repairMarathonProgression(p, RUNNER), p);
});
