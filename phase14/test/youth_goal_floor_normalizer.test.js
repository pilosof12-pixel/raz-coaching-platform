import test from 'node:test';
import assert from 'node:assert/strict';

import { directGoalExposures, parseProgramModel } from '../engine/program_model.js';
import { validateGoalComponentCoverageSemantic } from '../engine/goal_progression_graph.js';
import { normalizeYouthAcquisitionGoalFloors } from '../engine/youth_goal_floor_normalizer.js';
import { normalizeYouthPrimarySkillOrder } from '../engine/youth_skill_order_normalizer.js';

const INTAKE = {
  age: 13,
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  days_per_week: 2,
  gym_availability_mode: 'flexible',
  available_gym_days: [],
  training_location: 'home_gym',
  equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
  current_numbers: 'About 12 strict pull-ups and 6 good ring dips.',
  clarification_answers: {
    benchmark_bar_muscle_up: 'Cannot perform a bar muscle-up yet. Can perform a ring muscle-up.',
    benchmark_handstand: 'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
  },
};

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function week(n) {
  return [
    `START_WEEK${n}_TSV`, HEADER,
    ['Session A', '[WARMUP]', 'N/A', '1', '8 min', 'N/A', '3', 'Short non-fatiguing preparation.', ''].join('\t'),
    ['Session A', 'Controlled Handstand Kick-up', 'BW', '4', '1-2 attempts', '60s', '5', 'Fresh balance practice.', ''].join('\t'),
    ['Session A', 'Strict Pull-up', 'BW', '3', '6', '2 min', '7', 'General pull support.', ''].join('\t'),
    ['Session B', '[WARMUP]', 'N/A', '1', '8 min', 'N/A', '3', 'Short non-fatiguing preparation.', ''].join('\t'),
    ['Session B', 'Pistol Squat', 'BW', '3', '5 / side', '90s', '7', 'General athletic strength.', ''].join('\t'),
    `END_WEEK${n}_TSV`,
  ].join('\n');
}

function candidate() {
  return [1, 2, 3, 4].map(week).join('\n\n');
}

test('Youth acquisition normalizer restores missing bar-specific direct work and wall-supported handstand capacity', () => {
  const normalized = normalizeYouthAcquisitionGoalFloors(candidate(), INTAKE);
  assert.equal(normalized.repaired, true);
  assert.equal(normalized.repairs.filter((r) => r.exercise === 'Bar Muscle-up Transition Drill').length, 4);
  assert.equal(normalized.repairs.filter((r) => r.exercise === 'Wall Handstand Hold').length, 4);

  const ordered = normalizeYouthPrimarySkillOrder(normalized.program, INTAKE).program;
  const model = parseProgramModel(ordered, INTAKE);
  for (let weekNumber = 1; weekNumber <= 4; weekNumber++) {
    assert.ok(directGoalExposures(model, 'bar_muscle_up', weekNumber).length >= 1, `bar direct missing week ${weekNumber}`);
    assert.ok(directGoalExposures(model, 'handstand', weekNumber).length >= 1, `handstand direct missing week ${weekNumber}`);
  }
  assert.equal(validateGoalComponentCoverageSemantic(ordered, INTAKE, model).ok, true);

  assert.match(ordered, /BW \+ moderate band/);
  assert.match(ordered, /slightly lighter band/);
  assert.match(ordered, /lightest band that preserves a clean symmetrical turnover/);
  assert.match(ordered, /retain the lightest clean Week 3 band/);
});

test('Youth acquisition normalizer is idempotent once the required floor exists', () => {
  const once = normalizeYouthAcquisitionGoalFloors(candidate(), INTAKE);
  const twice = normalizeYouthAcquisitionGoalFloors(once.program, INTAKE);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});
