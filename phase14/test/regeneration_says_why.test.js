// A build that regenerates should say what it is regenerating for.
//
// Run #137's calisthenics athlete reached attempt 3 -- two QA rejections -- and
// the run log recorded "regenerating after quality check" and nothing else. The
// codes existed in qaTrace at the time; the trace was only ever emitted on the
// way out, on a saved program or a salvage, and that build never had an end
// because a deploy restarted the service under it.
//
// So a failed, killed or still-running build now reports the same trace a
// successful one does, as it goes. The information was already being collected;
// it just never reached anyone who could act on it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = fs.readFileSync(path.join(root, '..', 'server.phase15.js'), 'utf8');

test('the regeneration progress carries the trace so far', () => {
  assert.match(runtime, /QA-TRACE-ON-REGENERATION/);
  assert.match(runtime, /regenerating after quality check\$\{qaSoFar\}/);
});

test('it reads the live trace, not the one kept for the exit paths', () => {
  // lastQaTrace is only assigned on success or salvage, so reading it here
  // would report nothing precisely when the build has no exit.
  const at = runtime.indexOf('QA-TRACE-ON-REGENERATION');
  const block = runtime.slice(Math.max(0, at - 400), at);
  assert.match(block, /qaTrace\.length/, 'must read the live array');
  assert.doesNotMatch(block, /lastQaTrace/, 'lastQaTrace is empty until the build ends');
});

test('a real client never sees internal codes', () => {
  const at = runtime.indexOf('QA-TRACE-ON-REGENERATION');
  const block = runtime.slice(Math.max(0, at - 400), at);
  assert.match(block, /qa_diagnostics === true/,
    'the trace is gated the same way every other trace output is');
});

test('the first attempt is still described plainly', () => {
  // There is no trace before the first call, and "initial generation [ ]" would
  // be noise.
  assert.match(runtime, /attempt === 1 \? "initial generation"/);
});
