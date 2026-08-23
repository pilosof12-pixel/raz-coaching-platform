import test from 'node:test';
import assert from 'node:assert/strict';

import { bodyweightKg } from '../engine/intake_bodyweight.js';
import { intakeClarificationResult } from '../intake_clarification.js';

// The intake form collects bodyweight as free text and its own placeholder asks
// for "85 kg". Every consumer read it with Number(), which is NaN for exactly
// the value the form told the athlete to type, so relative-strength judgement
// was blind for everyone who filled the field in correctly.
test('bodyweight parses the shapes the form actually invites', () => {
  assert.equal(bodyweightKg({ bodyweight: '85 kg' }), 85);
  assert.equal(bodyweightKg({ bodyweight: '85kg' }), 85);
  assert.equal(bodyweightKg({ bodyweight: '85' }), 85);
  assert.equal(bodyweightKg({ bodyweight: '~85 kg' }), 85);
  assert.equal(bodyweightKg({ bodyweight: '82.5 kg' }), 82.5);
  assert.equal(bodyweightKg({ bodyweight: 85 }), 85);
});

// "187 lb" also contains a bare number. Reading it as kilograms would make the
// athlete 187 kg and invert every relative-strength ratio built on it.
test('pounds convert rather than being read as kilograms', () => {
  assert.equal(bodyweightKg({ bodyweight: '187 lb' }), 84.8);
  assert.equal(bodyweightKg({ bodyweight: '175 pounds' }), 79.4);
});

test('unusable and out-of-range values decline rather than guess', () => {
  for (const v of ['', null, undefined, 'kg', 'ask me later', '12 kg', '900 kg']) {
    assert.equal(bodyweightKg({ bodyweight: v }), null, `expected null for ${JSON.stringify(v)}`);
  }
});

test('the alternate field names all resolve', () => {
  assert.equal(bodyweightKg({ bodyweight_kg: 90 }), 90);
  assert.equal(bodyweightKg({ body_weight: '90 kg' }), 90);
  assert.equal(bodyweightKg({ weight_kg: '90' }), 90);
});

// Optional questions ride along with an exchange the athlete is already having
// and never open one by themselves, so the fixture carries a required question.
const RELATIVE_STRENGTH_INTAKE = {
  primary_goals: 'One-arm pull-up',
  experience: 'Advanced (3+ years)',
};

// The clarification rule checked intake.bodyweight_kg while the form writes
// intake.bodyweight, so an athlete who answered in the form was asked again.
// That is the unnecessary ping-pong the rest of this suite guards against.
test('an athlete who filled the form field is not asked for bodyweight again', () => {
  const asked = (intake) =>
    intakeClarificationResult(intake).questions.some((q) => q.id === 'bodyweight');

  assert.equal(asked(RELATIVE_STRENGTH_INTAKE), true, 'a blank field should still be asked about');
  assert.equal(asked({ ...RELATIVE_STRENGTH_INTAKE, bodyweight: '85 kg' }), false);
  assert.equal(asked({ ...RELATIVE_STRENGTH_INTAKE, bodyweight: '187 lb' }), false);
});

// A value the parser cannot use is not an answer, so the question must survive.
test('an unusable bodyweight entry still earns the question', () => {
  const { questions } = intakeClarificationResult({ ...RELATIVE_STRENGTH_INTAKE, bodyweight: 'not sure' });
  assert.ok(questions.some((q) => q.id === 'bodyweight'));
});

// Bodyweight is context, never a gate: a missing answer must not stall a build.
test('bodyweight never blocks generation', () => {
  const { questions } = intakeClarificationResult(RELATIVE_STRENGTH_INTAKE);
  const bw = questions.find((q) => q.id === 'bodyweight');
  assert.equal(bw.required, false);
});
