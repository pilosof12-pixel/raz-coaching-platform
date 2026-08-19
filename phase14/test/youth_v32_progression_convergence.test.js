import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeYouthSkillAcquisitionQuality } from '../engine/coaching_spec_v1_convergence_normalizer.js';
import { validateProgressionArchitectureSemantic } from '../engine/coaching_progression_gpp.js';
import { validateYouthProgressionQualitySemantic } from '../engine/coaching_acceptance_quality.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const fourWeeks = (rows) => [1, 2, 3, 4].map((w) => block(w, rows(w))).join('\n\n');

const INTAKE = {
  age: 13,
  experience: 'intermediate',
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  days_per_week: 2,
  equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
  current_numbers: 'Pistol squat established; ring muscle-up achieved; about 12 strict pull-ups and 6 good ring dips. Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds.',
  clarification_answers: { benchmark_bar_muscle_up: 'Cannot perform a bar muscle-up yet. Can perform a ring muscle-up. About 12 strict pull-ups and 6 good ring dips.' },
  notes: 'Athlete is 13 years old. Skill quality before fatigue; no grinders or repeated failed attempts.',
};

function staticCandidate() {
  return fourWeeks(() => [
    'Mon\tBar Muscle-up Transition Drill\tModerate band assistance\t3\t1\t90 sec\t6\tClean turnover practice; stop after any technical deterioration.\t',
    'Mon\tBanded Muscle-up\tModerate band assistance\t2\t1\t90 sec\t6\tIntegrated assisted full-skill singles.\t',
    'Thu\tControlled Handstand Kick-up\tBodyweight\t3\t2\t60 sec\t6\tControlled independent entries; stop when balance quality drops.\t',
    'Thu\tRing Row\tBodyweight\t3\t8\t90 sec\t6\tGeneral pull foundation.\t',
  ]);
}

test('Youth acquisition normalizer creates safe visible Weeks 1-3 progression and Week 4 consolidation', () => {
  const out = normalizeYouthSkillAcquisitionQuality(staticCandidate(), INTAKE).program;
  assert.doesNotThrow(() => validateProgressionArchitectureSemantic(out, INTAKE));
  assert.doesNotThrow(() => validateYouthProgressionQualitySemantic(out, INTAKE));

  const w1 = out.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0];
  const w2 = out.match(/START_WEEK2_TSV[\s\S]*?END_WEEK2_TSV/)[0];
  const w3 = out.match(/START_WEEK3_TSV[\s\S]*?END_WEEK3_TSV/)[0];
  const w4 = out.match(/START_WEEK4_TSV[\s\S]*?END_WEEK4_TSV/)[0];

  assert.match(w1, /Bar Muscle-up Transition Drill\tModerate band assistance/);
  assert.match(w2, /Bar Muscle-up Transition Drill\tSlightly lighter band assistance/);
  assert.match(w3, /Bar Muscle-up Transition Drill\tLightest band assistance/);
  assert.match(w1, /Controlled Handstand Kick-up\tBodyweight\t3\t2\t/);
  assert.match(w2, /Controlled Handstand Kick-up\tBodyweight\t4\t2\t/);
  assert.match(w3, /Controlled Handstand Kick-up\tBodyweight\t4\t3\t/);
  assert.match(w4, /Controlled Handstand Kick-up\tBodyweight\t3\t2\t/);
  assert.match(w4, /Consolidation week/i);
});

test('Youth visible progression normalization is idempotent', () => {
  const once = normalizeYouthSkillAcquisitionQuality(staticCandidate(), INTAKE).program;
  const twice = normalizeYouthSkillAcquisitionQuality(once, INTAKE).program;
  assert.equal(twice, once);
});
