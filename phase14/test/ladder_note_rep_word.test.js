// Run #143, Week 1 Monday, prescribed 4 sets of 2,1,1,1:
//
//   "Top set is clean current capacity, then crisp doubles"
//
// The back-offs are singles. The coach charged it as a semantic mismatch, and it
// is the same class we have been trying to eradicate for weeks.
//
// Two things let it through. collectRepWordFlags returns early on a row whose
// repCount is not finite, and a ladder's repCount is deliberately null, so the
// row was never examined. And when it was examined there was no rule for a
// ladder: unlike a flat row, a ladder has no single dose to compare a word to.
//
// The rule only judges a word that a cue points at, and only when the rungs it
// points at are all the same, so the repair always has exactly one word to
// write. Anything looser would be a gate with no converging repair.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectRepWordFlags, expectedLadderRungs } from '../engine/v34_prescription_consistency.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (reps, note) => [1, 2, 3, 4].map((n) => [
  `START_WEEK${n}_TSV`, HEAD,
  `Mon\tMuscle-up\tBW\t4\t${reps}\t150s\t8\t${note}\t`,
  `END_WEEK${n}_TSV`,
].join('\n')).join('\n\n');
const noteOf = (text) => text.split('\n').map((l) => l.split('\t'))
  .find((c) => c.length === 9 && c[1] === 'Muscle-up')[7];
const words = (program) => collectRepWordFlags(program).map((f) => f.note_claim);

const SHIPPED = 'Strict on rings with false grip. Top set is clean current capacity, then crisp doubles; stop at any missed turnover.';
const CORRECT = 'Strict on rings with false grip. Top set is clean current capacity, then crisp singles; stop at any missed turnover.';

test('the back-off word must match the back-off rungs', () => {
  assert.deepEqual(words(block('2,1,1,1', SHIPPED)),
    ['doubles', 'doubles', 'doubles', 'doubles'],
    'the sentence run #143 shipped must be caught');
  assert.deepEqual(words(block('2,1,1,1', CORRECT)), [],
    'and the corrected sentence must not be');
});

test('the repair writes the word the rungs actually prescribe', () => {
  const repaired = repairDeterministicContradictions(block('2,1,1,1', SHIPPED), INTAKE).program;
  assert.match(noteOf(repaired), /then crisp singles;/);
  assert.deepEqual(words(repaired), [], 'the repair must satisfy the detector that flagged it');

  // A gate whose repair does not converge is a dead build, so prove it settles.
  const again = repairDeterministicContradictions(repaired, INTAKE).program;
  assert.equal(again, repaired, 'the repair must be idempotent');
});

test('a top-set word is judged against the top rung, not the back-offs', () => {
  assert.deepEqual(words(block('2,1,1,1', 'Top set is a clean double, then crisp singles.')), [],
    'the top rung of 2,1,1,1 is a double');
  assert.deepEqual(words(block('2,1,1,1', 'Top set is a clean triple, then crisp singles.')),
    ['triple', 'triple', 'triple', 'triple'],
    'calling the top rung a triple is the same mistake in the other direction');
  const repaired = repairDeterministicContradictions(
    block('2,1,1,1', 'Top set is a clean triple, then crisp singles.'), INTAKE).program;
  assert.match(noteOf(repaired), /Top set is a clean double/, 'and it keeps the singular form');
});

test('a word no cue points at is left alone', () => {
  // "Singles and doubles both appear in this ladder" is a fair description of
  // 2,1,1,1. Judging an uncued word would flag correct prose and the repair
  // would have no single right answer to write.
  assert.deepEqual(words(block('2,1,1,1', 'Ladder of one double and three singles.')), []);
  assert.equal(expectedLadderRungs('Ladder of one double and three singles.', 20, [2, 1, 1, 1]), null,
    'no cue means no judgement');
});

test('back-offs that are not all the same are not judged', () => {
  // 3,2,1 back-offs are a 2 and a 1. No single word describes them, so there is
  // no word the repair could converge on -- the rule must stay silent.
  assert.equal(expectedLadderRungs('Top set, then crisp doubles.', 22, [3, 2, 1]), null);
  assert.deepEqual(words(block('3,2,1', 'Top set is clean, then crisp doubles.')), []);
});

test('a cue does not reach across a sentence boundary', () => {
  // The cue belongs to its own clause. "then crisp singles. Doubles are fine on
  // a strong day" must not have "Doubles" read as a back-off claim.
  assert.deepEqual(
    words(block('2,1,1,1', 'Top set at capacity, then crisp singles. Doubles are fine on a strong day.')),
    [], 'a later sentence must not inherit the earlier cue');
});

test('the program run #143 delivered now converges through the bundle', () => {
  // Non-synthetic: the actual live output the coach reviewed, with the actual
  // defect he found, through the gate that ships it.
  const delivered = fs.readFileSync(path.join(here, '..', 'run143-advanced-calisthenics-for-coach.txt'), 'utf8');
  assert.deepEqual(words(delivered), ['doubles'], 'the shipped defect is present in the shipped file');

  const settled = collectRepairableValidationFailures(delivered, INTAKE);
  assert.equal(settled.ok, true, 'the bundle must repair it rather than refuse the build');
  assert.deepEqual(words(settled.program), []);
  assert.match(noteOf(settled.program), /then crisp singles;/);
});
