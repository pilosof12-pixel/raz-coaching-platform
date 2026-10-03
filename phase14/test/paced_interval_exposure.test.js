// TARGET_MODALITY_EXPOSURE_REDUCED is a frequency rule: do not silently remove
// target-modality practice. Run #161 shipped the sprint triathlete DIRTY on it
// for a week in which she ran on four days.
//
// Week 4 consolidated her intervals from 5 x 4 min to 4 x 3 min at
// 4:35-4:37/km. That is 12 minutes of work, under the 15-minute floor that
// keeps a warm-up jog from counting as an exposure, so Monday stopped counting
// and four running days read as two.

import test from 'node:test';
import assert from 'node:assert/strict';

import { endurancePerformanceIntegrityFlags } from '../engine/phase15_elite_guardrails.js';

// The required exposure count comes from the labelled sport schedule, as it
// does for the real athlete -- not from current_numbers, which this rule does not
// read. A first draft of this fixture put "3 runs a week" there, the requirement
// silently fell to one, and the tests that expect a flag could never get one.
const INTAKE = {
  age: 38,
  primary_goals: ['Go sub-1:15 at the sprint triathlon in 8 weeks, from a current 1:22'],
  secondary_goals: [],
  current_numbers: '5 km standalone: 23:05',
  performance_markers: ['5 km run: 24:30'],
  sport: 'Triathlon (sprint distance)',
  sport_schedule: [
    { day: 'Mon', type: 'Run intervals', intensity: 'hard' },
    { day: 'Tue', type: 'Swim', intensity: 'moderate' },
    { day: 'Wed', type: 'Run easy', intensity: 'light' },
    { day: 'Thu', type: 'Bike', intensity: 'moderate' },
    { day: 'Fri', type: 'Swim technique', intensity: 'light' },
    { day: 'Sat', type: 'Run long', intensity: 'moderate' },
    { day: 'Sun', type: 'Bike long', intensity: 'hard' },
  ],
};

const IDX = { day: 0, exercise: 1, weight: 2, sets: 3, reps: 4, notes: 7 };
const parsedOf = (rows) => ({ idx: IDX, rows: rows.map((cells) => ({ cells })) });
const r = (day, ex, load, sets, reps, notes = '') => [day, ex, load, sets, reps, '90 sec', '7', notes, ''];

const exposureFlags = (rows) => endurancePerformanceIntegrityFlags('', INTAKE, parsedOf(rows))
  .filter((f) => f.code === 'TARGET_MODALITY_EXPOSURE_REDUCED');

test('a consolidated interval session still counts as a running day', () => {
  const week4 = [
    r('Mon', 'Run', '4:35-4:37 /km', '4', '3 min', 'Retain Week 3 pace quality with less total work.'),
    r('Wed', 'Run', '5:20-5:45 /km', '1', '35 min', 'Shorter easy run.'),
    r('Sat', 'Run', '5:10-5:35 /km', '1', '60 min', 'Back down from Week 3.'),
  ];
  assert.deepEqual(exposureFlags(week4), [], 'three running days, three required');
});

test('a single unpaced jog still does not count', () => {
  const week = [
    r('Mon', 'Run', 'Easy', '1', '6 min', 'Shakeout only.'),
    r('Wed', 'Run', '5:20-5:45 /km', '1', '35 min'),
    r('Sat', 'Run', '5:10-5:35 /km', '1', '60 min'),
  ];
  assert.equal(exposureFlags(week).length, 1, 'six easy minutes is not a running exposure');
});

test('a week that really drops a running day is still caught', () => {
  const week = [
    r('Mon', 'Run', '4:35-4:37 /km', '4', '3 min'),
    r('Sat', 'Run', '5:10-5:35 /km', '1', '60 min'),
  ];
  assert.equal(exposureFlags(week).length, 1);
});

test('the message no longer claims to be about Week 1', () => {
  const [flag] = exposureFlags([r('Sat', 'Run', '5:10-5:35 /km', '1', '60 min')]);
  assert.ok(flag);
  assert.doesNotMatch(flag.message, /Week 1 programs/,
    'the rule runs on later weeks too, and "Week 1" sent the reader to the wrong week');
});
