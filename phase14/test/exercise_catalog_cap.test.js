// The exercise catalog the model must choose from was capped at 120 names,
// sorted alphabetically, so every avatar lost 38-71 of the names routed to it,
// always from the end of the alphabet: Weighted Pull-up, Wall Handstand Hold,
// Tuck Planche, Tuck Front Lever, Side Plank. The model is told to use catalog
// names exactly, so a missing name becomes a misnamed exercise.

import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalExerciseCatalog, exerciseFamilyTerms } from '../engine/phase15_source_router.js';
import { EXERCISE_DICTIONARY } from '../engine/exercise_dictionary.js';

// Every routing branch at once: the largest catalog any athlete can be sent.
const MAXIMAL = {
  age: 25, sport: 'MMA',
  primary_goals: ['One-arm pull-up', 'Full planche', 'Full front lever', 'Freestanding handstand push-up'],
  secondary_goals: ['Back squat 180 kg', 'Overhead press 90 kg', 'Marathon', 'Ring dips', 'Swim and bike for a triathlon'],
  training_location: 'park with rings', equipment: 'rings, bike, rower',
};

test('the catalog holds every name routed to the athlete', () => {
  const shown = canonicalExerciseCatalog(EXERCISE_DICTIONARY, MAXIMAL).split(' | ');
  const terms = exerciseFamilyTerms(MAXIMAL);
  const routed = [...new Set([...EXERCISE_DICTIONARY].filter((n) => terms.some((t) => n.toLowerCase().includes(t))))];
  const cut = routed.filter((n) => !shown.includes(n));
  assert.deepEqual(cut, [], `routed but cut: ${cut.slice(0, 10).join(', ')}`);
  for (const name of ['Weighted Pull-up', 'Side Plank', 'Tuck Planche', 'Tuck Front Lever']) {
    if (EXERCISE_DICTIONARY.has ? EXERCISE_DICTIONARY.has(name) : [...EXERCISE_DICTIONARY].includes(name)) assert.ok(shown.includes(name), name);
  }
});
