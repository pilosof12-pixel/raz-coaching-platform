// "No grinders" is the standard, not a violation of it.
//
// YG-07 fails a youth program whose notes ask for failure work -- to failure,
// AMRAP, forced reps, grinding. It read the note for those words and stripped the
// negated forms first, so that forbidding the thing would not read as prescribing
// it. The strip list held "no grinding" and not "no grinders".
//
// The golden Youth program says "no grinders" on every Pistol Squat row in all
// four weeks, which is exactly the standard YG-07 exists to enforce, and it was
// failed for it. Any real Youth build using the same ordinary coaching phrase was
// refused the same way and paid a model call to be told to fix what was right.
//
// The rule is not loosened here. It still fires on every genuine prescription of
// failure work, which is what the second test is for.

import test from 'node:test';
import assert from 'node:assert/strict';

import { youthGymnasticsGoldenProgram, YOUTH_GYMNASTICS_INTAKE } from './fixtures/golden_programs.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';

const YG07 = 'COACH_SPEC_V1_YG_FAILURE_BASED_DEFAULT';
const codesFor = (program) => (collectRepairableValidationFailures(program, YOUTH_GYMNASTICS_INTAKE).flags || [])
  .map((f) => f.code);

test('forbidding failure work does not read as prescribing it', () => {
  const golden = youthGymnasticsGoldenProgram();
  assert.match(golden, /no grinders/, 'the fixture must still carry the phrase this is about');
  assert.ok(!codesFor(golden).includes(YG07), '"no grinders" is the youth standard, not a breach of it');

  // The other ways a coach rules it out, which a note may reasonably use.
  for (const phrase of [
    'no grinders', 'no grinding', 'never grinding', 'avoid grinders',
    'do not train to failure', 'never to failure', 'no forced reps',
    'stop two reps before failure', 'keep every set short of failure',
  ]) {
    const program = golden.replace(/no grinders/g, phrase);
    assert.ok(!codesFor(program).includes(YG07), `"${phrase}" forbids failure work; it must not be flagged`);
  }
});

test('a youth program that really asks for failure work is still refused', () => {
  const golden = youthGymnasticsGoldenProgram();
  for (const phrase of [
    'take the last set as an AMRAP',
    'take the last set to failure',
    'add forced reps with a spotter',
    'grinding reps are fine here',
    'push every set until failure',
  ]) {
    const program = golden.replace(/no grinders/g, phrase);
    assert.ok(codesFor(program).includes(YG07), `"${phrase}" prescribes failure work and must fail YG-07`);
  }
});
