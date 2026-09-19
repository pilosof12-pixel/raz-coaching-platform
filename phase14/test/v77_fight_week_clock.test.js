import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  daysOut, eventWeekday, weighInDaysOut,
  collectFightWeekClockFlags, repairFightWeekClock, buildFightWeekClockBrief,
} from '../engine/v77_fight_week_clock.js';

// Pinned rather than read from docs/qa/.../latest: acceptance runs overwrite
// that directory, and once the engine started preventing these defects the
// live programs stopped exhibiting them -- so the tests were asserting the
// presence of bugs in programs that no longer had any.
const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const CAMP = fs.readFileSync(new URL('./fixtures/run92_mma_fight_camp_pre_rules.txt', import.meta.url), 'utf8');
// A fight on a Sunday roughly four weeks out, weighing in the day before.
//
// This date used to be written down as 2026-09-27, and the suite failed on
// 19 September because the fight was then eight days away. Block week is
// derived from the hours remaining to the event, not from the calendar, so a
// pinned date walks backwards through the block as real time passes: week 4
// becomes week 3, then week 2, and eventually week 1 IS the competition week
// and the countdown belongs there -- at which point "earlier weeks are not put
// on a countdown" is asserting something false about a correct program.
//
// Only the weekday and the one-day weigh-in gap are load-bearing here: every
// assertion below is about Sunday, about the gap, or about which week the
// countdown lands in. So the Sunday is chosen relative to today.
//
// The window is narrow at BOTH ends and was measured rather than guessed. Under
// 22 days the fight moves out of week 4; at 30 days and beyond week 4 stops
// carrying the countdown at all, because the event no longer falls inside the
// block. The safe band is 22 to 29 days. Stepping forward to the next Sunday
// from day 22 lands in 22..28 inclusive -- exactly one Sunday falls in any
// seven-day window -- so every possible run date sits inside the band.
const sundayAtLeast = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7)); // forward to Sunday
  return d;
};
const iso = (d) => d.toISOString().slice(0, 10);
const FIGHT_DAY = sundayAtLeast(22);
const WEIGH_IN = new Date(FIGHT_DAY);
WEIGH_IN.setUTCDate(WEIGH_IN.getUTCDate() - 1);
const FIGHTER = { ...COMP.mma_fight_camp, competition_date: iso(FIGHT_DAY), weigh_in_date: iso(WEIGH_IN) };

test('an athlete with no event is untouched', () => {
  const g = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(collectFightWeekClockFlags(g, intake).length, 0, id);
    assert.equal(repairFightWeekClock(g, intake), g, id);
    assert.equal(buildFightWeekClockBrief(intake), '', id);
  }
});

test('the countdown is measured from the day the event falls on', () => {
  assert.equal(eventWeekday(FIGHTER), 'sun');
  assert.equal(daysOut('Tue', FIGHTER), 5);
  assert.equal(daysOut('Fri', FIGHTER), 2);
  assert.equal(daysOut('Sun', FIGHTER), 0);
});

test('a block with no date cannot put itself on a clock', () => {
  assert.equal(eventWeekday(COMP.mma_fight_camp), null);
  assert.equal(collectFightWeekClockFlags(CAMP, COMP.mma_fight_camp).length, 0);
});

test('weigh-in is located in the countdown', () => {
  assert.equal(weighInDaysOut(FIGHTER), 1);
});

test('a competition week presented by weekday alone is flagged', () => {
  assert.ok(collectFightWeekClockFlags(CAMP, FIGHTER).some((f) => f.code === 'V77_FIGHT_WEEK_NOT_ON_THE_CLOCK'));
});

test('the repair puts fight week on the clock and converges', () => {
  const fixed = repairFightWeekClock(CAMP, FIGHTER);
  assert.equal(collectFightWeekClockFlags(fixed, FIGHTER).length, 0);
  assert.equal(repairFightWeekClock(fixed, FIGHTER), fixed, 'idempotent');
  assert.match(fixed, /Day -5:/);
  assert.match(fixed, /Day -2:/);
});

// Only the competition week is a countdown; earlier weeks stay ordinary.
test('earlier weeks are not put on a countdown', () => {
  const fixed = repairFightWeekClock(CAMP, FIGHTER);
  const week1 = fixed.split('START_WEEK1_TSV')[1].split('END_WEEK1_TSV')[0];
  assert.equal(/Day -\d+:/.test(week1), false);
});

test('the weigh-in day is called out where it falls', () => {
  const fixed = repairFightWeekClock(CAMP, FIGHTER);
  const week4 = fixed.split('START_WEEK4_TSV')[1].split('END_WEEK4_TSV')[0];
  if (/Day -1:/.test(week4)) assert.match(week4, /Weigh-in today/);
});

test('the brief asks the model to build the week backwards', () => {
  const brief = buildFightWeekClockBrief(FIGHTER);
  assert.match(brief, /Day -7 through Day 0/);
  assert.match(brief, /build that week backwards/i);
  assert.match(brief, /Weigh-in is Day -1/);
});
