import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateTactical3KCoachingSpecV1,
  collectYouthCoachingSpecV1ReviewSignals,
} from '../engine/coaching_spec_v1_quality.js';
import {
  normalizeAdvancedHybridSecondaryRunStability,
  normalizeYouthSkillAcquisitionQuality,
  normalizeTactical3KRaceSpecificity,
} from '../engine/coaching_spec_v1_convergence_normalizer.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function block(week, rows) {
  return `START_WEEK${week}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${week}_TSV`;
}
function fourWeeks(factory, intro = '') {
  return `${intro ? `${intro}\n\n` : ''}${[1,2,3,4].map((week) => block(week, factory(week))).join('\n\n')}`;
}

const tacticalLiveIntake = {
  age: 27,
  experience: 'advanced',
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'Improve strict pull-ups from 14 toward 18-20'],
  maintenance_goals: ['Maintain useful squat and deadlift strength while staying athletic and relatively weight-stable'],
  current_numbers: '3 km: 13:30 | 10 km ruck with 20 kg: 95 min | Back Squat: 140 kg x 5 | Deadlift: 180 kg x 3 | Strict Pull-ups: 14 reps',
  performance_markers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min'],
  injuries: 'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
  notes: 'Wants combat-ready / special-operations-style fitness without random punishment circuits or unnecessary mass gain.',
};

function tactical400Only() {
  return fourWeeks((week) => [
    `Mon\tBack Squat\t${[120,122.5,125,120][week-1]} kg\t3\t5\t3 min\t7.5\tMaintenance squat.\t`,
    `Tue\tRun\t400 m @ ${['1:42-1:45','1:42-1:45','1:40-1:43','1:38-1:40'][week-1]}\t${[6,7,7,5][week-1]}\t400 m\t2:00\t8\tPrimary 3K quality.\t`,
    `Thu\tBackpack Carry\t20 kg, 9:30/km\t1\t${[8,8.5,9,8][week-1]} km\tN/A\t6\tControlled ruck.\t`,
  ], 'If shin symptoms return, hold the newest run or ruck progression, reduce impact, and repeat the prior tolerated week.');
}

test('live Tactical special-operations-style context no longer bypasses T3K-02', () => {
  assert.throws(
    () => validateTactical3KCoachingSpecV1(tactical400Only(), tacticalLiveIntake),
    (err) => err?.code === 'COACH_SPEC_V1_T3K_400_ONLY_BLOCK',
  );
});

test('Tactical convergence creates 400 -> 600 -> 800 race-specific development and protects the next-day key run', () => {
  const repaired = normalizeTactical3KRaceSpecificity(tactical400Only(), tacticalLiveIntake);
  assert.equal(repaired.repaired, true);
  assert.match(repaired.program, /START_WEEK2_TSV[\s\S]*Tue\tRun\t600 m @ 2:39-2:42\t4\t600 m/);
  assert.match(repaired.program, /START_WEEK3_TSV[\s\S]*Tue\tRun\t800 m @ 3:27-3:34\t4\t800 m/);
  assert.match(repaired.program, /Mon\tBack Squat\t122\.5 kg\t2\t5\t3 min\t7\t/);
  assert.equal(validateTactical3KCoachingSpecV1(repaired.program, tacticalLiveIntake).ok, true);
});

const youthLiveIntake = {
  age: 13,
  days_per_week: 2,
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  current_numbers: 'Pistol squat established; ring muscle-up achieved; about 12 strict pull-ups and 6 good ring dips. Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
  notes: 'Skill quality before fatigue; no grinders or repeated failed attempts.',
};

function youthProgram() {
  return fourWeeks((week) => {
    const attempts = [[4,3],[4,4],[5,4],[4,4]][week-1];
    const explosiveSets = [5,5,6,4][week-1];
    return [
      `Session A\tControlled Handstand Kick-up\tBodyweight\t${attempts[0]}\t${attempts[1]}\t60-75 sec\tN/A\tStop early if entry quality drops.\t`,
      `Session A\tBar Muscle-up Transition Drill\t${week >= 3 ? 'Light' : 'Medium'} band\t5\t1\t75-90 sec\t6\tClean transition singles; no misses.\t`,
      `Session A\tExplosive Hip-to-Bar Pull-up\tBodyweight\t${explosiveSets}\t2\t90-120 sec\t6\tPull fast and high; stop if height drops.\t`,
      'Session A\tWall Handstand Hold\tBodyweight\t3\t20 sec\t60-90 sec\t5\tLine capacity.\t',
    ];
  }, 'Skill attempt counts are ceilings. Stop after repeated deterioration in entry, balance or turnover quality.');
}

test('Youth convergence caps attempts, keeps power volume at the baseline, and integrates assisted full bar muscle-up singles', () => {
  const repaired = normalizeYouthSkillAcquisitionQuality(youthProgram(), youthLiveIntake);
  assert.equal(repaired.repaired, true);
  assert.match(repaired.program, /START_WEEK3_TSV[\s\S]*Controlled Handstand Kick-up\tBodyweight\t4\t3\t/);
  assert.match(repaired.program, /START_WEEK3_TSV[\s\S]*Explosive Hip-to-Bar Pull-up\tBodyweight\t5\t2\t/);
  assert.match(repaired.program, /Banded Muscle-up\tBand assistance selected for a smooth full bar turnover\t2\t1\t90 sec\t6\tIntegrated assisted full-skill/);
  const reviewCodes = new Set(collectYouthCoachingSpecV1ReviewSignals(repaired.program, youthLiveIntake).map((x) => x.code));
  assert.equal(reviewCodes.has('YG-02_ATTEMPT_VOLUME_REVIEW'), false);
  assert.equal(reviewCodes.has('YG-05_FULL_SKILL_INTEGRATION_REVIEW'), false);
});

const advancedLiveIntake = {
  age: 30,
  days_per_week: 4,
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport_sessions_per_week: 5,
  sport: 'MMA',
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  current_numbers: 'Back Squat: 205 kg 1RM | One-Arm Pull-up: 2 strict reps each arm | Running: 1 session a week, about 20 km total',
};

test('Advanced Hybrid convergence holds secondary long-run distance at the tolerated Week 1 dose', () => {
  const program = fourWeeks((week) => [
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tPrimary squat.\t',
    `Tue\tRun\tConversational easy pace\t1\t${[20,21,22,20][week-1]} km\tN/A\t5-6\tSecondary marathon run.\t`,
  ]);
  const repaired = normalizeAdvancedHybridSecondaryRunStability(program, advancedLiveIntake);
  assert.equal(repaired.repaired, true);
  assert.doesNotMatch(repaired.program, /\t21 km\t|\t22 km\t/);
  assert.equal((repaired.program.match(/\t20 km\t/g) || []).length, 4);
});
