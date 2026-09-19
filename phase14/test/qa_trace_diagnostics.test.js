// The trace that says why a build was slow must survive a build that succeeded.
//
// Run #119 took three model calls and 638 seconds and left the number three as
// its only record. qaTrace already distinguishes a quality regeneration
// (A2:<rule>) from an aborted request at the timeout ceiling (T1:request_ceiling)
// and from an empty output retried -- three causes with three different fixes --
// but it was attached to errors and read on the salvage path only, so every
// build that succeeded discarded it. A successful slow build is exactly the one
// worth diagnosing.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = fs.readFileSync(path.join(here, '..', 'server.phase15.js'), 'utf8');

test('the trace is captured on every exit from the generator, not just salvage', () => {
  for (const marker of ['QA-TRACE-DIAGNOSTICS-SUCCESS', 'QA-TRACE-DIAGNOSTICS-FASTPATH', 'QA-TRACE-DIAGNOSTICS-SALVAGE']) {
    assert.ok(runtime.includes(marker), `${marker} missing: that exit still drops the trace`);
  }
});

test('it is reset per build, like the salvage record beside it', () => {
  assert.match(runtime, /lastQaSalvage = null;\s*\n\s*lastQaTrace = null;/);
});

test('a client build says exactly what it said before', () => {
  // The suffix is gated on the intake asking for diagnostics. Acceptance runs
  // set qa_diagnostics: true; a paying client does not, and their job detail
  // must not start carrying rule names.
  assert.match(runtime, /intake && intake\.qa_diagnostics === true && Array\.isArray\(lastQaTrace\)/);
  const line = runtime.split('\n').find((l) => l.includes('saving program after'));
  assert.ok(line.includes('${qaTraceSuffix}'), 'the suffix is not on the detail that result.json records');
});

test('it cannot change a delivered program', () => {
  // Every write is to lastQaTrace or to a progress string. If this assertion
  // ever needs relaxing, the patch has grown past what it was allowed to do.
  const patch = fs.readFileSync(path.join(here, '..', 'scripts', 'apply_qa_trace_diagnostics.mjs'), 'utf8');
  assert.ok(!/\bprogram\s*=/.test(patch.replace(/^\s*\/\/.*$/gm, '')),
    'the patch assigns to program; it is only allowed to record what happened');
});
