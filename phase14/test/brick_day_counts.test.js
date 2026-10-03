// A brick's run legs are short by design. Run #166's triathlete ran two legs
// under 15 minutes each on Saturday; the row-level floor counted neither, and
// TARGET_MODALITY_EXPOSURE_REDUCED sent the build back twice for a run day it had.

import test from 'node:test';
import assert from 'node:assert/strict';
import { endurancePerformanceIntegrityFlags } from '../engine/phase15_elite_guardrails.js';

const intake = { primary_goals: ['Sprint triathlon, run faster'], notes: 'Currently 3 runs a week.' };
const flags = (rows) => endurancePerformanceIntegrityFlags('', intake, {
  idx: { day: 0, exercise: 1, weight: 2, sets: 3, reps: 4, notes: 5 },
  rows: rows.map((c) => ({ cells: [...c, ''] })),
}).filter((f) => f.code === 'TARGET_MODALITY_EXPOSURE_REDUCED');

const base = [['Mon', 'Run', 'x', '5', '3 min'], ['Wed', 'Run', 'x', '1', '40 min']];

test('a brick day counts by its total running time', () => {
  assert.equal(flags([...base, ['Sat', 'Bike', 'x', '1', '20 min'], ['Sat', 'Run', 'x', '1', '8 min'], ['Sat', 'Bike', 'x', '1', '10 min'], ['Sat', 'Run', 'x', '1', '8 min']]).length, 0);
});

test('a token jog still does not count', () => {
  const f = flags([...base, ['Sat', 'Bike', 'x', '1', '30 min'], ['Sat', 'Run', 'x', '1', '6 min']]);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].days.sort(), ['Mon', 'Wed']);
});
