import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  weeklyExposures, describeExposures, collectFrequencyClaimFlags, repairFrequencyClaim,
} from '../engine/v61_weekly_exposures.js';

const HYBRID = {
  days_per_week: 4,
  sport_schedule: [
    { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
    { day: 'Sat', intensity: 'moderate' },
  ],
};

const WEEK = [
  'START_WEEK1_TSV',
  'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
  'Mon\tOne-Arm Pull-up\tBW\t3\t1-2\t150 s\t8\tPrimary.\t',
  'Mon\tBack Squat\t175 kg\t3\t3\t3 min\t8\tPrimary.\t',
  'Tue\tAssisted One-Arm Pull-up\tband\t2\t1\t120 s\t6\tTechnical.\t',
  'Thu\tRun\teasy\t1\t18 km\tN/A\t5\tLong run.\t',
  'Fri\tChin-up\tBW\t2\t4\t120 s\t7\tSupport.\t',
  'Sun\tOverhead Press\t70 kg\t2\t4\t150 s\t7.5\tSecondary.\t',
  'END_WEEK1_TSV',
].join('\n');

const build = (narrative) => `${narrative}\n${WEEK}`;

// Five training days: four with strength work, one that is only a run.
test('exposures are counted from the prescription', () => {
  const ex = weeklyExposures(WEEK, 1, HYBRID);
  assert.equal(ex.total, 5);
  assert.equal(ex.strength, 4);
  assert.equal(ex.enduranceOnly, 1);
  assert.equal(ex.sport, 5);
});

// A day is counted once by what it holds, not once per exercise.
test('a strength day that finishes with a jog is still one day', () => {
  const mixed = WEEK.replace('END_WEEK1_TSV', 'Mon\tRun\teasy\t1\t20 min\tN/A\t4\tCooldown.\t\nEND_WEEK1_TSV');
  const ex = weeklyExposures(mixed, 1, HYBRID);
  assert.equal(ex.total, 5, 'still five days');
  assert.equal(ex.enduranceOnly, 1, 'Monday is not an endurance-only day');
});

// The review asked for these apart: three runs and a ruck is four conditioning
// exposures, and reporting "2 endurance days" hid that entirely.
test('runs and rucks are counted as separate exposures', () => {
  const withRuck = WEEK.replace('END_WEEK1_TSV', 'Sat\tBackpack Carry\t20 kg\t1\t8 km\tN/A\t6\tRuck.\t\nEND_WEEK1_TSV');
  const ex = weeklyExposures(withRuck, 1, HYBRID);
  assert.equal(ex.runningExposures, 1);
  assert.equal(ex.ruckExposures, 1);
  assert.equal(ex.conditioningExposures, 2);
});

test('the description names what the figure counts', () => {
  const text = describeExposures(weeklyExposures(WEEK, 1, HYBRID));
  assert.equal(text, '5 training days/week (4 strength, 1 running), plus 5 sport sessions');
});

// The live defect: the Overview quoted intake.days_per_week while the table
// showed five days.
test('a claim that matches no real exposure count is rejected', () => {
  const flags = collectFrequencyClaimFlags(build('This block runs 4 structured sessions/week.'), HYBRID);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V61_FREQUENCY_CLAIM_MISMATCH');
  assert.equal(flags[0].claimed, 4);
  assert.equal(flags[0].actual, 5);
});

// The number alone is not the test: a qualified figure that names what it
// counts is honest, an unqualified one reads as the whole week.
test('a qualified claim that names its category is accepted', () => {
  assert.equal(collectFrequencyClaimFlags(build('Expect 4 strength sessions/week.'), HYBRID).length, 0);
  assert.equal(collectFrequencyClaimFlags(build('Expect 1 endurance session/week.'), HYBRID).length, 0);
  assert.equal(collectFrequencyClaimFlags(build('Expect 5 sessions/week.'), HYBRID).length, 0);
});

test('an unqualified figure must be the whole week', () => {
  assert.equal(collectFrequencyClaimFlags(build('Expect 4 sessions/week.'), HYBRID).length, 1,
    'four is the strength count, but unqualified it reads as the week');
});

test('the repair states the counted week and converges', () => {
  const bad = build('This block runs 4 structured sessions/week.');
  const fixed = repairFrequencyClaim(bad, HYBRID);
  assert.equal(collectFrequencyClaimFlags(fixed, HYBRID).length, 0);
  assert.match(fixed, /5 training days\/week \(4 strength, 1 running\)/);
  assert.equal(repairFrequencyClaim(fixed, HYBRID), fixed, 'idempotent');
});

test('a program with no claim is untouched', () => {
  const clean = build('This block protects the primaries.');
  assert.equal(repairFrequencyClaim(clean, HYBRID), clean);
});

// The browser exporter cannot import the engine, so it carries its own copy of
// this counting. Two implementations of one rule is exactly how a detector and
// a repair drift apart, so assert they agree rather than trusting they do.
test('the spreadsheet exporter counts the same week as the engine', () => {
  const src = fs.readFileSync(new URL('../public/spreadsheet-parity.js', import.meta.url), 'utf8');
  const start = src.indexOf('const ENDURANCE_RE');
  const end = src.indexOf('function describeExposures');
  assert.ok(start > 0 && end > start, 'browser counter not found');

  const rows = WEEK.split('\n').slice(2, -1).map((l) => l.split('\t'))
    .map((c) => ({ day: c[0], exercise: c[1] }));
  const ctx = { normalizedRows: () => rows, week: {} };
  vm.createContext(ctx);
  vm.runInContext(`${src.slice(start, end)}; result = weeklyExposures(week);`, ctx);

  const engine = weeklyExposures(WEEK, 1, HYBRID);
  assert.equal(ctx.result.total, engine.total, 'total days must agree');
  assert.equal(ctx.result.strength, engine.strength, 'strength days must agree');
  assert.equal(ctx.result.enduranceOnly, engine.enduranceOnly, 'endurance-only days must agree');
  assert.equal(ctx.result.runningExposures, engine.runningExposures, 'running exposures must agree');
  assert.equal(ctx.result.ruckExposures, engine.ruckExposures, 'ruck exposures must agree');
  assert.equal(ctx.result.conditioningExposures, engine.conditioningExposures, 'conditioning exposures must agree');
});

// Against the programs a coach actually reviewed.
test('the live run #81 programs count as the review described', () => {
  const dir = path.join(process.cwd(), '..', 'docs/qa/live-three-avatar/latest');
  const h = path.join(dir, 'advanced_hybrid-program.txt');
  const t = path.join(dir, 'tactical_3k-program.txt');
  if (!fs.existsSync(h) || !fs.existsSync(t)) return;
  const hx = weeklyExposures(fs.readFileSync(h, 'utf8'), 1, HYBRID);
  assert.equal(hx.total, 5);
  assert.equal(hx.strength, 4);
  assert.equal(hx.enduranceOnly, 1, 'the review read this as 4 strength + 1 endurance');
  const tx = weeklyExposures(fs.readFileSync(t, 'utf8'), 1, {});
  assert.equal(tx.total, 5, 'Sessions A-E');
  assert.equal(tx.strength, 3, 'the intake asked for 3');
});
