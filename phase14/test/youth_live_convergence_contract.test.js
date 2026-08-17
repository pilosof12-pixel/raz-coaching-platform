import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { pullUpDoseAnalysis } from '../engine/coaching_progression_gpp.js';

const youth = {
  age: 13,
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  current_numbers: 'About 12 strict pull-ups. Wall-facing handstand about 15 seconds; no reliable unsupported balance time yet.',
};

test('Youth live convergence patch locks ring vocabulary and live repair contracts', () => {
  const src = fs.readFileSync(new URL('../scripts/apply_youth_live_convergence.mjs', import.meta.url), 'utf8');
  assert.match(src, /Ring Push-up/);
  assert.match(src, /Ring Hamstring Curl/);
  assert.match(src, /Wall-Facing Handstand Hold/);
  assert.match(src, /YOUTH-HANDSTAND-COMPONENT-SURGICAL-REPAIR/);
  assert.match(src, /YOUTH-WEEK4-SURGICAL-REPAIR/);
  assert.match(src, /YOUTH-PULL-UP-SURGICAL-REPAIR/);
  assert.match(src, /YOUTH-SKILL-FIRST-SURGICAL-REPAIR/);
  assert.match(src, /YOUTH-QUALITY-PROGRESSION-SURGICAL-REPAIR/);
  assert.match(src, /YOUTH PRIMARY-SKILL-FIRST RULE/);
  assert.match(src, /YOUTH QUALITY-PROGRESSION RULE/);
});

test('known 12-rep pull-up max accepts submaximal 3x8 and rejects repeated 3x10', () => {
  const makeProgram = (reps) => [1,2,3,4].map((week) => `START_WEEK${week}_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\nSession A\tPull-up\tBodyweight\t3\t${reps}\t90 sec\t8\tClean submaximal pulling.\t\nEND_WEEK${week}_TSV`).join('\n\n');
  const safe = pullUpDoseAnalysis(makeProgram('8'), youth);
  assert.equal(safe.known_max_reps, 12);
  assert.equal(safe.violations.length, 0);
  const tooHigh = pullUpDoseAnalysis(makeProgram('10'), youth);
  assert.equal(tooHigh.violations.length > 0, true);
});
