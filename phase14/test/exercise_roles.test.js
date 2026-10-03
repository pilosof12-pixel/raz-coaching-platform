import test from 'node:test';
import assert from 'node:assert/strict';

import { isLeadingSkill, isPowerPrimer, skillFamilyOf } from '../engine/exercise_roles.js';

test('a skill leads only when its family is one of the athlete goals', () => {
  const hybrid = { primary_goals: ['220kg back squat', '4 One arm pullups'], secondary_goals: ['100kg overhead press'] };
  assert.equal(isLeadingSkill('One-Arm Pull-up', hybrid), true);
  assert.equal(isLeadingSkill('Assisted One-Arm Pull-up', hybrid), true);
  assert.equal(isLeadingSkill('Pseudo Planche Push-up', hybrid), false);
  assert.equal(isLeadingSkill('Back Squat', hybrid), false);
  const cal = { primary_goals: ['Strict muscle-up on rings'], secondary_goals: ['Hold a 10 second straddle planche'] };
  assert.equal(isLeadingSkill('Straddle Planche', cal), true);
  assert.equal(isLeadingSkill('Pseudo Planche Push-up', cal), false, 'planche support, not planche practice');
  assert.equal(isLeadingSkill('Ring Muscle-up', cal), true);
});

test('a youth athlete\'s primary skills always lead', () => {
  assert.equal(isLeadingSkill('Bar Muscle-up Transition Drill', { age: 13 }), true);
  assert.equal(isLeadingSkill('Ring Dip', { age: 13 }), false);
});

test('power primers are named, not guessed', () => {
  for (const n of ['Box Jump', 'Broad Jump', 'Medicine Ball Slam', 'Explosive Push-up', 'Trap Bar Jump']) assert.equal(isPowerPrimer(n), true, n);
  for (const n of ['Back Squat', 'Snatch', 'Run', 'Push-up']) assert.equal(isPowerPrimer(n), false, n);
  assert.equal(skillFamilyOf('Snatch Pull'), null, 'a pull is strength support, not the competition lift');
});
