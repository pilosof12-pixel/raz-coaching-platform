import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExerciseDemo } from '../data/lib/exerciseDemos.js';

// These are the canonical working exercises Phase 15 is currently allowed/expected
// to emit across the Raz benchmark, planche regression and weighted-street-lifting
// regressions. If the coaching path adds a new client-facing working exercise,
// add it here before shipping so a direct curated video is required.
const required = [
  'Box Squat to Parallel',
  'Overhead Press',
  'One-Arm Pull-up',
  'Assisted One-Arm Pull-up',
  'Weighted Chin-up',
  'Zone-2 Bike',
  'Zone-2 Row',
  'Cable Lateral Raise',
  'Face Pull',
  'Box Jump',
  'Hip Thrust',
  'Advanced Tuck Planche',
  'Straddle Planche',
  'Full Planche',
  'Pseudo Planche Push-up',
  'Weighted Pull-up',
  'Dip',
  'Weighted Dip'
];

test('every Phase 15 client-facing critical exercise resolves to a direct curated video', () => {
  const missing = [];
  const invalid = [];
  for (const name of required) {
    const hit = resolveExerciseDemo(name);
    if (!hit?.url) { missing.push(name); continue; }
    if (!/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(hit.url)) invalid.push([name, hit.url]);
    assert.equal(hit.source, 'curated');
  }
  assert.deepEqual(missing, [], `Missing direct demo URLs: ${missing.join(', ')}`);
  assert.deepEqual(invalid, [], `Non-direct demo URLs: ${JSON.stringify(invalid)}`);
});
