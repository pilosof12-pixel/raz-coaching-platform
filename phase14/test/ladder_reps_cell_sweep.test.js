// A reps cell used to hold one number.
//
// The model now writes ladders -- "2/1/1/1" is a double then three singles --
// and every reader that took the first number out of the cell read that as four
// sets of two. Two defects shipped before anyone looked for the rest of them:
// the note reconciler rewrote "keep the back-off singles" to "keep the back-off
// triples", and the repair that builds a ladder could not see the one the model
// had already written, so it built a second one on the other day.
//
// The sweep found nine more readers. These are the ones whose arithmetic a
// ladder actually changes: session minutes, skill attempts, week-over-week
// volume, power/skill volume, one-arm pull spacing, and the fight-week primer
// cap. Reading a ladder as sets x top rung doubles them.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ladderOf, topSetOf, repCount, repsInRow } from '../engine/tsv_rows.js';
import { sessionDurations } from '../engine/v34_workload_accounting.js';
import { collectPrescriptionConsistencyFlags } from '../engine/v34_prescription_consistency.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (sets, reps, note) => [1, 2, 3, 4].map((n) => [
  `START_WEEK${n}_TSV`, HEAD,
  `Mon\tMuscle-up\tBodyweight\t${sets}\t${reps}\t3 min\t8\t${note || 'Strict rings.'}\t`,
  'Mon\tWeighted Pull-up\t31 kg\t3\t3\t4 min\t8\tPrimary.\t',
  'Mon\tDip\tRPE-selected load\t2\t5\t3 min\t7.5\tPressing.\t',
  `END_WEEK${n}_TSV`,
].join('\n')).join('\n\n');

test('one place knows how to read a reps cell', () => {
  assert.deepEqual(ladderOf('2/1/1/1'), [2, 1, 1, 1]);
  assert.deepEqual(ladderOf('2-1-1-1'), [2, 1, 1, 1]);
  assert.equal(ladderOf('8-10'), null, 'a two-part hyphen is a rep range');
  assert.equal(ladderOf('5'), null);
  assert.equal(topSetOf('3/1/1/1'), 3);
  assert.equal(topSetOf('8-10'), 8, 'the guaranteed set length is the bottom of a range');
  assert.equal(repCount('3/1/1/1'), null, 'a ladder has no single rep count');
  assert.equal(repCount('5'), 5);
  assert.equal(repCount('30 min'), null);
  assert.equal(repsInRow('4', '3/1/1/1'), 6, 'the sum of the rungs, not 4 x 3');
  assert.equal(repsInRow('3', '5'), 15);
});

test('a ladder costs the session the time its reps actually take', () => {
  // 4 x 3/1/1/1 is six reps. Read as sets x top rung it was twelve, and the
  // session-time trim took sets off the day to pay for reps nobody does.
  const ladderMin = sessionDurations(block('4', '3/1/1/1'), 1)[0].minutes;
  const inflatedMin = sessionDurations(block('4', '3'), 1)[0].minutes;
  assert.ok(ladderMin < inflatedMin,
    `a ladder of six reps must cost less than four sets of three (${ladderMin} vs ${inflatedMin})`);
});

test('the detector and the repair agree about a ladder note', () => {
  // This is the shape that kills a build: the repair leaves the note alone and
  // the detector goes on flagging it, so the model is asked forever to fix a
  // sentence that is already correct. Fixing only one of the three copies of
  // repCount created exactly that.
  const note = 'Hardest set-length week; only take the triple if rep 2 is still clean; '
    + 'otherwise stay at a double and keep the back-off singles.';
  const program = block('4', '3/1/1/1', note);

  assert.deepEqual(
    collectPrescriptionConsistencyFlags(program, INTAKE).filter((f) => /REP_WORD/.test(f.code)), [],
    'a note describing several set lengths is not a mismatch',
  );

  const repaired = repairDeterministicContradictions(program, INTAKE).program;
  const after = repaired.split('\n').map((l) => l.split('\t'))
    .find((c) => c.length === 9 && c[1] === 'Muscle-up')[7];
  assert.equal(after, note, 'the repair must leave it alone');
  assert.deepEqual(
    collectPrescriptionConsistencyFlags(repaired, INTAKE).filter((f) => /REP_WORD/.test(f.code)), [],
    'and the detector must still be satisfied afterwards',
  );
});
