import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_OUTPUT_MARKER, patchOpenAIEmptyOutputRetrySource } from '../scripts/apply_openai_empty_output_retry.mjs';

test('empty OpenAI output is classified as a transient provider failure for the existing provider retry loop', () => {
  const source = [
    'async function runEngineRaw(userContent) {',
    '  const text = "";',
    '      if (!text) throw new Error("OpenAI returned no output_text content.");',
    '}',
  ].join('\n');
  const patched = patchOpenAIEmptyOutputRetrySource(source);
  assert.match(patched, /emptyOutputError\.code = "OPENAI_EMPTY_OUTPUT"/);
  assert.match(patched, /emptyOutputError\.status = 503/);
  assert.match(patched, new RegExp(EMPTY_OUTPUT_MARKER));
  assert.doesNotMatch(patched, /if \(!text\) throw new Error\("OpenAI returned no output_text content\."\)/);
});

test('empty-output runtime patch is idempotent', () => {
  const source = '      if (!text) throw new Error("OpenAI returned no output_text content.");';
  const once = patchOpenAIEmptyOutputRetrySource(source);
  const twice = patchOpenAIEmptyOutputRetrySource(once);
  assert.equal(twice, once);
});

test('empty-output runtime patch fails closed if the expected generated-runtime anchor drifts', () => {
  assert.throws(
    () => patchOpenAIEmptyOutputRetrySource('const text = maybeText;'),
    /anchor expected once, found 0/,
  );
});
