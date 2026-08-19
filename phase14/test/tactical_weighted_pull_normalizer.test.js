import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTacticalWeightedPullExposure } from '../engine/tactical_weighted_pull_normalizer.js';
import { validateTacticalManualAcceptanceSemantic } from '../engine/tactical_manual_acceptance.js';

const intake = {
  age: 27,
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve strict pull-ups from 14 toward 18-20'],
  maintenance_goals: ['Maintain useful squat strength'],
  notes: 'Combat-ready tactical athlete.',
  current_numbers: 'Weighted Pull-up: +30 kg x 5\nStrict Pull-ups: 14 reps\n3 km: 13:30',
};

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function block(week, weightedRow = '') {
  const rows = [
    `Mon\t[WARMUP]\tN/A\t1\t8 min\tN/A\t3\tGeneral prep.\t`,
    `Mon\tBack Squat\t120 kg\t3\t5\t3 min\t7\tMaintenance strength.\t`,
    weightedRow,
    `Wed\tPull-up\tBodyweight\t4\t8\t2 min\t7\tStrict bodyweight volume.\t`,
    `Tue\tRun\t1:42 per 400 m\t5\t400 m\t2 min\t8\t3K intervals.\t`,
  ].filter(Boolean);
  return `START_WEEK${week}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${week}_TSV`;
}
function program(weightedRow = '') { return [1,2,3,4].map((w) => block(w, weightedRow)).join('\n'); }

test('inserts a canonical submaximal weighted pull floor when exposure is absent', () => {
  const raw = program();
  const fixed = normalizeTacticalWeightedPullExposure(raw, intake);
  assert.equal(fixed.repaired, true);
  assert.equal((fixed.program.match(/\tWeighted Pull-up\t\+22\.5 kg\t3\t4\t/g) || []).length, 4);
  assert.doesNotThrow(() => validateTacticalManualAcceptanceSemantic(fixed.program, intake));
});

test('reduces near-benchmark multi-set weighted pulling instead of copying the benchmark', () => {
  const raw = program('Mon\tWeighted Pull-up\t+30 kg\t5\t5\t3 min\t9\tToo close to benchmark.\t');
  assert.throws(
    () => validateTacticalManualAcceptanceSemantic(raw, intake),
    (error) => error?.code === 'TACTICAL_WEIGHTED_PULL_DOSE_TOO_CLOSE_TO_BENCHMARK',
  );
  const fixed = normalizeTacticalWeightedPullExposure(raw, intake);
  assert.match(fixed.program, /\tWeighted Pull-up\t\+22\.5 kg\t3\t4\t2?3? ?min?/i);
  assert.doesNotThrow(() => validateTacticalManualAcceptanceSemantic(fixed.program, intake));
});

test('converts ambiguous same-day generic loaded pull-up instead of adding duplicate pulling volume', () => {
  const raw = program('Mon\tPull-up\tRPE-selected load\t4\t5\t3 min\t8\tWeighted support.\t');
  const fixed = normalizeTacticalWeightedPullExposure(raw, intake);
  assert.equal((fixed.program.match(/\tWeighted Pull-up\t/g) || []).length, 4);
  assert.equal((fixed.program.match(/Mon\tPull-up\tRPE-selected load/g) || []).length, 0);
  assert.doesNotThrow(() => validateTacticalManualAcceptanceSemantic(fixed.program, intake));
});

test('is idempotent for an already safe explicit weighted exposure', () => {
  const raw = program('Mon\tWeighted Pull-up\t+22.5 kg\t3\t4\t3 min\t7.5\tSubmaximal support.\t');
  const fixed = normalizeTacticalWeightedPullExposure(raw, intake);
  assert.equal(fixed.repaired, false);
  assert.equal(fixed.program, raw);
});
