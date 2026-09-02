import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  isInSeason, matchDays, protectedDays, collectInSeasonFlags, repairInSeason,
  repairSeasonNarrative, buildInSeasonBrief,
} from '../engine/v83_in_season.js';
import { intakeClarificationResult } from '../intake_clarification.js';

const HARD = JSON.parse(fs.readFileSync(new URL('./fixtures/hard_avatars.json', import.meta.url), 'utf8'));
const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const BASE = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
const FOOTBALLER = HARD.inseason_footballer;

test('a fixture list is recognised as a season, a dated event is not', () => {
  assert.equal(isInSeason(FOOTBALLER), true);
  assert.deepEqual(matchDays(FOOTBALLER), ['sat']);
  assert.deepEqual(protectedDays(FOOTBALLER), ['fri']);
  // Nothing else may be mistaken for a season -- taking the taper away from an
  // athlete who needs one is the expensive direction of this error.
  for (const [id, intake] of Object.entries({ ...COMP, ...CORE, masters_return: HARD.masters_return })) {
    assert.equal(isInSeason(intake), false, id);
    assert.equal(buildInSeasonBrief(intake), '', id);
    assert.equal(repairInSeason(BASE, intake), BASE, id);
  }
});

test('an athlete with a real date is never treated as in-season', () => {
  const dated = { ...FOOTBALLER, competition_date: '2026-11-14' };
  assert.equal(isInSeason(dated), false, 'a stated date beats the fixture pattern');
});

test('the intake no longer demands a date the athlete does not have', () => {
  // This blocked the build outright: "a competitive match most Saturdays" read
  // as an event, and the engine refused to build without a date.
  const result = intakeClarificationResult(FOOTBALLER);
  assert.equal(result.ready, true);
  assert.deepEqual((result.questions || []).map((q) => q.id), []);
});

test('a genuine undated event is still asked for its date', () => {
  const oneOff = { notes: 'I have a big competition coming up and want to peak for it.', primary_goals: ['Win my first meet'] };
  const ids = (intakeClarificationResult(oneOff).questions || []).map((q) => q.id);
  assert.ok(ids.includes('competition_date'), 'a one-off event still needs its date');
});

test('peaking language in a season block is flagged and reworded', () => {
  const bad = `We will taper into competition week so you peak for the event.\n${BASE}`;
  const flags = collectInSeasonFlags(bad, FOOTBALLER).filter((f) => f.code === 'V83_SEASON_PLANNED_AS_EVENT');
  assert.equal(flags.length, 1);

  const fixed = repairSeasonNarrative(bad, FOOTBALLER);
  assert.doesNotMatch(fixed.split('START_WEEK1_TSV')[0], /\btaper|peak for|competition week\b/i);
  assert.match(fixed, /stay ready for/);
  assert.equal(repairSeasonNarrative(fixed, FOOTBALLER), fixed, 'narrative repair is not idempotent');
});

test('the week tables are never touched by the narrative repair', () => {
  const bad = `We will taper into competition week.\n${BASE}`;
  const fixed = repairSeasonNarrative(bad, FOOTBALLER);
  assert.equal(fixed.slice(fixed.search(/START_WEEK1_TSV/i)), bad.slice(bad.search(/START_WEEK1_TSV/i)));
});

test('a hard dose the day before a match is flagged; a primer is not', () => {
  // Judge the prescription, not the exercise name. One light set before a match
  // is ordinary practice, and keying the rule on the name made a flag its own
  // repair could never clear.
  const flags = collectInSeasonFlags(BASE, FOOTBALLER).filter((f) => f.code === 'V83_HIGH_COST_WORK_BEFORE_MATCH');
  assert.ok(flags.length > 0, 'the fixture loads Friday, the day before the match');
  for (const f of flags) assert.equal(f.day, 'fri');

  const fixed = repairInSeason(BASE, FOOTBALLER);
  assert.equal(collectInSeasonFlags(fixed, FOOTBALLER).length, 0);
  assert.equal(repairInSeason(fixed, FOOTBALLER), fixed, 'repair is not idempotent');
});

test('the protected day keeps the movement, at a cost that buys nothing back', () => {
  const fixed = repairInSeason(BASE, FOOTBALLER);
  const start = fixed.indexOf('START_WEEK1_TSV');
  const rows = fixed.slice(start, fixed.indexOf('END_WEEK1_TSV')).split('\n').slice(2)
    .map((l) => l.split('\t')).filter((c) => c.length > 5 && /^Fri/i.test(c[0]) && !/WARMUP/.test(c[1]));
  for (const row of rows) {
    if (!/deadlift|squat|nordic|rdl|good ?morning/i.test(row[1])) continue;
    assert.equal(row[3], '1', `${row[1]} still runs ${row[3]} sets the day before a match`);
  }
});

test('the brief says there is nothing to peak for, and names the protected day', () => {
  const brief = buildInSeasonBrief(FOOTBALLER);
  assert.match(brief, /THERE IS NO EVENT TO PEAK FOR/);
  assert.match(brief, /Do not taper/);
  assert.match(brief, /Friday is the day before a match/);
  assert.match(brief, /Saturday/);
});
