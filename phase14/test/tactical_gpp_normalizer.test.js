import test from 'node:test';
import assert from 'node:assert/strict';

import { tacticalGppAnalysis } from '../engine/coaching_progression_gpp.js';
import { normalizeTacticalGppFloor } from '../engine/tactical_gpp_normalizer.js';
import { TACTICAL_3K_INTAKE, tactical3KGoldenProgram } from './fixtures/golden_programs.js';

function withoutPushCoreFloor() {
  return tactical3KGoldenProgram()
    .split('\n')
    .filter((line) => {
      if (!line.includes('\t')) return true;
      const exercise = String(line.split('\t')[1] || '');
      return !['Push-up', 'Pallof Press', 'Overhead Press'].includes(exercise);
    })
    .join('\n');
}

test('Tactical GPP normalizer restores only the missing low-cost push/core floor on existing strength days', () => {
  const broken = withoutPushCoreFloor();
  const before = tacticalGppAnalysis(broken, TACTICAL_3K_INTAKE);
  assert.ok(before.violations.length > 0);
  assert.ok(before.violations.every((week) => week.missing.includes('push') && week.missing.includes('core')));

  const normalized = normalizeTacticalGppFloor(broken, TACTICAL_3K_INTAKE);
  assert.equal(normalized.repaired, true);
  assert.equal(normalized.repairs.filter((r) => r.exercise === 'Push-up').length, 4);
  assert.equal(normalized.repairs.filter((r) => r.exercise === 'Dead Bug').length, 4);

  const after = tacticalGppAnalysis(normalized.program, TACTICAL_3K_INTAKE);
  assert.deepEqual(after.violations, []);
  for (const week of after.weeks) {
    assert.equal(week.totals.push, 2);
    assert.equal(week.totals.core, 2);
    assert.equal(week.low_cost_support_sets, 4);
  }
  assert.doesNotMatch(normalized.program, /Burpee|EMOM|finisher/i);
});

test('Tactical GPP normalizer is idempotent after the floor is restored', () => {
  const once = normalizeTacticalGppFloor(withoutPushCoreFloor(), TACTICAL_3K_INTAKE);
  const twice = normalizeTacticalGppFloor(once.program, TACTICAL_3K_INTAKE);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});
