import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import {
  YOUTH_GYMNASTICS_INTAKE,
  youthGymnasticsGoldenProgram,
} from './fixtures/golden_programs.js';

function failureCodes(error) {
  const codes = new Set();
  if (error?.code) codes.add(error.code);
  for (const flag of error?.flags || []) if (flag?.code) codes.add(flag.code);
  for (const violation of error?.details?.violations || []) {
    if (violation?.code) codes.add(violation.code);
    if (violation?.type) codes.add(violation.type);
  }
  return codes;
}

function isWallSupportedHandstandRow(line) {
  const cells = String(line || '').split('\t');
  const exercise = String(cells[1] || '').toLowerCase();
  return exercise.includes('handstand') && exercise.includes('wall');
}

test('production repairable bundle rejects Youth handstand work that omits wall-supported capacity', () => {
  const kickUpOnly = youthGymnasticsGoldenProgram()
    .split('\n')
    .filter((line) => !isWallSupportedHandstandRow(line))
    .join('\n');

  assert.throws(
    () => validateProductionProgram(kickUpOnly, YOUTH_GYMNASTICS_INTAKE),
    (error) => {
      const codes = failureCodes(error);
      assert.ok(
        codes.has('GOAL_COMPONENT_COVERAGE_MISSING'),
        `Expected GOAL_COMPONENT_COVERAGE_MISSING; received ${[...codes].join(', ') || error?.message || 'unknown error'}`,
      );
      return true;
    },
  );
});

test('production repairable bundle still accepts the corrected Youth golden program', () => {
  const result = validateProductionProgram(youthGymnasticsGoldenProgram(), YOUTH_GYMNASTICS_INTAKE);
  assert.equal(result.ok, true);
});
