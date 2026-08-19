import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAdvancedHybridOHPComplement } from '../engine/advanced_hybrid_ohp_normalizer.js';
import {
  validateAdvancedHybridCoachingSpecV1,
  validateYouthCoachingSpecV1HardRules,
} from '../engine/coaching_spec_v1_quality.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function block(week, rows) {
  return `START_WEEK${week}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${week}_TSV`;
}
function fourWeeks(factory, intro = '') {
  return `${intro ? `${intro}\n\n` : ''}${[1, 2, 3, 4].map((w) => block(w, factory(w))).join('\n\n')}`;
}

const advancedIntake = {
  age: 30,
  days_per_week: 4,
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport_sessions_per_week: 5,
  sport: 'MMA / grappling 5 sessions per week',
  primary_goals: ['Back Squat 220 kg', '4 strict One-Arm Pull-ups'],
  secondary_goals: ['Overhead Press 100 kg', 'Marathon'],
  maintenance_goals: ['Maintain muscle'],
  current_numbers: 'Back Squat 205 kg 1RM | One-Arm Pull-up 2 strict each arm | Overhead Press 80 kg x 4',
};

function advancedFourFamilyProgram() {
  const squat = [160, 162.5, 165, 157.5];
  const oapReps = [2, 2, 3, 2];
  const ohp = [75, 77.5, 80, 72.5];
  const run = [10, 10.5, 11, 9];
  return fourWeeks((w) => [
    `Mon\tBack Squat\t${squat[w - 1]} kg\t3\t3\t3 min\t7.5\tIf technique, RPE and recovery are on target, use the listed load; otherwise hold the prior load.\t`,
    `Mon\tOne-Arm Pull-up\tBodyweight\t2\t${oapReps[w - 1]} per arm\t3 min\t7\tClean primary-goal reps only.\t`,
    `Sun\tOverhead Press\t${ohp[w - 1]} kg\t4\t4\t2-3 min\t7.5\tSecondary press work.\t`,
    `Fri\tPush Press\tRPE-selected load\t3\t3\t2-3 min\t6.5\tLow-cost secondary press support.\t`,
    `Sun\tRun\tEasy conversational pace\t1\t${run[w - 1]} km\tN/A\t5\tSecondary marathon exposure.\t`,
  ]);
}

test('AH-01 deterministic convergence holds secondary pressing at Week 1 dose', () => {
  const original = advancedFourFamilyProgram();
  assert.throws(
    () => validateAdvancedHybridCoachingSpecV1(original, advancedIntake),
    (err) => err?.code === 'COACH_SPEC_V1_AH_RECOVERY_HIERARCHY_OVERLOADED',
  );

  const normalized = normalizeAdvancedHybridOHPComplement(original, advancedIntake);
  assert.equal(normalized.repaired, true);
  assert.match(normalized.program, /START_WEEK2_TSV[\s\S]*?Overhead Press\t75 kg\t4\t4\t2-3 min\t7\.5/i);
  assert.match(normalized.program, /START_WEEK3_TSV[\s\S]*?Overhead Press\t75 kg\t4\t4\t2-3 min\t7\.5/i);
  assert.equal(validateAdvancedHybridCoachingSpecV1(normalized.program, advancedIntake).ok, true);
});

const youthIntake = {
  age: 13,
  days_per_week: 2,
  primary_goals: ['First Bar Muscle-up', 'Freestanding Handstand'],
  secondary_goals: ['General push/pull strength'],
  current_numbers: '12 strict pull-ups | 6 ring dips | ring muscle-up achieved | wall handstand 20 sec',
};

function safeYouthProgram(reps = '3') {
  return fourWeeks(() => [
    `Session A\tControlled Handstand Kick-up\tBW\t3\t${reps}\t60 sec\t6\tDo not train to failure. Stop if form deteriorates.\t`,
    'Session A\tBar Muscle-up Transition Drill\tLight band\t4\t1\t75 sec\t6\tNo grinding; keep every rep technical.\t',
  ], 'Stop if form deteriorates; attempt counts are ceilings, not quotas.');
}

test('YG-07 does not false-positive explicit anti-failure coaching language', () => {
  assert.equal(validateYouthCoachingSpecV1HardRules(safeYouthProgram(), youthIntake).ok, true);
});

test('YG-07 still rejects an actual AMRAP prescription', () => {
  assert.throws(
    () => validateYouthCoachingSpecV1HardRules(safeYouthProgram('AMRAP'), youthIntake),
    (err) => err?.code === 'COACH_SPEC_V1_YG_FAILURE_BASED_DEFAULT',
  );
});
