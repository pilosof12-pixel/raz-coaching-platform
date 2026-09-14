// Rules that refuse a program for missing an exposure the athlete's own goal
// requires, in a module that raises eleven blocking codes and repaired none of
// them. Each names exactly what is absent and could not put it there.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  repairGoalNarrative, repairOverheadExposure,
  repairModalityExposure, repairAdvancedSkillExposure,
} from '../engine/goal_exposure.js';
import { validatePhase15Program } from '../engine/phase15_program_qa.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { matchDictionary } from '../engine/exercise_dictionary.js';

const T = new URL('./fixtures/', import.meta.url);
const CORE = JSON.parse(fs.readFileSync(new URL('acceptance_intakes.json', T), 'utf8'));

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const r = (d, n, w, s, reps, rest, rpe, note) => [d, n, w, String(s), reps, rest, String(rpe), note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const four = (rows) => [1, 2, 3, 4].map((n) => wk(n, rows)).join('\n\n');

const codesFrom = (program, intake) => {
  try { validatePhase15Program(program, intake); return []; }
  catch (e) { return (e.flags || []).map((f) => f.code); }
};
const afterBundle = (program, intake) => {
  try {
    const res = collectRepairableValidationFailures(program, intake, { skipSkillCalibration: true });
    return (res.flags || []).map((f) => f.code);
  } catch (e) { return [e?.code || 'THREW']; }
};

const OHP = {
  age: 30, language: 'en', experience: 'advanced', days_per_week: 3,
  available_gym_days: ['Mon', 'Wed', 'Fri'], training_location: 'commercial_gym',
  equipment: 'Full commercial gym.',
  primary_goals: ['220 kg back squat'],
  secondary_goals: ['Strict overhead press progression'],
  // farOhpGoal needs a current and a target at least 15% apart, each written
  // next to the lift's name, or the whole family of OHP rules stays silent.
  current_numbers: 'Overhead Press: 70 kg x 1\nBack Squat: 180 kg x 1',
  notes: 'OHP target is 100 kg by the end of the year.', qa_diagnostics: true,
};

test('STRICT_OHP_SPECIFICITY_UNDERDOSED is raised and then cleared', () => {
  const p = four([
    r('Mon', 'Push Press', '80 kg', 3, '5', '3 min', 8, 'Overhead work.'),
    r('Mon', 'Back Squat', '160 kg', 3, '5', '3 min', 8, 'Heavy.'),
    r('Wed', 'Dumbbell Shoulder Press', '30 kg', 3, '8', '2 min', 7, 'Support.'),
  ]);
  assert.ok(codesFrom(p, OHP).includes('STRICT_OHP_SPECIFICITY_UNDERDOSED'), 'the fixture must raise it');
  const fixed = repairOverheadExposure(p, OHP);
  assert.ok(!codesFrom(fixed, OHP).includes('STRICT_OHP_SPECIFICITY_UNDERDOSED'),
    'the repair must answer its own flag');
  // Converted, not added: the session does not grow a movement.
  const w1 = fixed.slice(fixed.indexOf('START_WEEK1'), fixed.indexOf('END_WEEK1'));
  assert.match(w1, /Overhead Press/);
  assert.ok(!/Push Press/.test(w1), 'the press that was there became the press the goal named');
  assert.match(fixed, /no leg drive/);
  assert.equal(repairOverheadExposure(fixed, OHP), fixed, 'repair is not idempotent');
  assert.ok(!afterBundle(p, OHP).includes('STRICT_OHP_SPECIFICITY_UNDERDOSED'));
});

test('FAR_SECONDARY_STRENGTH_TOKEN_DOSE is raised and then cleared', () => {
  const p = four([
    r('Mon', 'Overhead Press', '70 kg', 3, '5', '3 min', 8, 'Strict press.'),
    r('Mon', 'Back Squat', '160 kg', 3, '5', '3 min', 8, 'Heavy.'),
    r('Wed', 'Chest-Supported Row', '60 kg', 3, '10', '2 min', 7, 'Pulling.'),
  ]);
  assert.ok(codesFrom(p, OHP).includes('FAR_SECONDARY_STRENGTH_TOKEN_DOSE'), 'the fixture must raise it');
  const fixed = repairOverheadExposure(p, OHP);
  assert.ok(!codesFrom(fixed, OHP).includes('FAR_SECONDARY_STRENGTH_TOKEN_DOSE'),
    'the repair must answer its own flag');
  // The second exposure lands on a day that had none.
  const w1 = fixed.slice(fixed.indexOf('START_WEEK1'), fixed.indexOf('END_WEEK1'));
  const added = w1.split('\n').find((l) => /Dumbbell Shoulder Press/.test(l));
  assert.ok(added, 'a second vertical press exists');
  assert.equal(matchDictionary(added.split('\t')[1]).status, 'hit', 'and it is a real exercise');
  assert.equal(repairOverheadExposure(fixed, OHP), fixed, 'repair is not idempotent');
});

test('SECONDARY_GOAL_NARRATIVE_CONTRADICTION is raised and then cleared', () => {
  const p = `Your overhead press will be maintained this block and progressed in a later block.\n\n${four([
    r('Mon', 'Overhead Press', '70 kg', 3, '5', '3 min', 8, 'Strict press.'),
    r('Wed', 'Dumbbell Shoulder Press', '30 kg', 3, '8', '2 min', 7, 'Support.'),
  ])}`;
  assert.ok(codesFrom(p, OHP).includes('SECONDARY_GOAL_NARRATIVE_CONTRADICTION'), 'the fixture must raise it');
  const fixed = repairGoalNarrative(p, OHP);
  assert.ok(!codesFrom(fixed, OHP).includes('SECONDARY_GOAL_NARRATIVE_CONTRADICTION'),
    'the repair must answer its own flag');
  assert.match(fixed, /progresses across this block/);
  assert.equal(repairGoalNarrative(fixed, OHP), fixed, 'repair is not idempotent');
});

const RUNNER = {
  age: 34, language: 'en', experience: 'intermediate', days_per_week: 3,
  available_gym_days: ['Mon', 'Wed', 'Fri'], training_location: 'commercial_gym',
  equipment: 'Full commercial gym and road access.',
  primary_goals: ['Run a 10 km in under 45 minutes'],
  current_numbers: 'Runs about 20 km per week.', qa_diagnostics: true,
};

test('SPORT_MODALITY_SPECIFICITY_MISSING is raised and then cleared', () => {
  const p = four([
    r('Mon', 'Zone-2 Bike', '-', 1, '40 min', '-', 5, 'Aerobic work.'),
    r('Wed', 'Back Squat', '100 kg', 3, '5', '3 min', 7, 'Strength.'),
  ]);
  assert.ok(codesFrom(p, RUNNER).includes('SPORT_MODALITY_SPECIFICITY_MISSING'), 'the fixture must raise it');
  const fixed = repairModalityExposure(p, RUNNER);
  assert.ok(!codesFrom(fixed, RUNNER).includes('SPORT_MODALITY_SPECIFICITY_MISSING'),
    'the repair must answer its own flag');
  const added = fixed.split('\n').find((l) => /\tRun\t/.test(l));
  assert.ok(added, 'the goal modality is trained directly');
  assert.equal(repairModalityExposure(fixed, RUNNER), fixed, 'repair is not idempotent');
});

test('an athlete whose sport already supplies the modality gets no extra row', () => {
  const external = { ...RUNNER, sport: 'Running club', sport_schedule: [{ day: 'Sat', intensity: 'moderate' }] };
  const p = four([r('Mon', 'Back Squat', '100 kg', 3, '5', '3 min', 7, 'Strength.')]);
  assert.equal(repairModalityExposure(p, external), p);
});

const OAP = {
  ...CORE.advanced_hybrid,
  current_numbers: 'One-Arm Pull-up: 2 strict reps each arm\nBack Squat: 205 kg 1RM',
};

test('ADVANCED_SKILL_REGRESSION is raised and then cleared', () => {
  const p = four([
    r('Mon', 'One-Arm Pull-up Eccentric', 'BW', 4, '3', '3 min', 8, 'Lowering work.'),
    r('Mon', 'Back Squat', '160 kg', 3, '5', '3 min', 8, 'Heavy.'),
    r('Fri', 'Assisted One-Arm Pull-up', 'Band', 3, '4', '3 min', 8, 'Assisted volume.'),
    r('Fri', 'Bench Press', '120 kg', 3, '5', '3 min', 8, 'Pressing.'),
  ]);
  assert.ok(codesFrom(p, OAP).includes('ADVANCED_SKILL_REGRESSION'), 'the fixture must raise it');
  const fixed = repairAdvancedSkillExposure(p, OAP);
  const prescribed = fixed.split('\n').filter((l) => l.includes('\t')).map((l) => l.split('\t')[1]);
  assert.ok(!prescribed.some((n) => /eccentric/i.test(n)), 'the eccentric exposure is gone');
  assert.ok(prescribed.includes('Assisted One-Arm Pull-up'), 'and assisted volume took its place');
  assert.match(fixed, /Assisted rather than eccentric/);
  assert.equal(repairAdvancedSkillExposure(fixed, OAP), fixed, 'repair is not idempotent');
});
