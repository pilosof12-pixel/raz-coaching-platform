import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicBrief } from '../engine/phase15_planner.js';

const warrior={
  primary_goals:['Build a Warrior / Batman performance profile: muscular, strong, athletic, explosive and capable'],
  secondary_goals:['Improve weighted pull-up and weighted dip strength and hypertrophy','Build lower-body strength, trunk strength, grip, work capacity and body composition'],
  days_per_week:3,
  available_gym_days:['Mon','Thu','Sat'],
  gym_availability_mode:'limited',
  training_location:'outdoor_park',
  equipment:'Pull-up bar, parallel bars, rings, weighted belt and plates to 37 kg, open ground. No machines.',
  notes:'Monday and Thursday mandatory. Saturday optional but productive.'
};

test('park-only Warrior work-capacity profile retains authored aerobic support',()=>{
  const brief=buildDeterministicBrief(warrior);
  assert.match(brief,/WARRIOR CAPACITY SOURCE RULE/i);
  assert.match(brief,/two 25-30 minute Zone-2 Run exposures/i);
  assert.match(brief,/ZONE2_A/);
  assert.match(brief,/ZONE2_B/);
  assert.doesNotMatch(brief,/Zone-2 Bike|Zone-2 Row/);
});

test('generic work capacity does not force the Warrior-specific route',()=>{
  const brief=buildDeterministicBrief({
    primary_goals:['General strength'],secondary_goals:['Improve work capacity'],days_per_week:3,
    training_location:'commercial_gym',equipment:'full gym'
  });
  assert.doesNotMatch(brief,/WARRIOR CAPACITY SOURCE RULE/i);
});
