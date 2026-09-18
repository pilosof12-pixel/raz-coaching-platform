// The findings the coach made on run #116 that the grader could not see.
//
// He made seven findings on the first Hyrox block and the encoded standard
// caught two. These are the four that are now checked; each assertion is taken
// from his review rather than from the code.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { taperPowerSpike, borrowedSportLanguage, modalitySplitCarriedOver } from '../engine/coach_race_block_rules.js';
import { consecutiveTrainingDays } from '../engine/coach_rules.js';
import { DEDUCTIONS } from '../engine/coach_standard.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => fs.readFileSync(path.join(root, 'fixtures', f), 'utf8');
const HYROX_PROGRAM = 'run116_dual_event_hyrox.txt';
const HYROX = {
  age: 33, experience: 'Advanced (3+ years)',
  primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
  maintenance_goals: ['Hold my squat and pulling strength through both'],
  days_per_week: 4, gym_availability_mode: 'flexible', available_gym_days: [],
  sport: 'Hyrox', sport_schedule: [],
  current_numbers: 'Back Squat: 150 kg x 1\nDeadlift: 190 kg x 1\n1 km ski erg: 3:38',
  injuries: 'Left achilles grumbles after back-to-back running days.',
  pain: { active: false }, event_type: 'hybrid_race', event_priority: 'A',
  competition_date: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
};

test('his finding 3: a taper that multiplies power work is flagged', () => {
  // "Going from 2 to 17 power sets is not preservation. It is a new training
  // emphasis." The taper audit had already printed 2 / 2 / 17 in the delivered
  // program and no rule compared the numbers.
  const flags = taperPowerSpike(fx(HYROX_PROGRAM), HYROX);
  const week3 = flags.find((f) => f.week === 3);
  assert.ok(week3, `no week 3 finding: ${JSON.stringify(flags)}`);
  assert.equal(week3.power, 17);
  assert.equal(week3.baseline, 2);
});

test('a sharpening dose is not a new emphasis', () => {
  // A fight camp that adds three ballistic sets in its sharpening week is doing
  // the right thing -- the engine's own combat-power repair puts them there.
  const FIGHTER = { ...JSON.parse(fx('competition_avatars.json')).mma_fight_camp, gym_availability_mode: 'flexible' };
  assert.deepEqual(taperPowerSpike(fx('mma_fight_camp-program.txt'), FIGHTER), []);
});

test('it stays silent on the programs he scored without charging this', () => {
  const C = JSON.parse(fx('competition_avatars.json'));
  const A = JSON.parse(fx('acceptance_intakes.json'));
  const cases = [
    ['run101_weightlifter_peak.txt', C.weightlifter_peak],
    ['run81_tactical_3k.txt', A.tactical_3k],
    ['run113_mma_camp_delivered.txt', C.mma_fight_camp],
  ];
  for (const [file, intake] of cases) {
    assert.deepEqual(taperPowerSpike(fx(file), intake), [], `${file} gained a finding he did not make`);
  }
});

test('his finding 4: combat language in a Hyrox program', () => {
  // "Horizontal power for level changes and takedown entries." in a race block.
  const flags = borrowedSportLanguage(fx(HYROX_PROGRAM), HYROX);
  assert.ok(flags.length > 0);
  assert.match(flags[0].detail, /combat sport language/i);
});

test('the same words are fine for an athlete who actually fights', () => {
  const FIGHTER = JSON.parse(fx('competition_avatars.json')).mma_fight_camp;
  for (const file of ['run113_mma_camp_delivered.txt', 'mma_fight_camp-program.txt']) {
    assert.deepEqual(borrowedSportLanguage(fx(file), FIGHTER), [], `${file} flagged its own sport's vocabulary`);
  }
});

test('his finding 5: the movement may change but the split may not', () => {
  // "Prefer the ski erg if it is open; the listed split is the point." beside a
  // RowErg split of 1:51/500 m.
  const flags = modalitySplitCarriedOver(fx(HYROX_PROGRAM), HYROX);
  assert.ok(flags.length > 0, 'the ski erg substitution was not caught');
  assert.match(flags[0].detail, /ski ?erg/i);
  assert.match(flags[0].detail, /do not produce the same split/i);
});

test('his finding 7: competition week is no longer invisible to the day rule', () => {
  // Week 4's rows are labelled "Day -4" and weekdayKey correctly returns
  // nothing for them, so the rule saw a week with no days at all and reported
  // four consecutive training days as zero.
  const flags = consecutiveTrainingDays(fx(HYROX_PROGRAM), HYROX);
  const comp = flags.find((f) => /day -/.test(f.detail));
  assert.ok(comp, `competition week still invisible: ${JSON.stringify(flags)}`);
  assert.equal(comp.week, 4);
  assert.match(comp.detail, /4 days in a row \(day -4, day -3, day -2, day -1\)/);
});

test('his costs are recorded as his, not rounded to ours', () => {
  assert.equal(DEDUCTIONS.TAPER_INTRODUCES_NEW_EMPHASIS.typical, 0.45);
  assert.equal(DEDUCTIONS.COACHING_LANGUAGE_FROM_ANOTHER_SPORT.typical, 0.10);
  assert.equal(DEDUCTIONS.PRESCRIPTION_SURVIVES_MODALITY_CHANGE.typical, 0.20);
  // He charged 0.25 for competition-week clustering, above the previous ceiling.
  assert.equal(DEDUCTIONS.AVOIDABLE_CONSECUTIVE_DAY_CLUSTERING.range[1], 0.25);
});
