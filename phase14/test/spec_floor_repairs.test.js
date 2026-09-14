// Three more rules that could refuse a program and had no way to mend one.
//
// A skill movement on a conditioning clock, a fighter's bike session with no
// stated purpose, and a week 1 that runs further than the athlete has ever run.
// Each rule was right, each message already named the value it wanted, and none
// of them could be answered -- so an intake that tripped one spent four
// generations and produced nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairSkillRest } from '../engine/coaching_spec_v1_quality.js';
import { repairEnduranceRedundancy } from '../engine/phase15_elite_guardrails.js';
import { repairRunBaseline } from '../engine/advanced_hybrid_quality.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const cells = (l) => l.split('\t');

const YOUTH = {
  age: 13, experience: 'intermediate', days_per_week: 2, training_location: 'home_gym',
  primary_goals: ['Achieve a freestanding handstand', 'Achieve first bar muscle-up'],
  equipment: 'Rings, pull-up bar, bands and bench.',
};
const FIGHTER = { sport: 'MMA', sport_schedule: [{ day: 'Mon', intensity: 'hard' }], primary_goals: ['Run a faster 5 km'] };
const HYBRID = {
  age: 30, experience: 'advanced', days_per_week: 4, available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  primary_goals: ['220kg back squat', '4 One arm pullups'], secondary_goals: ['Marathon'],
  sport: 'MMA', sport_sessions_per_week: 5, training_location: 'commercial_gym',
  notes: 'Current running is 1 run per week, about 20 km total.',
  clarification_answers: { running_current_exposure: 'Currently 1 run per week, about 20 km total, longest recent run about 20 km.' },
};

// COACH_SPEC_V1_YG_SKILL_REST_TOO_SHORT
test('a skill movement is taken off the conditioning clock', () => {
  const p = wk(1, [
    ['Mon', 'Wall Handstand Hold', 'BW', '4', '20 sec', '20 sec', '7', 'Hold tall.', ''].join('\t'),
    ['Mon', 'Ring Row', 'BW', '3', '8', '60 sec', '7', 'Pull.', ''].join('\t'),
  ]);
  const fixed = repairSkillRest(p, YOUTH);
  const skill = fixed.split('\n').find((l) => l.includes('Wall Handstand Hold'));
  assert.equal(cells(skill)[5], '60-90 sec');
  assert.match(cells(skill)[7], /skill practice, not conditioning/);
  // A movement that is not a skill keeps whatever rest it had.
  assert.equal(cells(fixed.split('\n').find((l) => l.includes('Ring Row')))[5], '60 sec');
  assert.equal(repairSkillRest(fixed, YOUTH), fixed, 'repair is not idempotent');
});

test('an adult is not governed by the youth skill-rest rule', () => {
  const p = wk(1, [['Mon', 'Box Jump', 'BW', '4', '3', '20 sec', '7', 'Jump.', ''].join('\t')]);
  assert.equal(repairSkillRest(p, { age: 30, experience: 'advanced' }), p);
});

// CONCURRENT_ENDURANCE_REDUNDANCY_UNJUSTIFIED
test('a fighter\'s bike session says why it is a bike and not a run', () => {
  const p = wk(1, [
    ['Tue', 'Zone-2 Bike', '-', '1', '30 min', '-', '5', 'Steady aerobic work.', ''].join('\t'),
    ['Tue', 'Pull-up', 'BW', '3', '8', '2 min', '7', 'Pulling.', ''].join('\t'),
  ]);
  const fixed = repairEnduranceRedundancy(p, FIGHTER);
  const bike = cells(fixed.split('\n').find((l) => l.includes('Zone-2 Bike')))[7];
  assert.match(bike, /Steady aerobic work\./, 'the original note survives');
  assert.match(bike, /aerobic volume with less mechanical and eccentric cost/);
  assert.ok(!/eccentric cost/.test(cells(fixed.split('\n').find((l) => l.includes('Pull-up')))[7]),
    'only the redundant modality is annotated');
  assert.equal(repairEnduranceRedundancy(fixed, FIGHTER), fixed, 'repair is not idempotent');
});

test('a note that already states the purpose is left alone', () => {
  const p = wk(1, [['Tue', 'Zone-2 Bike', '-', '1', '30 min', '-', '5', 'Chosen for lower-impact aerobic volume.', ''].join('\t')]);
  assert.equal(repairEnduranceRedundancy(p, FIGHTER), p);
});

test('an athlete with no combat practice is untouched', () => {
  const p = wk(1, [['Tue', 'Zone-2 Bike', '-', '1', '30 min', '-', '5', 'Steady aerobic work.', ''].join('\t')]);
  assert.equal(repairEnduranceRedundancy(p, { sport: 'Cycling' }), p);
});

// ADVANCED_HYBRID_RUN_BASELINE_EXCEEDED
test('week 1 starts from the distance the athlete already runs', () => {
  const p = wk(1, [
    ['Sun', 'Run', '-', '1', '32 km', '-', '5', 'Long aerobic run.', ''].join('\t'),
    ['Mon', 'Back Squat', '150 kg', '3', '5', '3 min', '8', 'Heavy.', ''].join('\t'),
  ]);
  const fixed = repairRunBaseline(p, HYBRID);
  const run = fixed.split('\n').find((l) => /\tRun\t/.test(l));
  assert.equal(cells(run)[4], '20 km');
  assert.match(cells(run)[7], /starts from what you already run/);
  // The run keeps its day and its place in the week; only the distance moves.
  assert.equal(cells(run)[0], 'Sun');
  assert.equal(repairRunBaseline(fixed, HYBRID), fixed, 'repair is not idempotent');
});

test('a run already inside the baseline is not touched', () => {
  const p = wk(1, [['Sun', 'Run', '-', '1', '16 km', '-', '5', 'Long aerobic run.', ''].join('\t')]);
  assert.equal(repairRunBaseline(p, HYBRID), p);
});
