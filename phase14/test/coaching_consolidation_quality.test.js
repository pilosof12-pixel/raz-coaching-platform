import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildConsolidationQualityBrief,
  validateYouthConsolidationRetentionSemantic,
  youthConsolidationRetentionAnalysis,
} from '../engine/coaching_consolidation_quality.js';
import { validateProductionProgram } from '../engine/production_validation.js';
import {
  YOUTH_GYMNASTICS_INTAKE,
  youthGymnasticsGoldenProgram,
} from './fixtures/golden_programs.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function singleExerciseBlock(exercise, prescriptions) {
  return prescriptions.map((p, index) => {
    const week = index + 1;
    const row = ['Mon', exercise, p.load || 'BW', p.sets, p.reps, '90s', '7', p.notes || '', ''].join('\t');
    return `START_WEEK${week}_TSV\n${HEADER}\n${row}\nEND_WEEK${week}_TSV`;
  }).join('\n\n');
}

test('approved Youth golden consolidates Week 4 without erasing the Week 2-3 standard', () => {
  const program = youthGymnasticsGoldenProgram();
  const analysis = youthConsolidationRetentionAnalysis(program, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(analysis.applicable, true);
  assert.equal(analysis.waived, false);
  assert.deepEqual(analysis.violations, []);
  assert.equal(validateProductionProgram(program, YOUTH_GYMNASTICS_INTAKE).ok, true);
});

test('Week 4 cannot reset a progressed bodyweight rep target to Week 1', () => {
  const bad = singleExerciseBlock('Strict Ring Dip', [
    { sets: '3', reps: '5' },
    { sets: '3', reps: '6' },
    { sets: '3', reps: '7' },
    { sets: '3', reps: '5', notes: 'Consolidation week.' },
  ]);
  const analysis = youthConsolidationRetentionAnalysis(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(analysis.violations.length, 1);
  assert.ok(analysis.violations[0].scalar_retention_failures.some((x) => x.axis === 'reps'));
  assert.throws(
    () => validateYouthConsolidationRetentionSemantic(bad, YOUTH_GYMNASTICS_INTAKE),
    (error) => error?.code === 'YOUTH_CONSOLIDATION_RESET_TO_BASELINE',
  );
});

test('Week 4 may reduce sets while retaining the improved rep standard', () => {
  const good = singleExerciseBlock('Strict Ring Dip', [
    { sets: '3', reps: '5' },
    { sets: '3', reps: '6' },
    { sets: '3', reps: '7' },
    { sets: '2', reps: '6-7', notes: 'Reduce fatigue while retaining the higher clean rep standard.' },
  ]);
  assert.deepEqual(youthConsolidationRetentionAnalysis(good, YOUTH_GYMNASTICS_INTAKE).violations, []);
});

test('assistance progression cannot return to the Week 1 band in Week 4', () => {
  const bad = singleExerciseBlock('Band-Assisted Bar Muscle-up Transition Drill', [
    { load: 'BW + moderate band', sets: '4', reps: '2' },
    { load: 'BW + lighter band', sets: '4', reps: '2' },
    { load: 'BW + lightest band', sets: '4', reps: '2' },
    { load: 'BW + moderate band', sets: '3', reps: '2', notes: 'Consolidation week.' },
  ]);
  const analysis = youthConsolidationRetentionAnalysis(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(analysis.violations.length, 1);
  assert.ok(analysis.violations[0].scalar_retention_failures.some((x) => x.axis === 'less_assistance'));
});

test('assisted skill may reduce Week 4 volume while retaining the best clean Week 3 band', () => {
  const good = singleExerciseBlock('Band-Assisted Bar Muscle-up Transition Drill', [
    { load: 'BW + moderate band', sets: '4', reps: '2' },
    { load: 'BW + lighter band', sets: '4', reps: '2' },
    { load: 'BW + lightest band', sets: '4', reps: '2' },
    { load: 'BW + retain the Week 3 lightest clean band', sets: '3', reps: '2', notes: 'Preserve the best clean Week 3 turnover with fewer sets.' },
  ]);
  assert.deepEqual(youthConsolidationRetentionAnalysis(good, YOUTH_GYMNASTICS_INTAKE).violations, []);
});

test('volume-only skill build needs an explicit Week 4 quality-retention target', () => {
  const bad = singleExerciseBlock('Controlled Handstand Kick-up', [
    { sets: '4', reps: '2 attempts', notes: 'Practice clean entries.' },
    { sets: '5', reps: '2 attempts', notes: 'Practice clean entries.' },
    { sets: '6', reps: '2 attempts', notes: 'Practice clean entries.' },
    { sets: '4', reps: '2 attempts', notes: 'Consolidation week.' },
  ]);
  const badAnalysis = youthConsolidationRetentionAnalysis(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.equal(badAnalysis.violations.length, 1);
  assert.equal(badAnalysis.violations[0].skill_quality_reset, true);

  const good = bad.replace('Consolidation week.', 'Match or improve the best Week 3 independent balance quality with fewer attempts.');
  assert.deepEqual(youthConsolidationRetentionAnalysis(good, YOUTH_GYMNASTICS_INTAKE).violations, []);
});

test('active pain context can justify a larger consolidation regression', () => {
  const program = singleExerciseBlock('Strict Ring Dip', [
    { sets: '3', reps: '5' },
    { sets: '3', reps: '6' },
    { sets: '3', reps: '7' },
    { sets: '2', reps: '5' },
  ]);
  const intake = { ...YOUTH_GYMNASTICS_INTAKE, pain: { active: true, description: 'Active shoulder pain flare.' } };
  const analysis = youthConsolidationRetentionAnalysis(program, intake);
  assert.equal(analysis.waived, true);
  assert.deepEqual(analysis.violations, []);
});

test('generation brief explicitly separates fatigue reduction from capability reset', () => {
  const brief = buildConsolidationQualityBrief(YOUTH_GYMNASTICS_INTAKE);
  assert.match(brief, /CONSOLIDATION \/ EXPRESSION/);
  assert.match(brief, /reduce sets\/attempts first/i);
  assert.match(brief, /3x5 -> 3x6 -> 3x7/i);
  assert.match(brief, /not return to the moderate band/i);
  assert.match(brief, /best Week-3/i);
});

test('production patch wires consolidation brief, validator and repairable error into runtime', () => {
  const src = fs.readFileSync(new URL('../scripts/apply_progression_gpp_coaching.mjs', import.meta.url), 'utf8');
  assert.match(src, /buildConsolidationQualityBrief/);
  assert.match(src, /validateYouthConsolidationRetentionSemantic/);
  assert.match(src, /YOUTH-WEEK4-CONSOLIDATION-RETENTION/);
  assert.match(src, /YOUTH_CONSOLIDATION_RESET_TO_BASELINE/);
});
