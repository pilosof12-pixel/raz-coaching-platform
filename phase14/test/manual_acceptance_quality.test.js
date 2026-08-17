import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateYouthManualAcceptanceSemantic,
  validateAdvancedHybridManualAcceptanceSemantic,
} from '../engine/manual_acceptance_quality.js';

function program(rowsByWeek) {
  const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  return [1,2,3,4].map((week) => [
    `START_WEEK${week}_TSV`,
    header,
    ...(rowsByWeek[week] || rowsByWeek.default || []),
    `END_WEEK${week}_TSV`,
  ].join('\n')).join('\n');
}

const youthIntake = {
  age: 13,
  gym_availability_mode: 'flexible',
  available_gym_days: [],
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  current_numbers: 'About 12 strict pull-ups and 6 good ring dips. Wall-facing handstand about 15 seconds.',
};

test('youth flexible scheduling rejects invented weekdays', () => {
  const p = program({ default: [
    'Monday\tControlled Handstand Kick-up\tBodyweight\t4\t3 attempts\t90s\tN/A\tQuality entries\t',
    'Tuesday\tBar Muscle-up Transition Drill\tBand-assisted\t3\t2\t120s\tN/A\tClean turnover\t',
  ]});
  assert.throws(() => validateYouthManualAcceptanceSemantic(p, youthIntake), (err) => err?.code === 'YOUTH_FLEXIBLE_SCHEDULE_INVENTED_WEEKDAYS');
});

test('youth skill work must precede support strength', () => {
  const p = program({ default: [
    'Session A\tRing Row\tBodyweight\t3\t6\t60s\t7\tSupport\t',
    'Session A\tBar Muscle-up Transition Drill\tBand-assisted\t3\t2\t120s\tN/A\tClean turnover\t',
    'Session B\tControlled Handstand Kick-up\tBodyweight\t4\t3 attempts\t90s\tN/A\tQuality entries\t',
  ]});
  assert.throws(() => validateYouthManualAcceptanceSemantic(p, youthIntake), (err) => err?.code === 'YOUTH_PRIMARY_SKILL_NOT_FRESH');
});

test('youth handstand attempt volume cannot progress by piling on sets', () => {
  const p = program({ default: [
    'Session A\tControlled Handstand Kick-up\tBodyweight\t6\t4 attempts\t90s\tN/A\tQuality entries\t',
    'Session B\tBar Muscle-up Transition Drill\tBand-assisted\t3\t2\t120s\tN/A\tClean turnover\t',
  ]});
  assert.throws(() => validateYouthManualAcceptanceSemantic(p, youthIntake), (err) => err?.code === 'YOUTH_HANDSTAND_ATTEMPT_VOLUME_EXCESSIVE');
});

test('youth ring dip working sets stay below a known fresh ceiling', () => {
  const p = program({ default: [
    'Session A\tBar Muscle-up Transition Drill\tBand-assisted\t3\t2\t120s\tN/A\tClean turnover\t',
    'Session A\tRing Dip\tBodyweight\t3\t6\t90s\t8\tSupport strength\t',
    'Session B\tControlled Handstand Kick-up\tBodyweight\t4\t3 attempts\t90s\tN/A\tQuality entries\t',
  ]});
  assert.throws(() => validateYouthManualAcceptanceSemantic(p, youthIntake), (err) => err?.code === 'RING_DIP_DOSE_EXCEEDS_KNOWN_CAPACITY');
});

const hybridIntake = {
  age: 30,
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  days_per_week: 4,
  sport: 'MMA',
  sport_sessions_per_week: 5,
  available_gym_days: ['Mon','Tue','Fri','Sun'],
  current_numbers: 'Back Squat: 205 kg 1RM\nOne-Arm Pull-up: 2 strict reps each arm\nRunning: 1 session a week, about 20 km total, longest recent run about 20 km',
};

test('advanced hybrid rejects repeated squat work that assumes future target capacity', () => {
  const p = program({ default: [
    'Mon\tBack Squat\t190 kg\t3\t3\t180s\t8.5\tHeavy work\t',
    'Mon\tOne-Arm Pull-up\tBW\t3\t1 per arm\t120s\t8\tEach arm\t',
  ]});
  assert.throws(() => validateAdvancedHybridManualAcceptanceSemantic(p, hybridIntake), (err) => err?.code === 'ADVANCED_HYBRID_SQUAT_LOAD_EXCEEDS_CURRENT_CAPACITY');
});

test('advanced hybrid requires explicit per-side OAP dosing', () => {
  const p = program({ default: [
    'Mon\tBack Squat\t175 kg\t3\t3\t180s\t8\tHeavy work\t',
    'Mon\tOne-Arm Pull-up\tBW\t3\t1\t120s\t8\tStrict single\t',
  ]});
  assert.throws(() => validateAdvancedHybridManualAcceptanceSemantic(p, hybridIntake), (err) => err?.code === 'ADVANCED_HYBRID_OAP_SIDE_DOSING_AMBIGUOUS');
});

test('advanced hybrid rejects a long run immediately before heavy squat', () => {
  const p = program({ default: [
    'Sun\tRun\tN/A\t1\t20 km\tN/A\t6\tLong easy run\t',
    'Mon\tBack Squat\t170 kg\t3\t3\t180s\t8\tHeavy work\t',
    'Mon\tOne-Arm Pull-up\tBW\t3\t1 per arm\t120s\t8\tEach arm\t',
  ]});
  assert.throws(() => validateAdvancedHybridManualAcceptanceSemantic(p, hybridIntake), (err) => err?.code === 'ADVANCED_HYBRID_LONG_RUN_PRECEDES_HEAVY_SQUAT');
});
