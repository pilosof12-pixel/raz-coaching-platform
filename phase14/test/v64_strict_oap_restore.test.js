import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { validateRepairableProgramBundle } from '../engine/repairable_validation_bundle.js';

const GOOD = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
const stripStrict = (p) => p.split('\n').filter((l) => !/^\w+\tOne-Arm Pull-up\t/.test(l)).join('\n');

// The real acceptance intake. An abbreviated one fails validators that have
// nothing to do with this rule -- the first version of this test asserted a
// known-good program was broken, because the intake was missing fields those
// other validators need.
const INTAKE = JSON.parse(
  fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'),
).advanced_hybrid;

const gate = (program) => {
  try {
    return validateRepairableProgramBundle(program, INTAKE).ok;
  } catch (_) {
    return false;
  }
};

// Run #84 spent attempts 2, 3 and 4 on ADVANCED_HYBRID_OAP_SPECIFICITY and
// saved nothing. The assisted exposure had a repair; the strict one did not,
// so the gate refused with no way for the engine to answer it.
test('a week missing its strict exposure fails the gate', () => {
  assert.equal(gate(stripStrict(GOOD)), false);
});

test('the repair restores it and the program converges in one pass', () => {
  const out = repairDeterministicContradictions(stripStrict(GOOD), INTAKE);
  assert.ok(out.repairs.some((r) => r.type === 'v35_strict_oap_restored'));
  assert.equal(gate(out.program), true);
});

test('the restored row carries a real prescription', () => {
  const { program } = repairDeterministicContradictions(stripStrict(GOOD), INTAKE);
  const row = program.split('\n').find((l) => /^\w+\tOne-Arm Pull-up\t/.test(l)).split('\t');
  assert.equal(row[1], 'One-Arm Pull-up');
  assert.equal(row[3], '3', 'sets');
  assert.match(row[4], /per arm/, 'reps are per arm');
  assert.match(row[7], /dead hang/, 'and it says how to do it');
});

// It goes on a day the athlete already trains, never on a new one.
test('the restored row lands on an existing fixed strength day', () => {
  const { program } = repairDeterministicContradictions(stripStrict(GOOD), INTAKE);
  for (const line of program.split('\n').filter((l) => /^\w+\tOne-Arm Pull-up\t/.test(l))) {
    const day = line.split('\t')[0].trim();
    assert.ok(['Mon', 'Tue', 'Fri', 'Sun'].includes(day), `restored onto ${day}, not a stated gym day`);
  }
});

test('a sound program is left alone', () => {
  const out = repairDeterministicContradictions(GOOD, INTAKE);
  assert.equal(out.repairs.some((r) => r.type === 'v35_strict_oap_restored'), false);
  assert.equal(gate(GOOD), true);
});

test('the repair is idempotent', () => {
  const once = repairDeterministicContradictions(stripStrict(GOOD), INTAKE).program;
  assert.equal(repairDeterministicContradictions(once, INTAKE).program, once);
});

// Writing the row back is only safe because the athlete has shown the movement.
test('an athlete who has never done one is not given one', () => {
  const noBenchmark = { ...INTAKE, current_numbers: 'Back Squat: 205 kg 1RM' };
  const out = repairDeterministicContradictions(stripStrict(GOOD), noBenchmark);
  assert.equal(out.repairs.some((r) => r.type === 'v35_strict_oap_restored'), false);
});

// A missing row may be a coaching decision when pulling reproduces pain.
test('active pain that pulling reproduces blocks the restore', () => {
  const painful = {
    ...INTAKE,
    pain: { active: true, description: 'Sharp elbow pain on every pull-up', tolerated_movements: 'Pressing is fine' },
  };
  const out = repairDeterministicContradictions(stripStrict(GOOD), painful);
  assert.equal(out.repairs.some((r) => r.type === 'v35_strict_oap_restored'), false);
});
