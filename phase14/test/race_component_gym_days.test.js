// SPORT_DAY_COUPLING_VIOLATION was unsatisfiable for a triathlete.
//
// A race component counts as a gym day because for most multi-component events
// it is one: a Hyrox card is sled pushes, sandbag lunges and wall balls, and
// those happen where the barbells are. Swimming, cycling and running do not.
//
// The sprint triathlete's components are Swim, Bike and Run, so every running
// day was counted as a gym day. She has two gym days and seven sport sessions,
// so no program for her can put her race work inside her gym days -- the gate
// could not be satisfied by any output. Run #160 is that in the record: four
// attempts raising the same violation with identical content, because the model
// was being asked for something that cannot exist. A salvage path then
// delivered the program anyway, still violating it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gymRelevantComponents, validateSportDayCouplingSemantic } from '../engine/semantic_program_qa.js';

test('the endurance disciplines are not gym work', () => {
  assert.deepEqual(gymRelevantComponents(['Swim', 'Bike', 'Run']), []);
  assert.deepEqual(gymRelevantComponents(['Swimming', 'Cycling', 'Running', 'Trail Run', 'Open Water Swim']), []);
});

// Rowing stays: a Hyrox row is an erg in the gym.
test('a Hyrox card keeps every component, rowing included', () => {
  const card = ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Row', 'Farmers Carry', 'Sandbag Lunge', 'Wall Ball'];
  assert.deepEqual(gymRelevantComponents(card), card);
});

test('a component that merely mentions a discipline is still gym work', () => {
  assert.deepEqual(gymRelevantComponents(['Run With Sandbag', 'Sled Pull']), ['Run With Sandbag', 'Sled Pull']);
});

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, exercise, sets = '1', reps = '1') =>
  [day, exercise, '', sets, reps, '', '6', 'Controlled.', ''].join('\t');
const program = (rows) =>
  [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, H, ...rows, `END_WEEK${w}_TSV`].join('\n')).join('\n\n');

const TRIATHLETE = {
  age: 38,
  primary_goals: ['Go sub-1:15 at the sprint triathlon in 8 weeks, from a current 1:22'],
  secondary_goals: ['Stop losing time in the swim: 750 m from 16:10 toward 14:30', 'Hold squat and single-leg strength through the build'],
  days_per_week: 2,
  session_duration_minutes: 75,
  gym_availability_mode: 'limited',
  available_gym_days: ['Tue', 'Fri'],
  equipment: 'pool, road bike and indoor trainer, full gym',
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
  current_numbers: 'Back Squat: 75 kg x 5\n750 m swim: 16:10',
  event_type: 'triathlon',
  event_priority: 'A',
  competition_date: new Date(Date.now() + 56 * 86400000).toISOString().slice(0, 10),
};

// The shape of a correct triathlon week: strength on the two days she named,
// sport everywhere else.
const CORRECT_WEEK = [
  row('Mon', 'Run', '4', '90 sec'),
  row('Tue', 'Swim', '6', '100 m'),
  row('Tue', 'Back Squat', '3', '3'),
  row('Tue', 'Reverse Lunge', '2', '6/leg'),
  row('Wed', 'Run', '1', '20 min'),
  row('Thu', 'Bike', '1', '60 min'),
  row('Fri', 'Swim', '4', '100 m'),
  row('Fri', 'Barbell Hip Thrust', '2', '6'),
  row('Fri', 'Seated Calf Raise', '2', '8'),
  row('Sat', 'Run', '1', '35 min'),
  row('Sun', 'Bike', '1', '120 min'),
];

test('a correct triathlon week can satisfy the gate at all', () => {
  assert.doesNotThrow(
    () => validateSportDayCouplingSemantic(program(CORRECT_WEEK), TRIATHLETE),
    'no program could satisfy this before: every run day counted as a gym day',
  );
});

// The gate keeps its teeth where it has them: strength work really outside the
// days she named is still a violation.
test('strength on a day she said she has no gym is still caught', () => {
  const strayLift = [...CORRECT_WEEK, row('Wed', 'Back Squat', '3', '5')];
  assert.throws(
    () => validateSportDayCouplingSemantic(program(strayLift), TRIATHLETE),
    (err) => err?.code === 'SPORT_DAY_COUPLING_VIOLATION',
  );
});

// A gym day she asked for that received no session at all is still caught.
test('a gym day left empty is still caught', () => {
  const noFriday = CORRECT_WEEK.filter((r) => !r.startsWith('Fri'));
  assert.throws(
    () => validateSportDayCouplingSemantic(program(noFriday), TRIATHLETE),
    (err) => err?.code === 'SPORT_DAY_COUPLING_VIOLATION',
  );
});

// Known and pre-existing, asserted so it is on the record rather than implied by
// the tests above passing. A gym day is identified from the work on it, and that
// identification reads a swim as work, so a Tuesday carrying nothing but a swim
// still counts as one of her two strength days. Removing the lifts from Friday
// therefore does NOT produce a count violation.
//
// This was invisible before the race-component fix: every run day was counted as
// a gym day, so violations always fired and nothing about the count could be
// observed. Checked against the original rather than assumed -- it is the same
// denylist weakness recorded in cardio_only_strength_day_scope.test.js, and
// widening it into an allowlist of strength movements is a larger change with
// real false-positive risk.
test('a gym day holding only a swim is still read as a strength day', () => {
  const liftsRemoved = CORRECT_WEEK.filter((r) => !/^Fri\t(?:Barbell Hip Thrust|Seated Calf Raise)/.test(r));
  assert.doesNotThrow(() => validateSportDayCouplingSemantic(program(liftsRemoved), TRIATHLETE));
});
