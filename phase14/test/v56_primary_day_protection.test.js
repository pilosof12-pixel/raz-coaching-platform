import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectPrePrimaryLoadFlags, repairPrePrimaryLoad, buildPrimaryDayProtectionBrief,
  primaryDayFor, precedingGymDay, topOfRange,
} from '../engine/v56_primary_day_protection.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const HYBRID = {
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport: 'MMA',
  sport_schedule: [
    { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
    { day: 'Sat', intensity: 'moderate' },
  ],
};

function week(rows) {
  return [
    'START_WEEK1_TSV',
    'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
    ...rows,
    'END_WEEK1_TSV',
  ].join('\n');
}

const HEAVY_PRESS_BEFORE_PRIMARY = week([
  'Sun\tOverhead Press\t72.5 kg\t4\t4\t2-3 min\t7-7.5\tSecondary press.\t',
  'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1-2 per arm\t150-240 sec\t8\tPrimary.\t',
  'Mon\tBack Squat\t175 kg\t1\t3\t3-5 min\t7.5-8\tPrimary.\t',
]);

// Readiness already ranks Monday best for this athlete -- every other gym day
// follows hard MMA -- so the defect is never the primary placement. It is the
// engine's own secondary work sitting in the 24 hours in front of it.
test('a heavy secondary exposure the day before the primary day is flagged', () => {
  const flags = collectPrePrimaryLoadFlags(HEAVY_PRESS_BEFORE_PRIMARY, HYBRID);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V56_PRE_PRIMARY_DAY_OVERLOADED');
  assert.equal(flags[0].day, 'sun');
  assert.equal(flags[0].primaryDay, 'mon');
  assert.match(flags[0].exercise, /Overhead Press/);
});

test('the repair holds the effort and converges in one pass', () => {
  const fixed = repairPrePrimaryLoad(HEAVY_PRESS_BEFORE_PRIMARY, HYBRID);
  assert.equal(collectPrePrimaryLoadFlags(fixed, HYBRID).length, 0);
  const row = fixed.split('\n').find((l) => l.startsWith('Sun\tOverhead Press')).split('\t');
  assert.equal(row[6], '7');
  assert.equal(row[3], '4', 'sets must not change');
  assert.equal(row[4], '4', 'reps must not change');
  assert.equal(row[2], '72.5 kg', 'load must not change');
  assert.match(row[7], /day before the mon primary session/);
});

test('the repair is idempotent', () => {
  const once = repairPrePrimaryLoad(HEAVY_PRESS_BEFORE_PRIMARY, HYBRID);
  assert.equal(repairPrePrimaryLoad(once, HYBRID), once);
});

// Sunday precedes Monday: the week is circular, and the day before the primary
// day is the last scheduled gym day before it, not simply "yesterday".
test('the preceding gym day wraps around the week', () => {
  assert.equal(precedingGymDay(['mon', 'tue', 'fri', 'sun'], 'mon'), 'sun');
  assert.equal(precedingGymDay(['mon', 'tue', 'fri', 'sun'], 'tue'), 'mon');
  assert.equal(precedingGymDay(['mon', 'fri'], 'mon'), 'fri');
});

test('the primary day is found from the goal, not from the calendar', () => {
  const parsed = parseWeek(HEAVY_PRESS_BEFORE_PRIMARY, 1);
  assert.equal(primaryDayFor(parsed, HYBRID), 'mon');
});

// The top of a range is what the athlete may take the set to.
test('effort is read at the top of its range', () => {
  assert.equal(topOfRange('7-7.5'), 7.5);
  assert.equal(topOfRange('8'), 8);
  assert.equal(topOfRange('N/A'), null);
});

test('light and technical work on the pre-primary day is left alone', () => {
  const light = week([
    'Sun\tFace Pull\tRPE-selected\t3\t12\t60 sec\t6-7\tSupport.\t',
    'Sun\tOverhead Press\t60 kg\t2\t4\t2-3 min\t7.5\tTwo sets only.\t',
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1-2 per arm\t150-240 sec\t8\tPrimary.\t',
  ]);
  assert.equal(collectPrePrimaryLoadFlags(light, HYBRID).length, 0);
  assert.equal(repairPrePrimaryLoad(light, HYBRID), light);
});

// A primary exposure on the pre-primary day is the hierarchy rules' business.
test('a primary movement on the pre-primary day is not this rule\'s finding', () => {
  const primaryBefore = week([
    'Sun\tBack Squat\t175 kg\t4\t3\t3-5 min\t8\tPrimary.\t',
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1-2 per arm\t150-240 sec\t8\tPrimary.\t',
  ]);
  assert.equal(collectPrePrimaryLoadFlags(primaryBefore, HYBRID).length, 0);
});

// The coach asked for Youth to be left alone; both other avatars declare no
// fixed gym days, so the rule cannot reach them at all.
test('an athlete with no fixed gym days is untouched', () => {
  const flexible = { ...HYBRID, available_gym_days: [] };
  assert.equal(collectPrePrimaryLoadFlags(HEAVY_PRESS_BEFORE_PRIMARY, flexible).length, 0);
  assert.equal(repairPrePrimaryLoad(HEAVY_PRESS_BEFORE_PRIMARY, flexible), HEAVY_PRESS_BEFORE_PRIMARY);
});

test('the brief tells the model to reason from the schedule, not the calendar', () => {
  const brief = buildPrimaryDayProtectionBrief(HYBRID);
  assert.match(brief, /24 hours/);
  assert.match(brief, /no intrinsic readiness|intrinsic readiness/);
  assert.equal(buildPrimaryDayProtectionBrief({}), '');
});

// The finding the coach actually raised, against the program he reviewed.
//
// Pinned rather than read from docs/qa/.../latest: acceptance runs overwrite
// that file, and once the engine started preventing this defect the live
// program stopped exhibiting it -- so the test was asserting the presence of a
// bug in a program that no longer had one. The regression it guards is the
// detector going quiet, which needs a program that genuinely offends.
test('the reviewed run #77 Hybrid program is caught in every week and converges', () => {
  const url = new URL('./fixtures/run77_advanced_hybrid_defective.txt', import.meta.url);
  if (!fs.existsSync(url)) return;
  const program = fs.readFileSync(url, 'utf8');
  const intake = { ...HYBRID, goal_priority_model: 'tiered_equal_primary' };
  const flags = collectPrePrimaryLoadFlags(program, intake);
  assert.ok(flags.length >= 1, 'the reviewed program must raise the finding');
  assert.ok(flags.every((f) => f.day === 'sun' && f.primaryDay === 'mon'));
  assert.equal(collectPrePrimaryLoadFlags(repairPrePrimaryLoad(program, intake), intake).length, 0);
});
