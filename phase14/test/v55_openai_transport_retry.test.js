import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  patchOpenAITransportRetrySource, TRANSPORT_RETRY_MARKER,
} from '../scripts/apply_openai_transport_retry.mjs';

// Derive the patched runtime here rather than reading whatever the last build
// left on disk, so the suite is meaningful on a tree that has not been built.
// The patch is idempotent, so this is a no-op when the file is already current.
const built = patchOpenAITransportRetrySource(
  fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8'),
);

test('the runtime routes the OpenAI call through the retry helper', () => {
  assert.ok(built.includes(TRANSPORT_RETRY_MARKER));
  assert.ok(built.includes('await openAIFetchWithTransportRetry("https://api.openai.com/v1/responses"'));
  assert.equal(built.includes('const r = await fetch("https://api.openai.com/v1/responses"'), false);
});

test('the patch is idempotent', () => {
  assert.equal(patchOpenAITransportRetrySource(built), built);
});

// The helper is emitted as source text, so exercise it by evaluating the emitted
// definition against fakes rather than trusting the string.
async function loadHelper(fetchImpl) {
  const start = built.indexOf('// OPENAI-TRANSPORT-TRANSIENT-RETRY');
  const end = built.indexOf('async function runEngineRaw(userContent) {');
  const source = built.slice(start, end);
  const factory = new Function('fetch', `${source}; return { openAIFetchWithTransportRetry, isTransientTransportError };`);
  return factory(fetchImpl);
}

function dropped() {
  const e = new TypeError('fetch failed');
  e.cause = { code: 'ECONNRESET' };
  return e;
}

test('a dropped connection is retried rather than ending the build', async () => {
  let calls = 0;
  const { openAIFetchWithTransportRetry } = await loadHelper(async () => {
    calls += 1;
    if (calls === 1) throw dropped();
    return { ok: true, status: 200 };
  });
  const r = await openAIFetchWithTransportRetry('u', { body: '{}' }, undefined);
  assert.equal(r.status, 200);
  assert.equal(calls, 2, 'the request should have been re-sent exactly once');
});

test('run #76 shape: bare "fetch failed" with no cause is still transient', async () => {
  let calls = 0;
  const { openAIFetchWithTransportRetry, isTransientTransportError } = await loadHelper(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return { ok: true, status: 200 };
  });
  assert.equal(isTransientTransportError(new TypeError('fetch failed')), true);
  await openAIFetchWithTransportRetry('u', { body: '{}' }, undefined);
  assert.equal(calls, 2);
});

test('429 and 5xx are retried; the final response is returned', async () => {
  for (const status of [429, 500, 503]) {
    let calls = 0;
    const { openAIFetchWithTransportRetry } = await loadHelper(async () => {
      calls += 1;
      return calls === 1 ? { ok: false, status } : { ok: true, status: 200 };
    });
    const r = await openAIFetchWithTransportRetry('u', { body: '{}' }, undefined);
    assert.equal(r.status, 200, `status ${status} should have been retried`);
    assert.equal(calls, 2);
  }
});

// Retrying these would burn minutes and money for an identical failure.
// Live run #82 stopped on "You have no credits remaining", which OpenAI
// returns as a 429. A rate-limit 429 is worth retrying; an out-of-money 429 is
// as permanent as a 400 and only spends the build deadline.
test('an out-of-credits 429 is not retried', async () => {
  let calls = 0;
  const body = { error: { code: 'insufficient_quota', message: 'You have no credits remaining. Add credits to continue using the API.' } };
  const { openAIFetchWithTransportRetry } = await loadHelper(async () => {
    calls += 1;
    return { ok: false, status: 429, clone: () => ({ json: async () => body }) };
  });
  const r = await openAIFetchWithTransportRetry('u', { body: '{}' }, undefined);
  assert.equal(r.status, 429);
  assert.equal(calls, 1, 'a billing failure must not be re-sent');
});

test('an ordinary rate-limit 429 is still retried', async () => {
  let calls = 0;
  const { openAIFetchWithTransportRetry } = await loadHelper(async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: false, status: 429, clone: () => ({ json: async () => ({ error: { code: 'rate_limit_exceeded', message: 'Too many requests' } }) }) };
    }
    return { ok: true, status: 200 };
  });
  const r = await openAIFetchWithTransportRetry('u', { body: '{}' }, undefined);
  assert.equal(r.status, 200);
  assert.equal(calls, 2);
});

// A 429 whose body cannot be read must stay retriable rather than being
// mistaken for a billing stop.
test('an unreadable 429 body is treated as transient', async () => {
  let calls = 0;
  const { openAIFetchWithTransportRetry } = await loadHelper(async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 429, clone: () => ({ json: async () => { throw new Error('not json'); } }) };
    return { ok: true, status: 200 };
  });
  assert.equal((await openAIFetchWithTransportRetry('u', { body: '{}' }, undefined)).status, 200);
  assert.equal(calls, 2);
});

test('a bad request is not retried', async () => {
  let calls = 0;
  const { openAIFetchWithTransportRetry } = await loadHelper(async () => {
    calls += 1;
    return { ok: false, status: 400 };
  });
  const r = await openAIFetchWithTransportRetry('u', { body: '{}' }, undefined);
  assert.equal(r.status, 400);
  assert.equal(calls, 1, 'a 400 must not be re-sent');
});

test('our own timeout is not retried', async () => {
  let calls = 0;
  const { openAIFetchWithTransportRetry } = await loadHelper(async () => {
    calls += 1;
    throw dropped();
  });
  await assert.rejects(
    () => openAIFetchWithTransportRetry('u', { body: '{}' }, { aborted: true }),
    /fetch failed/,
  );
  assert.equal(calls, 1, 'an aborted request must not be re-sent');
});

test('a persistent transport failure still surfaces after the retry budget', async () => {
  let calls = 0;
  const { openAIFetchWithTransportRetry } = await loadHelper(async () => {
    calls += 1;
    throw dropped();
  });
  await assert.rejects(() => openAIFetchWithTransportRetry('u', { body: '{}' }, undefined), /fetch failed/);
  assert.equal(calls, 3, 'bounded at three attempts');
});
