import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAdvancedHybridAdjacentPulling } from '../engine/advanced_hybrid_pull_spacing_normalizer.js';
import { validateAdvancedHybridCoachingSpecV1 } from '../engine/coaching_spec_v1_quality.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function block(week, rows) {
  return `START_WEEK${week}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${week}_TSV`;
}
function fourWeeks(rows) {
  return [1, 2, 3, 4].map((week) => block(week, rows)).join('\n\n');
}

const intake = {
  age: 30,
  days_per_week: 4,
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport_sessions_per_week: 5,
  sport: 'MMA / grappling 5 sessions per week',
  primary_goals: ['Back Squat 220 kg', '4 strict One-Arm Pull-ups'],
  secondary_goals: ['Overhead Press 100 kg', 'Marathon pathway'],
  maintenance_goals: ['Maintain muscle'],
  current_numbers: 'Back Squat 205 kg 1RM | One-Arm Pull-up 2 strict each arm | Weighted Chin-up +80 kg 1RM | Overhead Press 80 kg x 4',
};

test('AH-04 normalizer preserves strict OAP and converts adjacent assisted work to a technical microdose', () => {
  const original = fourWeeks([
    'Mon\tOne-Arm Pull-up\tBodyweight\t5\t1 per arm\t2-3 min\t8\tPrimary strict singles.\t',
    'Tue\tAssisted One-Arm Pull-up\tMinimum assistance\t4\t2 per arm\t2-3 min\t7.5\tAssisted volume.\t',
  ]);

  assert.throws(
    () => validateAdvancedHybridCoachingSpecV1(original, intake),
    (err) => err?.code === 'COACH_SPEC_V1_AH_ADJACENT_HIGH_STRESS_PULLING',
  );

  const repaired = normalizeAdvancedHybridAdjacentPulling(original, intake);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.repairs.length, 4);
  assert.match(repaired.program, /Mon\tOne-Arm Pull-up\tBodyweight\t5\t1 per arm\t2-3 min\t8\tPrimary strict singles\./);
  assert.match(repaired.program, /Tue\tAssisted One-Arm Pull-up\tMinimum assistance\t2\t1 per arm\t2-3 min\t6-6\.5\t/);
  assert.equal(validateAdvancedHybridCoachingSpecV1(repaired.program, intake).ok, true);
});

test('AH-04 normalizer trims adjacent weighted bilateral support before strict OAP specificity', () => {
  const original = fourWeeks([
    'Mon\tOne-Arm Pull-up\tBodyweight\t4\t1 per arm\t3 min\t8\tPrimary strict work.\t',
    'Tue\tWeighted Chin-up\t+45 kg\t3\t3\t2-3 min\t8.5\tSecondary bilateral support.\t',
  ]);

  const repaired = normalizeAdvancedHybridAdjacentPulling(original, intake);
  assert.equal(repaired.repaired, true);
  assert.match(repaired.program, /Mon\tOne-Arm Pull-up\tBodyweight\t4\t1 per arm\t3 min\t8\tPrimary strict work\./);
  assert.match(repaired.program, /Tue\tWeighted Chin-up\t\+45 kg\t2\t3\t2-3 min\t6-6\.5\t/);
  assert.equal(validateAdvancedHybridCoachingSpecV1(repaired.program, intake).ok, true);
});

test('AH-04 normalizer is idempotent after the adjacent conflict is removed', () => {
  const original = fourWeeks([
    'Mon\tOne-Arm Pull-up\tBodyweight\t5\t1 per arm\t2-3 min\t8\tPrimary strict singles.\t',
    'Tue\tAssisted One-Arm Pull-up\tMinimum assistance\t4\t2 per arm\t2-3 min\t7.5\tAssisted volume.\t',
  ]);
  const first = normalizeAdvancedHybridAdjacentPulling(original, intake);
  const second = normalizeAdvancedHybridAdjacentPulling(first.program, intake);
  assert.equal(first.repaired, true);
  assert.equal(second.repaired, false);
  assert.equal(second.program, first.program);
});
