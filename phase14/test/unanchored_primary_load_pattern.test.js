// A goal family matches on words, so it catches movements the goal cannot mean.
//
// "Weighted pull-up with 40 kg for 3" builds the family /pull[- ]?up|chin[- ]?
// up/, which also matches "Australian Pull-up" -- a bodyweight row that cannot
// serve a weighted vertical pulling goal and cannot sensibly be prescribed in
// kilos either. The rule charged the calisthenics athlete for it on every run.
//
// The test that matters here is the one that proves the rule still bites. A
// filter that removes a false positive by removing the finding is worthless, so
// the two true shapes are pinned alongside the false one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeProgram } from '../engine/coach_rules.js';

const INTAKE = {
  primary_goals: ['Weighted pull-up with 40 kg for 3'],
  days_per_week: 3, gym_availability_mode: 'flexible', available_gym_days: [],
  sport_schedule: [], pain: { active: false }, mobility: { active: false, limitation: '' },
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const build = (rows) => [1, 2, 3, 4]
  .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`)
  .join('\n\n');
const flagged = (program) => gradeProgram(program, INTAKE)
  .filter((f) => f.rule === 'PRIMARY_LOAD_UNANCHORED')
  .map((f) => f.movement);

test('the goal movement carrying no number anywhere still fires', () => {
  const program = build([
    'Mon\tWeighted Pull-up\tRPE-selected\t4\t5\t2:00\t8\tPull.\t',
    'Mon\tDip\tBW\t3\t8\t2:00\t7\tPress.\t',
  ]);
  assert.deepEqual(flagged(program), ['Weighted Pull-up']);
});

test('a same-pattern variant carrying no number still fires', () => {
  // A chin-up is the same vertical pull. The athlete chasing 40 kg needs to
  // know what this one is loaded to, and nothing here tells them.
  const program = build([
    'Mon\tWeighted Pull-up\t28 kg\t4\t5\t2:00\t8\tPull.\t',
    'Mon\tChin-up\tBW\t3\t8\t2:00\t7\tPull.\t',
  ]);
  assert.deepEqual(flagged(program), ['Chin-up']);
});

test('a different-pattern row is not the goal movement', () => {
  const program = build([
    'Mon\tWeighted Pull-up\t28 kg\t4\t5\t2:00\t8\tPull.\t',
    'Mon\tAustralian Pull-up\tBW\t3\t12\t1:30\t7\tRow.\t',
  ]);
  assert.deepEqual(flagged(program), []);
});

test('with nothing in the family anchored there is no second opinion, so it fires', () => {
  // The filter asks which patterns already carry the number. When none do, the
  // question cannot be answered and the finding must stand -- otherwise a block
  // that anchors nothing at all would be the one that escapes.
  const program = build([
    'Mon\tAustralian Pull-up\tBW\t3\t12\t1:30\t7\tRow.\t',
    'Mon\tDip\tBW\t3\t8\t2:00\t7\tPress.\t',
  ]);
  assert.deepEqual(flagged(program), ['Australian Pull-up']);
});
