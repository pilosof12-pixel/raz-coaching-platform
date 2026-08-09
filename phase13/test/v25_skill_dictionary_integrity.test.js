import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_PROGRESSIONS } from '../engine/skill_progressions.js';
import { EXERCISE_DICTIONARY, matchDictionary } from '../engine/exercise_dictionary.js';

test('every skill graph rung resolves through deterministic exercise dictionary', () => {
  const misses = [];
  for (const family of SKILL_PROGRESSIONS.values()) {
    for (const rung of family.rungs || []) {
      const m = matchDictionary(rung.name);
      if (m.status === 'miss') misses.push(`${family.family}: ${rung.name}`);
    }
  }
  assert.deepEqual(misses, []);
});

test('every skill graph complementary exercise resolves through deterministic dictionary', () => {
  const misses = [];
  for (const family of SKILL_PROGRESSIONS.values()) {
    for (const rung of family.rungs || []) {
      for (const name of rung.complementary || []) {
        const m = matchDictionary(name);
        if (m.status === 'miss') misses.push(`${family.family}: ${name}`);
      }
    }
  }
  assert.deepEqual(misses, []);
});
