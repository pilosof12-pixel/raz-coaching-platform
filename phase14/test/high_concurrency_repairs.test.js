// Three rules for the athlete carrying the most at once: primary strength and
// skill goals, a marathon behind them, and five sport sessions a week. Each
// rule named its own answer and could not apply it, so a hybrid intake that
// tripped one spent four generations and produced nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairUnconditionalProgression } from '../engine/coaching_spec_v1_quality.js';
import { repairMarathonSubordination } from '../engine/advanced_hybrid_quality.js';
import { repairDense72hWindow } from '../engine/manual_acceptance_quality.js';
import { validateAdvancedHybridCoachingSpecV1 } from '../engine/coaching_spec_v1_quality.js';
import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';

const HYBRID = {
  age: 30, language: 'en', experience: 'advanced', days_per_week: 4,
  gym_availability_mode: 'limited', available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  training_location: 'commercial_gym', equipment: 'Full commercial gym.',
  primary_goals: ['220kg back squat', '4 One arm pullups'], secondary_goals: ['Marathon'],
  sport: 'MMA', sport_sessions_per_week: 5,
  current_numbers: 'Back Squat: 205 kg 1RM\nRunning: 1 session a week, about 20 km total, longest recent run about 20 km',
  clarification_answers: { running_current_exposure: 'Currently 1 run per week, about 20 km total, longest recent run about 20 km.' },
  qa_diagnostics: true,
};
const NOT_HYBRID = { age: 30, experience: 'beginner', days_per_week: 2, primary_goals: ['Get fitter'] };

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (d, n, w, s, r, rpe, note) => [d, n, w, String(s), r, '3 min', String(rpe), note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const cell = (line, i) => line.split('\t')[i];

// COACH_SPEC_V1_AH_UNCONDITIONAL_MAJOR_LIFT_PROGRESSION
test('extra weight on the bar has to say what earns it', () => {
  const p = [1, 2, 3, 4].map((n) => wk(n, [row('Mon', 'Back Squat', `${145 + n * 5} kg`, 3, '5', 8, 'Top set of five.')])).join('\n\n');
  const fixed = repairUnconditionalProgression(p, HYBRID);
  const week2 = fixed.split('\n').filter((l) => /Back Squat/.test(l))[1];
  assert.match(cell(week2, 7), /only if last week's top set moved at the same speed/);
  assert.match(cell(week2, 7), /repeat last week's weight/i, 'and says what to do when it did not');
  // Week 1 has nothing before it to earn, so it is left alone.
  assert.equal(cell(fixed.split('\n').filter((l) => /Back Squat/.test(l))[0], 7), 'Top set of five.');
  assert.equal(repairUnconditionalProgression(fixed, HYBRID), fixed, 'repair is not idempotent');
});

test('a note that already states a condition is not given a second one', () => {
  const p = [1, 2].map((n) => wk(n, [row('Mon', 'Back Squat', `${145 + n * 5} kg`, 3, '5', 8,
    'Add weight only if bar speed held last week.')])).join('\n\n');
  assert.equal(repairUnconditionalProgression(p, HYBRID), p);
});

test('an athlete who is not carrying concurrent goals is untouched', () => {
  const p = [1, 2].map((n) => wk(n, [row('Mon', 'Back Squat', `${100 + n * 5} kg`, 3, '5', 8, 'Top set.')])).join('\n\n');
  assert.equal(repairUnconditionalProgression(p, NOT_HYBRID), p);
});

// ADVANCED_HYBRID_MARATHON_SUBORDINATION
test('the support run is described as the support run', () => {
  const p = wk(1, [
    row('Sun', 'Run', '-', 1, '16 km', 5, 'Long aerobic run.'),
    row('Sun', 'Back Squat', '150 kg', 3, '5', 8, 'Heavy.'),
  ]);
  const fixed = repairMarathonSubordination(p, HYBRID);
  assert.match(fixed, /Easy, conversational pace/);
  assert.match(fixed, /strength and skill goals stay in front of it/);
  assert.equal(repairMarathonSubordination(fixed, HYBRID), fixed, 'repair is not idempotent');
});

test('a second run is removed, and never the last work on a day', () => {
  const p = wk(1, [
    row('Sun', 'Run', '-', 1, '16 km', 5, 'Easy conversational run.'),
    row('Sun', 'Back Squat', '150 kg', 3, '5', 8, 'Heavy.'),
    row('Wed', 'Run', '-', 1, '8 km', 8, 'Tempo effort.'),
    row('Wed', 'Pull-up', 'BW', 3, '8', 7, 'Pulling.'),
  ]);
  const fixed = repairMarathonSubordination(p, HYBRID);
  const runs = fixed.split('\n').filter((l) => /\tRun\t/.test(l));
  assert.equal(runs.length, 1, 'exactly one run survives');
  assert.match(runs[0], /16 km/, 'and it is the one already written as easy');
  assert.match(fixed, /Pull-up/, 'the rest of that day is untouched');

  // A run that is the only work on its day stays: no session is emptied for a
  // wording rule.
  const alone = wk(1, [
    row('Sun', 'Run', '-', 1, '16 km', 5, 'Easy conversational run.'),
    row('Sun', 'Back Squat', '150 kg', 3, '5', 8, 'Heavy.'),
    row('Wed', 'Run', '-', 1, '8 km', 8, 'Tempo effort.'),
  ]);
  assert.equal(repairMarathonSubordination(alone, HYBRID).split('\n').filter((l) => /\tRun\t/.test(l)).length, 2);
});

// ADVANCED_HYBRID_DENSE_72H_PRIMARY_WINDOW
test('the day between a long run and a heavy squat is made genuinely low-cost', () => {
  const p = wk(1, [
    row('Sat', 'Run', '-', 1, '20 km', 5, 'Long aerobic run.'),
    row('Sun', 'Bulgarian Split Squat', '40 kg', 4, '8', 8, 'Hard unilateral work.'),
    row('Mon', 'Back Squat', '170 kg', 3, '3', 9, 'Heavy triple.'),
  ]);
  const fixed = repairDense72hWindow(p, HYBRID);
  const middle = fixed.split('\n').find((l) => /Bulgarian Split Squat/.test(l));
  assert.equal(cell(middle, 3), '2', 'compact');
  assert.equal(cell(middle, 6), '6', 'and roughly RPE 6');
  assert.match(cell(middle, 7), /leave both of those intact/);
  // The long run and the squat are the things being protected, not changed.
  assert.match(fixed.split('\n').find((l) => /\tRun\t/.test(l)), /20 km/);
  assert.equal(cell(fixed.split('\n').find((l) => /Back Squat/.test(l)), 6), '9');
  assert.equal(repairDense72hWindow(fixed, HYBRID), fixed, 'repair is not idempotent');
});

test('a week without that collision is left alone', () => {
  const p = wk(1, [
    row('Sat', 'Run', '-', 1, '20 km', 5, 'Long aerobic run.'),
    row('Sun', 'Zone-2 Bike', '-', 1, '30 min', 5, 'Easy spin.'),
    row('Mon', 'Back Squat', '170 kg', 3, '3', 9, 'Heavy triple.'),
  ]);
  assert.equal(repairDense72hWindow(p, HYBRID), p);
});
