import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  competitionLifts, collectCompetitionWeekFlags, repairCompetitionWeek, buildCompetitionWeekBrief,
} from '../engine/v90_competition_week.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const CORE = JSON.parse(read('acceptance_intakes.json'));
const COMP = JSON.parse(read('competition_avatars.json'));
const iso = (w) => new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10);

assert.ok(COMP.weightlifter_meet_week, 'fixture key must exist');
const MEET = {
  ...COMP.weightlifter_meet_week,
  competition_date: iso(4),
  event_type: 'strength_meet',
  event_priority: 'A',
};

// A competition week built the way the coach asked it to be built.
const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, name, sets, reps, note = '') => [day, name, '80 kg', String(sets), String(reps), '3 min', '7', note, ''].join('\t');
const week = (n, lines) => `START_WEEK${n}_TSV\n${header}\n${lines.join('\n')}\nEND_WEEK${n}_TSV`;
const block = (lines) => [week(1, [row('Mon', 'Snatch', 4, 2)]), week(2, [row('Mon', 'Snatch', 4, 2)]),
  week(3, [row('Mon', 'Snatch', 3, 2)]), week(4, lines)].join('\n');

test('the competition lifts are read from the maxima the athlete tracks', () => {
  const lifts = competitionLifts(MEET);
  assert.ok(lifts.includes('Snatch'));
  assert.ok(lifts.includes('Clean and jerk'));
  // "Current training: 5 sessions per week" is not a lift.
  assert.ok(!lifts.some((l) => /current training/i.test(l)));
});

test('repeated doubles on a competition lift are redundant technical touches', () => {
  // The delivered meet week carried Snatch 5 x 2 on Day -4: ten reps of a
  // competition lift four days out, which the coach read as a training session
  // wearing a taper's name.
  const program = block([row('Day -5', 'Snatch', 3, 1), row('Day -4', 'Snatch', 5, 2)]);
  const flags = collectCompetitionWeekFlags(program, MEET);
  const touch = flags.filter((f) => f.code === 'V90_TECHNICAL_TOUCH_REDUNDANT');
  assert.equal(touch.length, 1);
  assert.match(touch[0].detail, /spends 10 reps on Snatch/);
  // A weightlifter is never told about a fight.
  assert.ok(!/fight/i.test(touch[0].detail), touch[0].detail);
});

test('three crisp singles are inside the budget', () => {
  const program = block([row('Day -5', 'Snatch', 3, 1), row('Day -4', 'Snatch', 3, 1)]);
  assert.equal(collectCompetitionWeekFlags(program, MEET).filter((f) => f.code === 'V90_TECHNICAL_TOUCH_REDUNDANT').length, 0);
});

test('the week may not get heavier as the event gets closer', () => {
  const program = block([
    row('Day -5', 'Snatch', 2, 1), row('Day -4', 'Snatch', 2, 1), row('Day -4', 'Chest-Supported Row', 4, 8),
  ]);
  const grows = collectCompetitionWeekFlags(program, MEET).filter((f) => f.code === 'V90_SESSION_GROWS_INTO_DAY_ZERO');
  assert.equal(grows.length, 1);
  assert.match(grows[0].detail, /Day -4 carries 6 working sets against 2 on Day -5/);
});

test('the last session before the event must be offered, not prescribed', () => {
  const program = block([row('Day -5', 'Snatch', 2, 1), row('Day -1', 'Snatch', 2, 1, 'Primer only.')]);
  const flags = collectCompetitionWeekFlags(program, MEET).filter((f) => f.code === 'V90_FINAL_PRIMER_MANDATORY');
  assert.equal(flags.length, 1);
});

test('a row-level qualifier is not an offer to skip the session', () => {
  // "Only if you feel snappy" against one box jump left the rule satisfied
  // while the snatches below it were still prescribed flatly.
  const program = block([
    row('Day -5', 'Snatch', 2, 1),
    row('Day -1', 'Box Jump', 2, 2, 'Full reset; only if you feel snappy.'),
    row('Day -1', 'Snatch', 2, 1, 'Primer only; every rep should feel fast.'),
  ]);
  assert.equal(collectCompetitionWeekFlags(program, MEET).filter((f) => f.code === 'V90_FINAL_PRIMER_MANDATORY').length, 1);

  const offered = block([
    row('Day -5', 'Snatch', 2, 1),
    row('Day -1', 'Snatch', 2, 1, 'This session is optional: skip it entirely if you are already sharp.'),
  ]);
  assert.equal(collectCompetitionWeekFlags(offered, MEET).filter((f) => f.code === 'V90_FINAL_PRIMER_MANDATORY').length, 0);
});

test('the repair answers every flag it raises, and converges', () => {
  const program = block([
    row('Day -5', 'Snatch', 3, 1), row('Day -5', 'Chest-Supported Row', 2, 5),
    row('Day -4', 'Snatch', 5, 2), row('Day -4', 'Plank', 2, 30),
    row('Day -1', 'Snatch', 2, 1, 'Primer only.'),
  ]);
  assert.ok(collectCompetitionWeekFlags(program, MEET).length >= 3);
  const fixed = repairCompetitionWeek(program, MEET);
  assert.equal(collectCompetitionWeekFlags(fixed, MEET).length, 0, 'the repair must answer its own flags');
  assert.equal(repairCompetitionWeek(fixed, MEET), fixed, 'repair is not idempotent');
  assert.match(fixed, /optional/i);
  // Singles, not doubles -- and the competition lift itself is never deleted.
  assert.ok(/Day -4\tSnatch\t[^\t]*\t3\t1\t/.test(fixed), fixed.slice(fixed.indexOf('START_WEEK4')));
});

test('the trim never reaches for the competition lift', () => {
  const program = block([
    row('Day -5', 'Snatch', 1, 1),
    row('Day -4', 'Snatch', 3, 1), row('Day -4', 'Cable Row', 3, 8),
  ]);
  const fixed = repairCompetitionWeek(program, MEET);
  const w4 = fixed.slice(fixed.indexOf('START_WEEK4_TSV'));
  assert.ok(/Day -4\tSnatch\t[^\t]*\t3\t1\t/.test(w4), 'the snatch keeps its sets');
});

test('an athlete with no event is left alone', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    const program = block([row('Day -4', 'Snatch', 5, 2)]);
    assert.equal(collectCompetitionWeekFlags(program, intake).length, 0, id);
    assert.equal(repairCompetitionWeek(program, intake), program, id);
    assert.equal(buildCompetitionWeekBrief(intake), '', id);
  }
});

test('the brief names the budget and the conditional last session', () => {
  const brief = buildCompetitionWeekBrief(MEET);
  assert.match(brief, /EVERY SET MUST JUSTIFY ITSELF AGAINST FRESHNESS/);
  assert.match(brief, /TECHNICAL WORK IS SINGLES/);
  assert.match(brief, /CONDITIONAL, NOT MANDATORY/);
});
