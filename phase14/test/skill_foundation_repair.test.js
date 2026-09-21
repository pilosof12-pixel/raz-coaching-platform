// A skill day with nothing underneath it was the one gate with no answer.
//
// Run #129's calisthenics build spent four model calls on
// V38_SKILL_WITHOUT_FOUNDATION and shipped with eight of them. Week 1 Tuesday
// reads handstand kick-up, freestanding handstand push-up negative, wall
// handstand push-up, pistol squat: an entire upper-body day of skill practice
// with no foundational pulling or pushing at all.
//
// The brief already says not to, in as many words. The model read it and
// produced the defect anyway, four times, and regenerating never fixed it.
//
// Nothing is invented: the movement added is one the athlete already performs
// elsewhere in the block, at the dose it carries there.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairSkillFoundation } from '../engine/skill_foundation_repair.js';
import { auditProgramStructure } from '../engine/v38_structural_audit.js';

const INTAKE = {
  age: 28, language: 'en', experience: 'Advanced (3+ years)', bodyweight: '72 kg',
  primary_goals: ['Strict muscle-up on rings for 5 clean reps', 'Weighted pull-up with 40 kg for 3'],
  secondary_goals: ['Hold a 10 second straddle planche'],
  maintenance_goals: ['Keep my front lever, currently advanced tuck'],
  goal_priority_model: 'tiered_equal_primary', days_per_week: 4, session_duration_minutes: 90,
  gym_availability_mode: 'flexible', available_gym_days: [], training_location: 'calisthenics_park',
  equipment: 'Pull-up bars, dip bars, rings, parallettes, a weight belt that takes plates up to 50 kg, bands.',
  sport: '', sport_schedule: [],
  current_numbers: 'Weighted pull-up: 32 kg x 3\nRing dip: 12 reps\nTuck planche: 15 s',
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const wk = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

// Monday carries the foundation the athlete owns; Tuesday is skill with nothing.
// Full enough sessions that the only defect is the one under test. The first
// version of this fixture was four rows and tripped V38_INCOMPLETE_SESSION and
// V38_MISSING_MOVEMENT_CATEGORY as well, so the guard was judging a program
// broken in three ways and refused every candidate -- the repair was correct and
// the fixture was not.
const ROWS = [
  'Mon\tWeighted Pull-up\t20 kg\t4\t5\t2:00\t8\tStrength.\t',
  'Mon\tRing Push-up\tBodyweight\t3\t10\t1:30\t7\tPressing.\t',
  'Mon\tBulgarian Split Squat\tBodyweight\t3\t8\t1:30\t7\tLower.\t',
  'Mon\tHollow Body Hold\tBodyweight\t3\t30s\t1:00\t6\tTrunk.\t',
  'Tue\tControlled Handstand Kick-up\tBodyweight\t3\t2 attempts\t1:00\t6\tSkill.\t',
  'Tue\tBack-to-Wall Handstand Push-Up\tBodyweight\t2\t3\t2:00\t7\tSkill.\t',
  'Tue\tBulgarian Split Squat\tBodyweight\t3\t8\t1:30\t7\tLower.\t',
  'Tue\tHollow Body Hold\tBodyweight\t3\t30s\t1:00\t6\tTrunk.\t',
  // A lighter pull the athlete also owns. Without one the only donor is
  // Monday's Weighted Pull-up, putting heavy pulling on back-to-back days and
  // raising V38_CONSECUTIVE_CONFLICTING_EXPOSURE -- so the repair declines, and
  // correctly. Having both is what the multi-donor search is for.
  'Thu\tInverted Row\tBodyweight\t3\t12\t1:30\t7\tSupport pulling.\t',
  'Thu\tRing Push-up\tBodyweight\t3\t10\t1:30\t7\tPressing.\t',
  'Thu\tBulgarian Split Squat\tBodyweight\t3\t8\t1:30\t7\tLower.\t',
  'Thu\tHollow Body Hold\tBodyweight\t3\t30s\t1:00\t6\tTrunk.\t',
];
const PROGRAM = [wk(1, ROWS), wk(2, ROWS), wk(3, ROWS), wk(4, ROWS)].join('\n\n');

const count = (p) => auditProgramStructure(p, INTAKE).filter((f) => f.code === 'V38_SKILL_WITHOUT_FOUNDATION').length;
const rowsOf = (p) => p.split('\n').filter((l) => /\t/.test(l) && !/^Day\t/.test(l));

test('the fixture starts with skill days that have no foundation', () => {
  assert.ok(count(PROGRAM) > 0, 'fixture no longer exhibits the defect');
});

test('the missing layer is added and the gate clears', () => {
  const { program, changed } = repairSkillFoundation(PROGRAM, INTAKE);
  assert.ok(changed, 'repair did not fire');
  assert.ok(count(program) < count(PROGRAM), 'the gate did not move');
});

test('it only adds movements the athlete already performs', () => {
  const owned = new Set(rowsOf(PROGRAM).map((l) => l.split('\t')[1]));
  const { program } = repairSkillFoundation(PROGRAM, INTAKE);
  for (const line of rowsOf(program)) {
    assert.ok(owned.has(line.split('\t')[1]), `invented a movement: ${line.split('\t')[1]}`);
  }
});

test('every added row names a movement', () => {
  // newRow takes `name`, not `exercise`. Passing the column name produced rows
  // with an empty Exercise cell: added, belonging to no movement, and answering
  // nothing. The gate never moved and the bug looked like a guard refusal.
  const { program } = repairSkillFoundation(PROGRAM, INTAKE);
  for (const line of rowsOf(program)) {
    assert.ok(String(line.split('\t')[1] || '').trim(), `row with no exercise: ${JSON.stringify(line)}`);
  }
});

test('it is idempotent', () => {
  const once = repairSkillFoundation(PROGRAM, INTAKE).program;
  assert.equal(repairSkillFoundation(once, INTAKE).changed, false);
});

test('a program with no foundation anywhere is left alone', () => {
  // Writing the layer from nothing would be composing training rather than
  // repairing it.
  const skillOnly = [1, 2, 3, 4].map((n) => wk(n, [
    'Tue\tControlled Handstand Kick-up\tBodyweight\t3\t2 attempts\t1:00\t6\tSkill.\t',
  ])).join('\n\n');
  assert.equal(repairSkillFoundation(skillOnly, INTAKE).changed, false);
});
