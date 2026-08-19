import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildAcceptanceQualityBrief,
  hardRunWarmupAnalysis,
  validateHardRunWarmupSemantic,
  validateYouthProgressionQualitySemantic,
  youthProgressionQualityAnalysis,
} from '../engine/coaching_acceptance_quality.js';
import {
  TACTICAL_3K_INTAKE,
  YOUTH_GYMNASTICS_INTAKE,
  tactical3KGoldenProgram,
  youthGymnasticsGoldenProgram,
} from './fixtures/golden_programs.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function weekBlock(week, rows) {
  return `START_WEEK${week}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${week}_TSV`;
}

function cosmeticYouthProgram() {
  return [1, 2, 3, 4].map((week) => weekBlock(week, [
    `Mon\tControlled Handstand Kick-up\tBW\t4\t2 attempts\t${45 + week * 15}s\tN/A\tWeek ${week}: same skill dose, rewritten coaching note.\t`,
    `Mon\tBand-Assisted Bar Muscle-up Transition Drill\tBW + moderate band\t4\t2\t${75 + week * 15}s\tN/A\tWeek ${week}: same assistance and reps, rewritten coaching note.\t`,
  ])).join('\n\n');
}

test('approved Youth golden has meaningful forward progression before consolidation', () => {
  const result = youthProgressionQualityAnalysis(youthGymnasticsGoldenProgram(), YOUTH_GYMNASTICS_INTAKE);
  assert.equal(result.applicable, true);
  assert.deepEqual(result.violations, []);
  const handstand = result.targets.find((x) => x.family === 'handstand');
  const muscleUp = result.targets.find((x) => x.family === 'bar_muscle_up');
  assert.ok(handstand?.meaningful_progression);
  assert.ok(muscleUp?.meaningful_progression);
  assert.ok(handstand.build_evidence.some((x) => x.axes.some((axis) => ['sets', 'target_volume', 'reps', 'duration'].includes(axis))));
  assert.ok(muscleUp.build_evidence.some((x) => x.axes.includes('less_assistance')));
});

test('Youth progression cannot be faked by changing only rest, RPE wording or Notes', () => {
  const bad = cosmeticYouthProgram();
  const analysis = youthProgressionQualityAnalysis(bad, YOUTH_GYMNASTICS_INTAKE);
  assert.ok(analysis.violations.some((x) => x.family === 'handstand'));
  assert.ok(analysis.violations.some((x) => x.family === 'bar_muscle_up'));
  assert.throws(
    () => validateYouthProgressionQualitySemantic(bad, YOUTH_GYMNASTICS_INTAKE),
    (error) => error?.code === 'YOUTH_PROGRESSION_QUALITY_MISSING',
  );
});

test('Youth acceptance brief makes progression visible in prescription fields and allows Week 4 consolidation', () => {
  const brief = buildAcceptanceQualityBrief(YOUTH_GYMNASTICS_INTAKE);
  assert.match(brief, /YOUTH VISIBLE PROGRESSION QUALITY/);
  assert.match(brief, /TSV prescription itself/i);
  assert.match(brief, /Rest-only, RPE-only/i);
  assert.match(brief, /Week 4 may consolidate/i);
  assert.match(brief, /assistance reduction/i);
  assert.match(brief, /independent balance/i);
});

test('approved Tactical golden contains specific preparation for every hard run', () => {
  const result = hardRunWarmupAnalysis(tactical3KGoldenProgram(), TACTICAL_3K_INTAKE);
  assert.equal(result.applicable, true);
  assert.ok(result.hard_runs.length >= 4);
  assert.deepEqual(result.violations, []);
});

test('live-like interval prescription without same-day running preparation fails closed', () => {
  const bad = tactical3KGoldenProgram().replace(/3K-specific interval session\. Keep every rep repeatable and add easy running before and after\./g, '3K interval work, focus on repeatable pace.');
  const analysis = hardRunWarmupAnalysis(bad, TACTICAL_3K_INTAKE);
  assert.ok(analysis.violations.length >= 1);
  assert.throws(
    () => validateHardRunWarmupSemantic(bad, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'HARD_RUN_WARMUP_MISSING',
  );
});

test('production patch script wires the new quality brief and validators into the generated runtime', () => {
  const src = fs.readFileSync(new URL('../scripts/apply_progression_gpp_coaching.mjs', import.meta.url), 'utf8');
  assert.match(src, /buildAcceptanceQualityBrief/);
  assert.match(src, /validateYouthProgressionQualitySemantic/);
  assert.match(src, /validateHardRunWarmupSemantic/);
  assert.match(src, /YOUTH_PROGRESSION_QUALITY_MISSING/);
  assert.match(src, /HARD_RUN_WARMUP_MISSING/);
});
