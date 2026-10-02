// Run #160 shipped two programs and I reported two passes. One of them carried
// SPORT_DAY_COUPLING_VIOLATION and LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_
// PERFORMANCE, which the engine stated plainly at the front of the job detail
// and the grading script dropped on the floor. These tests exist so a delivered
// program with unresolved rules can never be counted as a clean one again.

import test from 'node:test';
import assert from 'node:assert/strict';

import { deliveryVerdict, effortThatWroteIt, timingFrom, unresolvedRulesFrom } from '../engine/delivery_verdict.js';

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

// The ladder is not quality-neutral the whole way down. high -> medium costs
// nothing, because high never finished inside the request ceiling on four of
// five avatars and medium was already writing every program. medium -> low is
// different: in run #160 the triathlete fell to low and it shows, with six
// minutes of intervals on her Monday and weekly running volume at roughly half
// the 22-25 km she tolerates. That is the right trade against delivering
// nothing, and it is not something a report should leave to be inferred from a
// trace string.

test('the effort that wrote the program is the last one named', () => {
  assert.equal(effortThatWroteIt('QA trace: E0:medium -> T1:request_ceiling@low -> A1:X.'), 'low');
  assert.equal(effortThatWroteIt('QA trace: E0:high -> T1:request_ceiling@medium.'), 'medium');
  assert.equal(effortThatWroteIt('saving program after 1 model call(s) QA trace: E0:medium.'), 'medium');
  assert.equal(effortThatWroteIt('no trace here'), null);
});

test('a low-effort program is marked degraded without changing its verdict', () => {
  const clean = deliveryVerdict({ ok: true, detail: 'QA trace: E0:medium -> T1:request_ceiling@low.' });
  assert.equal(clean.verdict, 'PASS', 'clean is still clean');
  assert.equal(clean.degraded, true, 'and still worth a second look');
  assert.equal(clean.effort, 'low');
});

test('a medium program is not degraded', () => {
  const r = deliveryVerdict({ ok: true, detail: RUN160_BASKETBALL });
  assert.equal(r.degraded, false);
  assert.equal(r.effort, 'medium');
});

// The 300-second bar is the product promise, and masters_return came in at 304
// with nothing in the evidence able to say whether those four seconds were the
// model's or ours. The breakdown existed in lastBuildTiming and went only to the
// console and to /api/health, which production redacts to {ok:true}.

test('the timing breakdown is read back from the detail', () => {
  const detail = 'saving program after 1 model call(s) QA trace: E0:medium. Timing: total 298s, model 281s across 1 call(s), engine 2s.';
  assert.deepEqual(timingFrom(detail), { total_s: 298, model_s: 281, calls: 1, engine_s: 2 });
});

test('a detail without timing does not invent one', () => {
  assert.equal(timingFrom(RUN160_BASKETBALL), null);
  assert.equal(timingFrom(''), null);
  assert.equal(deliveryVerdict({ ok: true, detail: RUN160_BASKETBALL }).timing, null);
});

test('timing rides alongside the verdict rather than changing it', () => {
  const slowButClean = 'saving program after 1 model call(s) QA trace: E0:medium. Timing: total 900s, model 880s across 1 call(s), engine 3s.';
  const r = deliveryVerdict({ ok: true, detail: slowButClean });
  assert.equal(r.verdict, 'PASS', 'slow is not dirty');
  assert.equal(r.timing.model_s, 880);
});

test('a multi-call build reports the model sum, not the last call', () => {
  const four = 'delivered with unresolved rules: X QA trace: E0:medium -> T1:request_ceiling@low. Timing: total 843s, model 820s across 4 call(s), engine 9s.';
  const t = timingFrom(four);
  assert.equal(t.calls, 4);
  assert.equal(t.model_s, 820, 'the sum across calls is what a four-attempt build actually spent');
});
