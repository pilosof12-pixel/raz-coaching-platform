import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  collectRepairableValidationFailures,
  stripNonExerciseScheduleRows,
} from '../engine/repairable_validation_bundle.js';
import { TACTICAL_3K_INTAKE } from './fixtures/golden_programs.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function brokenWeek(week) {
  const rows = [
    ['Mon', 'Back Squat', 'RPE-selected load', '3', '5', '3 min', '7', 'Strength maintenance.', ''],
    ['Mon', 'Push-up', 'Bodyweight', '2', '15', '60s', '6', 'Low-cost push support.', ''],
    ['Tue', 'Run', '1:42-1:45 / 400 m', '6', '400 m', '2 min', '7-8', '3K intervals.', ''],
    ['Wed', 'Weighted Pull-up', '+25 kg', '3', '5', '3 min', '7-8', 'Pulling strength.', ''],
    ['Wed', 'Pull-up', 'Bodyweight', '2', '8', '2 min', '7', 'Strict pull-up capacity.', ''],
    ['Wed', 'Pallof Press', 'RPE-selected load', '2', '10 / side', '60s', '6', 'Trunk support.', ''],
    ['Thu', 'Ring Hamstring Curl', 'Bodyweight', '2', '10', '60s', '6', 'Posterior-chain support.', ''],
    ['Thu', 'Quantum Hamstring Curl', 'Bodyweight', '2', '8', '60s', '6', 'Deliberately invented QA exercise.', ''],
    ['Fri', 'Run', '5:30 / km', '1', '40 min', 'N/A', '4', 'Long aerobic run.', ''],
    ['Fri', 'Deadlift', 'RPE-selected load', '2', '3', '3 min', '7', 'Strength maintenance.', ''],
    ['Fri', 'Overhead Press', 'RPE-selected load', '2', '5', '2 min', '6-7', 'Push support.', ''],
    ['Sat', 'Backpack Carry', '20 kg', '1', '70 min', 'N/A', '5', 'Direct ruck.', ''],
    ['Sun', 'Rest', 'N/A', '0', 'N/A', 'N/A', 'N/A', 'Rest day.', ''],
  ];
  return [
    `START_WEEK${week}_TSV`,
    HEADER,
    ...rows.map((row) => row.join('\t')),
    `END_WEEK${week}_TSV`,
  ].join('\n');
}

function liveLikeBrokenProgram() {
  return [1, 2, 3, 4].map(brokenWeek).join('\n\n');
}

test('Rest and Off schedule markers are removed before exercise identity QA', () => {
  const stripped = stripNonExerciseScheduleRows(liveLikeBrokenProgram(), TACTICAL_3K_INTAKE);
  assert.doesNotMatch(stripped, /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\t(?:Rest|Rest Day|Off|Off Day|Recovery Day)\t/m);
  assert.match(stripped, /\tRun\t/);
  assert.match(stripped, /\tRing Hamstring Curl\t/);
  assert.match(stripped, /\tQuantum Hamstring Curl\t/);
});

test('live Tactical cascade is reported as one aggregate repair contract instead of fail-fast attempts', () => {
  const result = collectRepairableValidationFailures(liveLikeBrokenProgram(), TACTICAL_3K_INTAKE);
  assert.equal(result.ok, false);

  const codes = new Set(result.flags.map((flag) => flag.code));
  assert.ok(codes.has('EXERCISE_HALLUCINATION'), [...codes].join(', '));
  assert.ok(codes.has('PROGRESSION_ARCHITECTURE_MISSING'), [...codes].join(', '));
  assert.ok(codes.has('TACTICAL_SCHEDULE_ARCHITECTURE_VIOLATION'), [...codes].join(', '));

  const hallucination = result.flags.find((flag) => flag.code === 'EXERCISE_HALLUCINATION');
  const unknown = (hallucination?.details?.unknown || []).map((row) => row.exercise);
  assert.ok(unknown.includes('Quantum Hamstring Curl'), unknown.join(' | '));
  assert.ok(!unknown.includes('Ring Hamstring Curl'), unknown.join(' | '));
  assert.ok(!unknown.includes('Rest'), unknown.join(' | '));
});

test('aggregate runtime preserves the OpenAI direct-skill calibration guard', () => {
  const result = collectRepairableValidationFailures(
    liveLikeBrokenProgram(),
    TACTICAL_3K_INTAKE,
    { skipSkillCalibration: true },
  );
  assert.equal(result.skill_calibration_skipped, true);

  const patch = fs.readFileSync(new URL('../scripts/apply_aggregate_repair_validation.mjs', import.meta.url), 'utf8');
  assert.match(patch, /skipSkillCalibration: Boolean\(OPENAI_API_KEY\)/);
  assert.match(patch, /OPENAI-DIRECT-SKILL-CALIBRATION-GUARD/);
});
