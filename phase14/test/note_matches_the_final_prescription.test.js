// Passing every machine gate is not the same as being right in the client's hands.
//
// Run #138's repaired artifact cleared the whole validation bundle and still
// carried two instructions the athlete cannot follow. The coach found both.
//
// Week 3 Monday is prescribed as Muscle-up 3x2 and the model wrote "If rep 2
// would be soft, switch to singles" -- correct, and the fallback is the point of
// the sentence. The note reconciler restates rep words so they match the row, saw
// "singles" against a 2-rep row, and rewrote it to "switch to doubles" on a set
// already prescribed as doubles. The repair made the line worse than the model
// wrote it.
//
// Separately, a Dip written at four sets carried "stop at 3 sets", a later repair
// cut it to two, and the note kept telling him to stop at a set the row no longer
// has.
//
// Both are the same failure: a note generated against a prescription that then
// changed under it. These assertions run on the real delivered artifact.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRepairableProgramBundle } from '../engine/repairable_validation_bundle.js';
import { collectPrescriptionConsistencyFlags } from '../engine/v34_prescription_consistency.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DELIVERED = fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics.txt'), 'utf8');
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const repaired = () => {
  const out = validateRepairableProgramBundle(DELIVERED, INTAKE);
  assert.equal(out.ok, true, 'fixture must still clear the bundle');
  return out.program;
};

const rows = (program) => program.split('\n').map((l) => l.split('\t')).filter((c) => c.length === 9 && c[0] !== 'Day');

const REP_WORD = { single: 1, singles: 1, double: 2, doubles: 2, triple: 3, triples: 3 };

test('no note tells the athlete to fall back to the dose already prescribed', () => {
  // "Strict ring doubles only if rep 1 is crisp. If rep 2 would be soft, switch
  // to singles" is a 2-rep row whose second rep word is deliberately a different
  // dose. Restating it as the row's own produced "switch to doubles" on a set
  // already prescribed as doubles -- the repair making the line worse than the
  // model wrote it. This is the invariant, whatever the prescription ends up as.
  for (const c of rows(repaired())) {
    const reps = Number(c[4]);
    if (!Number.isFinite(reps)) continue;
    const re = /\b(?:switch(?:ing)? to|drop(?:ping)? (?:back )?to|fall(?:ing)? back (?:on|to)|revert(?:ing)? to)\s+(?:\w+\s+){0,2}(singles?|doubles?|triples?)\b/gi;
    for (const m of String(c[7]).matchAll(re)) {
      assert.notEqual(REP_WORD[m[1].toLowerCase()], reps,
        `${c[0]} ${c[1]} is prescribed at ${reps} reps and its note says to fall back to ${m[1]}`);
    }
  }
});

test('no note tells the athlete to stop at a set the row does not contain', () => {
  for (const c of rows(repaired())) {
    const sets = Number(c[3]);
    if (!Number.isFinite(sets)) continue;
    const m = String(c[7]).match(/stop at (\d+)\s+(?:clean|quality|good|solid)?\s*sets?\b/i);
    if (!m) continue;
    assert.ok(Number(m[1]) < sets,
      `${c[0]} ${c[1]} is prescribed ${sets} sets and its note says stop at ${m[1]}`);
  }
});

test('the detector and the repair agree about fallback rep words', () => {
  // If they disagree the build never converges: the repair leaves the note
  // alone, the detector goes on flagging it, and the model is asked to fix a
  // sentence that is already correct. That loop is what four model calls buys.
  const flags = collectPrescriptionConsistencyFlags(repaired(), INTAKE)
    .filter((f) => f.code === 'V34_NOTE_REP_WORD_MISMATCH');
  assert.deepEqual(flags, []);
});

// --- a ladder row has no single rep count ------------------------------------
//
// Run #139 shipped "otherwise stay at a triples and keep the back-off triples"
// and "one extra clean back-off doubles". Neither is something a model writes --
// they are in-place substitutions. The reconciler restates rep words so they
// match the row, read the top of the ladder "3/1/1/1" as THE rep count, and
// rewrote every rep word in the note to it. The back-off descriptions, which are
// the part of the sentence that says what to do instead, were destroyed.

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';

const HEAD_L = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const ladderBlock = (note) => [1, 2, 3, 4].map((n) => [
  `START_WEEK${n}_TSV`, HEAD_L,
  `Mon\tMuscle-up\tBodyweight\t4\t3/1/1/1\t3 min\t8\t${note}\t`,
  'Mon\tWeighted Pull-up\t31 kg\t3\t3\t4 min\t8\tPrimary.\t',
  'Mon\tDip\tRPE-selected load\t2\t5\t3 min\t7.5\tPressing.\t',
  `END_WEEK${n}_TSV`,
].join('\n')).join('\n\n');

const noteOf = (program) => program.split('\n').map((l) => l.split('\t'))
  .find((c) => c.length === 9 && c[1] === 'Muscle-up')[7];

test('a ladder row keeps the rep words its note needs', () => {
  const note = 'Hardest set-length week; only take the triple if rep 2 is still clean and strict; '
    + 'otherwise stay at a double and keep the back-off singles.';
  const { program } = repairDeterministicContradictions(ladderBlock(note), INTAKE);
  assert.equal(noteOf(program), note, 'a note describing several set lengths must survive intact');
});

test('a plain row still has its rep words reconciled', () => {
  // The rewriting is right where there IS one rep count; it was only wrong where
  // the row prescribes several.
  const plain = [1, 2, 3, 4].map((n) => [
    `START_WEEK${n}_TSV`, HEAD_L,
    'Mon\tMuscle-up\tBodyweight\t4\t2\t3 min\t8\tStrict ring singles only.\t',
    'Mon\tWeighted Pull-up\t31 kg\t3\t3\t4 min\t8\tPrimary.\t',
    'Mon\tDip\tRPE-selected load\t2\t5\t3 min\t7.5\tPressing.\t',
    `END_WEEK${n}_TSV`,
  ].join('\n')).join('\n\n');
  const { program } = repairDeterministicContradictions(plain, INTAKE);
  assert.equal(/\bsingles\b/i.test(noteOf(program)), false, 'a 2-rep row should not say singles');
});
