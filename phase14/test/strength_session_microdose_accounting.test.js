import test from 'node:test';
import assert from 'node:assert/strict';

import { strengthSessionAccountingFlags } from '../engine/phase15_elite_guardrails.js';
import { STRENGTH_MICRODOSE_MARKER, patchStrengthSessionMicrodoseAccounting } from '../scripts/apply_strength_session_microdose_accounting.mjs';

function parsed(rows) {
  return {
    idx: { day: 0, exercise: 1, sets: 2, reps: 3, weight: 4, notes: 5 },
    rows: rows.map((cells) => ({ cells })),
  };
}

const highConcurrency = {
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  days_per_week: 4,
  sport: 'MMA',
  sport_sessions_per_week: 5,
};

test('verified high-concurrency hybrid may count a one-set compound/advanced-skill microdose as the fourth strength day', () => {
  const p = parsed([
    ['Mon', 'Back Squat', '3', '4', '165 kg', ''],
    ['Tue', 'Overhead Press', '2', '5', '65 kg', ''],
    ['Fri', 'Weighted Chin-up', '2', '4', '+45 kg', ''],
    ['Sun', 'One-Arm Pull-up', '1', '1 / arm', 'BW', 'Quality microdose.'],
  ]);
  assert.deepEqual(strengthSessionAccountingFlags('', highConcurrency, p), []);
});

test('one-set compound day does not satisfy ordinary requested strength frequency outside verified high concurrency', () => {
  const intake = { primary_goals: ['Build strength'], days_per_week: 4, sport: '', sport_sessions_per_week: 0 };
  const p = parsed([
    ['Mon', 'Back Squat', '3', '4', '100 kg', ''],
    ['Tue', 'Overhead Press', '2', '5', '50 kg', ''],
    ['Fri', 'Weighted Chin-up', '2', '4', '+20 kg', ''],
    ['Sun', 'Bench Press', '1', '5', '80 kg', ''],
  ]);
  const flags = strengthSessionAccountingFlags('', intake, p);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED');
});

test('high-concurrency cardio/core-only day still cannot masquerade as a requested strength microdose', () => {
  const p = parsed([
    ['Mon', 'Back Squat', '3', '4', '165 kg', ''],
    ['Tue', 'Overhead Press', '2', '5', '65 kg', ''],
    ['Fri', 'Weighted Chin-up', '2', '4', '+45 kg', ''],
    ['Sun', 'Run', '1', '40 min', 'Easy', ''],
    ['Sun', 'Dead Bug', '2', '8 / side', 'BW', ''],
  ]);
  const flags = strengthSessionAccountingFlags('', highConcurrency, p);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED');
});

test('two one-set resistance rows on a normal day count as two meaningful resistance sets', () => {
  const intake = { primary_goals: ['Build strength'], days_per_week: 4 };
  const p = parsed([
    ['Mon', 'Back Squat', '3', '4', '100 kg', ''],
    ['Tue', 'Overhead Press', '2', '5', '50 kg', ''],
    ['Fri', 'Weighted Chin-up', '2', '4', '+20 kg', ''],
    ['Sun', 'Bench Press', '1', '5', '80 kg', ''],
    ['Sun', 'Row', '1', '8', '60 kg', ''],
  ]);
  assert.deepEqual(strengthSessionAccountingFlags('', intake, p), []);
});

test('strength-session patch is idempotent once marker is present', () => {
  const source = `// Generic integrity guardrails for Phase 15.\n${STRENGTH_MICRODOSE_MARKER}`;
  assert.equal(patchStrengthSessionMicrodoseAccounting(source), source);
});
