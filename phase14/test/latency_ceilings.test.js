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
  assert.ok(ms >= 360000, `request ceiling ${ms}ms would abort legitimate calls`);
  assert.ok(ms <= 480000, `request ceiling ${ms}ms lets a stalled call dominate the build again`);
});

test('both remain overridable without a deploy', () => {
  // Render env vars are the fastest way to retune these if the next run shows
  // the numbers are still wrong.
  assert.match(runtime, /process\.env\.OPENAI_MAX_OUTPUT_TOKENS/);
  assert.match(runtime, /process\.env\.AI_REQUEST_TIMEOUT_MS/);
});

test('reasoning effort is untouched', () => {
  assert.match(runtime, /OPENAI_REASONING_EFFORT \|\| "high"/,
    'effort was lowered as part of a latency change; that is a quality decision');
});
