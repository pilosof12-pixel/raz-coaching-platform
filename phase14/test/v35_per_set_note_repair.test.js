import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFinalNoteCoherence } from '../engine/final_note_coherence.js';
import { collectAllV34ConsistencyFlags } from '../engine/v34_prescription_consistency.js';

function programWithNote(note, reps = '2') {
  return [
    'START_WEEK1_TSV',
    'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
    `Tue\tRun\tCurrent-pace controlled\t4\t${reps}\t90 sec\t7\t${note}\t`,
    'END_WEEK1_TSV',
  ].join('\n');
}

test('[V35-PS1] numeric attempts-per-set mismatch is repaired from the final Reps field', () => {
  const source = programWithNote('Complete 4 quality attempts per set; stop if mechanics fade.', '2');
  const fixed = normalizeFinalNoteCoherence(source);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /2 quality attempts per set/i);
  assert.doesNotMatch(fixed.program, /4 quality attempts per set/i);
  assert.equal(collectAllV34ConsistencyFlags(fixed.program, {}).some((f) => f.code === 'V34_NOTE_PER_SET_MISMATCH'), false);
});

test('[V35-PS2] spelled-out attempts-per-set mismatch is repaired deterministically', () => {
  const source = programWithNote('Three clean attempts per set, all technically identical.', '1');
  const fixed = normalizeFinalNoteCoherence(source);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /1 clean attempt per set/i);
  assert.equal(collectAllV34ConsistencyFlags(fixed.program, {}).some((f) => f.code === 'V34_NOTE_PER_SET_MISMATCH'), false);
});

test('[V35-PS3] already-consistent per-set language is preserved and the repair is idempotent', () => {
  const source = programWithNote('Take 2 quality reps per set and keep every rep smooth.', '2');
  const once = normalizeFinalNoteCoherence(source);
  assert.equal(once.repaired, false);
  assert.equal(once.program, source);
  const twice = normalizeFinalNoteCoherence(once.program);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, source);
});
