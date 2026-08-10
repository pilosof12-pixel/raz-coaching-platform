import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExerciseDemo } from '../data/lib/exerciseDemos.js';

// Canonical working exercises Phase 15 is allowed/expected to emit across the
// Raz benchmark and the two final multi-avatar stress clients. New staple
// exercises must be added here before shipping so client delivery can never
// silently fall back to a search URL.
const required = [
  // Raz benchmark staples
  'Box Squat to Parallel',
  'Overhead Press',
  'Standing Barbell Overhead Press',
  'Push Press',
  'One-Arm Pull-up',
  'Assisted One-Arm Pull-up',
  'Weighted Chin-up',
  'Weighted Pull-up',
  'Zone-2 Bike',
  'Zone-2 Row',
  'Cable Lateral Raise',
  'Face Pull',
  'Box Jump',
  'Hip Thrust',

  // Gymnastics and weighted street lifting staples
  'Advanced Tuck Planche',
  'Straddle Planche',
  'Full Planche',
  'Pseudo Planche Push-up',
  'Tuck Human Flag',
  'One-Leg Tuck Human Flag',
  'Straddle Human Flag',
  'Full Human Flag',
  'Dip',
  'Weighted Dip',

  // Common strength / GPP rows used by the final avatars
  'Front Squat',
  'Romanian Deadlift',
  'Bulgarian Split Squat',
  'Rear-Foot Elevated Split Squat',
  'Chest-Supported Row',
  'Hammer Curl',
  'Side Plank',
  'Pallof Press',
  'Farmer Carry',
  'Suitcase Carry'
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
