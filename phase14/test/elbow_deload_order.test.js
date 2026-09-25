// Which work comes out first depends on what provokes the joint.
//
// A calisthenics athlete's elbow is loaded two quite different ways: straight-arm
// holds put the biceps tendon and medial structures under long-lever tension,
// and bent-arm pulling loads them through range. An athlete whose symptoms come
// from one is not helped by removing the other first, and run #138 would have
// written the same removal order either way.
//
// The trap is reading the whole pain blob: this athlete's own notes say "all
// bent-arm pulling is tolerated" and "no pain in bent-arm work at all", which
// are the two clearest statements that bent-arm work is fine, and matching on
// them made him look provoked by both.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDeterministicBrief } from '../engine/phase15_planner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const guidance = (intake) => {
  const plan = buildDeterministicBrief(intake);
  return JSON.stringify(plan).replace(/\\u2019/g, '’');
};

test('a straight-arm provoked elbow removes straight-arm work first', () => {
  const text = guidance(INTAKE);
  assert.match(text, /ELBOW DE-LOAD ORDER \(STRAIGHT-ARM PROVOKED\)/);
  assert.equal(/ELBOW DE-LOAD ORDER \(BENT-ARM PROVOKED\)/.test(text), false);
});

test('tolerated movements are not read as the ones that hurt', () => {
  // The whole signal for this athlete is in two clauses that say bent-arm work
  // is fine. Matching them would have picked the opposite branch.
  assert.match(String(INTAKE.pain.tolerated_movements), /bent-arm pulling and pressing is tolerated/i);
  assert.match(String(INTAKE.injuries), /No pain in bent-arm work/i);
  assert.match(guidance(INTAKE), /STRAIGHT-ARM PROVOKED/);
});

test('a bent-arm provoked elbow reduces the supporting pulling first', () => {
  const bentArm = {
    ...INTAKE,
    injuries: 'Left medial elbow gets sore after heavy pull-up and row volume.',
    pain: {
      active: false,
      description: 'Medial elbow ache after bent-arm pulling volume',
      severity: '2/10',
      character: 'dull, inner elbow',
      tolerated_movements: 'Straight-arm holds are comfortable at current volume.',
    },
  };
  const text = guidance(bentArm);
  assert.match(text, /ELBOW DE-LOAD ORDER \(BENT-ARM PROVOKED\)/);
  assert.equal(/ELBOW DE-LOAD ORDER \(STRAIGHT-ARM PROVOKED\)/.test(text), false);
});

test('an elbow with no stated pattern gets both branches spelled out', () => {
  const vague = {
    ...INTAKE,
    injuries: 'Occasional elbow soreness.',
    pain: { active: false, description: 'Elbow soreness', severity: '2/10', character: 'dull', tolerated_movements: '' },
  };
  const text = guidance(vague);
  assert.match(text, /ELBOW DE-LOAD ORDER:/);
  assert.match(text, /if symptoms follow straight-arm work/i);
});

test('an athlete with no elbow complaint gets no elbow instruction', () => {
  const clear = { ...INTAKE, injuries: 'None reported.', pain: { active: false, description: '', severity: '', character: '', tolerated_movements: '' } };
  assert.equal(/ELBOW DE-LOAD ORDER/.test(guidance(clear)), false);
});
