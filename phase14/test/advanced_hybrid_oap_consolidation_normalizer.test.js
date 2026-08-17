import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAdvancedHybridWeek4OapConsolidation } from '../engine/advanced_hybrid_oap_consolidation_normalizer.js';
import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';

const intake = {
  age: 30,
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  maintenance_goals: ['Maintain muscle mass'],
  days_per_week: 4,
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport: 'MMA',
  sport_sessions_per_week: 5,
  current_numbers: [
    'Back Squat: 205 kg 1RM',
    'One-Arm Pull-up: 2 strict reps each arm',
    'Overhead Press: 80 kg x 4',
    'Running: 1 session a week, about 20 km total, longest recent run about 20 km',
  ].join('\n'),
  notes: 'Advanced hybrid athlete. Primary strength and calisthenics goals outrank the marathon side quest.',
};

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function row(day, exercise, weight, sets, reps, rpe, notes='') {
  return [day, exercise, weight, String(sets), String(reps), '3 min', String(rpe), notes, ''].join('\t');
}
function week(n, strictSets) {
  const squatHeavy = [165, 170, 175, 165][n - 1];
  const squatVolume = [145, 150, 155, 145][n - 1];
  const w4 = n === 4;
  const rows = [
    row('Mon', 'Back Squat', `${squatHeavy} kg`, w4 ? 2 : 3, '3', w4 ? '7' : n === 3 ? '8' : '7.5', 'Primary heavy squat exposure.'),
    row('Tue', 'Back Squat', `${squatVolume} kg`, w4 ? 1 : 2, '6', w4 ? '6.5' : '7', 'Lower-cost squat specificity exposure.'),
    row('Tue', 'Overhead Press', w4 ? '62.5 kg' : '65 kg', w4 ? 1 : 2, '5', w4 ? '6.5' : '7', 'Secondary press exposure.'),
    row('Fri', 'One-Arm Pull-up', 'BW', strictSets, '1 / arm', w4 ? '7' : '8', 'Strict quality singles, full reset between arms.'),
    row('Fri', 'Weighted Chin-up', '+45 kg', w4 ? 1 : 2, '5', w4 ? '6.5' : '7', 'Bilateral pull support.'),
    row('Sun', 'Assisted One-Arm Pull-up', 'Light band', w4 ? 2 : 3, '2 / arm', w4 ? '6' : '7', 'Clean assisted unilateral volume.'),
    row('Sun', 'Dumbbell Bench Press', 'RPE-selected load', w4 ? 1 : 2, '6', w4 ? '6' : '7', 'Low-cost upper support.'),
  ];
  return `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
}
function program(w4StrictSets = 4) {
  return [week(1, 3), week(2, 3), week(3, 3), week(4, w4StrictSets)].join('\n\n');
}

test('Advanced validator rejects Week 4 strict OAP set volume above Week 3', () => {
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(program(4), intake),
    (error) => error?.code === 'ADVANCED_HYBRID_WEEK4_OAP_VOLUME_INCREASED',
  );
});

test('deterministic Advanced repair caps Week 4 strict OAP volume at Week 3 without touching assisted work', () => {
  const bad = program(4);
  const fixed = normalizeAdvancedHybridWeek4OapConsolidation(bad, intake);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /START_WEEK4_TSV[\s\S]*Fri\tOne-Arm Pull-up\tBW\t3\t1 \/ arm/);
  assert.match(fixed.program, /Sun\tAssisted One-Arm Pull-up\tLight band\t2\t2 \/ arm/);
  assert.match(fixed.program, /Week 4 consolidation: retain Week 3 strict one-arm pull-up quality/i);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(fixed.program, intake));
});

test('Advanced repair is a no-op when Week 4 already holds or reduces strict OAP volume', () => {
  const good = program(3);
  const fixed = normalizeAdvancedHybridWeek4OapConsolidation(good, intake);
  assert.equal(fixed.repaired, false);
  assert.equal(fixed.program, good);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(good, intake));
});

test('non-numeric ambiguous Week 4 OAP set prescription is not guessed at', () => {
  const bad = program(4).replace(
    'Fri\tOne-Arm Pull-up\tBW\t4\t1 / arm',
    'Fri\tOne-Arm Pull-up\tBW\t3-4\t1 / arm',
  );
  const fixed = normalizeAdvancedHybridWeek4OapConsolidation(bad, intake);
  assert.equal(fixed.repaired, false);
  assert.equal(fixed.program, bad);
});
