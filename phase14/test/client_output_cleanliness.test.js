import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clientOutputLeaks,
  validateClientOutputCleanliness,
} from '../engine/client_output_qa.js';
import {
  youthGymnasticsGoldenProgram,
  tactical3KGoldenProgram,
} from './fixtures/golden_programs.js';

test('known-good golden programs contain no client-facing internal QA artifacts', () => {
  for (const program of [youthGymnasticsGoldenProgram(), tactical3KGoldenProgram()]) {
    assert.deepEqual(clientOutputLeaks(program), []);
    assert.doesNotThrow(() => validateClientOutputCleanliness(program));
  }
});

test('review and support placeholders fail closed before client delivery', () => {
  const contaminated = [
    'Normal coaching intro.',
    '[REVIEW] duplicate skill row removed',
    'This exercise slot could not be safely generated, please contact support.',
  ].join('\n');

  assert.throws(
    () => validateClientOutputCleanliness(contaminated),
    (err) => {
      assert.equal(err.code, 'PHASE15_QUALITY_VIOLATION');
      assert.equal(err.details.boundary, 'client_output');
      const codes = err.details.leaks.map((leak) => leak.code);
      assert.ok(codes.includes('review_placeholder'));
      assert.ok(codes.includes('support_placeholder'));
      return true;
    },
  );
});

test('validator codes and internal QA traces can never appear in the paying-client program', () => {
  for (const contaminated of [
    'SPORT_DAY_COUPLING_VIOLATION',
    'WEEKLY_MRV_EXCEEDED',
    'NAMED_GOAL_DIRECT_EXPOSURE_MISSING',
    'QA trace: A1:EQUIPMENT_VIOLATION',
    'INTERNAL QUALITY REPAIR MODE',
    '<!-- QA_FORMULA_VIOLATION_COUNT: 2 -->',
  ]) {
    assert.throws(
      () => validateClientOutputCleanliness(contaminated),
      (err) => err.code === 'PHASE15_QUALITY_VIOLATION',
      contaminated,
    );
  }
});
