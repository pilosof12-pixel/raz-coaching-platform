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
// A constant number of days out, not "the next Saturday after week w".
//
// Quantising to a weekday is what made this unstable, and moving the band did
// not fix it. Any weekday rule gives a seven-day-wide band, because the Saturday
// that is "about three weeks away" is anywhere from fifteen to twenty-one days
// away depending on what day you ask. The findings track the exact offset, not
// the weekday: sweeping the fight camp one day at a time, sixteen through
// twenty-two days is a flat plateau and the answer changes at fifteen and at
// twenty-three. A seven-day band straddles those edges, so the corpus graded
// differently on Saturdays even after the band was moved -- four MMA programs
// swung by 1.08 severity between 25 and 26 September.
//
// There is no arrangement that holds BOTH the offset and the weekday constant
// against a moving clock; one of them has to give. The offset is what the rules
// actually read, so the offset is what is held. Each number below sits in the
// middle of a measured plateau for that avatar, and the weekday is allowed to
// drift because nothing measures it.
export const CORPUS_NOW = process.env.CORPUS_NOW ? Date.parse(process.env.CORPUS_NOW) : null;
const clock = () => CORPUS_NOW ?? Date.now();
export const daysOut = (n, now = clock()) => new Date(now + n * day).toISOString().slice(0, 10);

// Kept for callers outside the corpus; the corpus itself no longer uses it.
export const saturday = (w, now = clock()) => {
  const d = new Date(now + (w * 7 - 6) * day);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};

export const LIFTER = { ...C.weightlifter_peak, competition_date: daysOut(53), event_type: 'strength_meet', event_priority: 'A' };
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
export const MEET = { ...C.weightlifter_meet_week, competition_date: daysOut(25) };
export const FIGHTER = { ...C.mma_fight_camp, competition_date: daysOut(19) };

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
  ['run116_dual_event_hyrox.txt', { ...HYROX, competition_date: daysOut(25) }, null],
  ['run100_masters_return.txt', H.masters_return, null],
  ['run101_masters_return.txt', H.masters_return, null],
];
