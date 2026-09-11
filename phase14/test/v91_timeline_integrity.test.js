// A program may not contradict itself about the calendar.
//
// The delivered fight camp labelled Friday "Day -1", which puts the fight on
// Saturday, and the camp schedule printed a few lines above it gave the same
// athlete moderate MMA on that Saturday and light MMA on the Sunday. Training
// on fight day, and training after the fight, in one file, from one engine.
//
// The coach called this the type of error a coaching generator absolutely has
// to catch, and rated the MMA output down for it specifically.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectTimelineIntegrityFlags, repairTimelineIntegrity,
  campScheduleFinalWeek, workingDaysOf, buildTimelineIntegrityBrief,
} from '../engine/v91_timeline_integrity.js';
import { renderCampSchedule } from '../engine/v78_sport_taper.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const CORE = JSON.parse(read('acceptance_intakes.json'));
const COMP = JSON.parse(read('competition_avatars.json'));

const DAY = 86400000;
// Pin the fight to a Saturday inside the four-week window, so the block still
// reaches Day 0 in week 4 whatever day this suite runs.
const onSaturday = (w) => {
  const d = new Date(Date.now() + w * 7 * DAY);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 6 + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const FIGHT = onSaturday(4);
assert.ok(COMP.mma_fight_camp, 'fixture key must exist');
const FIGHTER = {
  ...COMP.mma_fight_camp,
  competition_date: FIGHT,
  weigh_in_date: new Date(Date.parse(FIGHT) - DAY).toISOString().slice(0, 10),
  event_type: 'combat',
  event_priority: 'A',
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, name, note = '') => [day, name, 'RPE-selected load', '2', '3', '90 sec', '7', note, ''].join('\t');
const week = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const block = (w4rows, calendar = '') => [
  'A camp.', '', calendar, '',
  week(1, [row('Tue', 'Pull-up')]), week(2, [row('Tue', 'Pull-up')]),
  week(3, [row('Tue', 'Pull-up')]), week(4, w4rows),
].join('\n');

test('the calendar stops at Day 0 and names the fight', () => {
  const rendered = renderCampSchedule(FIGHTER);
  const w4 = rendered.split('\n').find((l) => /^W4 \|/.test(l));
  assert.ok(w4, 'the final week must be rendered');
  assert.match(w4, /FIGHT DAY/, 'the event day is named, not trained through');
  assert.match(w4, /D-1 /, 'every day of the event week carries its offset');
  // Sunday is after the fight and belongs to no week of this block.
  assert.match(w4, /\|\s*-\s*\|/, 'the day after the fight is empty');
});

test('a calendar that trains through the event is caught', () => {
  const stale = ['CAMP SCHEDULE', 'x', '',
    ' | Mon | Tue | Wed | Thu | Fri | Sat | Sun | hard contact',
    'W4 | MMA technical | MMA moderate + gym | MMA technical | MMA moderate | MMA technical + gym | MMA moderate | MMA light | 0 of 3'].join('\n');
  const program = block([row('Tue', 'Pull-up', 'Day -4.'), row('Fri', 'Explosive Push-up', 'Day -1.')], stale);
  const flags = collectTimelineIntegrityFlags(program, FIGHTER);
  const found = flags.find((f) => f.code === 'V91_CALENDAR_TRAINS_THROUGH_THE_EVENT');
  assert.ok(found, `expected the contradiction to be caught, got ${flags.map((f) => f.code).join(', ')}`);
  assert.match(found.detail, /Sat MMA moderate/);
});

test('a gym session on or after the event is caught and removed', () => {
  const program = block([row('Tue', 'Pull-up'), row('Sat', 'Back Squat'), row('Sun', 'Cable Row')]);
  const flags = collectTimelineIntegrityFlags(program, FIGHTER);
  assert.ok(flags.some((f) => f.code === 'V91_SESSION_ON_OR_AFTER_DAY_ZERO'));

  const fixed = repairTimelineIntegrity(program, FIGHTER);
  const days = workingDaysOf(fixed, 4);
  assert.ok(days.has('tue'), 'work before the event is untouched');
  assert.ok(!days.has('sat') && !days.has('sun'), 'nothing survives on or after Day 0');
  assert.equal((fixed.match(/START_WEEK\d_TSV/g) || []).length, 4, 'the week tables survive');
});

test('the repair answers its own flags and converges', () => {
  const stale = ['CAMP SCHEDULE', 'x', '',
    ' | Mon | Tue | Wed | Thu | Fri | Sat | Sun | hard contact',
    'W4 | MMA technical | MMA moderate + gym | MMA technical | MMA moderate | MMA technical + gym | MMA moderate | MMA light | 0 of 3'].join('\n');
  const program = block([row('Tue', 'Pull-up'), row('Sat', 'Back Squat')], stale);
  assert.ok(collectTimelineIntegrityFlags(program, FIGHTER).length >= 2);
  const fixed = repairTimelineIntegrity(program, FIGHTER);
  assert.equal(collectTimelineIntegrityFlags(fixed, FIGHTER).length, 0, 'the repair must answer its own flags');
  assert.equal(repairTimelineIntegrity(fixed, FIGHTER), fixed, 'repair is not idempotent');
});

test('the calendar is readable back as data, not just printed', () => {
  const parsed = campScheduleFinalWeek(renderCampSchedule(FIGHTER));
  assert.ok(parsed, 'a rendered table nobody can parse is a claim nobody checks');
  assert.equal(parsed.byDay.get('sat'), 'FIGHT DAY');
  assert.equal(parsed.byDay.get('sun'), '-');
});

test('an athlete with no event is left entirely alone', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    const program = block([row('Sat', 'Back Squat')]);
    assert.equal(collectTimelineIntegrityFlags(program, intake).length, 0, id);
    assert.equal(repairTimelineIntegrity(program, intake), program, id);
    assert.equal(buildTimelineIntegrityBrief(intake), '', id);
  }
});

test('the brief tells the model the week stops at Day 0', () => {
  const brief = buildTimelineIntegrityBrief(FIGHTER);
  assert.match(brief, /MAY NOT CONTRADICT ITSELF/);
  assert.match(brief, /NOTHING IS SCHEDULED ON DAY 0/);
  assert.match(brief, /two views of one week/);
});
