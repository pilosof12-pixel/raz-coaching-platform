// An Australian pull-up is a row, and the taxonomy was reading the words.
//
// Feet on the ground, body under a bar at hip height: the same movement as an
// inverted row, sharing none of a vertical pull's loading. The generic
// /(?:pull|chin)[- ]?up/ rule matched it first and called it a vertical pull,
// which cost the calisthenics athlete twice. It counted 3 against a day's
// pulling stress instead of 2, inflating the adjacency arithmetic; and it
// matched the /pull[- ]?up|chin[- ]?up/ goal family for "Weighted pull-up with
// 40 kg for 3", so a bodyweight row was charged with serving a weighted
// vertical pulling goal it cannot serve.

import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyExercise, stressSignature, CATEGORY } from '../engine/v38_movement_taxonomy.js';

test('an Australian pull-up classifies as a horizontal pull', () => {
  assert.equal(classifyExercise('Australian Pull-up').category, CATEGORY.HORIZONTAL_PULL);
  assert.equal(
    classifyExercise('Australian Pull-up').category,
    classifyExercise('Inverted Row').category,
    'it is the same movement as an inverted row',
  );
});

test('it carries a row\'s pulling stress, not a pull-up\'s', () => {
  assert.equal(stressSignature('Australian Pull-up').upperPull, stressSignature('Inverted Row').upperPull);
  assert.ok(
    stressSignature('Australian Pull-up').upperPull < stressSignature('Weighted Pull-up').upperPull,
  );
});

test('the genuine vertical pulls are untouched', () => {
  for (const name of ['Weighted Pull-up', 'Chin-up', 'Pull-up', 'One-Arm Pull-up', 'Lat Pulldown']) {
    assert.equal(classifyExercise(name).category, CATEGORY.VERTICAL_PULL, name);
  }
});
