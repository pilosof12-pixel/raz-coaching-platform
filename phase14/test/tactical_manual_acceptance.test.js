import test from 'node:test';
import assert from 'node:assert/strict';

import { validateTacticalManualAcceptanceSemantic } from '../engine/tactical_manual_acceptance.js';
import { enrichSpecificWarmups } from '../engine/specific_warmup_enrichment.js';

const intake = {
  age: 27,
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'Improve strict pull-ups from 14 toward 18-20'],
  maintenance_goals: ['Maintain useful squat and deadlift strength while staying athletic'],
  notes: 'Combat-ready tactical athlete.',
  current_numbers: '3 km: 13:30\nWeighted Pull-up: +30 kg x 5\nStrict Pull-ups: 14 reps\n10 km ruck with 20 kg: 95 min',
};

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function row(day, exercise, weight, sets, reps, notes='') {
  return [day, exercise, weight, String(sets), String(reps), '2 min', '7', notes, ''].join('\t');
}
function week(n, opts={}) {
  const weightedExercise = opts.weightedExercise || 'Weighted Pull-up';
  const weightedLoad = opts.weightedLoad || '+15 kg';
  const weightedSets = opts.weightedSets ?? 4;
  const weightedReps = opts.weightedReps ?? 4;
  const rows = [
    opts.warmupNote ? row('Mon', '[WARMUP]', 'N/A', 1, '8 min', opts.warmupNote) : null,
    row('Mon', weightedExercise, weightedLoad, weightedSets, weightedReps, 'Weighted strength support.'),
    row('Fri', 'Pull-up', 'BW', 4, 6, 'Strict bodyweight quality volume.'),
    row('Sat', 'Backpack Carry', '20 kg', 1, '8 km', 'Controlled ruck walk.'),
  ].filter(Boolean);
  return `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
}
function program(opts={}) {
  return [1,2,3,4].map((n) => week(n, opts)).join('\n');
}

test('tactical manual acceptance requires explicit weighted pull identity and +kg load when benchmarked', () => {
  assert.doesNotThrow(() => validateTacticalManualAcceptanceSemantic(program(), intake));
  assert.throws(
    () => validateTacticalManualAcceptanceSemantic(program({ weightedExercise: 'Pull-up', weightedLoad: 'RPE-selected load' }), intake),
    (error) => error?.code === 'TACTICAL_WEIGHTED_PULL_EXPOSURE_AMBIGUOUS',
  );
});

test('tactical weighted pulling cannot repeat a demonstrated 5-rep benchmark as near-max multi-set volume', () => {
  assert.throws(
    () => validateTacticalManualAcceptanceSemantic(program({ weightedLoad: '+27.5 kg', weightedSets: 4, weightedReps: 5 }), intake),
    (error) => error?.code === 'TACTICAL_WEIGHTED_PULL_DOSE_TOO_CLOSE_TO_BENCHMARK',
  );
  assert.throws(
    () => validateTacticalManualAcceptanceSemantic(program({ weightedLoad: '+30 kg', weightedSets: 5, weightedReps: 5 }), intake),
    (error) => error?.code === 'TACTICAL_WEIGHTED_PULL_DOSE_TOO_CLOSE_TO_BENCHMARK',
  );
  assert.doesNotThrow(() => validateTacticalManualAcceptanceSemantic(program({ weightedLoad: '+27.5 kg', weightedSets: 4, weightedReps: 3 }), intake));
  assert.doesNotThrow(() => validateTacticalManualAcceptanceSemantic(program({ weightedLoad: '+22.5 kg', weightedSets: 4, weightedReps: 5 }), intake));
});

test('tactical manual acceptance rejects strength-style kg x reps ruck warm-up prose', () => {
  assert.throws(
    () => validateTacticalManualAcceptanceSemantic(program({ warmupNote: 'Ramp Backpack Carry: 7.5 kg x 5, 12.5 kg x 3, 15 kg x 1-2 before 20 kg work sets.' }), intake),
    (error) => error?.code === 'TACTICAL_RUCK_WARMUP_MISREPRESENTED',
  );
});

test('specific warm-up enrichment never creates a strength-style ramp for Backpack Carry', () => {
  const raw = [1,2,3,4].map((n) => `START_WEEK${n}_TSV\n${H}\n${row('Sat', 'Backpack Carry', '20 kg', 1, '8 km', 'Controlled ruck walk.')}\nEND_WEEK${n}_TSV`).join('\n');
  const enriched = enrichSpecificWarmups(raw);
  assert.doesNotMatch(enriched, /Ramp Backpack Carry/i);
  assert.match(enriched, /Sat\tBackpack Carry\t20 kg\t1\t8 km/);
});
