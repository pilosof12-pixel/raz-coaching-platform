import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  gradeProgram, consecutiveTrainingDays, consecutiveLowerLegDays,
  benchmarkExposure, improvementGoalFlat, intensificationBand,
  goalSpeedProgression, unsupportedAthleteFact, ruckDistanceBelowTolerance,
  dayMinusOneStacked, sportScheduleChangedSilently,
  contingencyCreatesAdjacentDuplicate, trainingDaysVsIntake, goalFamilies,
} from '../engine/coach_rules.js';
import { collectClaimIntegrityFlags } from '../engine/v93_claim_integrity.js';
import { collectSportStateFlags } from '../engine/v78_sport_taper.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const json = (f) => JSON.parse(read(f));
const C = json('competition_avatars.json');
const A = json('acceptance_intakes.json');
const saturday = (w) => {
  const d = new Date(Date.now() + w * 7 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const LIFTER = { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet', event_priority: 'A' };
const TACTICAL = A.tactical_3k;
const FIGHTER = { ...C.mma_fight_camp, competition_date: saturday(3) };

const P1 = () => read('run101_weightlifter_peak.txt');
const P2 = () => read('run81_tactical_3k.txt');
const P3 = () => read('run113_mma_camp_delivered.txt');

const rulesOf = (flags) => new Set(flags.map((f) => f.rule));

// --- the three rules that each answer one of his findings --------------------

test('his five-consecutive-days finding is reproduced from the tables', () => {
  const flags = consecutiveTrainingDays(P1(), LIFTER);
  assert.equal(flags.length, 4, 'all four weeks');
  assert.match(flags[0].detail, /5 days in a row \(mon, tue, wed, thu, fri\) against a limit of 3/);
  // Not raised when the athlete cannot move their days.
  assert.deepEqual(consecutiveTrainingDays(P3(), FIGHTER), []);
});

// The training week wraps. Reading the calendar left to right scored Sat, Sun,
// Mon as two consecutive days, which is exactly the shape he penalised.
test('the week wraps, so Saturday to Monday is three consecutive days', () => {
  const flags = consecutiveLowerLegDays(P2(), TACTICAL);
  assert.equal(flags.length, 4);
  assert.match(flags[0].detail, /3 consecutive days against a limit of 2/);
  // Tied to the impact history, as he was explicit it should be.
  assert.deepEqual(consecutiveLowerLegDays(P2(), { ...TACTICAL, injuries: '', pain: {} }), []);
});

// "Improve 3 km from 13:30 to sub-12:00" states current then target. Reading the
// first time made the goal the athlete's present time, so a block that never
// got faster scored as already ahead of target.
test('goal pace is the target, not the athlete current time', () => {
  const flags = goalSpeedProgression(P2(), TACTICAL);
  assert.deepEqual(flags.map((f) => f.week), [3, 4]);
  assert.match(flags[0].detail, /91\.7% of goal speed/);
  assert.match(flags[1].detail, /252 s\/km against a goal of 240 s\/km/);
});

test('a benchmarked movement that serves a goal and is never trained is found', () => {
  assert.deepEqual(benchmarkExposure(P1(), LIFTER).map((f) => f.movement), ['Snatch Pull']);
  // The fight camp: the trap bar is benchmarked and explicitly pain free, and
  // the block's only lower-body strength is a hip thrust.
  const camp = benchmarkExposure(P3(), FIGHTER).map((f) => f.movement);
  assert.ok(camp.includes('Trap Bar Deadlift'), 'his largest Program 3 finding');
  // Back Squat is benchmarked too, and must NOT be demanded: it reproduces the
  // athlete's knee symptoms, which is his first conflict-resolution rule.
  assert.ok(!camp.includes('Back Squat'), 'an active symptom removes the requirement');
});

// A goal naming its movements does not licence every benchmark in the intake.
test('a goal that names movements is not a blanket strength goal', () => {
  const flags = benchmarkExposure(P2(), TACTICAL).map((f) => f.movement);
  assert.deepEqual(flags, [], 'push-ups are benchmarked but serve no stated goal');
});

test('an improvement goal held identical for the whole block is found', () => {
  const flags = improvementGoalFlat(P2(), TACTICAL);
  assert.ok(flags.some((f) => /Weighted Pull-up/i.test(f.movement)), 'the +22.5 kg that never moved');
});

test('the intensification band is measured against the stated percentages', () => {
  const flags = intensificationBand(P1(), LIFTER);
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /87% of current max, and the standard asks for at least 88%/);
});

test('a weight cut the intake never mentions is found', () => {
  const flags = unsupportedAthleteFact(P1(), LIFTER);
  assert.equal(flags.length, 1);
  assert.match(flags[0].claim, /4 kg cut/);
  // A fighter whose intake does state a cut may talk about it.
  assert.deepEqual(unsupportedAthleteFact(P3(), FIGHTER), []);
});

// --- the five rules added after the first calibration ------------------------

test('a ruck below the distance the athlete already tolerates is found', () => {
  const flags = ruckDistanceBelowTolerance(P2(), TACTICAL);
  assert.equal(flags.length, 4, 'all four weeks');
  assert.match(flags[0].detail, /about 6\.[0-9] km/);
  assert.match(flags[0].detail, /8-10 km with the same load is already tolerated/);
  // No tolerated distance in the intake means nothing to measure against.
  assert.deepEqual(ruckDistanceBelowTolerance(P2(), { ...TACTICAL, pain: {}, notes: '' }), []);
});

test('two primers on the day before the fight are found', () => {
  const flags = dayMinusOneStacked(P3(), FIGHTER);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].day, 'fri');
  assert.match(flags[0].detail, /both an MMA technical session and/);
  // An explicit either/or is the fix, and clears it.
  const fixed = `If the technical session already includes fast pad work, that session is the primer.\n${P3()}`;
  assert.deepEqual(dayMinusOneStacked(fixed, FIGHTER), []);
});

test('rewriting the athlete sport week without owning it is found', () => {
  const flags = sportScheduleChangedSilently(P3(), FIGHTER);
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /reduces mon, wed, fri from the intake's hard session/);
  const owned = `This program assumes your MMA coach reduces Friday to technical work from Week 1. If Friday remains a hard session, Friday gym becomes two throws and one clean set.\n${P3()}`;
  assert.deepEqual(sportScheduleChangedSilently(owned, FIGHTER), []);
});

test('a contingency that stacks the same lift on consecutive days is found', () => {
  const flags = contingencyCreatesAdjacentDuplicate(P1());
  assert.ok(flags.length >= 1);
  assert.match(flags[0].detail, /two consecutive days/);
  assert.match(flags[0].movement, /Back Squat/i);
});

test('a training-day count the intake does not explain is found', () => {
  const flags = trainingDaysVsIntake(P2(), TACTICAL);
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /days_per_week: 3 and the block trains on 5 calendar days/);
  // Saying which reading governs resolves it.
  const said = `Your intake lists three formal strength sessions per week across five calendar days.\n${P2()}`;
  assert.deepEqual(trainingDaysVsIntake(said, TACTICAL), []);
  // And a program that matches its own intake says nothing.
  assert.deepEqual(trainingDaysVsIntake(P1(), LIFTER), []);
});

// A goal names a movement; a shared word does not. Matching the token "press"
// from a 100 kg overhead press goal pulled in Pallof Press and Leg Press
// Machine, neither of which is that goal.
test('a goal matches its own movement family, not every word it shares', () => {
  const families = goalFamilies({ secondary_goals: ['100kg overhead press'] });
  assert.equal(families.length, 1);
  assert.ok(families[0].test('Overhead Press'));
  assert.ok(families[0].test('Push Press'));
  assert.ok(!families[0].test('Pallof Press'));
  assert.ok(!families[0].test('Leg Press Machine'));
  assert.ok(!families[0].test('Dumbbell Bench Press'));
});

// A goal phrased as a hold is not an improvement goal, whichever tier it sits
// in. "Keep front squat strength while sharpening the lifts" is a secondary
// goal asking for maintenance; reading it as improvement turned four squat
// variations into defects for doing exactly what was asked.
test('a secondary goal phrased as a hold is not an improvement goal', () => {
  assert.deepEqual(goalFamilies({ secondary_goals: ['Keep front squat strength while sharpening the lifts'] }), []);
  assert.equal(goalFamilies({ secondary_goals: ['Improve strict pull-ups from 14 toward 18-20'] }).length, 1);
  const lifter = { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet' };
  assert.deepEqual(improvementGoalFlat(read('run92_weightlifter_flat.txt'), lifter).map((f) => f.movement), []);
  // The competition lifts themselves are a different matter: RPE-selected load
  // at 5x2 and 6x1, identical in all four weeks, against a 120 kg snatch goal.
  const flat = improvementGoalFlat(read('run96_weightlifter_intensification.txt'), lifter).map((f) => f.movement);
  assert.deepEqual(flat.sort(), ['Clean and Jerk', 'Snatch']);
});

// --- the calibration itself ---------------------------------------------------
//
// Fifteen of the coach's eighteen findings, 3.75 of his 4.20 of severity, and
// one thing he did not raise. Program 2 is complete: six of six.
//
// The three misses are the ceiling, not a gap to close. Two are accessory
// marginal return, which he filed under "Judgement, not rules" himself. The
// third is a stale audit table the engine already fixes -- the fixture predates
// the fix.

test('the encoded rules reproduce fifteen of the coach eighteen findings', () => {
  const expect = {
    'program-1': ['BENCHMARK_UNEXPOSED', 'INTENSIFICATION_BAND_NOT_REACHED', 'CONSECUTIVE_TRAINING_DAYS',
      'UNSUPPORTED_ATHLETE_FACT', 'CONTINGENCY_CREATES_ADJACENT_DUPLICATE'],
    'program-2': ['STATED_PROGRESSION_ABSENT', 'GOAL_SPEED_NOT_APPROACHED', 'CONSECUTIVE_LOWER_LEG_DAYS',
      'IMPROVEMENT_GOAL_FLAT', 'GOAL_DISTANCE_BELOW_TOLERANCE', 'TRAINING_DAYS_VS_INTAKE'],
    'program-3': ['BENCHMARK_UNEXPOSED', 'SPORT_STATE_MISDESCRIBED', 'DAY_MINUS_ONE_STACKED',
      'SPORT_SCHEDULE_CHANGED_SILENTLY'],
  };
  const got = {
    'program-1': rulesOf(gradeProgram(P1(), LIFTER)),
    'program-2': new Set([...rulesOf(gradeProgram(P2(), TACTICAL)),
      ...(collectClaimIntegrityFlags(P2(), TACTICAL).length ? ['STATED_PROGRESSION_ABSENT'] : [])]),
    'program-3': new Set([...rulesOf(gradeProgram(P3(), FIGHTER)),
      ...(collectSportStateFlags(P3(), FIGHTER).length ? ['SPORT_STATE_MISDESCRIBED'] : [])]),
  };
  let total = 0;
  for (const [id, wanted] of Object.entries(expect)) {
    for (const rule of wanted) {
      assert.ok(got[id].has(rule), `${id} should raise ${rule}`);
      total += 1;
    }
  }
  assert.equal(total, 15);
});

// The one disagreement, kept visible rather than tuned away. Bench Press is
// benchmarked at 110 kg x 3 and the intake calls all upper body comfortable, so
// his own exposure rule demands it; the block trains Dip, Ring Push-up and
// Prowler Push instead. That is the same shape as his 0.40 trap bar finding,
// applied to the upper body, and he did not make it. Either he missed it or his
// family-substitution clause covers it -- a question for him, not something to
// silence here.
test('the one finding we raise and the coach did not is still raised', () => {
  const camp = benchmarkExposure(P3(), FIGHTER).map((f) => f.movement);
  assert.ok(camp.includes('Bench Press'));
  assert.equal(camp.length, 2, 'exactly two, so a third would be a new disagreement');
});
