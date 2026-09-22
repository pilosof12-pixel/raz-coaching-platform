// A contingency is not a claim about this week's dose.
//
// "If >RPE 8 or any miss, stay at the last made weight and cut 1 set" tells the
// athlete what to do if the session goes badly. V34 read "cut 1 set" as a claim
// that this week carries less volume than the last, checked the table, found
// the sets deliberately flat across weeks 1-3, and refused the whole meet-week
// build -- on a note the model had written into every one of those weeks.
//
// The rule exists for a note that contradicts its own row. A conditional
// contradicts nothing until its condition is met.
//
// The control here is the same program with the same words made unconditional,
// because the test that matters is the one proving the rule still bites. Two
// earlier attempts at a hand-built fixture never reached the rule at all and
// passed for that reason, before and after the change alike.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORPUS } from '../scripts/corpus.mjs';
import { validatePrescriptionConsistency } from '../engine/v34_prescription_consistency.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const [FILE, INTAKE] = CORPUS.find(([f]) => f === 'run114_weightlifter_peak.txt');
const PROGRAM = fs.readFileSync(path.join(DIR, FILE), 'utf8');
const CONDITIONAL = 'If >RPE 8 or any miss, stay at the last made weight and cut 1 set.';

// The bundle passes its own error class as the third argument, and the rule
// behaves differently without it.
class Err extends Error {
  constructor(code, amendment) { super(code); this.code = code; this.amendment = amendment; }
}
const codeFor = (program) => {
  try { validatePrescriptionConsistency(program, INTAKE, Err); return null; }
  catch (e) { return e.code; }
};

test('the fixture really does carry the conditional this is about', () => {
  assert.ok(PROGRAM.includes(CONDITIONAL), 'fixture changed; this test no longer tests what it says');
});

test('a conditional cut against flat sets is not a progression mismatch', () => {
  assert.notEqual(codeFor(PROGRAM), 'V34_PROGRESSION_LANGUAGE_MISMATCH');
});

test('the same words without the condition still fire', () => {
  const unconditional = PROGRAM.split(CONDITIONAL).join('Cut 1 set versus last week.');
  assert.equal(codeFor(unconditional), 'V34_PROGRESSION_LANGUAGE_MISMATCH',
    'a note that really does claim a reduction must still be checked');
});

test('the exemption is scoped to the clause, not the cell', () => {
  // A note may carry a real claim in one sentence and a contingency in the
  // next; only the contingency is exempt.
  const both = PROGRAM.split(CONDITIONAL)
    .join(`Cut 1 set versus last week. ${CONDITIONAL}`);
  assert.equal(codeFor(both), 'V34_PROGRESSION_LANGUAGE_MISMATCH');
});
