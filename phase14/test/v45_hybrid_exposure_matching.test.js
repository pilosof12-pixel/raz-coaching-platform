import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';
import { parseProgramModel } from '../engine/program_model.js';

// Live run #66 lost Advanced Hybrid to four attempts on ADVANCED_HYBRID_OAP_SPECIFICITY.
// The rule asks whether two KINDS of work are present -- strict one-arm pulling
// and a second assistance/volume exposure -- but matched a single exact display
// name for each. The exercise dictionary sanctions several names that deliver
// the same exposure, so a program could satisfy the coaching intent and still be
// rejected, and no rewording of that program could ever pass. Three runs, three
// different Hybrid failures; this was the third.

const root = path.dirname(fileURLToPath(import.meta.url));
const HYBRID = {
  age: 30, language: 'en',
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  maintenance_goals: ['Maintain muscle mass'],
  goal_priority_model: 'tiered_equal_primary', experience: 'advanced',
  days_per_week: 4, gym_availability_mode: 'limited',
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'], training_location: 'commercial_gym',
  sport: 'MMA', sport_sessions_per_week: 5,
  sport_schedule: [
    { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
    { day: 'Sat', intensity: 'moderate' },
  ],
  current_numbers: [
    'Back Squat: 205 kg 1RM', 'One-Arm Pull-up: 2 strict reps each arm',
    'Overhead Press: 80 kg x 4', 'Weighted Chin-up: +80 kg 1RM',
  ].join('\n'),
  injuries: 'None reported',
};

const goldenPath = path.join(root, 'fixtures', 'advanced_hybrid-program.txt');
const golden = fs.existsSync(goldenPath) ? fs.readFileSync(goldenPath, 'utf8') : null;

const codeFor = (program) => {
  try {
    validateAdvancedHybridQualitySemantic(program, HYBRID, parseProgramModel(program, HYBRID));
    return null;
  } catch (e) { return e.code; }
};

test('[H1] the coach-reviewed live program still passes unchanged', { skip: !golden }, () => {
  assert.equal(codeFor(golden), null);
});

test('[H2] every strict one-arm name the dictionary defines counts as strict work', { skip: !golden }, () => {
  for (const name of ['Weighted One-Arm Pull-up', 'One-Arm Chin-up']) {
    const swapped = golden.replace(/\tOne-Arm Pull-up\t/g, `\t${name}\t`);
    assert.equal(codeFor(swapped), null, `${name} is strict unilateral work`);
  }
});

test('[H3] every assisted variant counts as the second exposure', { skip: !golden }, () => {
  for (const name of ['Band-Assisted One-Arm Pull-Up', 'Band-Assisted One-Arm Pull-up Eccentric']) {
    const swapped = golden.replace(/\tAssisted One-Arm Pull-up\t/g, `\t${name}\t`);
    assert.equal(codeFor(swapped), null, `${name} is an assistance exposure`);
  }
});

test('[H4] a strict overhead press goal accepts the barbell names, not dumbbells', { skip: !golden }, () => {
  assert.equal(codeFor(golden.replace(/\tOverhead Press\t/g, '\tStanding Barbell Overhead Press\t')), null);
  // A dumbbell press is a different exposure and must not satisfy a barbell goal.
  assert.equal(codeFor(golden.replace(/\tOverhead Press\t/g, '\tDumbbell Overhead Press\t')), 'ADVANCED_HYBRID_OHP_ARCHITECTURE');
});

test('[H5] the rule still rejects what it exists to reject', { skip: !golden }, () => {
  // Regressing an athlete who owns strict reps to prerequisite-only work.
  assert.equal(codeFor(golden.replace(/\tOne-Arm Pull-up\t/g, '\tOne-Arm Pull-up Eccentric\t')), 'ADVANCED_HYBRID_OAP_SPECIFICITY');
  // Dropping the assistance/volume exposure entirely.
  const noAssisted = golden.split('\n').filter((l) => !/\tAssisted One-Arm Pull-up\t/.test(l)).join('\n');
  assert.equal(codeFor(noAssisted), 'ADVANCED_HYBRID_OAP_SPECIFICITY');
});

test('[H6] bilateral pulling never substitutes for a unilateral exposure', { skip: !golden }, () => {
  assert.equal(codeFor(golden.replace(/\tOne-Arm Pull-up\t/g, '\tPull-up\t')), 'ADVANCED_HYBRID_OAP_SPECIFICITY');
});
