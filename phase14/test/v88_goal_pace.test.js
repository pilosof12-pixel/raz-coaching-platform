import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  pacedGoals, prescribedPaces, collectGoalPaceFlags, collectStaticPaceFlags, buildGoalPaceBrief,
} from '../engine/v88_goal_pace.js';
import {
  renderTrainingWeek, appendTrainingWeek, collectSportWeekFlags,
} from '../engine/v83_in_season.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const CORE = JSON.parse(read('acceptance_intakes.json'));
const HARD = JSON.parse(read('hard_avatars.json'));
const MASTERS = fs.readFileSync(new URL('../../docs/qa/live-three-avatar/latest/masters_return-program.txt', import.meta.url), 'utf8');
const FOOTBALL = fs.readFileSync(new URL('../../docs/qa/live-three-avatar/latest/inseason_footballer-program.txt', import.meta.url), 'utf8');

test('a distance and a time are read as a pace', () => {
  const goals = pacedGoals(HARD.masters_return);
  assert.ok(goals.length);
  // 2 km in 8:58 is 269 s/km, which is 2:14.5 per 500 m.
  assert.equal(Math.round(goals[0].secPerKm), 269);
});

test('nonsense pairings are not read as goals', () => {
  assert.equal(pacedGoals({ current_numbers: 'Back Squat: 150 kg x 1' }).length, 0);
  assert.equal(pacedGoals({ current_numbers: 'Bodyweight 77 kg' }).length, 0);
  assert.equal(pacedGoals({}).length, 0);
});

test('a block that never visits race pace is flagged', () => {
  // The delivered block topped out at 2:32/500m against a 2:14.5 race pace.
  const flags = collectGoalPaceFlags(MASTERS, HARD.masters_return);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V88_GOAL_PACE_NEVER_TOUCHED');
  assert.match(flags[0].detail, /slower than the pace they already race at/);
});

test('a block that does visit race pace is not', () => {
  // The tactical avatar runs 400s at 1:44-1:46, which is faster than its
  // current 3 km race pace. A rule that flagged this would be wrong.
  assert.equal(collectGoalPaceFlags(read('run84_tactical_3k.txt'), CORE.tactical_3k).length, 0);
  assert.equal(collectStaticPaceFlags(read('run84_tactical_3k.txt'), CORE.tactical_3k).length, 0);
});

test('the bar is current race pace, not the target', () => {
  // Demanding target pace from week one is a different and far more arguable
  // rule; this one only asks the athlete to meet the pace they already hold.
  const paces = prescribedPaces(read('run84_tactical_3k.txt'));
  const fastest = paces.reduce((a, b) => (b.secPerKm < a.secPerKm ? b : a));
  const goal = pacedGoals(CORE.tactical_3k)[0];
  assert.ok(fastest.secPerKm < goal.secPerKm, 'fixture should already beat current race pace');
});

test('a pace identical in all four weeks is flagged', () => {
  const flags = collectStaticPaceFlags(MASTERS, HARD.masters_return);
  assert.ok(flags.length > 0);
  assert.equal(flags[0].exercise, 'Rowing Ergometer');
});

test('athletes without a timed goal get no pace brief', () => {
  assert.equal(buildGoalPaceBrief(CORE.youth_gymnastics), '');
  assert.equal(buildGoalPaceBrief(HARD.inseason_footballer), '');
  assert.match(buildGoalPaceBrief(HARD.masters_return), /TIMED GOAL IS A PACE/);
});

// --- the sport week an in-season athlete trains inside -----------------------

test('the training week is rendered for an in-season athlete only', () => {
  assert.match(renderTrainingWeek(HARD.inseason_footballer), /WEEKLY SCHEDULE/);
  assert.equal(renderTrainingWeek(HARD.masters_return), '');
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(renderTrainingWeek(intake), '', id);
  }
});

test('the week shows sport, gym, match and the protected day together', () => {
  const week = renderTrainingWeek(HARD.inseason_footballer);
  assert.match(week, /Football MATCH/);
  assert.match(week, /Football hard \+ gym/);
  assert.match(week, /\(protected\)/);
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) assert.match(week, new RegExp(d));
});

test('showing the week answers its own flag, and is idempotent', () => {
  assert.equal(collectSportWeekFlags(FOOTBALL, HARD.inseason_footballer).length, 1);
  const shown = appendTrainingWeek(FOOTBALL, HARD.inseason_footballer);
  assert.equal(collectSportWeekFlags(shown, HARD.inseason_footballer).length, 0);
  assert.equal(appendTrainingWeek(shown, HARD.inseason_footballer), shown);
  assert.ok(shown.indexOf('WEEKLY SCHEDULE') < shown.search(/START_WEEK1_TSV/i), 'the week belongs before the tables');
  assert.equal((shown.match(/START_WEEK\d_TSV/g) || []).length, 4, 'week tables damaged');
});
