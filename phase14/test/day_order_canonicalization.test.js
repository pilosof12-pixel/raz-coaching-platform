// A week has to print in the order it is trained.
//
// The adjacency and spread repairs move a session by relabelling the weekday it
// carries -- nothing added, removed or de-loaded, which is the whole point. But
// they relabel in place, so run #138's corrected block came out of the chain
// reading Mon / Wed / Tue / Fri / Sat. The training was right and the artifact
// was out of order.
//
// That is not cosmetic. Weekly sequence is how a coach reads recovery spacing,
// and no reviewer should have to reorder the microcycle in their head before
// judging whether two hard days sit too close together.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicaliseDayOrder } from '../engine/day_order_canonicalization.js';
import { validateRepairableProgramBundle } from '../engine/repairable_validation_bundle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DELIVERED = fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics.txt'), 'utf8');
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const wk = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

const orderOf = (program, week) => {
  const block = program.match(new RegExp(`START_WEEK${week}_TSV([\\s\\S]*?)END_WEEK${week}_TSV`))[1];
  const seen = [];
  for (const line of block.split('\n')) {
    const day = line.split('\t')[0];
    if (!day || day === 'Day' || !line.includes('\t')) continue;
    if (seen[seen.length - 1] !== day) seen.push(day);
  }
  return seen;
};

test('an out-of-order week is printed in training order', () => {
  const scrambled = wk(1, [
    'Mon\tWeighted Pull-up\t28 kg\t4\t4\t2:30\t8\tPrimary.\t',
    'Wed\tRing Push-up\tBodyweight\t3\t10\t1:30\t7\tPressing.\t',
    'Tue\tFreestanding Handstand Hold\tBodyweight\t5\t20s\t1:30\t6\tSkill.\t',
    'Sat\tInverted Row\tBodyweight\t3\t12\t1:30\t7\tPulling.\t',
    'Fri\tDip\tRPE-selected load\t3\t8\t2:00\t7\tPressing.\t',
  ]);
  assert.deepEqual(orderOf(scrambled, 1), ['Mon', 'Wed', 'Tue', 'Sat', 'Fri'], 'fixture must start scrambled');

  const { program, changed } = canonicaliseDayOrder(scrambled);
  assert.equal(changed, true);
  assert.deepEqual(orderOf(program, 1), ['Mon', 'Tue', 'Wed', 'Fri', 'Sat']);
});

test('rows keep their order inside a day', () => {
  const scrambled = wk(1, [
    'Wed\tRing Push-up\tBodyweight\t3\t10\t1:30\t7\tFirst.\t',
    'Wed\tInverted Row\tBodyweight\t3\t10\t1:30\t7\tSecond.\t',
    'Wed\tPlank\tBodyweight\t2\t40s\t1:00\t6\tThird.\t',
    'Mon\tWeighted Pull-up\t28 kg\t4\t4\t2:30\t8\tPrimary.\t',
  ]);
  const { program } = canonicaliseDayOrder(scrambled);
  const wed = program.split('\n').filter((l) => /^Wed\t/.test(l)).map((l) => l.split('\t')[1]);
  assert.deepEqual(wed, ['Ring Push-up', 'Inverted Row', 'Plank']);
});

test('a block that does not label by weekday is left exactly as written', () => {
  const sessions = wk(1, [
    'Session B\tWeighted Pull-up\t28 kg\t4\t4\t2:30\t8\tPrimary.\t',
    'Session A\tRing Push-up\tBodyweight\t3\t10\t1:30\t7\tPressing.\t',
  ]);
  const { program, changed } = canonicaliseDayOrder(sessions);
  assert.equal(changed, false);
  assert.equal(program, sessions);
});

test("run #138's repaired block reads Mon Tue Wed Fri Sat", () => {
  const out = validateRepairableProgramBundle(DELIVERED, INTAKE);
  assert.equal(out.ok, true);
  for (let week = 1; week <= 4; week += 1) {
    const order = orderOf(out.program, week);
    const sorted = [...order].sort(
      (a, b) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(a)
        - ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(b),
    );
    assert.deepEqual(order, sorted, `week ${week} prints out of training order`);
  }
});
