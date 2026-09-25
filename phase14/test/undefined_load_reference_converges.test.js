// The gate that spent a whole build.
//
// Run #140 took 466 seconds across four model calls and shipped with
// V34_NOTE_UNDEFINED_LOAD_REFERENCE unresolved. It was raised on every attempt
// and cleared on none, which is the exact shape that kills a build: a rule with
// no repair that converges.
//
// The repair existed and could not always answer. It only ever deleted the
// sentence carrying the claim, and it declined twice over -- a single-sentence
// note was never touched, and a note whose every sentence carried a load was
// left whole. Both of those are common, so the flag survived and the model was
// asked again, four times, for something no wording could fix.
//
// A note citing a load the program never establishes is nearly always citing the
// wrong number for its own row -- a load that moved under it during repair --
// and the row itself says what the right one is. Restating is what every other
// reconciler here does, and unlike deleting it always has an answer.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { collectPrescriptionConsistencyFlags } from '../engine/v34_prescription_consistency.js';

const INTAKE = {
  experience: 'Advanced (3+ years)',
  primary_goals: ['Weighted pull-up with 40 kg for 3'],
  current_numbers: 'Weighted pull-up: 32 kg x 3',
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (row) => [1, 2, 3, 4].map((n) => [
  `START_WEEK${n}_TSV`, HEAD, row,
  'Mon\tDip\tRPE-selected load\t2\t5\t3 min\t7.5\tPressing.\t',
  `END_WEEK${n}_TSV`,
].join('\n')).join('\n\n');

const flags = (p) => collectPrescriptionConsistencyFlags(p, INTAKE)
  .filter((f) => f.code === 'V34_NOTE_UNDEFINED_LOAD_REFERENCE').length;
const noteOf = (p, name) => p.split('\n').map((l) => l.split('\t'))
  .find((c) => c.length === 9 && c[1] === name)[7];

test('a single-sentence note is repaired, not left', () => {
  const p = block('Mon\tWeighted Pull-up\t30 kg\t3\t3\t4 min\t8\tStart at +37 kg and stop if set 1 is above RPE 8.\t');
  assert.ok(flags(p) > 0, 'fixture must raise it');
  const out = repairDeterministicContradictions(p, INTAKE).program;
  assert.equal(flags(out), 0);
  assert.match(noteOf(out, 'Weighted Pull-up'), /30 kg/, 'restated to the row it belongs to');
});

test('a note whose every sentence carries a load is repaired', () => {
  const p = block('Mon\tWeighted Pull-up\t30 kg\t3\t3\t4 min\t8\tStart at +37 kg. Drop to +35 kg if grindy.\t');
  assert.ok(flags(p) > 0, 'fixture must raise it');
  assert.equal(flags(repairDeterministicContradictions(p, INTAKE).program), 0);
});

test('a fallback to a load that no longer exists goes, rather than becoming vacuous', () => {
  // "Drop to +37 kg if it turns grindy" names a load to retreat TO. Restating it
  // as the row's own load would tell him to drop to the weight already on the
  // belt.
  const p = block('Mon\tWeighted Pull-up\t30 kg\t3\t3\t4 min\t8\tStart at the belt load and keep every rep clean. Drop to +37 kg if it turns grindy.\t');
  const note = noteOf(repairDeterministicContradictions(p, INTAKE).program, 'Weighted Pull-up');
  assert.equal(/drop to/i.test(note), false, `left a vacuous fallback: ${note}`);
  assert.match(note, /keep every rep clean/, 'the rest of the note stays');
});

test('a row with no load to restate against loses the claim', () => {
  const p = block('Mon\tPull-up\tBodyweight\t2\t5\t2 min\t6.5\tLight pull. Start at +37 kg if it feels easy.\t');
  const out = repairDeterministicContradictions(p, INTAKE).program;
  assert.equal(flags(out), 0);
  assert.match(noteOf(out, 'Pull-up'), /Light pull/, 'what can be kept is kept');
});

test('a load the program does establish is left alone', () => {
  const p = block('Mon\tWeighted Pull-up\t30 kg\t3\t3\t4 min\t8\tStart at 30 kg; your best is 32 kg x 3.\t');
  const before = noteOf(p, 'Weighted Pull-up');
  assert.equal(flags(p), 0);
  assert.equal(noteOf(repairDeterministicContradictions(p, INTAKE).program, 'Weighted Pull-up'), before);
});

test('it is idempotent', () => {
  const p = block('Mon\tWeighted Pull-up\t30 kg\t3\t3\t4 min\t8\tStart at +37 kg and stop if set 1 is above RPE 8.\t');
  const once = repairDeterministicContradictions(p, INTAKE).program;
  assert.equal(repairDeterministicContradictions(once, INTAKE).program, once);
});
