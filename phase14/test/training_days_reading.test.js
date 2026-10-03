// TRAINING_DAYS_VS_INTAKE: a block that trains on more days than
// days_per_week has to say which reading governs. The sprint triathlete's block
// had two gym sessions and seven sport sessions and never connected the number
// she typed to the week she was given.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTrainingDaysReading, collectTrainingDaysReadingFlags } from '../engine/training_days_reading.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const r = (day, ex, load = '60 kg', sets = '3', reps = '5') => [day, ex, load, sets, reps, '2 min', '7', 'Controlled.', ''].join('\t');
const prog = (rows, head = 'A build block.') =>
  `${head}\n\n` + [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, H, ...rows, `END_WEEK${w}_TSV`].join('\n')).join('\n\n');

const INTAKE = {
  language: 'en',
  days_per_week: 2,
  available_gym_days: ['Tue', 'Fri'],
  sport: 'Triathlon (sprint distance)',
  sport_schedule: [{ day: 'Mon', type: 'Run intervals' }, { day: 'Wed', type: 'Run easy' }, { day: 'Sat', type: 'Run long' }],
};
const WEEK = [
  r('Mon', 'Run', '4:35/km', '5', '3 min'),
  r('Tue', 'Back Squat'),
  r('Wed', 'Run', '5:30/km', '1', '40 min'),
  r('Fri', 'Split Squat'),
  r('Sat', 'Run', '5:20/km', '1', '60 min'),
];

test('the reading is stated, on her days, and clears the rule', () => {
  const before = prog(WEEK);
  assert.ok(collectTrainingDaysReadingFlags(before, INTAKE).length, 'the rule fires on the block as delivered');
  const out = normalizeTrainingDaysReading(before, INTAKE);
  assert.equal(out.repaired, true);
  assert.match(out.program, /Your two gym sessions are on Tuesday and Friday/);
  assert.deepEqual(collectTrainingDaysReadingFlags(out.program, INTAKE), []);
  assert.ok(out.program.indexOf('Your two gym sessions') < out.program.indexOf('START_WEEK1_TSV'), 'in the narrative, not the table');
});

// The sentence must be true or it is not written: "your two gym sessions" over
// a table with three would be a claim the table contradicts.
test('nothing is claimed when a week holds a different number of gym days', () => {
  const three = [...WEEK, r('Thu', 'Deadlift')];
  assert.equal(normalizeTrainingDaysReading(prog(three), INTAKE).repaired, false);
});

test('nothing is claimed without a sport schedule to explain the other days', () => {
  assert.equal(normalizeTrainingDaysReading(prog(WEEK), { ...INTAKE, sport_schedule: [] }).repaired, false);
});

test('an English sentence is not written into a program in another language', () => {
  assert.equal(normalizeTrainingDaysReading(prog(WEEK), { ...INTAKE, language: 'he' }).repaired, false);
});

test('a block that already explains itself is left alone', () => {
  const explained = prog(WEEK, 'Your two gym sessions are Tuesday and Friday; the rest is triathlon.');
  const out = normalizeTrainingDaysReading(explained, INTAKE);
  assert.equal(out.repaired, false);
  assert.equal(out.program, explained);
});
