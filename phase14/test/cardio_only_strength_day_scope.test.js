// CARDIO_ONLY_STRENGTH_DAY says "each listed gym day must contain actual
// strength/skill work", and it used to check every day in the program instead.
//
// For an endurance athlete those are not the same thing. The sprint triathlete
// has two gym days and seven sport sessions, so most of her week is cardio-only
// by design. A Thursday reading "Zone 2 Bike 60 min" was charged here as a gym
// day with no strength in it. The flag blocks and repairPhase15Program does not
// clear it, so a correct triathlon week was a dead build waiting for the right
// intake -- which is in a live run as this is written.
//
// The narrowing must not cost the rule its teeth, so each real detection it had
// is asserted here as well.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePhase15Program } from '../engine/phase15_program_qa.js';

const INTAKE = {
  age: 38,
  primary_goals: ['Go sub-1:15 at the sprint triathlon in 8 weeks'],
  secondary_goals: ['Hold squat and single-leg strength through the build'],
  days_per_week: 2,
  session_duration_minutes: 75,
  gym_availability_mode: 'limited',
  available_gym_days: ['Tue', 'Fri'],
  equipment: 'pool, bike, full gym',
  sport: 'Triathlon (sprint distance)',
  current_numbers: 'Back Squat: 75 kg x 5',
  event_type: 'triathlon',
};

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, exercise, sets = '1', reps = '1') =>
  [day, exercise, '', sets, reps, '', '6', 'Controlled.', ''].join('\t');
const program = (rows) =>
  [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, H, ...rows, `END_WEEK${w}_TSV`].join('\n')).join('\n\n');

function flagged(rows, intake = INTAKE) {
  let flags = [];
  try {
    flags = validatePhase15Program(program(rows), intake)?.flags || [];
  } catch (err) {
    flags = err?.flags || [];
  }
  return flags.map((f) => f.code).includes('CARDIO_ONLY_STRENGTH_DAY');
}

// Both gym days carry the strength she asked for; the rest of the week is sport.
const LEGITIMATE = [
  row('Mon', 'Run Intervals', '6', '400 m'),
  row('Tue', 'Swim', '1', '2000 m'),
  row('Tue', 'Back Squat', '3', '5'),
  row('Wed', 'Easy Run', '1', '40 min'),
  row('Thu', 'Zone 2 Bike', '1', '60 min'),
  row('Fri', 'Swim Technique', '1', '1500 m'),
  row('Fri', 'Split Squat', '3', '8'),
  row('Sat', 'Zone 2 Bike', '1', '90 min'),
  row('Sun', 'Long Run', '1', '70 min'),
];

test('a correct triathlon week with cardio-only days is not charged for them', () => {
  assert.equal(
    flagged(LEGITIMATE),
    false,
    'Thursday and Saturday are zone 2 rides on purpose and are not gym days',
  );
});

test('a named gym day spent on a zone 2 ride is still caught', () => {
  assert.equal(flagged([
    row('Mon', 'Run Intervals', '6', '400 m'),
    row('Tue', 'Zone 2 Bike', '1', '60 min'),
    row('Fri', 'Split Squat', '3', '8'),
    row('Fri', 'Swim Technique', '1', '1500 m'),
  ]), true);
});

test('a named gym day that got no session at all is still caught', () => {
  assert.equal(flagged(LEGITIMATE.filter((r) => !r.startsWith('Fri'))), true);
});

// Nothing to narrow to, so the rule behaves exactly as it did before.
test('with no gym days named, every training day must still carry work', () => {
  assert.equal(flagged(LEGITIMATE, { ...INTAKE, available_gym_days: [] }), true);
});

// Known and unchanged: this rule works off a denylist of cardio wording, so
// cardio it does not recognise reads as work. A gym day carrying only a swim
// was invisible to it before this narrowing and still is. Asserted rather than
// left implicit, so the blind spot is on the record and a future fix has
// somewhere to land.
test('a swim-only gym day remains undetected, as it was before', () => {
  assert.equal(flagged([
    row('Tue', 'Swim', '1', '2000 m'),
    row('Fri', 'Swim Technique', '1', '1500 m'),
    row('Fri', 'Split Squat', '3', '8'),
    row('Sun', 'Long Run', '1', '70 min'),
  ]), false);
});

// Narrowing this rule first broke two stress archetypes that had converged for
// weeks: a fight camp labels its table by countdown to the bout, so none of its
// days match a weekday name, and matching named gym days against it found
// nothing and read that as "her gym days got no sessions at all". Where the
// table does not speak in weekdays there is nothing to narrow to.
test('a table not labelled by weekday falls back to the previous behaviour', () => {
  const countdown = [
    row('Fight Week -3', 'Sparring', '1', '5 rounds'),
    row('Fight Week -3', 'Back Squat', '3', '5'),
    row('Fight Week -2', 'Zone 2 Bike', '1', '45 min'),
  ];
  assert.equal(flagged(countdown), true, 'the cardio-only countdown day is still charged');

  const countdownClean = [
    row('Fight Week -3', 'Sparring', '1', '5 rounds'),
    row('Fight Week -3', 'Back Squat', '3', '5'),
    row('Fight Week -2', 'Trap Bar Deadlift', '3', '5'),
  ];
  assert.equal(flagged(countdownClean), false, 'and a countdown table with work on every day is not');
});

test('a session-labelled youth table is unaffected', () => {
  const sessions = [
    row('Session A', 'Controlled Handstand Kick-up', '3', '2'),
    row('Session B', 'Handstand Hold', '3', '20 sec'),
  ];
  assert.equal(
    flagged(sessions, { ...INTAKE, available_gym_days: ['Tue', 'Fri'], days_per_week: 2 }),
    false,
    'both sessions carry work, and neither is matched against a weekday',
  );
});
