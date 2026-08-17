import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE, advancedHybridLaunchProgram } from './fixtures/advanced_hybrid_launch.js';

test('golden Advanced Hybrid keeps Week 4 strict OAP volume consolidated', () => {
  const result = validateAdvancedHybridQualitySemantic(advancedHybridLaunchProgram(), ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(result.ok, true);
});

test('Week 4 cannot increase strict OAP sets while hiding behind lower aggregate accessory volume', () => {
  const candidate = advancedHybridLaunchProgram().replace(
    /START_WEEK4_TSV([\s\S]*?)Mon\tOne-Arm Pull-up\tBW\t4\t1 \/ arm/,
    (match, prefix) => `START_WEEK4_TSV${prefix}Mon\tOne-Arm Pull-up\tBW\t6\t1 / arm`,
  );
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(candidate, ADVANCED_HYBRID_LAUNCH_INTAKE),
    (error) => error?.code === 'ADVANCED_HYBRID_WEEK4_OAP_VOLUME_INCREASED',
  );
});
