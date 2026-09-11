// An equipment note is prose, and prose says what is missing as often as what
// is there.
//
// A travelling client wrote "No barbell, no rack, ever" and the tokenizer read
// it word by word and whitelisted both. The equipment gate works from the same
// tokens, so it saw nothing wrong either: the athlete told us exactly what they
// did not have and would have been handed precisely that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeEquipmentTokens, computeEffectiveEquipment } from '../engine/exercise_dictionary.js';

const tokens = (s) => [...normalizeEquipmentTokens(s)].sort();

test('equipment the athlete says they do not have is not whitelisted', () => {
  assert.deepEqual(tokens('No barbell'), []);
  assert.deepEqual(tokens('We do not have a cable machine'), []);
  assert.deepEqual(tokens('Squat rack not available'), []);
});

test('a denial is found even when it does not open the sentence', () => {
  // The real note read "...often there is not. No barbell, no rack, ever", and
  // after a comma split the barbell landed in a fragment beginning "often".
  assert.deepEqual(tokens('often there is not. No barbell, no rack, ever'), []);
});

test('a denial anywhere beats a mention elsewhere', () => {
  assert.ok(!tokens('Barbell and bench, but no barbell at the hotel').includes('barbell'));
  assert.ok(tokens('Barbell and bench, but no barbell at the hotel').includes('bench'));
});

test('a limit is not a denial', () => {
  // "No more than 20 kg" describes what the dumbbells are, not their absence.
  assert.ok(tokens('Dumbbells, no more than 20 kg').includes('dumbbells'));
  assert.ok(tokens('Treadmill, no faster than 16 km/h').includes('treadmill'));
});

test('plain positive equipment is unaffected, singular or plural', () => {
  // "barbells" and "racks" never matched: the word boundary after the singular
  // fails on the plural. Masked at a commercial gym, which unions a full roster,
  // but a home-gym athlete who wrote "squat racks" was told they had no rack.
  for (const s of ['Barbell, rack, bench', 'Barbells, racks, benches']) {
    const t = tokens(s);
    assert.ok(t.includes('barbell'), s);
    assert.ok(t.includes('rack'), s);
    assert.ok(t.includes('bench'), s);
  }
});

test('the hotel client ends up with the kit they actually have', () => {
  const intake = {
    training_location: 'hotel_gym',
    equipment: 'Whatever the hotel has, and it changes every week. Assume only: '
      + 'adjustable dumbbells up to 20 kg, a bench, a mat and a treadmill. '
      + 'No barbell, no rack, ever.',
  };
  const kit = computeEffectiveEquipment(intake);
  assert.ok(kit.has('dumbbells') && kit.has('bench') && kit.has('treadmill'));
  assert.ok(!kit.has('barbell'), 'barbell must not survive an explicit denial');
  assert.ok(!kit.has('rack'), 'rack must not survive an explicit denial');
});
