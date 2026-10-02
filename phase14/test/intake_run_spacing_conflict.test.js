// An intake can contradict itself, and the model pays for it.
//
// The sprint triathlete's sport_schedule put a long run on Sunday and running
// intervals on Monday, while her own notes said "No two running days are
// consecutive, which is deliberate" because the achilles does not tolerate
// back-to-back ones. In run #159 that build ran 1201 seconds, exhausted the job
// budget at two reasoning efforts and delivered nothing. Every other avatar in
// that run reached a program.
//
// Both halves are mine: I wrote that fixture, and I also said in the run's own
// commit message that her intake had been corrected.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectIntakeClarifications,
  requiredClarifications,
  scheduleContradictsStatedRunSpacing,
} from '../intake_clarification.js';

const RULE = 'No two running days are consecutive, which is deliberate: the achilles tolerates the current three runs and does not tolerate back-to-back ones.';

const base = (schedule, notes = RULE) => ({
  age: 38,
  primary_goals: ['Go sub-1:15 at the sprint triathlon in 8 weeks'],
  secondary_goals: ['Stop losing time in the swim'],
  days_per_week: 2,
  available_gym_days: ['Tue', 'Fri'],
  sport: 'Triathlon (sprint distance)',
  sport_sessions_per_week: 7,
  sport_schedule: schedule,
  notes,
});

const CONTRADICTORY = [
  { day: 'Mon', type: 'Run intervals', intensity: 'hard' },
  { day: 'Tue', type: 'Swim', intensity: 'moderate' },
  { day: 'Wed', type: 'Run easy', intensity: 'light' },
  { day: 'Thu', type: 'Bike', intensity: 'moderate' },
  { day: 'Fri', type: 'Swim technique', intensity: 'light' },
  { day: 'Sat', type: 'Bike long', intensity: 'hard' },
  { day: 'Sun', type: 'Run long', intensity: 'moderate' },
];

const COHERENT = CONTRADICTORY.map((e) =>
  e.day === 'Sat' ? { ...e, type: 'Run long', intensity: 'moderate' }
  : e.day === 'Sun' ? { ...e, type: 'Bike long', intensity: 'hard' }
  : e);

test('a Sunday run beside a Monday run is caught across the week boundary', () => {
  const found = scheduleContradictsStatedRunSpacing(base(CONTRADICTORY));
  assert.ok(found, 'the run #159 intake must be recognised as contradictory');
  assert.deepEqual(found.run_days, ['Mon', 'Wed', 'Sun']);
  assert.deepEqual(found.pairs, [['Mon', 'Sun']], 'reading the week as a flat list is what missed this');
});

test('the corrected week is accepted', () => {
  assert.equal(scheduleContradictsStatedRunSpacing(base(COHERENT)), null);
  const ids = detectIntakeClarifications(base(COHERENT)).map((q) => q.id);
  assert.ok(!ids.includes('run_day_spacing_conflict'));
});

// Plenty of runners train on consecutive days. Nothing is asked unless the
// athlete has said it should not happen.
test('consecutive runs alone are not a contradiction', () => {
  const noRule = base(CONTRADICTORY, 'Works full time with two young children.');
  assert.equal(scheduleContradictsStatedRunSpacing(noRule), null);
});

test('the rule alone, with no schedule to check, asks nothing', () => {
  assert.equal(scheduleContradictsStatedRunSpacing({ ...base([]), sport_schedule: [] }), null);
});

test('it is asked as a required question the build stops for', () => {
  const questions = detectIntakeClarifications(base(CONTRADICTORY));
  const q = questions.find((x) => x.id === 'run_day_spacing_conflict');
  assert.ok(q, 'the contradiction must reach the athlete');
  assert.match(q.prompt, /Mon and Sun/);
  assert.match(q.prompt, /consecutive/i);
  assert.ok(requiredClarifications(questions).some((x) => x.id === 'run_day_spacing_conflict'),
    'a contradiction is worth stopping for; it costs a whole job budget to send');
});

// The cap is four questions, and a contradiction must not be the one dropped.
test('the contradiction survives a crowded question list', () => {
  const crowded = {
    ...base(CONTRADICTORY),
    primary_goals: ['Achieve first bar muscle-up', 'Freestanding handstand', 'One-arm pull-up', 'Front lever'],
    current_numbers: '',
    performance_markers: [],
  };
  const ids = detectIntakeClarifications(crowded).map((q) => q.id);
  assert.ok(ids.includes('run_day_spacing_conflict'), ids.join(', '));
});

// Answering it closes it, like every other clarification.
test('an answer settles it', () => {
  const answered = {
    ...base(CONTRADICTORY),
    clarification_answers: { run_day_spacing_conflict: 'Move the long run to Saturday and put the long ride on Sunday.' },
  };
  const ids = detectIntakeClarifications(answered).map((q) => q.id);
  assert.ok(!ids.includes('run_day_spacing_conflict'));
});
