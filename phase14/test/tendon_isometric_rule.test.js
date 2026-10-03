// The in-season basketball player has active patellar tendinopathy and wrote
// "Isometric holds have reliably reduced symptoms." His delivered block had no
// isometric in four weeks, and the corpus rule that prescribes one (A88.4) lived
// only in a grading script the model never saw.

import test from 'node:test';
import assert from 'node:assert/strict';

import { activeTendon, tendonIsometricRules } from '../engine/tendon_isometric_rule.js';
import { buildSpecialistRules } from '../engine/phase15_specialist_rules.js';

const BASKETBALL = {
  sport: 'Basketball, semi-professional',
  injuries: 'Right patellar tendinopathy, managed for two seasons.',
  pain: { active: true, description: 'Right patellar tendon, 2-3/10', tolerated_movements: 'Jumping is tolerated. Isometric holds have reliably reduced symptoms.' },
};

test('an active patellar tendon reaches the prompt, citing the athlete', () => {
  const [rule] = tendonIsometricRules(BASKETBALL);
  assert.match(rule, /ACTIVE TENDON \(patellar tendon\)/);
  assert.match(rule, /athlete reports that isometric holds reliably reduce/);
  assert.match(rule, /Wall Sit/, 'an exercise the dictionary knows');
  assert.match(buildSpecialistRules(BASKETBALL), /ACTIVE TENDON/);
});

// The triathlete's achilles is history, asymptomatic, and she wants to race.
test('a cleared or historic tendon is not treated as live', () => {
  const triathlete = { injuries: 'Right achilles tendinopathy 14 months ago. Currently symptom-free.', pain: { active: false } };
  assert.equal(activeTendon(triathlete), null);
  assert.deepEqual(tendonIsometricRules(triathlete), []);
});

test('without the athlete saying so, the corpus is cited instead', () => {
  const [rule] = tendonIsometricRules({ injuries: 'Achilles tendinopathy', pain: { active: true, description: 'achilles 3/10' } });
  assert.match(rule, /A88\.4/);
  assert.match(rule, /calf-raise hold/);
});

// It must not be read as a licence to add conditioning, which the same athlete
// forbade.
test('it is framed as tendon management, not conditioning', () => {
  const [rule] = tendonIsometricRules(BASKETBALL);
  assert.match(rule, /not conditioning/);
});
