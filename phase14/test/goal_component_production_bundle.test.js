import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import { validateGoalComponentCoverageSemantic } from '../engine/goal_progression_graph.js';
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

test('raw Youth component gate rejects missing wall capacity before production restores the explicit acquisition floor', () => {
  const kickUpOnly = youthGymnasticsGoldenProgram()
    .split('\n')
    .filter((line) => !isWallSupportedHandstandRow(line))
    .join('\n');

  assert.throws(
    () => validateGoalComponentCoverageSemantic(kickUpOnly, YOUTH_GYMNASTICS_INTAKE),
    (error) => {
      const codes = failureCodes(error);
      assert.ok(
        codes.has('GOAL_COMPONENT_COVERAGE_MISSING'),
        `Expected GOAL_COMPONENT_COVERAGE_MISSING; received ${[...codes].join(', ') || error?.message || 'unknown error'}`,
      );
      return true;
    },
  );

  const repaired = validateProductionProgram(kickUpOnly, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(repaired.ok, true);
  assert.match(
    repaired.program,
    /\tWall Handstand Hold\tBW/,
    'Production may restore the source-authored wall-supported capacity floor only for the explicit Youth acquisition state.',
  );
});

test('production repairable bundle still accepts the corrected Youth golden program', () => {
  const result = validateProductionProgram(youthGymnasticsGoldenProgram(), YOUTH_GYMNASTICS_INTAKE);
  assert.equal(result.ok, true);
});
