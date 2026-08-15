import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProgressionGppBrief } from '../engine/coaching_progression_gpp.js';
import { EXERCISE_DICTIONARY } from '../engine/exercise_dictionary.js';
import { TACTICAL_3K_INTAKE } from './fixtures/golden_programs.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('Tactical GPP brief exposes exact canonical support vocabulary instead of open-ended family labels', () => {
  const brief = buildProgressionGppBrief(TACTICAL_3K_INTAKE);
  const required = [
    'Push-up', 'Dip', 'Overhead Press',
    'Pallof Press', 'Side Plank', 'Dead Bug', 'Hanging Leg Raise',
    'Reverse Lunge', 'Bulgarian Split Squat', 'Farmer Carry', 'Suitcase Carry',
    'Backpack Carry', 'Run',
  ];
  for (const name of required) {
    assert.ok(EXERCISE_DICTIONARY.has(name), `${name} must exist in the authoritative exercise catalog`);
    assert.match(brief, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.doesNotMatch(brief, /rollout\/leg-raise family/i);
  assert.doesNotMatch(brief, /push-ups\/dips\/pressing/i);
  assert.match(brief, /Exercise column must use exact catalog names/i);
});

test('internal repair contract preserves Tactical support roles when fixing exercise names', () => {
  const source = fs.readFileSync(path.join(here, '..', 'scripts', 'final_pipeline_lock.mjs'), 'utf8');
  assert.match(source, /ROLE-PRESERVATION RULE/);
  assert.match(source, /TACTICAL ROLE-PRESERVING CANONICAL MENU/);
  assert.match(source, /Do not delete the only weekly push, trunk/);
  assert.match(source, /for direct loaded marching use Backpack Carry; for running use Run/);
  assert.match(source, /buildRolePreservingRepairFeedback\(err, intake\)/);
});
