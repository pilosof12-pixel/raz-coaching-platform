// Run #163's hybrid spent a regeneration on V34_NOTE_REP_WORD_MISMATCH:
// "Side Plank (Week 4) prescribes 30 rep(s) per set but its note describes
// Single". The row was a 30-second hold written "30s each side". repCount knew
// "30 sec" was a duration and read "30s" as thirty reps.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repCount } from '../engine/tsv_rows.js';
import { collectRepWordFlags } from '../engine/v34_prescription_consistency.js';

test('an abbreviated duration or distance is not a rep count', () => {
  for (const cell of ['30s', '30s each side', '20 s/side', '45-60s', '500 m']) assert.equal(repCount(cell), null, cell);
  assert.equal(repCount('8'), 8);
  assert.equal(repCount('6/side'), 6);
  assert.equal(repCount('5 reps'), 5);
});

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const program = (reps, note) => [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${header}\nMon\tSide Plank\tBodyweight\t1\t${reps}\t45s\t6\t${note}\t\nEND_WEEK${w}_TSV`).join('\n\n');

test('a single set of a timed hold is not a rep-word mismatch', () => {
  assert.equal(collectRepWordFlags(program('30s each side', 'Single set only this week; tight line.')).length, 0);
});

test('a real rep-word mismatch is still caught', () => {
  const flags = collectRepWordFlags(program('3', 'Crisp singles only.')).filter((f) => f.code === 'V34_NOTE_REP_WORD_MISMATCH');
  assert.ok(flags.length > 0);
});
