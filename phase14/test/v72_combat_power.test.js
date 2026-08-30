import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectCombatPowerFlags, repairCombatPower, buildCombatPowerBrief, isPowerExposure, governsCombatPower,
} from '../engine/v72_combat_power.js';
import { classifyExercise } from '../engine/v38_movement_taxonomy.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const FIGHTER = COMP.mma_fight_camp;
const CAMP = fs.readFileSync(
  new URL('../../docs/qa/live-three-avatar/latest/mma_fight_camp-program.txt', import.meta.url), 'utf8',
);

test('only a combat block in camp is governed', () => {
  assert.equal(governsCombatPower(FIGHTER), true);
  assert.equal(governsCombatPower(COMP.weightlifter_peak), false);
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(governsCombatPower(intake), false, id);
    assert.equal(collectCombatPowerFlags('', intake).length, 0, id);
    assert.equal(buildCombatPowerBrief(intake), '', id);
  }
});

// The reviewed camp said "explosive" eighteen times and prescribed hip thrusts,
// rows, push-ups and pull-ups. Intent is not a prescription.
test('a camp with no speed exposure is flagged in every week', () => {
  const flags = collectCombatPowerFlags(CAMP, FIGHTER);
  assert.equal(flags.filter((f) => f.code === 'V72_COMBAT_NO_POWER_EXPOSURE').length, 4);
});

test('the repair adds one and converges, idempotently', () => {
  const fixed = repairCombatPower(CAMP, FIGHTER);
  assert.equal(collectCombatPowerFlags(fixed, FIGHTER).length, 0);
  assert.equal(repairCombatPower(fixed, FIGHTER), fixed);
});

// The exposure must satisfy the rule that demanded it. The first version
// prescribed a Trap Bar Jump the taxonomy classified as unknown, so the repair
// wrote a row its own rule could not see.
test('whatever the repair adds classifies as power', () => {
  const fixed = repairCombatPower(CAMP, FIGHTER);
  const p = parseWeek(fixed, 1);
  const added = p.rows
    .map((c) => String(c[p.exercise] || '').trim())
    .find((n) => isPowerExposure(n));
  assert.ok(added, 'a power exposure must be present');
  assert.equal(classifyExercise(added).category, 'power');
});

test('the exposure is chosen from what the athlete has', () => {
  const fixed = repairCombatPower(CAMP, FIGHTER);
  assert.match(fixed, /Trap Bar Jump/, 'this fighter has a trap bar');
  const noKit = { ...FIGHTER, equipment: 'A pull-up bar and a floor.' };
  assert.match(repairCombatPower(CAMP, noKit), /Box Jump/, 'fall back to something needing nothing');
});

// Speed work in a fight camp is chosen by eccentric cost.
test('high-eccentric plyometrics are refused in fight week', () => {
  const withDepth = CAMP.replace(
    /END_WEEK4_TSV/,
    'Tue\tDepth Jump\tBodyweight\t4\t5\t2 min\t8\tPlyos.\t\nEND_WEEK4_TSV',
  );
  const flags = collectCombatPowerFlags(withDepth, FIGHTER);
  assert.ok(flags.some((f) => f.code === 'V72_HIGH_COST_PLYOMETRIC_IN_FIGHT_WEEK'));
});

test('a depth jump never counts as the required exposure', () => {
  assert.equal(isPowerExposure('Depth Jump'), false);
  assert.equal(isPowerExposure('Box Jump'), true);
  assert.equal(isPowerExposure('Medicine Ball Rotational Throw'), true);
});

test('the brief demands a prescription rather than an adjective', () => {
  const brief = buildCombatPowerBrief(FIGHTER);
  assert.match(brief, /not an adjective/i);
  assert.match(brief, /rate-of-force/i);
  assert.match(brief, /Depth jumps, drop jumps and bounding/);
});
