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

test('a fallback rep word is left as the fallback it is', () => {
  const muscleUp = rows(repaired()).filter((c) => /^muscle-up$/i.test(c[1].trim()) && c[4].trim() === '2');
  assert.ok(muscleUp.length, 'the doubles row must still be there');
  for (const c of muscleUp) {
    assert.equal(/switch to doubles/i.test(c[7]), false,
      'a row prescribed as doubles cannot tell the athlete to fall back to doubles');
    assert.ok(/switch to singles/i.test(c[7]), 'the fallback the model wrote is the correct one');
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
