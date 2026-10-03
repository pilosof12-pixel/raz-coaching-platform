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
  // The bundle carries its repaired program on the error as repairedProgram.
  // This used to read sweepErr.program, which the bundle never sets, so every
  // salvage shipped the model's raw text: run #163's youth program reached the
  // customer with a stray column on all 84 rows that the bundle had removed.
  assert.match(runtime, /sweepErr\?\.repairedProgram/);
  assert.match(runtime, /if \(typeof repaired === "string" && repaired\) salvaged = repaired;/);
});

test('the bundle error really carries the repaired program under the name the salvage reads', async () => {
  const { validateRepairableProgramBundle } = await import('../engine/repairable_validation_bundle.js');
  const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  // Ten cells on every row: a shape the bundle repairs, inside a program it
  // still refuses for other reasons.
  const row = 'Mon\tBack Squat\t100 kg\t3\t5\t2 min\t7\tSteady.\t\t';
  const program = [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${header}\n${row}\nEND_WEEK${w}_TSV`).join('\n\n');
  let thrown = null;
  try { validateRepairableProgramBundle(program, { age: 30, primary_goals: ['Squat 140 kg'], days_per_week: 3 }); }
  catch (err) { thrown = err; }
  assert.ok(thrown, 'fixture must be refused');
  assert.equal(typeof thrown.repairedProgram, 'string');
  assert.ok(!/\t\t$/m.test(thrown.repairedProgram.split('END_WEEK1_TSV')[0]), 'the repaired program is the one with the row shape fixed');
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

test('the deadline and spend-cap salvage is swept and recorded the same way', () => {
  // It shipped lastValid -- the model's raw text -- with only the equipment
  // substitution, and recorded nothing about what was still wrong.
  const body = runtime.slice(runtime.indexOf('const salvage = async (why) => {'), runtime.indexOf('QA-SALVAGE-EARLY-SWEEP'));
  assert.ok(body.length > 0, 'early salvage present');
  assert.match(body, /validateRepairableProgramBundle\(program, intake\)/);
  assert.match(body, /sweepErr\?\.repairedProgram/);
  assert.match(body, /lastQaSalvage = \{ codes: unresolved/);
});

test('every program the build returns has been through the bundle', () => {
  // The two salvages were the only paths that returned text the bundle had not
  // repaired. Each remaining return is the bundle's own output.
  const fn = runtime.slice(runtime.indexOf('async function generateValidatedProgram('), runtime.indexOf('async function failJobSafely('));
  const returns = [...fn.matchAll(/return (reformatWarmupCells\(\w+\)|finished|repairedProgram|program);/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(returns)].sort(), ['finished', 'program', 'reformatWarmupCells(program)', 'reformatWarmupCells(salvaged)', 'repairedProgram'].sort());
});
