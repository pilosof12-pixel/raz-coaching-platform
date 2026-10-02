// Run #160 shipped two programs and I reported two passes. One of them carried
// SPORT_DAY_COUPLING_VIOLATION and LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_
// PERFORMANCE, which the engine stated plainly at the front of the job detail
// and the grading script dropped on the floor. These tests exist so a delivered
// program with unresolved rules can never be counted as a clean one again.

import test from 'node:test';
import assert from 'node:assert/strict';

import { deliveryVerdict, unresolvedRulesFrom } from '../engine/delivery_verdict.js';

// The real string, from docs/qa/live-three-avatar/latest/result.json.
const RUN160_TRIATHLETE = 'delivered with unresolved rules: SPORT_DAY_COUPLING_VIOLATION+LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE QA trace: E0:medium -> T1:request_ceiling@low -> A1:TARGET_MODALITY_EXPOSURE_REDUCED+TARGET_MODALITY_EXPOSURE_REDUCED+EVENT_PROGRESSING_SESSION_MISSING -> A2:SPORT_DAY_COUPLING_VIOLATION+LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE.';
const RUN160_BASKETBALL = 'saving program after 1 model call(s) QA trace: E0:medium.';

test('the run #160 triathlete is not a pass', () => {
  const { verdict, unresolved } = deliveryVerdict({ ok: true, detail: RUN160_TRIATHLETE });
  assert.equal(verdict, 'DIRTY');
  assert.deepEqual(unresolved, ['SPORT_DAY_COUPLING_VIOLATION', 'LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE']);
});

test('a clean delivery is a pass', () => {
  const { verdict, unresolved } = deliveryVerdict({ ok: true, detail: RUN160_BASKETBALL });
  assert.equal(verdict, 'PASS');
  assert.deepEqual(unresolved, []);
});

test('nothing delivered is a fail, whatever the detail says', () => {
  assert.equal(deliveryVerdict({ ok: false, detail: RUN160_TRIATHLETE }).verdict, 'FAIL');
  assert.equal(deliveryVerdict({ ok: false, detail: '' }).verdict, 'FAIL');
});

// The codes appear elsewhere in the same detail, inside the A1/A2 trace entries.
// Only the ones the delivered program still breaks count, so the match is
// anchored to the salvage sentence rather than scanning for code-shaped words.
test('codes mentioned in the repair trace are not counted as unresolved', () => {
  const repairedInTheEnd = 'saving program after 2 model call(s) QA trace: E0:medium -> A1:WEEKLY_MRV_EXCEEDED -> A2:converged-without-regeneration.';
  assert.deepEqual(unresolvedRulesFrom(repairedInTheEnd), []);
  assert.equal(deliveryVerdict({ ok: true, detail: repairedInTheEnd }).verdict, 'PASS');
});

test('a single unresolved rule is enough', () => {
  const one = 'delivered with unresolved rules: WEEKLY_MRV_EXCEEDED QA trace: E0:medium.';
  assert.deepEqual(unresolvedRulesFrom(one), ['WEEKLY_MRV_EXCEEDED']);
  assert.equal(deliveryVerdict({ ok: true, detail: one }).verdict, 'DIRTY');
});

test('a missing or empty detail does not invent a verdict', () => {
  assert.equal(deliveryVerdict({ ok: true }).verdict, 'PASS');
  assert.deepEqual(unresolvedRulesFrom(undefined), []);
  assert.deepEqual(unresolvedRulesFrom(''), []);
});
