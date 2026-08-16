import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSpecialistRules } from '../engine/phase15_specialist_rules.js';

test('production specialist rules include component-aware handstand roadmap', () => {
  const prompt = buildSpecialistRules({
    primary_goals: ['Achieve a freestanding handstand'],
    current_numbers: 'Wall-facing handstand 15 seconds. No reliable unsupported balance yet.',
    equipment: 'floor, wall, pull-up bar',
  });
  assert.match(prompt, /ZERO-TO-ADVANCED GOAL ROADMAP/);
  assert.match(prompt, /wall-supported static handstand exposure/i);
  assert.match(prompt, /kick-up\/entry and independent balance practice/i);
  assert.match(prompt, /mandatory components/i);
});

test('advanced calisthenics plus marathon side quest emits priority-aware dual roadmap', () => {
  const prompt = buildSpecialistRules({
    primary_goals: ['Full Planche', '4 strict One-Arm Pull-ups'],
    secondary_goals: ['Complete a full marathon'],
    current_numbers: 'Straddle planche 4 seconds. 2 strict one-arm pull-ups each arm. Weighted pull-up +80 kg 1RM.',
    equipment: 'full gym, pull-up bar, parallettes, road access',
  });
  assert.match(prompt, /PRIMARY planche/);
  assert.match(prompt, /PRIMARY one_arm_pull_up/);
  assert.match(prompt, /SECONDARY marathon/);
  assert.match(prompt, /long-run pathway/i);
  assert.match(prompt, /may not steal the freshness\/recovery budget required by the primary goal/i);
});

test('roadmap does not collapse advanced weighted pulling into generic bodyweight progression', () => {
  const prompt = buildSpecialistRules({
    primary_goals: ['Weighted chin-up +100 kg 1RM'],
    current_numbers: 'Weighted chin-up +80 kg 1RM',
  });
  assert.match(prompt, /weighted_pull/);
  assert.match(prompt, /max-strength and fixed-load endurance use different loading structures/i);
  assert.match(prompt, /Current external-load 1RM anchor parsed for Weighted Chin-up: \+80 kg/i);
});
