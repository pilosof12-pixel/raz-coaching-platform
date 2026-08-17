import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXERCISE_DICTIONARY,
  EXERCISE_ALIASES,
  EXERCISE_EQUIPMENT_REQUIREMENTS,
} from '../engine/exercise_dictionary.js';
import { pullUpDoseAnalysis } from '../engine/coaching_progression_gpp.js';

const youth = {
  age: 13,
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  current_numbers: 'About 12 strict pull-ups. Wall-facing handstand about 15 seconds; no reliable unsupported balance time yet.',
};

test('ring-specific Youth movements are canonical and require rings', () => {
  for (const name of ['Ring Push-up', 'Ring Hamstring Curl']) {
    assert.equal(EXERCISE_DICTIONARY.has(name), true, `${name} must be canonical`);
    assert.deepEqual(EXERCISE_EQUIPMENT_REQUIREMENTS.get(name), ['rings']);
  }
  assert.equal(EXERCISE_ALIASES.get('Wall-Facing Handstand Hold'), 'Wall Handstand Hold');
});

test('known 12-rep pull-up max accepts submaximal 3x8 and rejects repeated 3x10', () => {
  const makeProgram = (reps) => [1,2,3,4].map((week) => `START_WEEK${week}_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\nSession A\tPull-up\tBodyweight\t3\t${reps}\t90 sec\t8\tClean submaximal pulling.\t\nEND_WEEK${week}_TSV`).join('\n\n');
  const safe = pullUpDoseAnalysis(makeProgram('8'), youth);
  assert.equal(safe.known_max_reps, 12);
  assert.equal(safe.violations.length, 0);
  const tooHigh = pullUpDoseAnalysis(makeProgram('10'), youth);
  assert.equal(tooHigh.violations.length > 0, true);
});
