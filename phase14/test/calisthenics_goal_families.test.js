// The engine could see two of this athlete's five goals.
//
// GOAL_MOVEMENTS was built from barbell and running goals, so a planche, a
// front lever and a freestanding handstand push-up produced no family at all.
// Every rule that asks "does this serve a stated goal" therefore answered no
// for his pressing and straight-arm work -- which is how pike push-ups and
// handstand push-up negatives, prescribed for a goal he stated in those exact
// words, were charged as accessory duplication serving nothing.
//
// Adding the families makes the engine quieter in one place and louder in
// another, and the second is the point: once the pike push-up is understood to
// serve a stated improvement goal, the fact that it never changes across four
// weeks becomes visible as the defect it is.

import test from 'node:test';
import assert from 'node:assert/strict';

import { statedGoalFamilies, gradeProgram } from '../engine/coach_rules.js';

const INTAKE = {
  age: 28, experience: 'Advanced (3+ years)', bodyweight: '72 kg',
  primary_goals: ['Strict muscle-up on rings for 5 clean reps', 'Weighted pull-up with 40 kg for 3'],
  secondary_goals: ['Hold a 10 second straddle planche', 'Freestanding handstand push-up'],
  maintenance_goals: ['Keep my front lever, currently advanced tuck'],
  days_per_week: 5, gym_availability_mode: 'flexible', available_gym_days: [],
  training_location: 'calisthenics_park', sport: '', sport_schedule: [],
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const seen = (goal) => statedGoalFamilies(INTAKE).some((f) => f.test(goal));

test('every stated goal produces a family the engine can match', () => {
  const goals = [
    ...INTAKE.primary_goals, ...INTAKE.secondary_goals, ...INTAKE.maintenance_goals,
  ];
  const invisible = goals.filter((g) => !seen(g));
  assert.deepEqual(invisible, [], 'a goal the engine cannot see is a goal it cannot serve or check');
});

test('handstand push-up progressions serve the handstand push-up goal', () => {
  for (const name of ['Elevated Pike Push-up', 'Freestanding Handstand Push-up Negative', 'Wall Handstand Push-up']) {
    assert.ok(seen(name), name);
  }
});

test('the balance skill and the pressing skill stay apart', () => {
  // A handstand hold is not handstand push-up work, and a goal for one must not
  // silently claim the other's volume.
  const pressOnly = { ...INTAKE, secondary_goals: ['Freestanding handstand push-up'], maintenance_goals: [] };
  const balanceOnly = { ...INTAKE, secondary_goals: ['Freestanding handstand for 30 seconds'], maintenance_goals: [] };
  const matches = (intake, name) => statedGoalFamilies(intake).some((f) => f.test(name));
  assert.ok(matches(pressOnly, 'Elevated Pike Push-up'));
  assert.ok(!matches(balanceOnly, 'Elevated Pike Push-up'), 'a balance goal does not claim pressing work');
  assert.ok(matches(balanceOnly, 'Freestanding Handstand Hold'));
});

test('a skill that serves a goal and never moves is now a visible defect', () => {
  const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const rows = [
    'Mon\tWeighted Pull-up\t28 kg\t4\t4\t2:30\t8\tPrimary.\t',
    'Mon\tElevated Pike Push-up\tbw\t3\t8\t2:00\t7\tSupport work.\t',
    'Mon\tRing Row\tbw\t3\t10\t1:30\t7\tPulling.\t',
    'Mon\tHollow Body Hold\tbw\t3\t30s\t1:00\t6\tTrunk.\t',
  ];
  const program = [1, 2, 3, 4]
    .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`)
    .join('\n\n');
  const flat = gradeProgram(program, INTAKE)
    .filter((f) => f.rule === 'IMPROVEMENT_GOAL_FLAT')
    .map((f) => f.movement || '');
  assert.ok(
    flat.some((m) => /Pike Push-up/.test(m)),
    'identical in all four weeks while serving a stated improvement goal',
  );
});
