// The two numbers that decided how long run #123 took.
//
// Its trace was the first this project has ever recorded:
//
//   T1:empty_output(max_output_tokens) -> T2:request_ceiling -> A1:V74_CAMP_SESSION_TOO_BUSY
//
// Two of three model calls produced nothing. The first exhausted its output
// budget and returned no text; the second ran past the request ceiling and was
// aborted and discarded. 1349 seconds, of which roughly 780 was a call thrown
// away.
//
// The first failure is arithmetic rather than bad luck. Reasoning tokens are
// charged against max_output_tokens, so at effort "high" a 24000 budget can be
// consumed by reasoning alone and leave nothing for a ~4500-token program. The
// API then reports incomplete: max_output_tokens, which is exactly what the
// trace recorded.
//
// The second is a ceiling set for a worst case nobody had measured. Successful
// calls land at 164-285s; 780s only decided how long a doomed call was allowed
// to burn before being abandoned.
//
// Reasoning effort is deliberately NOT lowered here. It is the one knob that
// trades latency against the quality this whole engine exists to protect, and
// that trade belongs to the coach, not to a latency fix.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = fs.readFileSync(path.join(here, '..', 'server.phase15.js'), 'utf8');

test('the output budget leaves room for an answer after high-effort reasoning', () => {
  const m = runtime.match(/OPENAI_MAX_OUTPUT_TOKENS = Number\(process\.env\.OPENAI_MAX_OUTPUT_TOKENS \|\| (\d+)\)/);
  assert.ok(m, 'max_output_tokens default not found');
  const budget = Number(m[1]);
  // A delivered Hyrox program is ~15800 characters, roughly 4500 tokens. The
  // budget has to cover that AND the reasoning that produced it.
  assert.ok(budget >= 40000, `max_output_tokens ${budget} is where the empty-output failure came from`);
});

test('a doomed call is abandoned before it can eat the build', () => {
  const m = runtime.match(/AI_REQUEST_TIMEOUT_MS = Number\(process\.env\.AI_REQUEST_TIMEOUT_MS \|\| \(OPENAI_API_KEY \? (\d+)/);
  assert.ok(m, 'request timeout default not found');
  const ms = Number(m[1]);
  // Comfortably above the 285s a successful call has ever taken, far below the
  // 780s that one discarded call was allowed to spend in #123.
  // Re-baselined after run #129. 420s was set because no successful call had
  // ever exceeded 285s -- and then both avatars opened with T1:request_ceiling,
  // aborting a first call that was still working and throwing away 420 seconds
  // before retrying. An abort costs the whole ceiling AND a retry, so cutting it
  // too fine is the more expensive mistake of the two.
  assert.ok(ms >= 540000, `request ceiling ${ms}ms aborts calls that would have finished`);
  assert.ok(ms <= 720000, `request ceiling ${ms}ms lets a stalled call dominate the build again`);
});

test('both remain overridable without a deploy', () => {
  // Render env vars are the fastest way to retune these if the next run shows
  // the numbers are still wrong.
  assert.match(runtime, /process\.env\.OPENAI_MAX_OUTPUT_TOKENS/);
  assert.match(runtime, /process\.env\.AI_REQUEST_TIMEOUT_MS/);
});

// This guard used to pin the default to "high" and say, correctly, that
// lowering it as part of a latency change is a quality decision and not a side
// effect. The quality decision has since been made, on evidence, so the guard
// now holds the decision rather than the old value -- and it still refuses a
// silent change, because the number and the reason are asserted together.
//
// The evidence: an effort that runs past the request ceiling is discarded
// whole, so it contributes no content at all. Four of five avatars abort at
// high -- tactical_3k and masters_return in run #158, advanced_hybrid and
// sprint_triathlete in #159 -- which means every program those builds delivered
// was written by the medium retry that followed, after up to 600 seconds of
// billed reasoning that produced nothing. Basketball ran medium from the start
// in #154 and finished in 299s, one call, zero findings.
test('the default effort is the one that actually produces programs', () => {
  assert.match(runtime, /OPENAI_REASONING_EFFORT \|\| "medium"/,
    'the default is medium because high aborts at the ceiling on four of five avatars and is discarded whole');
});

// Lowering the default must not quietly remove the ability to ask for more.
test('high is still reachable, so the decision stays measurable', () => {
  assert.match(runtime, /ALLOWED_REASONING_EFFORTS = new Set\(\["low", "medium", "high"\]\)/);
  assert.match(runtime, /intake\.qa_reasoning_effort/,
    'a QA intake must still be able to name high, which is how this was measured');
});

// youth_gymnastics does complete at high, in 763s across four attempts, so the
// ladder is the thing that keeps a slow avatar from dying rather than a
// formality. If it is ever removed, this change becomes a one-way door.
test('the ladder still gives a slow build somewhere to go', () => {
  assert.match(runtime, /CEILING_LADDER = \{ high: "medium", medium: "low" \}/);
});

// The effort in force was not observable from outside the process. An
// environment variable set in the host dashboard silently overrides the code
// default, so "we changed it" and "it took effect" were indistinguishable
// without reading the service logs. The latency question turns on this value,
// so health publishes it along with the budgets that bound a call.
test('health publishes the effort and budgets actually in force', () => {
  assert.match(runtime, /reasoning_effort: OPENAI_API_KEY \? OPENAI_REASONING_EFFORT : null/);
  assert.match(runtime, /reasoning_effort_source: OPENAI_API_KEY \? \(process\.env\.OPENAI_REASONING_EFFORT \? "environment" : "code-default"\)/,
    'a change that the host overrides must be distinguishable from one that took effect');
  assert.match(runtime, /request_ceiling_ms: AI_REQUEST_TIMEOUT_MS/);
  assert.match(runtime, /build_budget_ms: BUILD_JOB_TIMEOUT_MS/);
});
