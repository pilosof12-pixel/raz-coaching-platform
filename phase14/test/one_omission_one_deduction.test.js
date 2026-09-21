// One omission, one deduction.
//
// A benchmarked movement that the prose also promises and no row trains fires
// two rules about the same missing exercise: BENCHMARK_UNEXPOSED at 0.48 and
// PROMISED_MOVEMENT_ABSENT at 0.15. The coach's instruction is to take the
// larger rather than both, because the athlete is short one movement, not two.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeProgram } from '../engine/coach_rules.js';
import { DEDUCTIONS } from '../engine/coach_standard.js';

const INTAKE = {
  age: 30, experience: 'Advanced (3+ years)', bodyweight: '80 kg',
  primary_goals: ['Add 10 kg to my deadlift'],
  maintenance_goals: ['Keep my squat strength'],
  days_per_week: 3, gym_availability_mode: 'flexible', available_gym_days: [],
  training_location: 'commercial_gym', sport: '', sport_schedule: [],
  current_numbers: 'Back Squat: 180 kg x 1\nDeadlift: 200 kg x 1',
  performance_markers: ['Back Squat: 180 kg', 'Deadlift: 200 kg'],
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const rows = [
  'Mon\tDeadlift\t180 kg\t4\t3\t3:00\t8\tPrimary.\t',
  'Mon\tBench Press\t100 kg\t3\t8\t2:00\t7\tPress.\t',
  'Mon\tPlank\tBodyweight\t3\t45s\t1:00\t6\tTrunk.\t',
];
// The narrative promises squat work; no row trains a squat; and the athlete has
// a squat benchmark. One missing movement, two rules looking at it.
const PROGRAM = ['This block will add squat work through the four weeks.', '',
  ...[1, 2, 3, 4].map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`)].join('\n');

test('the smaller of two findings about one omission is dropped', () => {
  const found = gradeProgram(PROGRAM, INTAKE).map((f) => f.rule);
  assert.ok(found.includes('BENCHMARK_UNEXPOSED'), 'the larger finding must survive');
  assert.ok(!found.includes('PROMISED_MOVEMENT_ABSENT'),
    'the athlete is short one movement, not two');
});

test('the survivor is the larger deduction, not merely the first', () => {
  assert.ok(
    DEDUCTIONS.BENCHMARKED_MOVEMENT_UNEXPOSED.typical > DEDUCTIONS.PROMISED_EXPOSURE_ABSENT_FROM_TABLE.typical,
    'if these prices ever invert, the rule kept here has to invert with them',
  );
});

test('a promised movement with no benchmark behind it still fires', () => {
  // Nothing else is looking at this omission, so suppressing it would lose the
  // finding rather than deduplicate it.
  const noBenchmark = {
    ...INTAKE,
    current_numbers: 'Deadlift: 200 kg x 1',
    performance_markers: ['Deadlift: 200 kg'],
    maintenance_goals: [],
  };
  const found = gradeProgram(PROGRAM, noBenchmark).map((f) => f.rule);
  assert.ok(found.includes('PROMISED_MOVEMENT_ABSENT'));
});
