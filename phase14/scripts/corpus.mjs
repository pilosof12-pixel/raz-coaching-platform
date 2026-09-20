// scripts/corpus.mjs
//
// One list of "which delivered program belongs to which athlete".
//
// This used to live inside grade_delivered.mjs. It moved here the first time a
// second sweep needed it, because the alternative -- matching a fixture to an
// avatar by its filename -- silently pairs every program with the wrong
// intake, and a grader handed the wrong intake reports confident nonsense
// rather than an error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const fixturePath = (f) => path.join(root, '..', 'test', 'fixtures', f);
export const readFixture = (f) => fs.readFileSync(fixturePath(f), 'utf8');
const json = (f) => JSON.parse(readFixture(f));

const A = json('acceptance_intakes.json');
// The Hyrox racer, first generated in run #116. His intake lives in the live
// acceptance workflow rather than a fixture file, so it is written out here to
// keep the corpus sweep and the workflow describing the same athlete.
export const HYROX = {
  age: 33, language: 'en', experience: 'Advanced (3+ years)', bodyweight: '76 kg',
  primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
  secondary_goals: ['Run a half marathon two weeks after Hyrox without wrecking myself for it'],
  maintenance_goals: ['Hold my squat and pulling strength through both'],
  goal_priority_model: 'tiered', days_per_week: 4, session_duration_minutes: 75,
  gym_availability_mode: 'flexible', available_gym_days: [], training_location: 'commercial_gym',
  sport: 'Hyrox', sport_sessions_per_week: 2, sport_schedule: [],
  current_numbers: 'Back Squat: 150 kg x 1\nDeadlift: 190 kg x 1\n5 km run: 19:40\nHalf marathon PB: 1:28 (two years ago)\n1 km ski erg: 3:38',
  performance_markers: ['5 km: 19:40', 'Half marathon: 1:28'],
  injuries: 'Left achilles grumbles after back-to-back running days; settles with a day off.',
  pain: { active: false }, event_type: 'hybrid_race', event_priority: 'A',
};
const C = json('competition_avatars.json');
const H = json('hard_avatars.json');
const day = 86400000;
// The Saturday inside week w, not the first Saturday after it.
//
// This used to step forward w*7 days and then on to the next Saturday, which
// lands anywhere in w*7 .. w*7+6 -- for w=4, 28 to 34 days, or 4.00 to 4.86
// weeks. Block week comes from the hours remaining to the event, so above 28
// days the event falls OUTSIDE a four-week block and every competition-week and
// taper rule reads a different week. The same static fixture therefore graded
// differently depending on which weekday the suite ran on: between 19 and 20
// September the corpus moved from 24.56 severity to 25.36, from 17 clean
// programs to 10, and nothing about any program had changed.
//
// Starting six days earlier puts the band at w*7-6 .. w*7 -- 22 to 28 days for
// w=4 -- so the event is always inside week w. Exactly one Saturday falls in any
// seven-day window, so there is always precisely one answer.
export const saturday = (w, now = Date.now()) => {
  const d = new Date(now + (w * 7 - 6) * day);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};

export const LIFTER = { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet', event_priority: 'A' };
// Four weeks out, not one. The avatar's own definition says "the national
// qualifier is in 4 weeks, so this block runs into the meet: Week 4 IS
// competition week", and the fixture renders week 4 as Day -5 to Day -1. Pinned
// at one week out, competitionWeek answered 1, so every rule that treats the
// competition week differently was reading this program against the wrong week
// -- and the day-spread repair skipped week 1 as a taper while leaving the real
// taper in week 4 untouched.
//
// The margin matters as much as the number: an event exactly 28 days out slides
// between weeks as the day passes. This used to hand-roll "the first Saturday at
// least 23 days away", which is a 23..29 day band and spills past 28 into week 5
// for one weekday in seven -- the same straddle the helper above now avoids. It
// is just saturday(4).
export const MEET = { ...C.weightlifter_meet_week, competition_date: saturday(4) };
export const FIGHTER = { ...C.mma_fight_camp, competition_date: saturday(3) };

// Coach-scored programs first, so the known answers sit at the top of a report.
export const CORPUS = [
  ['run101_weightlifter_peak.txt', LIFTER, 8.2],
  ['run81_tactical_3k.txt', A.tactical_3k, 7.6],
  ['run113_mma_camp_delivered.txt', FIGHTER, 8.9],
  ['run81_advanced_hybrid.txt', A.advanced_hybrid, 7.9],
  ['advanced_hybrid-program.txt', A.advanced_hybrid, null],
  ['run88_advanced_hybrid.txt', A.advanced_hybrid, null],
  ['run77_advanced_hybrid_defective.txt', A.advanced_hybrid, null],
  ['tactical_3k-program.txt', A.tactical_3k, null],
  ['run84_tactical_3k.txt', A.tactical_3k, null],
  ['run114_tactical_3k.txt', A.tactical_3k, null],
  ['weightlifter_peak-program.txt', LIFTER, null],
  ['run92_weightlifter_flat.txt', LIFTER, null],
  ['run96_weightlifter_intensification.txt', LIFTER, null],
  ['run114_weightlifter_peak.txt', LIFTER, null],
  ['weightlifter_meet_week-program.txt', MEET, null],
  ['mma_fight_camp-program.txt', FIGHTER, null],
  ['run97_mma_camp_delivered.txt', FIGHTER, null],
  ['run92_mma_fight_camp_pre_rules.txt', FIGHTER, null],
  ['inseason_footballer-program.txt', H.inseason_footballer, null],
  ['run100_inseason_footballer.txt', H.inseason_footballer, null],
  ['run101_inseason_footballer.txt', H.inseason_footballer, null],
  ['run115_inseason_footballer.txt', H.inseason_footballer, null],
  ['masters_return-program.txt', H.masters_return, null],
  ['run116_dual_event_hyrox.txt', { ...HYROX, competition_date: saturday(4) }, null],
  ['run100_masters_return.txt', H.masters_return, null],
  ['run101_masters_return.txt', H.masters_return, null],
];
