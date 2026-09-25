// A goal stated as consecutive reps has to be trained as consecutive reps.
//
// The athlete's primary goal is five clean ring muscle-ups and he holds two.
// Run #138 programmed 5x1, 6x1, 3x2, 4x1: the weekly rep total is right and
// almost none of it is in the form the goal names. The coach charged 0.30 for it
// twice, and called it the largest remaining programming issue.
//
// One weekly exposure now trains set length and the other stays quality volume.
// Nothing is added: each day's total reps are preserved and redistributed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  consecutiveRepGoals, collectConsecutiveRepGoalFlags, repairConsecutiveRepGoal,
  ladderOf, topSetOf,
} from '../engine/consecutive_rep_goal.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics.txt'), 'utf8');
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const week = (program, n) => program.match(new RegExp(`START_WEEK${n}_TSV([\\s\\S]*?)END_WEEK${n}_TSV`))[1];
const muscleUps = (program, n, day) => week(program, n).split('\n')
  .map((l) => l.split('\t'))
  .filter((c) => c.length === 9 && c[1].trim().toLowerCase() === 'muscle-up' && (!day || c[0].trim() === day))
  .map((c) => ({ day: c[0].trim(), sets: Number(c[3]), reps: Number(c[4]), rest: c[5], rpe: c[6] }));
const total = (rows) => rows.reduce((n, r) => n + r.sets * r.reps, 0);

test('the goal and the capacity are read from the athlete’s own words', () => {
  assert.deepEqual(consecutiveRepGoals(PROGRAM, INTAKE), [{ name: 'Muscle-up', target: 5, current: 2 }]);
});

test('the delivered block is flagged for training the goal only in singles', () => {
  const flags = collectConsecutiveRepGoalFlags(PROGRAM, INTAKE);
  assert.ok(flags.length >= 3, 'weeks 1, 2 and 4 are all singles');
  for (const f of flags) assert.equal(f.longest_set, 1);
});

test('one session trains set length and the day total is preserved', () => {
  const { program, changed } = repairConsecutiveRepGoal(PROGRAM, INTAKE);
  assert.equal(changed, true);
  for (const n of [1, 2, 3, 4]) {
    assert.equal(total(muscleUps(program, n, 'Mon')), total(muscleUps(PROGRAM, n, 'Mon')),
      `week ${n} must redistribute the reps it already had, not add any`);
    assert.ok(Math.max(...muscleUps(program, n, 'Mon').map((r) => r.reps)) >= 2,
      `week ${n} must carry at least one set above singles`);
  }
});

test('the hardest week reaches one rep beyond current capacity', () => {
  const { program } = repairConsecutiveRepGoal(PROGRAM, INTAKE);
  assert.equal(Math.max(...muscleUps(program, 3, 'Mon').map((r) => r.reps)), 3);
});

test('consolidation still holds a set above singles', () => {
  const { program } = repairConsecutiveRepGoal(PROGRAM, INTAKE);
  assert.equal(Math.max(...muscleUps(program, 4, 'Mon').map((r) => r.reps)), 2);
});

test('the second weekly exposure is left as quality volume', () => {
  const { program } = repairConsecutiveRepGoal(PROGRAM, INTAKE);
  assert.deepEqual(muscleUps(program, 1, 'Fri'), muscleUps(PROGRAM, 1, 'Fri'));
});

test('every rebuilt row carries a rest and an RPE', () => {
  // newRow finds the RPE column itself; reading a parsed.rpe that does not exist
  // wrote an empty Target RPE onto every rebuilt row, silently.
  const { program } = repairConsecutiveRepGoal(PROGRAM, INTAKE);
  for (const n of [1, 2, 3, 4]) {
    for (const r of muscleUps(program, n)) {
      assert.ok(String(r.rest).trim(), `week ${n} row with no rest`);
      assert.ok(String(r.rpe).trim(), `week ${n} row with no RPE`);
    }
  }
});

test('PRIMARY_SKILL_CONSECUTIVE_REP_GOAL_UNTRAINED is raised and the repair clears it', () => {
  // A gate has to have an answer. This one blocks a release, so the repair that
  // answers it is the reason it is allowed to.
  const before = collectConsecutiveRepGoalFlags(PROGRAM, INTAKE);
  assert.ok(before.length, 'the delivered block must raise it');
  for (const f of before) {
    assert.equal(f.code, 'PRIMARY_SKILL_CONSECUTIVE_REP_GOAL_UNTRAINED');
    assert.equal(f.severity, 'hard');
  }
  const { program } = repairConsecutiveRepGoal(PROGRAM, INTAKE);
  assert.deepEqual(collectConsecutiveRepGoalFlags(program, INTAKE), []);
});

test('a day too short to hold one set at capacity is not flagged', () => {
  // Flagging what the repair cannot answer is a gate outliving its own repair --
  // the shape that killed thirteen paid builds. One single rep in the day cannot
  // be redistributed into a set of two.
  const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const tiny = [1, 2, 3, 4].map((n) => [
    `START_WEEK${n}_TSV`, HEAD,
    'Mon\tMuscle-up\tBodyweight\t1\t1\t3 min\t7\tOne crisp attempt.\t',
    'Mon\tDip\tRPE-selected load\t3\t5\t3 min\t7\tPressing.\t',
    `END_WEEK${n}_TSV`,
  ].join('\n')).join('\n\n');

  assert.deepEqual(collectConsecutiveRepGoalFlags(tiny, INTAKE), []);
  assert.equal(repairConsecutiveRepGoal(tiny, INTAKE).changed, false);
});

test('a back-off rung is described as the rung it is on', () => {
  // In the hardest week the second rung is a double behind a triple. Calling
  // that "the same length" is wrong in the athlete's hands, and the coach caught
  // it on the first build that carried the ladder.
  const { program } = repairConsecutiveRepGoal(PROGRAM, INTAKE);
  const w3 = program.match(/START_WEEK3_TSV([\s\S]*?)END_WEEK3_TSV/)[1]
    .split('\n').map((l) => l.split('\t'))
    .filter((c) => c.length === 9 && c[1] === 'Muscle-up' && c[0] === 'Mon');
  const top = Number(w3[0][4]);
  for (const c of w3.slice(1)) {
    const reps = Number(c[4]);
    if (reps === top) continue;
    assert.equal(/at the same length/i.test(c[7]), false,
      `a set of ${reps} behind a top set of ${top} is not the same length`);
  }
  const second = w3.find((c) => Number(c[4]) === 2);
  assert.match(second[7], /back-off set of 2 behind the top set of 3/i);
});

test('it is idempotent', () => {
  const once = repairConsecutiveRepGoal(PROGRAM, INTAKE).program;
  assert.equal(repairConsecutiveRepGoal(once, INTAKE).changed, false);
});

test('a goal the athlete cannot yet hold for two reps is left alone', () => {
  // Below two, "set length" is singles under another name and the job is to own
  // the movement at all.
  // Capacity is read from every place the athlete states it and the best number
  // wins, so a fixture that lowers only one of them still reads two.
  const lower = (t) => String(t).replace(/(muscle-up:\s*)2(\s*(?:clean\s*)?reps?)/i, '$11$2');
  const novice = {
    ...INTAKE,
    current_numbers: lower(INTAKE.current_numbers),
    performance_markers: INTAKE.performance_markers.map(lower),
  };
  assert.deepEqual(consecutiveRepGoals(PROGRAM, novice), []);
  assert.equal(repairConsecutiveRepGoal(PROGRAM, novice).changed, false);
});

test('a goal with no rep target is left alone', () => {
  const noTarget = { ...INTAKE, primary_goals: ['Strict muscle-up on rings'] };
  assert.deepEqual(consecutiveRepGoals(PROGRAM, noTarget), []);
});

// --- what the live run taught ------------------------------------------------
//
// Run #139 is the first build where the model wrote the ladder itself, and it
// wrote it the way a coach writes one: a single row, four sets, reps
// "2/1/1/1". Number() on that is NaN, so the repair scored Monday's whole
// prescription as zero reps, concluded Friday must be the primary session, and
// built a second ladder there. Both sessions ended up training set length when
// the entire point of the rule is that one does and the other stays quality
// volume.

const RUN139 = fs.readFileSync(path.join(here, 'fixtures/run139_advanced_calisthenics.txt'), 'utf8');

test('a ladder the model wrote is read as a ladder', () => {
  assert.deepEqual(ladderOf('2/1/1/1'), [2, 1, 1, 1]);
  assert.deepEqual(ladderOf('2-1-1-1'), [2, 1, 1, 1]);
  assert.deepEqual(ladderOf('3 (1+1+1)'), [1, 1, 1]);
  assert.equal(topSetOf('2/1/1/1'), 2);
});

test('a rep range is not a ladder', () => {
  // "8-10" is eight to ten reps. Reading it as a ladder of eight then ten would
  // let a range satisfy a rule about how long a single set is.
  assert.equal(ladderOf('8-10'), null);
  assert.equal(ladderOf('4-5s'), null);
  assert.equal(topSetOf('8-10'), 8, 'the guaranteed set length is the bottom of the range');
});

test('a week that already carries the ladder is left alone', () => {
  assert.deepEqual(collectConsecutiveRepGoalFlags(RUN139, INTAKE), []);
  assert.equal(repairConsecutiveRepGoal(RUN139, INTAKE).changed, false,
    'a second ladder on the other session is volume nobody asked for');
});

test('only one session is given the ladder', () => {
  const { program } = repairConsecutiveRepGoal(PROGRAM, INTAKE);
  for (const n of [1, 2, 3, 4]) {
    const days = new Set(muscleUps(program, n)
      .filter((r) => r.reps >= 2)
      .map((r) => r.day));
    assert.ok(days.size <= 1, `week ${n} trains set length on ${days.size} days`);
  }
});
