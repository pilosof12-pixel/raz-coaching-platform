import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectSecondaryCreepFlags, repairSecondaryVolumeCreep, buildSecondaryVolumeBrief,
} from '../engine/v66_secondary_volume_hold.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const GOOD = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
const INTAKE = JSON.parse(
  fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'),
).advanced_hybrid;

// Raise a secondary set count from Week 2 onward: the shape the rule exists for.
function bumpSecondaryAfterWeek1(program, by = 2) {
  const lines = program.split('\n');
  const end = lines.findIndex((l) => /END_WEEK1_TSV/.test(l));
  return lines.map((l, i) => {
    if (i <= end) return l;
    const c = l.split('\t');
    if (c.length > 6 && /^(Cable Row|Chest-Supported Row|Face Pull|Ring Push-up)$/i.test((c[1] || '').trim())) {
      const n = Number(String(c[3]).match(/\d+/)?.[0]);
      if (Number.isFinite(n)) c[3] = String(n + by);
    }
    return c.join('\t');
  }).join('\n');
}

const setsFor = (program, week, name) => {
  const p = parseWeek(program, week);
  return p.rows
    .filter((c) => String(c[p.exercise] || '').trim().toLowerCase() === name)
    .map((c) => Number(String(c[p.sets] || '').match(/\d+/)?.[0]) || 0);
};

test('a clean program raises nothing and is left byte-identical', () => {
  assert.equal(collectSecondaryCreepFlags(GOOD, INTAKE).length, 0);
  assert.equal(repairSecondaryVolumeCreep(GOOD, INTAKE), GOOD);
});

// Run #87 carried this code in all four attempts and it never cleared, because
// nothing could clear it. WEEKLY_MRV_EXCEEDED sat beside it and kept being
// trimmed; every other code in that run resolved attempt by attempt.
test('secondary volume rising against an advancing primary is flagged', () => {
  const flags = collectSecondaryCreepFlags(bumpSecondaryAfterWeek1(GOOD), INTAKE);
  assert.ok(flags.length >= 1);
  assert.equal(flags[0].code, 'V35_SECONDARY_VOLUME_CREEP');
});

test('the repair holds it and converges', () => {
  const bumped = bumpSecondaryAfterWeek1(GOOD);
  const fixed = repairSecondaryVolumeCreep(bumped, INTAKE);
  assert.equal(collectSecondaryCreepFlags(fixed, INTAKE).length, 0);
  assert.equal(repairSecondaryVolumeCreep(fixed, INTAKE), fixed, 'idempotent');
});

// The rule sums every row for the exercise in that week, so the reduction is
// spread across them. Deleting one of two sessions would change the training
// frequency the coach chose; halving both does not.
test('the week total is reduced without dropping a session', () => {
  const bumped = bumpSecondaryAfterWeek1(GOOD);
  const before = setsFor(bumped, 2, 'cable row');
  if (before.length < 2) return;
  const after = setsFor(repairSecondaryVolumeCreep(bumped, INTAKE), 2, 'cable row');
  assert.equal(after.length, before.length, 'every session survives');
  assert.ok(after.every((n) => n >= 1), 'no session is emptied');
  assert.ok(after.reduce((a, b) => a + b, 0) < before.reduce((a, b) => a + b, 0), 'the week total comes down');
});

test('the held row says why', () => {
  const fixed = repairSecondaryVolumeCreep(bumpSecondaryAfterWeek1(GOOD), INTAKE);
  assert.match(fixed, /secondary volume stays where it was/);
});

// Nothing but the set count moves.
test('exercise, load and reps are untouched', () => {
  const bumped = bumpSecondaryAfterWeek1(GOOD);
  const fixed = repairSecondaryVolumeCreep(bumped, INTAKE);
  const p1 = parseWeek(bumped, 2);
  const p2 = parseWeek(fixed, 2);
  assert.equal(p1.rows.length, p2.rows.length, 'no row added or removed');
  for (let i = 0; i < p1.rows.length; i += 1) {
    assert.equal(p2.rows[i][p2.exercise], p1.rows[i][p1.exercise]);
    assert.equal(p2.rows[i][p2.reps], p1.rows[i][p1.reps]);
    if (Number.isInteger(p1.load)) assert.equal(p2.rows[i][p2.load], p1.rows[i][p1.load]);
  }
});

test('the repair chain runs it and reports it', () => {
  const out = repairDeterministicContradictions(bumpSecondaryAfterWeek1(GOOD), INTAKE);
  assert.ok(out.repairs.some((r) => r.type === 'v66_secondary_volume_held'));
  assert.equal(collectSecondaryCreepFlags(out.program, INTAKE).length, 0);
});

test('the brief states the one-progression-at-a-time rule', () => {
  assert.match(buildSecondaryVolumeBrief(INTAKE), /hold at the previous week/i);
});
