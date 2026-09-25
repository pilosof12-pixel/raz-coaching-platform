// The repair the loop already had, and threw away.
//
// validateRepairableProgramBundle repairs the candidate and throws if anything
// is still flagged. The throw carried only the flags, so the catch re-asked the
// model from the text it had already written, and every repair made on the way
// was lost.
//
// Run #140 spent four model calls and 466 seconds on
// V34_NOTE_UNDEFINED_LOAD_REFERENCE, then shipped the program the bundle had
// produced on the first attempt -- discarded three times and recovered by the
// fallback after the loop gave up. The fallback's own comment is the argument:
// the bundle hands back the improved program whether or not the flags cleared,
// so it is strictly better than what the model last wrote.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRepairableProgramBundle } from '../engine/repairable_validation_bundle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows) => [1, 2, 3, 4]
  .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`).join('\n\n');

test('a failing bundle hands back the program it repaired', () => {
  // A barbell in a calisthenics park: something the chain cannot repair away, so
  // the bundle is guaranteed to throw and we can see what it throws with.
  const p = block([
    'Mon\tBarbell Back Squat\t100 kg\t3\t5\t3 min\t8\tPrimary.\t',
    'Mon\tMuscle-up\tBodyweight\t4\t1\t3 min\t7\tSkill.\t',
  ]);
  assert.throws(
    () => validateRepairableProgramBundle(p, INTAKE),
    (err) => {
      assert.ok(Array.isArray(err.flags) && err.flags.length, 'the flags still travel');
      assert.equal(typeof err.repairedProgram, 'string', 'and so does the repaired program');
      assert.ok(err.repairedProgram.includes('START_WEEK1_TSV'), 'which is a whole program');
      assert.ok(Array.isArray(err.deterministic_repairs), 'with the record of what was done to it');
      return true;
    },
  );
});

test('what it hands back is the repaired text, not the input', () => {
  // The note cites a load the program never establishes. The chain restates it,
  // and that restatement is what should reach the caller even though other
  // flags keep the bundle from accepting.
  const p = block([
    'Mon\tBarbell Back Squat\t100 kg\t3\t5\t3 min\t8\tUnrepairable equipment.\t',
    'Mon\tWeighted Pull-up\t30 kg\t3\t3\t4 min\t8\tStart at +37 kg and stop if set 1 is above RPE 8.\t',
  ]);
  try {
    validateRepairableProgramBundle(p, INTAKE);
    assert.fail('fixture must not be acceptable');
  } catch (err) {
    assert.equal(/\+37 kg/.test(err.repairedProgram), false,
      'the unverifiable load should already be gone from what the caller receives');
  }
});

test('the build loop uses it instead of asking the model again', () => {
  // server.phase15.js is generated, so the wiring is asserted against the built
  // runtime rather than the source it is patched from.
  const built = fs.readFileSync(path.join(here, '..', 'server.phase15.js'), 'utf8');
  assert.match(built, /REPAIRED-CANDIDATE-REUSE/, 'the patch must be applied');
  assert.match(built, /const repairedByBundle = err && typeof err\.repairedProgram === "string"/);
  assert.match(built, /converged-without-regeneration/, 'and say so in the trace');

  // It must finish only on the loop's own bar: the full bundle, clean, plus the
  // client-output check. Anything less would ship what the loop would not have.
  const at = built.indexOf('REPAIRED-CANDIDATE-REUSE');
  const region = built.slice(at, at + 1400);
  assert.match(region, /validateRepairableProgramBundle\(repairedByBundle, intake/);
  assert.match(region, /validateClientOutputCleanliness\(finished\)/);
  // And when it is still flagged, the improvement carries into the next attempt.
  assert.match(region, /repairCandidate = repairedByBundle/);
});

test('structural corruption still gets a fresh candidate', () => {
  // A malformed TSV cannot be surgically edited, so the early finish is skipped
  // for those codes and the old reset stands.
  const built = fs.readFileSync(path.join(here, '..', 'server.phase15.js'), 'utf8');
  assert.match(built, /if \(repairedByBundle\.trim\(\) && !requiresFreshCandidate\)/);
  assert.match(built, /repairCandidate = requiresFreshCandidate \? null : program;/);
});
