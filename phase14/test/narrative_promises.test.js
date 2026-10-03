// Coach on run #165: "Deadlift comes back once these stay clean" with no
// deadlift anywhere in the block -- a promise the program does not keep.

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNarrativePromises } from '../engine/narrative_promises.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const program = (intro, rows) => `${intro}\n\n${[1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n')}`;
const INTRO = 'Deadlift is intentionally not in Week 1, and Deadlift comes back once these stay clean for 24-48 hours after.';

test('a promise the table does not keep becomes a next-block decision on the same condition', () => {
  const out = normalizeNarrativePromises(program(INTRO, ['Mon\tGoblet Squat\t24 kg\t3\t8\t2 min\t6\tx\t']));
  assert.equal(out.repaired, true);
  assert.match(out.program, /Deadlift is considered for the next block once these stay clean/);
  assert.doesNotMatch(out.program, /comes back/);
});

test('a promise the table keeps is left alone', () => {
  const out = normalizeNarrativePromises(program(INTRO, ['Mon\tDeadlift\t60 kg\t3\t5\t2 min\t6\tx\t']));
  assert.equal(out.repaired, false);
});
