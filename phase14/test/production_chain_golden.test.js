import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { validateDirectGoalExposureSemantic } from '../engine/semantic_program_qa.js';
import { validateTacticalGppCoverageSemantic } from '../engine/coaching_progression_gpp.js';
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
  for (const violation of error?.details?.violations || []) {
    if (violation?.code) out.add(violation.code);
    if (violation?.type) out.add(violation.type);
  }
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

function expectValidatorFailure(fn, expectedCode) {
  assert.throws(
    fn,
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

function rewriteRows(program, fn) {
  return program.split('\n').map((line) => {
    if (!line.includes('\t')) return line;
    const cells = line.split('\t');
    return fn(cells, line).join('\t');
  }).join('\n');
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

test('Youth primary skills cannot repeat an unchanged prescription for all four weeks', () => {
  const bad = rewriteRows(youthGymnasticsGoldenProgram(), (cells) => {
    if (cells[1] === 'Controlled Handstand Kick-up') cells[3] = cells[0] === 'Mon' ? '4' : '5';
    if (cells[1] === 'Band-Assisted Bar Muscle-up Transition Drill') cells[2] = 'BW + moderate band';
    return cells;
  });
  expectFailure(bad, YOUTH_GYMNASTICS_INTAKE, 'PROGRESSION_ARCHITECTURE_MISSING');
});

test('Tactical missing GPP is repaired locally but unrelated strength-session defects still fail closed', () => {
  const bad = tactical3KGoldenProgram()
    .split('\n')
    .filter((line) => !line.includes('\tPush-up\t') && !line.includes('\tPallof Press\t'))
    .join('\n');

  // The semantic gate remains strict: the model-authored candidate is genuinely
  // missing the required low-cost push/core floor before production repair.
  expectValidatorFailure(
    () => validateTacticalGppCoverageSemantic(bad, TACTICAL_3K_INTAKE),
    'TACTICAL_GPP_COVERAGE_MISSING',
  );

  const collected = collectRepairableValidationFailures(bad, TACTICAL_3K_INTAKE);
  assert.ok(
    collected.deterministic_repairs.some((repair) => repair?.type === 'tactical_gpp_floor'),
    'Production must restore the canonical Tactical GPP floor before spending another AI attempt.',
  );
  const remaining = new Set((collected.flags || []).map((flag) => flag?.code));
  assert.equal(
    remaining.has('TACTICAL_GPP_COVERAGE_MISSING'),
    false,
    'The deterministic GPP repair must clear the exact defect it owns.',
  );
  assert.ok(
    remaining.has('TACTICAL_STRENGTH_SESSION_TOO_THIN'),
    `Expected unrelated thin-session defect to remain fail-closed; received ${[...remaining].join(', ')}`,
  );
});

test('Tactical 3K with only two strength days fails semantic strength-session accounting', () => {
  // Remove the entire Friday strength session. The long aerobic Run remains,
  // so Friday must not be counted as a third gym/strength day.
  const bad = tactical3KGoldenProgram()
    .split('\n')
    .filter((line) => !line.includes('\tDeadlift\t') && !line.includes('\tOverhead Press\t'))
    .join('\n');
  expectFailure(bad, TACTICAL_3K_INTAKE, 'SPORT_DAY_COUPLING_VIOLATION');
});

test('Tactical 3K cannot turn the direct ruck into a fourth run', () => {
  const bad = rewriteRows(tactical3KGoldenProgram(), (cells) => {
    if (cells[1] === 'Backpack Carry') {
      cells[1] = 'Run';
      cells[2] = 'Easy pace';
      cells[4] = '40 min';
      cells[6] = '4';
      cells[7] = 'Steady aerobic running.';
    }
    return cells;
  });
  expectFailure(bad, TACTICAL_3K_INTAKE, 'TARGET_MODALITY_EXPOSURE_REDUCED');
});

test('Tactical 3K cannot remove direct pull-up work while preserving three strength days', () => {
  const bad = rewriteRows(tactical3KGoldenProgram(), (cells) => {
    if (cells[1] === 'Weighted Pull-up') {
      cells[1] = 'Overhead Press';
      cells[2] = 'RPE-selected load';
      cells[3] = '3';
      cells[4] = '5';
      cells[5] = '3 min';
      cells[6] = '7';
      cells[7] = 'General strength maintenance.';
    }
    return cells;
  }).split('\n').filter((line) => !line.includes('\tPull-up\tBodyweight\t')).join('\n');
  expectFailure(bad, TACTICAL_3K_INTAKE, 'NAMED_GOAL_DIRECT_EXPOSURE_MISSING');
});

test('Youth bar muscle-up omission is rejected semantically then restored only for explicit acquisition intake', () => {
  const bad = rewriteRows(youthGymnasticsGoldenProgram(), (cells) => {
    if (cells[1] === 'Band-Assisted Bar Muscle-up Transition Drill') {
      cells[1] = 'Strict Pull-up';
      cells[2] = 'BW';
      cells[3] = '4';
      cells[4] = '5';
      cells[6] = '7';
    }
    return cells;
  });

  expectValidatorFailure(
    () => validateDirectGoalExposureSemantic(bad, YOUTH_GYMNASTICS_INTAKE),
    'NAMED_GOAL_DIRECT_EXPOSURE_MISSING',
  );

  const repaired = validateProductionProgram(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(repaired.ok, true);
  assert.match(
    repaired.program,
    /\tBar Muscle-up Transition Drill\t/,
    'Explicit first-bar-muscle-up acquisition may restore only the canonical bar-specific transition floor.',
  );
});

test('Youth independent-balance omission is rejected semantically then restored only for explicit acquisition intake', () => {
  const bad = youthGymnasticsGoldenProgram().replaceAll(
    '\tControlled Handstand Kick-up\tBW',
    '\tWall Handstand Hold\tBW',
  );

  expectValidatorFailure(
    () => validateDirectGoalExposureSemantic(bad, YOUTH_GYMNASTICS_INTAKE),
    'NAMED_GOAL_DIRECT_EXPOSURE_MISSING',
  );

  const repaired = validateProductionProgram(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(repaired.ok, true);
  assert.match(
    repaired.program,
    /\tControlled Handstand Kick-up\tBW/,
    'Explicit freestanding-handstand acquisition may restore the canonical fresh independent-balance floor.',
  );
});

test('Youth gymnastics fails closed on invented home-gym equipment', () => {
  const bad = youthGymnasticsGoldenProgram().replace(
    '\tPistol Squat\tBW\t3\t5 / side\t90s\t7',
    '\tCable Lateral Raise\tRPE-selected load\t3\t10\t60s\t7',
  );
  expectFailure(bad, YOUTH_GYMNASTICS_INTAKE, 'EQUIPMENT_VIOLATION');
});
