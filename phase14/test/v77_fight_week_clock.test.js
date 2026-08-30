import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  daysOut, eventWeekday, weighInDaysOut,
  collectFightWeekClockFlags, repairFightWeekClock, buildFightWeekClockBrief,
} from '../engine/v77_fight_week_clock.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const CAMP = fs.readFileSync(new URL('../../docs/qa/live-three-avatar/latest/mma_fight_camp-program.txt', import.meta.url), 'utf8');
// A fight on Sunday 27 September, weighing in the day before.
const FIGHTER = { ...COMP.mma_fight_camp, competition_date: '2026-09-27', weigh_in_date: '2026-09-26' };

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
