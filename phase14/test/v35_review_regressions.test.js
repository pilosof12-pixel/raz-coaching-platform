import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { gymDayReadiness, buildReadinessBrief } from '../engine/v34_readiness.js';
import {
  collectAllV34ConsistencyFlags,
  collectProgressionLanguageFlags,
  collectRepWordFlags,
  collectWarmupSanityFlags,
} from '../engine/v34_prescription_consistency.js';

// Regressions for the v34 live review. Every fixture below is the shape the
// reviewer actually found in docs/qa/live-three-avatar/latest.
const LIVE = path.join(process.cwd(), '..', 'docs', 'qa', 'live-three-avatar', 'latest');
const readLive = (n) => fs.readFileSync(path.join(LIVE, `${n}-program.txt`), 'utf8');
const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;

const HYBRID_INTAKE = {
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport: 'MMA', sport_sessions_per_week: 5,
  sport_schedule: [
    { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
    { day: 'Sat', intensity: 'moderate' },
  ],
};

// --- readiness: the regression that cost the Hybrid a full point -------------

test('[R1] a day following the athlete\'s own training day is no longer treated as pristine', () => {
  const mon = gymDayReadiness(HYBRID_INTAKE).days.find((d) => d.day === 'mon');
  assert.equal(mon.factors.previous_day_gym, 1.5, 'Sunday is a gym day and must cost Monday freshness');
  assert.ok(mon.score < 10, `Monday must not score a perfect 10, got ${mon.score}`);
});

test('[R2] the brief no longer hands the model a quotable "freshest day" claim', () => {
  const brief = buildReadinessBrief(HYBRID_INTAKE);
  assert.doesNotMatch(brief, /freshest available day \(currently/, 'the engine must not assert which weekday is freshest');
  assert.doesNotMatch(brief, /least fresh day \(currently/);
  assert.match(brief, /is an estimate from the intake, not a measured freshness reading/);
  assert.match(brief, /Do NOT state in the client-facing program that any particular day IS/);
  assert.match(brief, /their reported experience wins/, 'athlete-reported readiness must override the estimate');
  // The ranking itself is still supplied so placement can use it.
  assert.match(brief, /higher is fresher/);
});

test('[R3] readiness still responds to the schedule rather than to fixed weekdays', () => {
  const a = gymDayReadiness({ available_gym_days: ['Mon', 'Wed'], sport_schedule: [{ day: 'Sun', intensity: 'hard' }] });
  const b = gymDayReadiness({ available_gym_days: ['Mon', 'Wed'], sport_schedule: [{ day: 'Tue', intensity: 'hard' }] });
  assert.notEqual(a.days[0].day, b.days[0].day);
});

// --- progression language ----------------------------------------------------

test('[R4] a "repeat this load" note cannot survive a load increase', () => {
  const p = [
    block(3, ['Sun\tOverhead Press\t67.5 kg\t4\t4\t2-3 min\t7.5\tHold the build-week dose.\t']),
    block(4, ['Sun\tOverhead Press\t70 kg\t4\t4\t2-3 min\t7.5\tRepeat this load only if Week 3 stayed inside the cap.\t']),
  ].join('\n\n');
  const flags = collectProgressionLanguageFlags(p, {});
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V34_PROGRESSION_LANGUAGE_MISMATCH');
  assert.equal(flags[0].previous_load, 67.5);
  assert.equal(flags[0].current_load, 70);
});

test('[R5] a claimed reduction cannot survive an unchanged prescription', () => {
  const same = [
    block(3, ['Session A\tBar Muscle-up Transition Drill\tBand\t3\t2\t90 sec\t6\tBuild.\t']),
    block(4, ['Session A\tBar Muscle-up Transition Drill\tBand\t3\t2\t90 sec\t6\tKeep the Week 3 standard with slightly less total work.\t']),
  ].join('\n\n');
  assert.equal(collectProgressionLanguageFlags(same, {}).length, 1);
  // A genuine reduction is accepted.
  const real = [
    block(3, ['Session A\tBar Muscle-up Transition Drill\tBand\t3\t2\t90 sec\t6\tBuild.\t']),
    block(4, ['Session A\tBar Muscle-up Transition Drill\tBand\t2\t2\t90 sec\t6\tKeep the Week 3 standard with slightly less total work.\t']),
  ].join('\n\n');
  assert.deepEqual(collectProgressionLanguageFlags(real, {}), []);
});

test('[R6] "fewer total reps" is checked against the actual rep count', () => {
  const p = [
    block(3, ['Session A\tExplosive Hip-to-Bar Pull-up\tBodyweight\t4\t2\t2 min\t6\tPull fast.\t']),
    block(4, ['Session A\tExplosive Hip-to-Bar Pull-up\tBodyweight\t4\t2\t2 min\t6\tMatch Week 3 height and speed; fewer total reps.\t']),
  ].join('\n\n');
  assert.equal(collectProgressionLanguageFlags(p, {})[0].code, 'V34_PROGRESSION_LANGUAGE_MISMATCH');
});

// --- rep words and spelled-out numbers ---------------------------------------

test('[R7] a spelled-out attempts-per-set claim must match the numeric reps', () => {
  const p = block(2, ['Session A\tControlled Handstand Kick-up\tBodyweight\t4\t2\t60-90 sec\tN/A\tThree quality attempts per set; up to eight high-quality entries.\t']);
  const flags = collectRepWordFlags(p);
  assert.equal(flags[0].code, 'V34_NOTE_PER_SET_MISMATCH');
  assert.equal(flags[0].prescribed_reps, 2);
});

test('[R8] "doubles" cannot describe a single-rep prescription', () => {
  const p = block(1, ['Tue\tAssisted One-Arm Pull-up\tMinimal assistance\t2\t1 per arm\t2 min\t6\tClean symmetrical doubles each side.\t']);
  assert.equal(collectRepWordFlags(p)[0].code, 'V34_NOTE_REP_WORD_MISMATCH');
  // Matching wording is accepted.
  const ok = block(1, ['Tue\tAssisted One-Arm Pull-up\tMinimal assistance\t2\t1 per arm\t2 min\t6\tClean symmetrical singles each side.\t']);
  assert.deepEqual(collectRepWordFlags(ok), []);
});

test('[R9] a movement split across a priority set plus back-offs may name its other sets', () => {
  // The OAP priority set legitimately mentions the singles that follow it. This
  // guards the false positive the first version of the checker produced.
  const p = block(3, [
    'Mon\tOne-Arm Pull-up\tBodyweight\t1\t2 per arm\t3 min\t8\tPriority set, then the singles below.\t',
    'Mon\tOne-Arm Pull-up\tBodyweight\t2\t1 per arm\t3 min\t7.5\tClean singles.\t',
  ]);
  assert.deepEqual(collectRepWordFlags(p), []);
});

// --- warm-up sanity ----------------------------------------------------------

test('[R10] a ramp may not finish at or above the work load', () => {
  const p = block(1, [
    'Mon\t[WARMUP] Weighted Pull-up\tN/A\t1\t8 min\tN/A\t3\tRamp Weighted Pull-up: +10 kg x 5, +20 kg x 3, +27.5 kg x 1-2 before +27.5 kg work sets.\t',
    'Mon\tWeighted Pull-up\t+22.5 kg\t3\t4\t3 min\t7\tSubmaximal support.\t',
  ]);
  const codes = collectWarmupSanityFlags(p).map((f) => f.code);
  assert.ok(codes.includes('V34_WARMUP_HEAVIER_THAN_WORK'));
  assert.ok(codes.includes('V34_WARMUP_TARGET_MISMATCH'));
});

test('[R11] a correct ramp raises nothing', () => {
  const p = block(1, [
    'Mon\t[WARMUP] Weighted Pull-up\tN/A\t1\t8 min\tN/A\t3\tRamp Weighted Pull-up: +7.5 kg x 5, +12.5 kg x 3, +17.5 kg x 1-2 before +22.5 kg work sets.\t',
    'Mon\tWeighted Pull-up\t+22.5 kg\t3\t4\t3 min\t7\tSubmaximal support.\t',
  ]);
  assert.deepEqual(collectWarmupSanityFlags(p), []);
});

test('[R12] the same movement may not have its specific ramp prescribed twice on one day', () => {
  const p = block(1, [
    'Mon\t[WARMUP] One-Arm Pull-up\tN/A\t1\t8 min\tN/A\t3\tRamp Back Squat: 60 kg x 5, 100 kg x 3, 130 kg x 1-2 before 170 kg work sets.\t',
    'Mon\t[WARMUP] Back Squat\tN/A\t1\t6 min\tN/A\t3\tRamp Back Squat: 60 kg x 5, 100 kg x 3, 130 kg x 1-2 before 170 kg work sets.\t',
    'Mon\tBack Squat\t170 kg\t1\t3\t3 min\t8\tTop triple.\t',
  ]);
  assert.equal(collectWarmupSanityFlags(p).filter((f) => f.code === 'V34_DUPLICATE_SPECIFIC_RAMP').length, 1);
});

// --- the reviewed artifacts --------------------------------------------------

test('[R13] every contradiction the reviewer found in the v34 artifacts is now detected', () => {
  const hybrid = collectAllV34ConsistencyFlags(readLive('advanced_hybrid'), { current_numbers: 'Weighted Chin-up: +80 kg 1RM' });
  const youth = collectAllV34ConsistencyFlags(readLive('youth_gymnastics'), {});
  const tactical = collectAllV34ConsistencyFlags(readLive('tactical_3k'), { current_numbers: 'Weighted Pull-up: +30 kg x 5' });

  const has = (flags, code, exercise) => flags.some((f) => f.code === code && new RegExp(exercise, 'i').test(f.exercise));
  // Hybrid: Week 4 OHP "repeat" while the load rises; assisted OAP "doubles" on 1 rep.
  assert.ok(has(hybrid, 'V34_PROGRESSION_LANGUAGE_MISMATCH', 'Overhead Press'));
  assert.ok(has(hybrid, 'V34_NOTE_REP_WORD_MISMATCH', 'Assisted One-Arm Pull-up'));
  // Youth: two false reduction claims plus the spelled-out attempts claim.
  assert.ok(has(youth, 'V34_PROGRESSION_LANGUAGE_MISMATCH', 'Bar Muscle-up Transition Drill'));
  assert.ok(has(youth, 'V34_PROGRESSION_LANGUAGE_MISMATCH', 'Explosive Hip-to-Bar Pull-up'));
  assert.ok(has(youth, 'V34_NOTE_PER_SET_MISMATCH', 'Controlled Handstand Kick-up'));
  // Tactical: ramp above the work load, and a trim claim with no trim.
  assert.ok(has(tactical, 'V34_WARMUP_TARGET_MISMATCH', 'Weighted Pull-up'));
  assert.ok(has(tactical, 'V34_PROGRESSION_LANGUAGE_MISMATCH', 'Weighted Pull-up'));
});

test('[R14] the checkers stay quiet on prescriptions that genuinely agree', () => {
  const clean = [
    block(1, ['Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tTop triple; stop early if bar speed falls.\t']),
    block(2, ['Mon\tBack Squat\t172.5 kg\t3\t3\t3 min\t8\tSmall load step if Week 1 was clean.\t']),
    block(3, ['Mon\tBack Squat\t175 kg\t3\t3\t3 min\t8\tFinal build week.\t']),
    block(4, ['Mon\tBack Squat\t170 kg\t2\t3\t3 min\t7.5\tConsolidation: one fewer set and a lighter bar.\t']),
  ].join('\n\n');
  assert.deepEqual(collectAllV34ConsistencyFlags(clean, {}), []);
});
