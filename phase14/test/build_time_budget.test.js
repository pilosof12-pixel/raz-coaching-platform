// Run #132 spent forty minutes and was still going.
//
// Nothing was wrong with any single component. The build budget was 29 minutes,
// the request ceiling 600s, and the repair budget 4 attempts -- and 4 x 600s is
// exactly the 40 minutes observed. Latency was whatever that product happened
// to be, because no wall clock bounded the build as a whole.
//
// Two defects, and the second is the one that cost real money:
//
//   The request ceiling ignored the budget that owned it. A call starting one
//   minute before the deadline still ran a full ten past it, so the 29-minute
//   budget was really 39.
//
//   Reaching the deadline threw BUILD_TIMEOUT, which discards `lastValid` -- a
//   program that had already passed structural validation and was only waiting
//   on a polish attempt. The athlete got an error and an invitation to retry,
//   and the credits already spent bought nothing at all. The salvage path at
//   the bottom of the same function does the right thing and the deadline
//   branch never reached it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const server = fs.readFileSync(path.join(root, '..', 'server.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, '..', 'server.phase15.js'), 'utf8');

test('the build budget bounds the wall clock a user can wait', () => {
  const m = runtime.match(/BUILD_JOB_TIMEOUT_MS\s*\|\|\s*\(OPENAI_API_KEY\s*\?\s*(\d+)/);
  assert.ok(m, 'the production budget must be readable from the built runtime');
  const budgetMin = Number(m[1]) / 60000;
  assert.ok(
    budgetMin <= 20,
    `a build may not be allowed to run for ${budgetMin} minutes; run #132 did exactly that`,
  );
});

test('a request cannot outlive the budget that owns it', () => {
  assert.match(
    runtime,
    /setTimeout\(\(\)\s*=>\s*controller\.abort\(\),\s*currentRequestCeilingMs\(\)\)/,
    'the abort timer must read the remaining budget, not a fixed ceiling',
  );
  assert.match(runtime, /function currentRequestCeilingMs\(\)/);
  // And it must never fire a call so short it is certain to abort.
  assert.match(runtime, /Math\.max\(60000,\s*Math\.min\(AI_REQUEST_TIMEOUT_MS/);
});

test('the runtime is told which deadline is in force', () => {
  assert.match(server, /setBuildDeadline\(deadline\)/);
  assert.match(runtime, /function setBuildDeadline\(at\)/);
});

test('reaching the deadline ships the program instead of discarding it', () => {
  const fn = server.slice(
    server.indexOf('async function generateValidatedProgram'),
    server.indexOf('async function generateValidatedProgram') + 4000,
  );
  assert.match(fn, /const salvaged = await salvage\(/, 'the deadline branch must try to salvage first');
  const salvageAt = fn.indexOf('const salvaged = await salvage(');
  const throwAt = fn.indexOf('err.code = "BUILD_TIMEOUT"');
  assert.ok(salvageAt > -1 && throwAt > -1 && salvageAt < throwAt,
    'BUILD_TIMEOUT may only be thrown after salvage has been attempted');
  assert.match(fn, /if \(salvaged\) return salvaged;/);
});

test('the salvage applies the same deterministic corrections as the normal path', () => {
  // Otherwise a timed-out build ships a program carrying defects the ordinary
  // fall-through would have substituted away.
  const start = server.indexOf('const salvage = async');
  assert.ok(start > -1, 'salvage helper must exist');
  const fn = server.slice(start, start + 500);
  assert.match(fn, /hardSubstitute\(code, program, intake\)/);
  assert.match(fn, /reformatWarmupCells\(program\)/);
});
