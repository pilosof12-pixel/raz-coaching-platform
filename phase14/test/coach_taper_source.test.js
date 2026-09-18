import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { taperAgainstSource, gradeWithCoverage } from '../engine/coach_rules.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const C = JSON.parse(read('competition_avatars.json'));
const saturday = (w) => {
  const d = new Date(Date.now() + w * 7 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const LIFTER = { ...C.weightlifter_meet_week, competition_date: saturday(3), event_type: 'strength_meet', event_priority: 'A' };
const FIGHTER = { ...C.mma_fight_camp, competition_date: saturday(3) };

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const week = (w, days, sets) => ['START_WEEK' + w + '_TSV', HEAD,
  ...days.map((d) => `${d}\tSnatch\t100 kg\t${sets}\t2\t3 min\t8\tnote\t`), 'END_WEEK' + w + '_TSV', ''].join('\n');
const COUNTDOWN = ['Day -5', 'Day -4', 'Day -3', 'Day -2', 'Day -1'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
// Week 3 is staged by default, because a block holding weeks 1-3 flat and
// emptying week 4 is itself a finding -- a taper compressed into seven days --
// and these fixtures are for isolating the other taper rules.
const block = (finalDays, finalSets, thirdSets = 2.8) => ['A block.', '',
  week(1, WEEKDAYS, 4), week(2, WEEKDAYS, 4), week(3, WEEKDAYS, thirdSets), week(4, finalDays, finalSets)].join('\n');

// Mujika, as the cluster summarises him: volume is the fatigue lever and a
// 41-60% reduction is the strongest general starting point.
test('a competition week that barely reduces volume is found', () => {
  const flags = taperAgainstSource(block(COUNTDOWN, 3.6), LIFTER);
  assert.deepEqual(flags.map((f) => f.rule), ['TAPER_VOLUME_NOT_REDUCED']);
  assert.match(flags[0].detail, /a reduction of \d+%/);
  assert.match(flags[0].detail, /41-60% off pre-taper volume/);
});

// Frequency is held through a taper more than volume is: the sessions get
// shorter, not fewer.
test('a taper that sheds sessions instead of sets is found', () => {
  const flags = taperAgainstSource(block(COUNTDOWN.slice(0, 2), 5), LIFTER);
  assert.deepEqual(flags.map((f) => f.rule), ['TAPER_CUTS_FREQUENCY_NOT_VOLUME']);
});

test('a taper inside the band with its frequency intact is clean', () => {
  assert.deepEqual(taperAgainstSource(block(COUNTDOWN, 2), LIFTER), []);
});

// Competition week is written on a countdown. weekdayKey correctly refuses to
// resolve "Day -5", so counting resolved keys reported a five-session week as
// zero sessions and called a sound taper a frequency collapse.
test('competition week counts its sessions from the labels it actually uses', () => {
  const onCountdown = taperAgainstSource(block(COUNTDOWN, 2), LIFTER);
  const onWeekdays = taperAgainstSource(block(WEEKDAYS, 2), LIFTER);
  assert.deepEqual(onCountdown, onWeekdays, 'the label style must not change the verdict');
});

// "8 to 14 days is a defensible general starting window." In a block whose
// final week is the event, that window opens in the week before it, so the
// reduction has to have started by then.
test('a taper compressed into the final week is found', () => {
  const flat = ['b', '', week(1, WEEKDAYS, 4), week(2, WEEKDAYS, 4), week(3, WEEKDAYS, 4), week(4, COUNTDOWN, 1.8)].join('\n');
  const flags = taperAgainstSource(flat, LIFTER);
  assert.deepEqual(flags.map((f) => f.rule), ['TAPER_COMPRESSED_INTO_FINAL_WEEK']);
  assert.match(flags[0].detail, /8 to 14 days/);
  // Beginning the descent a week earlier clears it.
  const staged = ['b', '', week(1, WEEKDAYS, 4), week(2, WEEKDAYS, 4), week(3, WEEKDAYS, 2.8), week(4, COUNTDOWN, 1.8)].join('\n');
  assert.deepEqual(taperAgainstSource(staged, LIFTER), []);
});

// Every competition program we hold begins the descent at 27-33% in that week,
// so the 10% floor catches a block that has not begun rather than one that
// begins gently.
test('every delivered competition block already opens its taper in time', () => {
  const fighter = { ...C.mma_fight_camp, competition_date: saturday(3), event_type: 'combat' };
  for (const [f, intake] of [['run113_mma_camp_delivered.txt', fighter], ['run97_mma_camp_delivered.txt', fighter],
    ['mma_fight_camp-program.txt', fighter], ['weightlifter_meet_week-program.txt', LIFTER]]) {
    assert.deepEqual(taperAgainstSource(read(f), intake), [], f);
  }
});

// The delivered fight camp the coach praised for its taper: 24 sets to 24 to
// 16 to 10, a 58% reduction, with both gym days kept.
test('the taper the coach praised passes', () => {
  assert.deepEqual(taperAgainstSource(read('run113_mma_camp_delivered.txt'), FIGHTER), []);
  assert.deepEqual(taperAgainstSource(read('run97_mma_camp_delivered.txt'), FIGHTER), []);
  assert.deepEqual(taperAgainstSource(read('weightlifter_meet_week-program.txt'), LIFTER), []);
});

// A block that does not reach its event has no taper week to judge.
test('a build block eight weeks out is not judged as a taper', () => {
  const build = { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet' };
  assert.deepEqual(taperAgainstSource(read('run114_weightlifter_peak.txt'), build), []);
});

// No intensity threshold is encoded. The cluster gives numbers for volume,
// duration and frequency and none for intensity, saying only that the athlete
// "can still touch meaningful loads". An earlier version invented an 85% floor
// and flagged a meet week at 82% of its pre-taper top load.
test('no intensity threshold is invented where the source gives none', () => {
  // A competition week inside the volume band, with its frequency kept, whose
  // top load is far below pre-taper. The cluster gives numbers for volume,
  // duration and frequency and none for intensity -- only that the athlete
  // "can still touch meaningful loads" -- so this must produce nothing. An
  // earlier version invented an 85% floor and flagged a real meet week at 82%.
  const light = ['A block.', '',
    week(1, WEEKDAYS, 4), week(2, WEEKDAYS, 4), week(3, WEEKDAYS, 2.8),
    ['START_WEEK4_TSV', HEAD,
      ...COUNTDOWN.map((d) => `${d}\tSnatch\t55 kg\t2\t2\t3 min\t6\tmuch lighter\t`),
      'END_WEEK4_TSV', ''].join('\n')].join('\n');
  assert.deepEqual(taperAgainstSource(light, LIFTER), []);
});

test('the taper rule reports itself blind rather than clean when it cannot look', () => {
  const noSets = ['A block.', '', 'START_WEEK1_TSV', HEAD, 'END_WEEK1_TSV'].join('\n');
  const { blind } = gradeWithCoverage(noSets, LIFTER);
  assert.ok(blind.some((b) => b.rule === 'taperAgainstSource'));
});
