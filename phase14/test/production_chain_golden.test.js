import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import {
  TACTICAL_3K_INTAKE,
  YOUTH_GYMNASTICS_INTAKE,
  tactical3KGoldenProgram,
  youthGymnasticsGoldenProgram,
} from './fixtures/golden_programs.js';

function codesFrom(error) {
  const out = new Set();
  if (error?.code) out.add(error.code);
  for (const flag of error?.flags || []) if (flag?.code) out.add(flag.code);
  for (const violation of error?.details?.violations || []) if (violation?.type) out.add(violation.type);
  return out;
}

function expectFailure(program, intake, expectedCode) {
  assert.throws(
    () => validateProductionProgram(program, intake),
    (error) => {
      const codes = codesFrom(error);
      assert.ok(
        codes.has(expectedCode),
        `Expected ${expectedCode}; received ${[...codes].join(', ') || error?.message || 'unknown error'}`,
      );
      return true;
    },
  );
}

test('golden Youth gymnastics passes the full deterministic production validation chain', () => {
  const result = validateProductionProgram(youthGymnasticsGoldenProgram(), YOUTH_GYMNASTICS_INTAKE);
  assert.equal(result.ok, true);
  for (const week of result.model.weeks) {
    const strengthDays = week.days.filter((day) => day.sessions.some((s) => s.counts_toward_strength_frequency));
    assert.equal(strengthDays.length, 2);
  }
});

test('golden Tactical 3K passes the full deterministic production validation chain', () => {
  const result = validateProductionProgram(tactical3KGoldenProgram(), TACTICAL_3K_INTAKE);
  assert.equal(result.ok, true);
  for (const week of result.model.weeks) {
    const strengthDays = week.days.filter((day) => day.sessions.some((s) => s.counts_toward_strength_frequency));
    assert.equal(strengthDays.length, 3);
  }
});

test('Tactical 3K with only two strength days fails semantic strength-session accounting', () => {
  const bad = tactical3KGoldenProgram()
    .split('\n')
    .filter((line) => !line.includes('\tDeadlift\t'))
    .join('\n');
  expectFailure(bad, TACTICAL_3K_INTAKE, 'SPORT_DAY_COUPLING_VIOLATION');
});

test('Tactical 3K cannot turn the direct ruck into a fourth run', () => {
  const bad = tactical3KGoldenProgram().replaceAll(
    '\tBackpack Carry\t20 kg\t1\t70 min\tN/A\t5\tDirect ruck / loaded march at controlled walking pace; target pace 9:25-9:35 / km. Keep pack load stable and progress only one main ruck variable at a time.\t',
    '\tRun\tN/A\t1\t10 km\tN/A\t5\tSteady aerobic running.\t',
  );
  expectFailure(bad, TACTICAL_3K_INTAKE, 'TARGET_MODALITY_EXPOSURE_REDUCED');
});

test('Tactical 3K cannot remove direct pull-up work while preserving three strength days', () => {
  const bad = tactical3KGoldenProgram()
    .replaceAll('\tWeighted Pull-up\t+25 kg\t3\t5\t3 min\t7-8\tPulling-strength support below the demonstrated +30 kg x 5 benchmark.\t', '\tOverhead Press\t55 kg\t3\t5\t3 min\t7\tStrength maintenance.\t')
    .split('\n')
    .filter((line) => !line.includes('\tPull-up\tBodyweight\t'))
    .join('\n');
  expectFailure(bad, TACTICAL_3K_INTAKE, 'NAMED_GOAL_DIRECT_EXPOSURE_MISSING');
});

test('Youth gymnastics cannot omit direct bar muscle-up practice', () => {
  const bad = youthGymnasticsGoldenProgram().replaceAll(
    '\tBand-Assisted Bar Muscle-up Transition Drill\tBW + band\t4\t2\t90s\tN/A',
    '\tStrict Pull-up\tBW\t4\t5\t90s\t7',
  );
  expectFailure(bad, YOUTH_GYMNASTICS_INTAKE, 'NAMED_GOAL_DIRECT_EXPOSURE_MISSING');
});

test('Youth gymnastics cannot substitute wall holding for all independent-balance practice', () => {
  const bad = youthGymnasticsGoldenProgram().replaceAll(
    '\tControlled Handstand Kick-up\tBW',
    '\tWall Handstand Hold\tBW',
  );
  expectFailure(bad, YOUTH_GYMNASTICS_INTAKE, 'NAMED_GOAL_DIRECT_EXPOSURE_MISSING');
});

test('Youth gymnastics fails closed on invented home-gym equipment', () => {
  const bad = youthGymnasticsGoldenProgram().replace(
    '\tPistol Squat\tBW\t3\t5 / side\t90s\t7',
    '\tCable Lateral Raise\tRPE-selected load\t3\t10\t60s\t7',
  );
  expectFailure(bad, YOUTH_GYMNASTICS_INTAKE, 'EQUIPMENT_VIOLATION');
});
