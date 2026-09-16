import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROGRAM_TYPE, DIMENSIONS, selectProgramType, weightedScore, applyCaps,
  overallScore, overallCostOf, THRESHOLDS, CAPS,
} from '../engine/coach_standard.js';

// The three programs the coach scored in Phase 1, with the dimension scores he
// published. If the encoded weights do not reproduce his overall scores, the
// model is wrong and nothing built on it can be trusted.
const ANCHORS = [
  {
    id: 'Program 1, hybrid/weightlifting', stated: 8.2, raw: 8.23,
    type: PROGRAM_TYPE.WEIGHTLIFTING,
    dims: {
      competition_lift_specificity: 7.8,
      loading_progression: 8.4,
      fatigue_management: 8.1,
      athlete_specific_modification: 8.6,
      execution_rules: 8.8,
    },
  },
  {
    id: 'Program 2, tactical 3 km', stated: 7.6, raw: 7.638,
    type: PROGRAM_TYPE.TACTICAL_ENDURANCE,
    dims: {
      primary_goal_specificity: 7.0,
      progression_and_overload: 7.4,
      concurrent_training_structure: 7.8,
      secondary_goal_integration: 8.2,
      athlete_specific_constraints: 8.5,
      execution_rules: 8.6,
    },
  },
  {
    id: 'Program 3, MMA fight camp', stated: 8.9, raw: 8.929,
    type: PROGRAM_TYPE.COMBAT_CAMP,
    dims: {
      camp_specificity_and_hierarchy: 9.4,
      fatigue_and_sport_integration: 9.2,
      strength_and_power_maintenance: 8.3,
      injury_and_symptom_modification: 9.3,
      taper_and_competition_week: 9.1,
      execution_rules: 9.4,
    },
  },
];

test('every dimension set sums to one', () => {
  for (const [type, dims] of Object.entries(DIMENSIONS)) {
    const sum = dims.reduce((n, [, w]) => n + w, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${type} sums to ${sum}`);
  }
});

test('the encoded weights reproduce every score the coach gave', () => {
  for (const a of ANCHORS) {
    const got = overallScore(a.type, a.dims);
    assert.equal(got.ok, true, a.id);
    assert.ok(Math.abs(got.raw - a.raw) < 5e-4, `${a.id}: raw ${got.raw} vs ${a.raw}`);
    assert.equal(got.overall, a.stated, a.id);
  }
});

// The thing we had wrong until the standard arrived: reading the finding costs
// as the score. Kept as a test so it cannot quietly come back.
test('subtracting the finding costs from ten does not reproduce the scores', () => {
  for (const [id, costs, stated] of [['Program 1', 1.65, 8.2], ['Program 2', 1.60, 7.6], ['Program 3', 0.95, 8.9]]) {
    assert.notEqual(Math.round((10 - costs) * 10) / 10, stated, `${id} must not reconcile by subtraction`);
  }
  assert.ok(Math.abs((10 - 1.60) - 7.6) > 0.7, 'Program 2 is the case that proves it: 0.8 out');
});

test('a partial dimension set returns no score rather than a wrong one', () => {
  const partial = { ...ANCHORS[2].dims };
  delete partial.strength_and_power_maintenance;
  const got = overallScore(PROGRAM_TYPE.COMBAT_CAMP, partial);
  assert.equal(got.ok, false);
  assert.equal(got.overall, null);
  assert.deepEqual(got.missing, ['strength_and_power_maintenance']);
});

test('caps apply after the weighted score and the lowest one wins', () => {
  assert.deepEqual(applyCaps(8.9, []), { score: 8.9, capped: false, cap: null });
  assert.equal(applyCaps(8.9, ['PRIMARY_GOAL_OMITTED']).score, CAPS.PRIMARY_GOAL_OMITTED);
  assert.equal(applyCaps(8.9, ['PRIMARY_GOAL_OMITTED', 'SYMPTOM_REPRODUCTION_IGNORED']).score, 6.0);
  // A cap above the earned score leaves it alone.
  assert.equal(applyCaps(5.5, ['AVAILABLE_DAY_VIOLATION']).score, 5.5);
  const capped = overallScore(PROGRAM_TYPE.COMBAT_CAMP, ANCHORS[2].dims, ['SYMPTOM_REPRODUCTION_IGNORED']);
  assert.equal(capped.overall, 6.0);
  assert.equal(capped.capped, true);
});

// The reason the weights matter for what we build: the same finding is worth
// very different amounts depending on where it lands.
test('a finding costs its severity times the weight of the dimension it lands in', () => {
  const inStrength = overallCostOf(PROGRAM_TYPE.COMBAT_CAMP, 'strength_and_power_maintenance', 0.40);
  const inExecution = overallCostOf(PROGRAM_TYPE.COMBAT_CAMP, 'execution_rules', 0.40);
  assert.ok(Math.abs(inStrength - 0.14) < 1e-9);
  assert.ok(Math.abs(inExecution - 0.032) < 1e-9);
  assert.ok(inStrength > inExecution * 4);
});

test('program type is selected from the intake', () => {
  assert.equal(selectProgramType({ sport: 'Olympic weightlifting', primary_goals: ['Snatch 120 kg'] }), PROGRAM_TYPE.WEIGHTLIFTING);
  assert.equal(selectProgramType({
    primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
    secondary_goals: ['Improve 10 km ruck with 20 kg', 'Improve strict pull-ups'],
  }), PROGRAM_TYPE.TACTICAL_ENDURANCE);
  assert.equal(selectProgramType({
    event_type: 'combat',
    primary_goals: ['Arrive at the fight fresh and physically sharp'],
    sport_schedule: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day: d, intensity: 'moderate' })),
  }, { weeksToEvent: 3.4 }), PROGRAM_TYPE.COMBAT_CAMP);
  // A fighter whose event is months away is not in a camp.
  assert.notEqual(selectProgramType({
    event_type: 'combat', sport_schedule: new Array(7).fill({ day: 'Mon', intensity: 'hard' }),
  }, { weeksToEvent: 12 }), PROGRAM_TYPE.COMBAT_CAMP);
  assert.equal(selectProgramType({ primary_goals: ['Get generally fitter'] }), PROGRAM_TYPE.UNCLASSIFIED);
});

// Only numbers the coach committed to. Anything he filed under "Judgement, not
// rules" must stay out: a preference encoded as a gate fails builds for a
// reason nobody can satisfy.
test('the encoded thresholds are the ones the standard states', () => {
  assert.equal(THRESHOLDS.MAINTENANCE_MIN_LOAD_FRACTION_OF_BENCHMARK, 0.75);
  assert.equal(THRESHOLDS.RUN_WEEK3_MIN_FRACTION_OF_GOAL_SPEED, 0.95);
  assert.equal(THRESHOLDS.RUN_WEEK4_MIN_FRACTION_OF_GOAL_SPEED, 0.97);
  assert.equal(THRESHOLDS.MAX_CONSECUTIVE_LIFTING_DAYS, 3);
  assert.equal(THRESHOLDS.MAX_CONSECUTIVE_LOWER_LEG_LOADING_DAYS, 2);
  assert.deepEqual(THRESHOLDS.BASELINE_MAX_SHORTFALL_BY_WEEK, [0.30, 0.20, 0.10, null]);
  assert.deepEqual(THRESHOLDS.OLY_WEEK3_CJ_INTENSITY_BAND, [0.89, 0.90]);
});
