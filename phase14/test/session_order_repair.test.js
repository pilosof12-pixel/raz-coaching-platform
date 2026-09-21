// The clash that had no repair was never about content.
//
// Run #130's calisthenics build failed V38_CONSECUTIVE_CONFLICTING_EXPOSURE on
// all four weeks, spent four model calls and 649s on it, and shipped the
// defects anyway. Monday is the weighted pull session and Tuesday is the
// handstand and planche session; both are correct, and they are simply next to
// each other. Swapping the Tuesday and Wednesday sessions clears every week
// with nothing added, removed or de-loaded.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairSessionAdjacency } from '../engine/session_order_repair.js';
import { auditCircularScheduling } from '../engine/v38_structural_audit.js';

const INTAKE = {
  age: 28, language: 'en', experience: 'Advanced (3+ years)', bodyweight: '72 kg',
  primary_goals: ['Weighted pull-up with 40 kg for 3', 'Strict muscle-up on rings for 5 clean reps'],
  secondary_goals: ['Hold a 10 second straddle planche'],
  goal_priority_model: 'tiered_equal_primary', days_per_week: 5, session_duration_minutes: 90,
  gym_availability_mode: 'flexible', available_gym_days: [], training_location: 'calisthenics_park',
  equipment: 'Pull-up bars, dip bars, rings, parallettes, a weight belt, bands.',
  sport: '', sport_schedule: [],
  current_numbers: 'Weighted pull-up: 32 kg x 3\nTuck planche: 15 s',
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

// Monday and Tuesday are run #130's week 1 as delivered, including the RPE
// column: the audit weights a row at 1.0 only when it is heavy (RPE >= 7.5 over
// 2+ sets) and 0.5 otherwise, so Monday totals 3.5 and Tuesday 4.0 and the pair
// clashes. Wednesday is the leg day the swap moves into the gap.
const ROWS = [
  'Mon\t[WARMUP] Band Pull-Apart Warm-up\tLight band\t2\t15\t0:45\tN/A\tWarm-up.\t',
  'Mon\tRing Muscle-up\tBW\t6\t2\t2:30\t7-8\tPrimary skill.\t',
  'Mon\tWeighted Pull-up\t28 kg added\t4\t4\t2:30\t7.5\tPrimary. Leave a rep.\t',
  'Mon\tDip\tRPE-selected load\t3\t8\t2:00\t7.5\tPressing volume.\t',
  'Mon\tBulgarian Split Squat\tBW\t3\t8\t1:30\t7\tLower.\t',
  'Mon\tSide Plank\tBW\t2\t30s\t1:00\t6\tTrunk.\t',
  'Tue\t[WARMUP] Band Pull-Apart Warm-up\tLight band\t2\t15\t0:45\tN/A\tWarm-up.\t',
  'Tue\tFreestanding Handstand Hold\tBW\t5\t20s\t1:30\t6\tSkill.\t',
  'Tue\tFreestanding Handstand Push-up Negative\tBW\t3\t3\t2:00\t7\tSkill.\t',
  'Tue\tElevated Pike Push-up\tBW\t4\t8\t2:00\t7.5\tPressing.\t',
  'Tue\tAdvanced Tuck Planche\tBW\t4\t12s\t1:30\t8\tSkill.\t',
  'Tue\tInverted Row\tBW\t3\t12\t1:30\t8\tSupport pulling.\t',
  'Tue\tPistol Squat\tBW\t3\t5\t1:30\t7\tLower.\t',
  'Wed\tBroad Jump\tBW\t4\t3\t2:00\t7\tPower.\t',
  'Wed\tBulgarian Split Squat\tBW\t4\t8\t1:30\t7.5\tLower.\t',
  'Wed\tRing Hamstring Curl\tBW\t3\t10\t1:30\t7\tPosterior.\t',
  'Wed\tRing Push-up\tBW\t3\t12\t1:30\t7\tPressing.\t',
  'Wed\tCalf Raise\tBW\t3\t15\t1:00\t7\tLower.\t',
  'Fri\tRing Muscle-up\tBW\t5\t2\t2:30\t7\tSkill.\t',
  'Fri\tDip\tRPE-selected load\t3\t8\t2:00\t7\tPressing.\t',
  'Fri\tControlled Handstand Kick-up\tBW\t3\t2 attempts\t1:00\t6\tSkill.\t',
  'Fri\tBulgarian Split Squat\tBW\t3\t8\t1:30\t7\tLower.\t',
  'Sat\tWeighted Pull-up\t26 kg added\t4\t5\t2:30\t7.5\tVolume.\t',
  'Sat\tAdvanced Tuck Planche\tBW\t4\t12s\t1:30\t8\tSkill.\t',
  'Sat\tAdvanced Tuck Front Lever\tBW\t3\t10s\t1:30\t7\tMaintenance.\t',
  'Sat\tDip\tRPE-selected load\t3\t8\t2:00\t7\tPressing.\t',
];

const PROGRAM = [1, 2, 3, 4]
  .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${ROWS.join('\n')}\nEND_WEEK${n}_TSV`)
  .join('\n\n');

// Everything about a row except which weekday it is labelled with.
const contentOf = (program) => program
  .split('\n')
  .filter((l) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\t/.test(l))
  .map((l) => l.split('\t').slice(1).join('\t'))
  .sort();

test('reordering sessions clears the adjacency clash', () => {
  assert.equal(auditCircularScheduling(PROGRAM, INTAKE).length, 4, 'fixture must reproduce the run #130 clash');
  const { changed, program } = repairSessionAdjacency(PROGRAM, INTAKE);
  assert.equal(changed, true);
  assert.equal(auditCircularScheduling(program, INTAKE).length, 0);
});

test('no exercise, set, rep or load changes', () => {
  const { program } = repairSessionAdjacency(PROGRAM, INTAKE);
  assert.deepEqual(contentOf(program), contentOf(PROGRAM));
});

test('the primary session stays on the first training day', () => {
  const { program } = repairSessionAdjacency(PROGRAM, INTAKE);
  const monday = program.split('\n').filter((l) => /^Mon\t/.test(l));
  assert.ok(
    monday.some((l) => /Weighted Pull-up/.test(l)),
    'a layout that wins on adjacency by burying the primary goal is not a win',
  );
});

test('it takes the smallest swap that works', () => {
  const { moves } = repairSessionAdjacency(PROGRAM, INTAKE);
  assert.deepEqual(moves[0].from, ['mon', 'tue', 'wed', 'fri', 'sat']);
  assert.deepEqual(moves[0].to, ['mon', 'wed', 'tue', 'fri', 'sat']);
});

test('a week with no clash is left alone', () => {
  const { changed, program } = repairSessionAdjacency(
    repairSessionAdjacency(PROGRAM, INTAKE).program, INTAKE,
  );
  assert.equal(changed, false, 'applying it twice must not keep shuffling the week');
  assert.equal(auditCircularScheduling(program, INTAKE).length, 0);
});

test('it declines when the weeks do not share a day set', () => {
  // One permutation cannot describe a block whose weeks train on different
  // days, and guessing one would move a session onto a rest day.
  const shifted = PROGRAM.replace(
    /(START_WEEK2_TSV[\s\S]*?END_WEEK2_TSV)/,
    (wk) => wk.replace(/^Sat\t/gm, 'Sun\t'),
  );
  const { changed } = repairSessionAdjacency(shifted, INTAKE);
  assert.equal(changed, false);
});
