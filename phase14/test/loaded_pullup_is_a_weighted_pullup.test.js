// A pull-up carrying a belt is a weighted pull-up.
//
// Run #141 delivered a four-week block with no kilograms anywhere, for an
// athlete whose primary goal is a +40 kg weighted pull-up and who owns a 50 kg
// belt and a 32 kg x 3 benchmark. Four model calls, 464 seconds, delivered
// unresolved, and the same two flags on every attempt.
//
// The cause was a name. The model wrote the row as "Pull-up" with an added belt
// load. The benchmark is for the weighted variation, so the unbenchmarked-load
// repair read the bare name as unbenchmarked and stripped the load to
// "RPE-selected". PRIMARY_EXACT_MOVEMENT_MISSING then fired because no Weighted
// Pull-up row existed anywhere -- a flag our own repair had created.
//
// The load cell says which movement it is.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairUnbenchmarkedVariationLoads } from '../engine/phase15_elite_guardrails.js';
import { validatePhase15Program } from '../engine/phase15_program_qa.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));
const RUN141 = fs.readFileSync(path.join(here, 'fixtures/run141_advanced_calisthenics.txt'), 'utf8');

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows) => [1, 2, 3, 4]
  .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`).join('\n\n');
const rowFor = (p, note) => p.split('\n').map((l) => l.split('\t'))
  .find((c) => c.length === 9 && c[7] === note);

test('a bare pull-up with kilograms on it keeps its load and gains its name', () => {
  const p = block(['Mon\tPull-up\t29 kg\t3\t3\t4 min\t8\tbelt\t']);
  const out = repairUnbenchmarkedVariationLoads(p, INTAKE);
  const row = rowFor(out, 'belt');
  assert.equal(row[1], 'Weighted Pull-up');
  assert.equal(row[2], '29 kg', 'the athlete’s load must survive, not become RPE-selected');
});

test('a belt load with no number still names the movement', () => {
  const p = block(['Mon\tPull-up\tRPE-selected belt load\t3\t3\t4 min\t8\tbelt\t']);
  assert.equal(rowFor(repairUnbenchmarkedVariationLoads(p, INTAKE), 'belt')[1], 'Weighted Pull-up');
});

test('a bodyweight pull-up is left exactly as it is', () => {
  const p = block(['Mon\tPull-up\tBodyweight\t2\t5\t2 min\t6.5\tlight\t']);
  const row = rowFor(repairUnbenchmarkedVariationLoads(p, INTAKE), 'light');
  assert.equal(row[1], 'Pull-up');
  assert.equal(row[2], 'Bodyweight');
});

test('a movement that is already named is untouched', () => {
  const p = block(['Mon\tWeighted Pull-up\t29 kg\t3\t3\t4 min\t8\tnamed\t']);
  const row = rowFor(repairUnbenchmarkedVariationLoads(p, INTAKE), 'named');
  assert.equal(row[1], 'Weighted Pull-up');
  assert.equal(row[2], '29 kg');
});

test('a variation with no weighted benchmark still loses the assertive load', () => {
  // The old behaviour, and still right: an exact load on a variation the athlete
  // has no benchmark for is not something to keep by renaming it.
  const p = block(['Mon\tArcher Pull-up\t20 kg\t3\t3\t3 min\t8\tvariation\t']);
  const row = rowFor(repairUnbenchmarkedVariationLoads(p, INTAKE), 'variation');
  assert.equal(row[1], 'Archer Pull-up', 'no invented weighted variation');
  assert.equal(row[2], 'RPE-selected load');
});

test("run #141's block stops missing its own primary movement", () => {
  assert.throws(() => validatePhase15Program(RUN141, INTAKE), (err) => {
    assert.ok(err.flags.some((f) => f.code === 'PRIMARY_EXACT_MOVEMENT_MISSING'));
    return true;
  });
  const renamed = repairUnbenchmarkedVariationLoads(RUN141, INTAKE);
  assert.doesNotThrow(() => validatePhase15Program(renamed, INTAKE));
});

test('it is idempotent', () => {
  const p = block(['Mon\tPull-up\t29 kg\t3\t3\t4 min\t8\tbelt\t']);
  const once = repairUnbenchmarkedVariationLoads(p, INTAKE);
  assert.equal(repairUnbenchmarkedVariationLoads(once, INTAKE), once);
});
