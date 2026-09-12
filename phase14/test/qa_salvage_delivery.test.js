// Thirteen paid builds had a finished program in hand and threw it away.
//
// Every one of them reached the exhaustion tail through `if (lastValid)` --
// a complete, structurally valid four-week program, discarded in favour of
// "Please retry the build". The pipeline used to ship it after applying every
// deterministic correction it had; that fallback was replaced with a hard
// throw, and the dead-build class dates from the replacement.
//
// This asserts the delivered behaviour on the built runtime, and that nothing
// here became a general bypass: a build that never exhausted its attempts is
// validated exactly as before.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');

test('an exhausted build delivers the repaired candidate instead of discarding it', () => {
  assert.ok(!/err\.code = "INTERNAL_QA_REPAIR_EXHAUSTED";\s*\n\s*err\.qa_trace[\s\S]{0,40}throw err;/.test(runtime),
    'the tail must no longer throw away a program it is holding');
  assert.match(runtime, /QA-SALVAGE-TAIL/);
  assert.match(runtime, /return reformatWarmupCells\(salvaged\)/);
});

test('the candidate is swept through the deterministic chain before it ships', () => {
  // Delivering what the model last wrote would be worse than what we had. The
  // bundle hands back its improved program whether or not the flags cleared.
  assert.match(runtime, /const swept = validateRepairableProgramBundle\(salvaged, intake\)/);
  assert.match(runtime, /if \(typeof sweepErr\?\.program === "string" && sweepErr\.program\) salvaged = sweepErr\.program/);
});

test('the rules that stayed broken are recorded, not forgotten', () => {
  assert.match(runtime, /lastQaSalvage = \{/);
  assert.match(runtime, /codes: unresolved/);
  assert.match(runtime, /delivered with unresolved rules/);
  // Reset per build, so one salvage cannot leak into the next client's job.
  assert.match(runtime, /function resetBuildUsage\(\) \{\s*\n\s*lastQaSalvage = null;/);
});

test('the save boundary opens only for a salvage', () => {
  // A build that passed its attempts must take exactly the path it took before.
  assert.match(runtime, /if \(!lastQaSalvage\) throw finalErr;/);
  assert.match(runtime, /validatePhase15FinalProgram\(program, intake\); \/\/ SAVE-BOUNDARY-FINAL-QA/);
});

test('no validator was removed to make this work', () => {
  // The repair loop still runs every rule, still refuses, and still spends its
  // attempts. Salvage is what happens after all of that, not instead of it.
  assert.match(runtime, /const repairable = Boolean\(err && \(/);
  assert.match(runtime, /qaTrace\.push\(`A\$\{attempt\}:\$\{repairLabel\}/);
  assert.ok(runtime.includes('validateClientOutputCleanliness(program)'),
    'client output cleanliness still runs on the delivered program');
});
