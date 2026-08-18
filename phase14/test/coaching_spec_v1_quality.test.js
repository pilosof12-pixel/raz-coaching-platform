import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAdvancedHybridCoachingSpecV1,
  validateYouthCoachingSpecV1HardRules,
  collectYouthCoachingSpecV1ReviewSignals,
  validateTactical3KCoachingSpecV1,
  buildCoachingSpecV1Brief,
} from '../engine/coaching_spec_v1_quality.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function block(week, rows) {
  return `START_WEEK${week}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${week}_TSV`;
}
function fourWeeks(factory, intro = '') {
  return `${intro ? `${intro}\n\n` : ''}${[1,2,3,4].map((w) => block(w, factory(w))).join('\n\n')}`;
}

const advancedIntake = {
  age: 30,
  days_per_week: 4,
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport_sessions_per_week: 5,
  sport: 'MMA / grappling 5 sessions per week',
  primary_goals: ['Back Squat 220 kg', '4 strict One-Arm Pull-ups'],
  secondary_goals: ['Overhead Press 100 kg', 'Marathon pathway'],
  maintenance_goals: ['Maintain muscle'],
  current_numbers: 'Back Squat 205 kg 1RM | One-Arm Pull-up 2 strict each arm | Overhead Press 80 kg x 4',
};

test('AH-02 rejects two substantial >=80% squat exposures in the same high-concurrency week', () => {
  const program = fourWeeks(() => [
    'Mon\tBack Squat\t180 kg\t4\t3\t3 min\t8\tPrimary heavy exposure.\t',
    'Fri\tBack Squat\t165 kg\t3\t4\t2 min\t7.5\tSecondary squat exposure.\t',
  ]);
  assert.throws(
    () => validateAdvancedHybridCoachingSpecV1(program, advancedIntake),
    (err) => err?.code === 'COACH_SPEC_V1_AH_DUAL_SQUAT_FATIGUE',
  );
});

test('AH-04 rejects demanding OAP exposures on consecutive days', () => {
  const program = fourWeeks(() => [
    'Mon\tOne-Arm Pull-up\tBodyweight\t5\t1 per arm\t2-3 min\t8\tClean strict singles per arm.\t',
    'Tue\tAssisted One-Arm Pull-up\tMinimum assistance\t4\t2 per arm\t2-3 min\t7.5\tClean assisted doubles per arm.\t',
  ]);
  assert.throws(
    () => validateAdvancedHybridCoachingSpecV1(program, advancedIntake),
    (err) => err?.code === 'COACH_SPEC_V1_AH_ADJACENT_HIGH_STRESS_PULLING',
  );
});

test('AH-06 rejects automatic overload of an explicitly maintained running pathway', () => {
  const intake = {
    ...advancedIntake,
    secondary_goals: ['Overhead Press 100 kg'],
    maintenance_goals: ['Marathon / running maintenance'],
  };
  const program = fourWeeks((w) => [
    `Thu\tRun\tEasy conversational pace\t1\t${[12,13,14,12][w-1]} km\tN/A\t5\tEasy aerobic maintenance.\t`,
  ]);
  assert.throws(
    () => validateAdvancedHybridCoachingSpecV1(program, intake),
    (err) => err?.code === 'COACH_SPEC_V1_AH_MAINTENANCE_AUTO_OVERLOAD',
  );
});

const youthIntake = {
  age: 13,
  gym_availability_mode: 'flexible',
  days_per_week: 2,
  session_length: '60 min',
  primary_goals: ['First Bar Muscle-up', 'Freestanding Handstand'],
  secondary_goals: ['General push/pull strength'],
  current_numbers: '12 strict pull-ups | 6 good ring dips | ring muscle-up achieved | wall handstand 20 sec | no reliable unsupported balance',
};

test('Youth hard rules allow a technically safe program while soft/context rules still produce review signals', () => {
  const program = fourWeeks((w) => {
    const kickSets = w === 3 ? 5 : 4;
    const kickReps = w === 1 ? 3 : 4;
    const powerReps = w >= 3 ? 3 : 2;
    return [
      `Session A\tControlled Handstand Kick-up\tBW\t${kickSets}\t${kickReps}\t45-90 sec\tN/A\tQuality attempts only.\t`,
      'Session A\tBar Muscle-up Transition Drill\tLight band\t5\t1\t75 sec\t6\tClean component singles.\t',
      `Session A\tExplosive Hip-to-Bar Pull-up\tBW\t5\t${powerReps}\t90 sec\t6\tStop if height drops.\t`,
      'Session A\tWall Handstand Hold\tBW\t2\t20 sec\t60 sec\t5\tLine capacity.\t',
    ];
  }, 'Stop before form breaks; attempt counts are ceilings, not quotas.');

  assert.equal(validateYouthCoachingSpecV1HardRules(program, youthIntake).ok, true);
  const signals = collectYouthCoachingSpecV1ReviewSignals(program, youthIntake);
  const codes = new Set(signals.map((x) => x.code));
  assert.ok(codes.has('YG-02_ATTEMPT_VOLUME_REVIEW'));
  assert.ok(codes.has('YG-05_FULL_SKILL_INTEGRATION_REVIEW'));
  assert.ok(codes.has('YG-06_POWER_REP_INFLATION_REVIEW'));
});

test('YG-01 rejects youth acquisition work with no quality-based stop rule', () => {
  const program = fourWeeks(() => [
    'Session A\tControlled Handstand Kick-up\tBW\t4\t3\t60 sec\tN/A\tComplete all prescribed attempts.\t',
    'Session A\tBar Muscle-up Transition Drill\tLight band\t4\t1\t75 sec\t6\tComplete the written sets.\t',
  ]);
  assert.throws(
    () => validateYouthCoachingSpecV1HardRules(program, youthIntake),
    (err) => err?.code === 'COACH_SPEC_V1_YG_SKILL_STOP_RULE_MISSING',
  );
});

const tacticalIntake = {
  age: 27,
  primary_goals: ['3K sub-12'],
  secondary_goals: ['10 km ruck 20 kg to 82 min', '18-20 strict pull-ups'],
  maintenance_goals: ['Maintain squat and deadlift strength'],
  notes: 'Advanced special operations tactical athlete',
  current_numbers: '3K 13:30 | recent 400 m repeats 1:42-1:45 | Back Squat 140 kg x 5 | Deadlift 180 kg x 3',
};

test('T3K-02 rejects a four-week development block that uses only 400 m intervals', () => {
  const program = fourWeeks((w) => [
    `Tue\tRun\t1:${[44,42,40,38][w-1]} per 400 m\t${[6,7,6,4][w-1]}\t400 m\t2 min\tN/A\tControlled quality.\t`,
  ]);
  assert.throws(
    () => validateTactical3KCoachingSpecV1(program, tacticalIntake),
    (err) => err?.code === 'COACH_SPEC_V1_T3K_400_ONLY_BLOCK',
  );
});

test('T3K-05 rejects a primary quality run 24h after substantial lower-body strength', () => {
  const program = fourWeeks(() => [
    'Mon\tBack Squat\t112.5 kg\t3\t5\t2-3 min\t8\tMaintenance strength.\t',
    'Tue\tRun\t2:34 per 600 m\t4\t600 m\t2 min\tN/A\tPrimary 3K quality.\t',
  ]);
  assert.throws(
    () => validateTactical3KCoachingSpecV1(program, tacticalIntake),
    (err) => err?.code === 'COACH_SPEC_V1_T3K_KEY_RUN_PRECEDED_BY_STRENGTH',
  );
});

test('T3K-06 rejects simultaneous ruck load, distance and pace progression', () => {
  const program = fourWeeks((w) => {
    const rucks = [
      ['20 kg, 9:30 per km', '8 km'],
      ['22 kg, 9:15 per km', '9 km'],
      ['22 kg, 9:15 per km', '9 km'],
      ['22 kg, 9:15 per km', '8 km'],
    ][w-1];
    return [
      'Tue\tRun\t2:34 per 600 m\t4\t600 m\t2 min\tN/A\tPrimary 3K quality.\t',
      `Thu\tBackpack Carry\t${rucks[0]}\t1\t${rucks[1]}\tN/A\t6\tControlled ruck.\t`,
    ];
  });
  assert.throws(
    () => validateTactical3KCoachingSpecV1(program, tacticalIntake),
    (err) => err?.code === 'COACH_SPEC_V1_T3K_RUCK_MULTI_VARIABLE_PROGRESSION',
  );
});

test('context brief contains the frozen priority hierarchy and avatar-specific rules', () => {
  const advanced = buildCoachingSpecV1Brief(advancedIntake);
  const youth = buildCoachingSpecV1Brief(youthIntake);
  const tactical = buildCoachingSpecV1Brief(tacticalIntake);
  assert.match(advanced, /safety > primary-goal readiness/i);
  assert.match(advanced, /roughly 48h/i);
  assert.match(youth, /8-15 excellent attempts/i);
  assert.match(tactical, /600-1000m/i);
});
