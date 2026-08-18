import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAdvancedHybridOHPComplement } from '../engine/advanced_hybrid_ohp_normalizer.js';
import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE, advancedHybridLaunchProgram } from './fixtures/advanced_hybrid_launch.js';

function withoutPushPress(program) {
  return String(program)
    .split('\n')
    .filter((line) => !/^Sun\tPush Press\t/i.test(line))
    .join('\n');
}

function removeWeek2OHP(program) {
  let inWeek2 = false;
  return String(program).split('\n').filter((line) => {
    if (/START_WEEK2_TSV/.test(line)) inWeek2 = true;
    if (/END_WEEK2_TSV/.test(line)) inWeek2 = false;
    return !(inWeek2 && /^Tue\tOverhead Press\t/i.test(line));
  }).join('\n');
}

test('Advanced Hybrid OHP complement converges missing Push Press without changing strict OHP', () => {
  const raw = withoutPushPress(advancedHybridLaunchProgram());
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(raw, ADVANCED_HYBRID_LAUNCH_INTAKE),
    (error) => error?.code === 'ADVANCED_HYBRID_OHP_ARCHITECTURE',
  );

  const fixed = normalizeAdvancedHybridOHPComplement(raw, ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(fixed.repaired, true);
  assert.equal(fixed.repairs.length, 4);
  assert.equal((fixed.program.match(/\tPush Press\t/g) || []).length, 4);
  assert.equal((fixed.program.match(/\tOverhead Press\t/g) || []).length, 4);
  assert.match(fixed.program, /START_WEEK4_TSV[\s\S]*?\tPush Press\tRPE-selected load\t1\t3\t2-3 min\t6\t/);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(fixed.program, ADVANCED_HYBRID_LAUNCH_INTAKE));
});

test('normalizer is idempotent when Push Press already exists', () => {
  const original = advancedHybridLaunchProgram();
  const fixed = normalizeAdvancedHybridOHPComplement(original, ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(fixed.repaired, false);
  assert.equal(fixed.program, original);
});

test('normalizer fails closed when strict OHP itself is missing', () => {
  const raw = removeWeek2OHP(withoutPushPress(advancedHybridLaunchProgram()));
  const fixed = normalizeAdvancedHybridOHPComplement(raw, ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(fixed.repairs.some((r) => r.week === 2), false);
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(fixed.program, ADVANCED_HYBRID_LAUNCH_INTAKE),
    (error) => error?.code === 'ADVANCED_HYBRID_OHP_ARCHITECTURE',
  );
});

test('normalizer is a no-op outside high-concurrency hybrid intakes', () => {
  const raw = withoutPushPress(advancedHybridLaunchProgram());
  const intake = { ...ADVANCED_HYBRID_LAUNCH_INTAKE, sport_sessions_per_week: 0, sport_schedule: [] };
  const fixed = normalizeAdvancedHybridOHPComplement(raw, intake);
  assert.equal(fixed.repaired, false);
  assert.equal(fixed.program, raw);
});
