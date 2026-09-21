// You can spend a hundred dollars and have no application.
//
// Three things bounded a build: a per-request timeout, a repair-attempt count,
// and a wall-clock budget. None of them bounded money. Run #132 put six calls
// through at max_output_tokens 48000 and delivered no program at all, and
// because reasoning tokens count against that budget, every one of those calls
// could bill its full ceiling for emitting nothing.
//
// The largest program this engine has ever delivered is under 7000 output
// tokens. A build that has spent an order of magnitude more than that is not
// nearly finished, it is looping, and the only useful thing left to do is stop.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const server = fs.readFileSync(path.join(root, '..', 'server.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, '..', 'server.phase15.js'), 'utf8');

// The real accumulator, lifted out and run rather than pattern-matched.
const loadRecorder = (cap) => {
  const start = runtime.indexOf('function recordBuildUsage(u)');
  const body = runtime.slice(start, runtime.indexOf('\n}', start) + 2);
  const state = { usage: null };
  // eslint-disable-next-line no-new-func
  const fn = new Function('state', 'MAX_BUILD_OUTPUT_TOKENS', `
    let buildUsage = null;
    function resetBuildUsage() { buildUsage = { calls: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, openai_ms: 0 }; }
    ${body}
    return (u) => { recordBuildUsage(u); state.usage = buildUsage; };
  `)(state, cap);
  return { record: fn, state };
};

test('a build that keeps paying without converging is stopped', () => {
  const { record } = loadRecorder(60000);
  // Four calls at the configured output ceiling, no program.
  assert.doesNotThrow(() => record({ output_tokens: 48000 }));
  let thrown = null;
  try { record({ output_tokens: 48000 }); } catch (e) { thrown = e; }
  assert.ok(thrown, 'the second full-ceiling call must not be allowed to pass silently');
  assert.equal(thrown.code, 'BUILD_SPEND_EXCEEDED');
  assert.ok(thrown.spend.calls >= 2 && thrown.spend.output_tokens > 60000);
});

test('an ordinary build is never touched by it', () => {
  const { record, state } = loadRecorder(60000);
  // The largest program ever delivered, generated three times over.
  for (let i = 0; i < 3; i += 1) assert.doesNotThrow(() => record({ output_tokens: 6669 }));
  assert.equal(state.usage.calls, 3);
});

test('the ceiling is overridable without a deploy', () => {
  assert.match(runtime, /MAX_BUILD_OUTPUT_TOKENS \|\| 60000/);
  assert.match(runtime, /process\.env\.MAX_BUILD_OUTPUT_TOKENS/);
});

test('spend is the one failure that is never retried', () => {
  const at = server.indexOf('BUILD_SPEND_EXCEEDED');
  assert.ok(at > -1);
  const branch = server.slice(at, at + 400);
  assert.match(branch, /const salvaged = await salvage\(/, 'it must ship what already passed validation');
  assert.doesNotMatch(branch, /continue;/, 'it must not re-enter the loop');
  // And it is decided before the transient classification, so an abort raised
  // while over budget cannot be read as retriable.
  assert.ok(at < server.indexOf('const retriable = e?.code === "OPENAI_EMPTY_OUTPUT"'));
});
