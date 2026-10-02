// An interval row describes its own warm-up, and that description used to make
// it a Zone-2 row.
//
// The sprint triathlete's Monday session was 4 x 90 sec at 4:37-4:40/km, RPE 7,
// noted "use 8 min easy warm-up and 6 min easy cooldown inside the session".
// That is correct coaching: 4:37/km is faster than her demonstrated 4:54/km 5K,
// which is what an interval is for. LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_
// PERFORMANCE flagged it anyway, because the word "easy" appeared somewhere in
// the row.
//
// There is no way to prescribe intervals and mention their warm-up without
// tripping that, so the rule could not be satisfied. In run #160 the model wrote
// the session three times, the gate refused it three times, and the program
// shipped still carrying the violation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePhase15Program } from '../engine/phase15_program_qa.js';

const INTAKE = {
  age: 38,
  primary_goals: ['Go sub-1:15 at the sprint triathlon in 8 weeks, from a current 1:22'],
  secondary_goals: ['Stop losing time in the swim: 750 m from 16:10 toward 14:30'],
  days_per_week: 2,
  session_duration_minutes: 75,
  gym_availability_mode: 'limited',
  available_gym_days: ['Tue', 'Fri'],
  equipment: 'pool, road bike and trainer, full gym, treadmill and road access',
  sport: 'Triathlon (sprint distance)',
  sport_sessions_per_week: 7,
  sport_schedule: [
    { day: 'Mon', type: 'Run intervals', intensity: 'hard' },
    { day: 'Tue', type: 'Swim', intensity: 'moderate' },
    { day: 'Wed', type: 'Run easy', intensity: 'light' },
    { day: 'Thu', type: 'Bike', intensity: 'moderate' },
    { day: 'Fri', type: 'Swim technique', intensity: 'light' },
    { day: 'Sat', type: 'Run long', intensity: 'moderate' },
    { day: 'Sun', type: 'Bike long', intensity: 'hard' },
  ],
  // 5 km in 23:05 is 4:37/km; the 5 km inside the triathlon is 4:54/km. The
  // slower anchor is the one the rule uses.
  current_numbers: 'Sprint triathlon: 1:22 (750 m swim 16:10, 20 km bike 38:40, 5 km run 24:30)\n5 km standalone: 23:05\nBack Squat: 75 kg x 5',
  performance_markers: ['5 km run: 24:30'],
  event_type: 'triathlon',
  event_priority: 'A',
  competition_date: new Date(Date.now() + 56 * 86400000).toISOString().slice(0, 10),
};

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const r = (day, exercise, load, sets, reps, rpe, notes) =>
  [day, exercise, load, sets, reps, '90 sec', rpe, notes, ''].join('\t');

const INTERVAL_WITH_EASY_WARMUP = r(
  'Mon', 'Run', '4:37-4:40/km', '4', '90 sec', '7',
  'Primary standalone pace visit for the week; use 8 min easy warm-up and 6 min easy cooldown inside the session, flat only.',
);
const EASY_RUN_CORRECT = r('Wed', 'Run', '5:25-5:45/km', '1', '20 min', '4',
  'Easy maintenance run only; keep it fully conversational and flat.');
const EASY_RUN_AT_RACE_PACE = r('Wed', 'Run', '4:20-4:30/km', '1', '20 min', '4',
  'Easy maintenance run only; keep it fully conversational and flat.');

const week = (rows) => [
  r('Tue', 'Swim', '2:05/100 m', '6', '100 m', '6', 'First swim exposure.'),
  r('Tue', 'Back Squat', '65 kg', '3', '3', '7', 'Main lift.'),
  r('Thu', 'Bike', 'Steady', '1', '60 min', '5', 'Aerobic ride.'),
  r('Fri', 'Swim', '2:00-2:02/100 m', '4', '100 m', '6', 'Technique-led.'),
  r('Fri', 'Barbell Hip Thrust', '70 kg', '2', '6', '7', 'Posterior chain.'),
  r('Sat', 'Run', '5:40-6:00/km', '1', '35 min', '4', 'Long steady run, conversational throughout.'),
  r('Sun', 'Bike', 'Steady', '1', '120 min', '5', 'Long ride.'),
  ...rows,
].join('\n');

const program = (rows) =>
  [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, H, week(rows), `END_WEEK${w}_TSV`].join('\n')).join('\n\n');

const codes = (rows) => {
  try { return (validatePhase15Program(program(rows), INTAKE)?.flags || []).map((f) => f.code); }
  catch (e) { return (e?.flags || []).map((f) => f.code); }
};

test('an interval row is not low-intensity because it mentions an easy warm-up', () => {
  assert.ok(
    !codes([INTERVAL_WITH_EASY_WARMUP, EASY_RUN_CORRECT]).includes('LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE'),
    'this is the session run #160 wrote three times and the gate refused three times',
  );
});

test('an easy run really prescribed at race pace is still caught', () => {
  assert.ok(
    codes([INTERVAL_WITH_EASY_WARMUP, EASY_RUN_AT_RACE_PACE]).includes('LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE'),
    'the rule must keep working where it is right: 4:20/km is not easy for a 4:54/km runner',
  );
});

// Only the warm-up phrase is removed, not the text around it, so a row that
// says both keeps the one that matters.
test('a mislabelled easy run keeps its other signals', () => {
  const both = r('Wed', 'Run', '4:20-4:30/km', '1', '20 min', '4',
    'Start with an easy warm-up, then hold Zone 2 for the main block.');
  assert.ok(codes([INTERVAL_WITH_EASY_WARMUP, both]).includes('LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE'));
});

test('a cooldown phrase is exempt the same way', () => {
  const interval = r('Mon', 'Run', '4:35/km', '5', '400 m', '8',
    'Repetition work; cool down at an easy jog for 8 minutes afterwards.');
  assert.ok(!codes([interval, EASY_RUN_CORRECT]).includes('LOW_INTENSITY_PACE_CONTRADICTS_CURRENT_PERFORMANCE'));
});
