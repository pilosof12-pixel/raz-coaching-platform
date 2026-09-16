import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  requiredMovements, buildBenchmarkExposureBrief, buildProgressionBrief,
  buildSchedulingBrief, buildCoachStandardBrief,
} from '../engine/coach_standard_brief.js';

const T = new URL('./fixtures/', import.meta.url);
const json = (f) => JSON.parse(fs.readFileSync(new URL(f, T), 'utf8'));
const C = json('competition_avatars.json');
const A = json('acceptance_intakes.json');
const H = json('hard_avatars.json');

// The brief names the athlete's own movements, because a brief saying "train
// the benchmarks" changes nothing.
test('the brief names the movements the block must contain', () => {
  const brief = buildBenchmarkExposureBrief(C.mma_fight_camp);
  assert.match(brief, /Trap Bar Deadlift \(190 kg x 3\)/);
  assert.match(brief, /At least 142\.5 kg on the bar/, '75% of the benchmark, rounded to the bar');
});

// The most dangerous thing this file could do. The tolerated list ends "Heavy
// back squat is not.", and a substring search over it reported back squat as
// tolerated -- which would have put the athlete's symptom-reproducing lift into
// the brief, and the coach caps that program at 6.0.
test('the brief never asks for a movement the athlete reported symptoms on', () => {
  const required = requiredMovements(C.mma_fight_camp).map((b) => b.name);
  assert.ok(!required.includes('Back Squat'), 'knee ache after heavy bilateral squatting');
  assert.ok(required.includes('Trap Bar Deadlift'));
  assert.doesNotMatch(buildBenchmarkExposureBrief(C.mma_fight_camp), /Back Squat/);
});

test('the progression brief names the goals the athlete asked to improve', () => {
  const brief = buildProgressionBrief(A.tactical_3k);
  assert.match(brief, /Improve 3 km from 13:30 to sub-12:00/);
  assert.match(brief, /RPE-selected load/, 'and asks for a number to lift');
  // Nothing to say when every goal is a hold.
  assert.equal(buildProgressionBrief({ maintenance_goals: ['Maintain strength'] }), '');
});

test('the scheduling brief only speaks when the calendar is a choice', () => {
  assert.match(buildSchedulingBrief(A.tactical_3k), /more than 3 consecutive training days/);
  assert.match(buildSchedulingBrief(A.tactical_3k), /The week wraps/);
  assert.match(buildSchedulingBrief(A.tactical_3k), /impact-related lower-leg trouble/);
  // Two fixed gym days is not a choice.
  assert.equal(buildSchedulingBrief(C.mma_fight_camp), '');
  // No impact history, no lower-leg clause.
  assert.doesNotMatch(buildSchedulingBrief({ gym_availability_mode: 'flexible' }), /lower-leg/);
});

test('an intake with nothing to say produces no brief', () => {
  assert.equal(buildCoachStandardBrief({}), '');
  assert.equal(buildCoachStandardBrief({ experience: 'beginner', current_numbers: 'Back Squat: 60 kg x 5' }), '',
    'the exposure rules are for advanced athletes; novices are not yet observed');
});

test('every avatar we hold produces a brief that parses as brief lines', () => {
  for (const [id, intake] of Object.entries({ ...A, ...C, ...H })) {
    const brief = buildCoachStandardBrief(intake);
    if (!brief) continue;
    for (const line of brief.split('\n')) {
      assert.ok(line.startsWith('*') || line.startsWith('  ') || line.startsWith('    '), `${id}: "${line.slice(0, 40)}"`);
    }
  }
});
