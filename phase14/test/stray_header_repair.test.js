// A repeated header row is a typing accident with one correct answer.
//
// Run #126's first attempt raised five gates at once -- EXERCISE_HALLUCINATION,
// SPORT_DAY_COUPLING_VIOLATION, V38_INCOMPLETE_SESSION,
// V74_NOVEL_EXERCISE_NEAR_EVENT, REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED -- and
// the unknown-name diagnostic named the hallucinated exercise as, literally,
// "Exercise". The model had emitted the header line a second time inside a week
// block. One stray row read as a movement nobody has heard of, a session with a
// broken exercise in it, a day whose coupling could not be resolved and a
// strength session that could not be accounted for.
//
// The dictionary gate is the first thing the validation bundle runs, so the
// build was on its way back to the model before any repair saw it. A whole
// regeneration for a duplicated line.

import test from 'node:test';
import assert from 'node:assert/strict';

import { stripRepeatedHeaderRows } from '../engine/stray_header_repair.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows) => `START_WEEK1_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK1_TSV`;

test('a second header inside a block is dropped', () => {
  const p = block([
    'Mon\tBack Squat\t100 kg\t3\t5\t2:00\t7\tx\t',
    HEADER,
    'Tue\tBench Press\t80 kg\t3\t5\t2:00\t7\tx\t',
  ]);
  const { program, changed, dropped } = stripRepeatedHeaderRows(p);
  assert.ok(changed);
  assert.equal(dropped.length, 1);
  assert.equal((program.match(/^Day\tExercise/gm) || []).length, 1, 'the real header was removed too');
  assert.equal((program.match(/^(Mon|Tue)\t/gm) || []).length, 2, 'a prescription was lost');
});

test('the first header of every block survives', () => {
  const p = [block(['Mon\tBack Squat\t100 kg\t3\t5\t2:00\t7\tx\t']),
    block(['Tue\tBench Press\t80 kg\t3\t5\t2:00\t7\tx\t']).replace(/WEEK1/g, 'WEEK2')].join('\n\n');
  const { program, changed } = stripRepeatedHeaderRows(p);
  assert.equal(changed, false, 'a legitimate per-block header was treated as a duplicate');
  assert.equal(program, p);
});

test('it never touches a real prescription', () => {
  // The rule is the narrowest it can be: the first two cells must be the
  // header's own labels, which no prescription can legitimately carry.
  const p = block([
    'Mon\tDay Squat\t100 kg\t3\t5\t2:00\t7\tNamed oddly on purpose.\t',
    'Tue\tExercise Ball Crunch\tBodyweight\t3\t12\t1:00\t6\tAlso odd.\t',
  ]);
  assert.equal(stripRepeatedHeaderRows(p).changed, false);
});

test('it is idempotent', () => {
  const p = block(['Mon\tBack Squat\t100 kg\t3\t5\t2:00\t7\tx\t', HEADER]);
  const once = stripRepeatedHeaderRows(p).program;
  assert.equal(stripRepeatedHeaderRows(once).changed, false);
});
