import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { gymDayReadiness, preferredDayForExposure, sportStressByDay } from '../engine/v34_readiness.js';
import { buildV34ArchitectureBrief, currentStrictOapReps, targetConsecutiveReps, wallHandstandSeconds, buildSymptomResponseRules, buildMaintenanceHoldRules } from '../engine/v34_coaching_architecture.js';
import { collectPrescriptionConsistencyFlags, validatePrescriptionConsistency } from '../engine/v34_prescription_consistency.js';
import { sessionDurations, projectedWeeklyRunningKm, runningVolumeSignals, restSeconds, statedRunningBaselineKm } from '../engine/v34_workload_accounting.js';
import { advancedOapPrescription } from '../engine/phase15_quality_rules.js';

const LIVE = path.join(process.cwd(), '..', 'docs', 'qa', 'live-three-avatar', 'latest');
const readLive = (n) => fs.readFileSync(path.join(LIVE, `${n}-program.txt`), 'utf8');
const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;

// 1. OAP multi-rep specificity ------------------------------------------------

test('[V34-1] a 2-rep OAP athlete chasing 4 reps gets multi-rep specificity, not only singles', () => {
  const p = advancedOapPrescription(2);
  assert.equal(p.stage, 'multi_rep');
  assert.deepEqual(p.lead_set_reps, [1, 2], 'lead set is readiness-dependent multi-rep');
  assert.equal(p.follow_set_reps, 1);
  assert.match(p.note, /2 \+ 1 \+ 1/, 'the worked example leads with the multi-rep set');
  assert.match(p.note, /poor-readiness day 1 \+ 1 \+ 1 is acceptable/i);
  assert.doesNotMatch(p.note, /prioritize strict submaximal singles/i, 'the singles-first bias is gone');
});

test('[V34-1b] the brief states rep-outcome specificity only when the goal exceeds demonstrated capacity', () => {
  const intake = {
    primary_goals: ['4 One arm pullups'],
    current_numbers: 'One-Arm Pull-up: 2 strict reps each arm',
  };
  assert.equal(currentStrictOapReps(intake), 2);
  assert.equal(targetConsecutiveReps('4 One arm pullups'), 4);
  const brief = buildV34ArchitectureBrief(intake);
  assert.match(brief, /UNILATERAL REP-OUTCOME SPECIFICITY/);
  assert.match(brief, /multi-rep priority set of 1-2 clean reps per side/);
  assert.doesNotMatch(brief, /blindly inflating total unilateral volume[^]*add more sets/i);
  // Already at target: no rule emitted.
  const done = buildV34ArchitectureBrief({ primary_goals: ['4 One arm pullups'], current_numbers: 'One-Arm Pull-up: 5 strict reps each arm' });
  assert.doesNotMatch(done, /UNILATERAL REP-OUTCOME SPECIFICITY/);
});

// 2-3. Readiness --------------------------------------------------------------

test('[V34-2] hard sport the previous day penalises that gym day for a primary neural exposure', () => {
  const intake = { available_gym_days: ['Mon', 'Wed'], sport: 'MMA', sport_schedule: [{ day: 'Sun', intensity: 'hard' }] };
  const { days } = gymDayReadiness(intake);
  const mon = days.find((d) => d.day === 'mon');
  const wed = days.find((d) => d.day === 'wed');
  assert.equal(mon.factors.previous_day_sport, 3, 'Monday is charged for the hard Sunday');
  assert.ok(wed.score > mon.score, 'the untouched day must score higher');
  assert.equal(preferredDayForExposure(intake, { neural: true }), 'wed');
});

test('[V34-3] an explicitly low-cost microdose may occupy the least fresh day', () => {
  const intake = { available_gym_days: ['Mon', 'Wed'], sport: 'MMA', sport_schedule: [{ day: 'Sun', intensity: 'hard' }] };
  assert.equal(preferredDayForExposure(intake, { lowCost: true }), 'mon');
  const brief = buildV34ArchitectureBrief(intake);
  assert.match(brief, /low-cost technical microdoses .* may occupy the least fresh day/s);
});

test('[V34-3b] readiness is derived from the schedule, never from fixed weekdays', () => {
  const a = gymDayReadiness({ available_gym_days: ['Mon', 'Tue'], sport_schedule: [{ day: 'Sun', intensity: 'hard' }] });
  const b = gymDayReadiness({ available_gym_days: ['Mon', 'Tue'], sport_schedule: [{ day: 'Tue', intensity: 'hard' }] });
  assert.notEqual(a.days[0].day, b.days[0].day, 'the same weekdays rank differently under different sport schedules');
  assert.deepEqual(sportStressByDay({ sport_schedule: [{ day: 'Wed', intensity: 'hard' }] }), { wed: 3 });
});

const plannerIntake = (gymDays, sportSchedule) => ({
  days_per_week: gymDays.length,
  available_gym_days: gymDays,
  primary_goals: ['4 One arm pullups'],
  current_numbers: 'One-Arm Pull-up: 2 strict reps each arm',
  sport_schedule: sportSchedule,
});
const oapDay = (brief) => {
  const line = brief.split('\n').find((l) => /OAP_STRICT/.test(l));
  return line ? line.trim().replace(/^\*\s*/, '').split(':')[0] : null;
};

test('[V34-3c] readiness placement actually reaches the planner and honours hysteresis', async () => {
  const { buildDeterministicBrief } = await import('../engine/phase15_planner.js');
  const { gymDayReadiness } = await import('../engine/v34_readiness.js');
  const better = plannerIntake(['Mon', 'Wed'], [{ day: 'Tue', intensity: 'hard' }]);
  const betterScores = gymDayReadiness(better, { gymDays: ['Mon', 'Wed'] }).days;
  assert.equal(betterScores[0].day, 'mon');
  assert.ok(betterScores[0].score - betterScores[1].score >= 1);
  assert.equal(oapDay(buildDeterministicBrief(better)), 'Mon');
  const mirrored = plannerIntake(['Mon', 'Wed'], [{ day: 'Sun', intensity: 'hard' }]);
  assert.equal(oapDay(buildDeterministicBrief(mirrored)), 'Wed');
  const tied = plannerIntake(['Mon', 'Wed'], []);
  const tiedScores = gymDayReadiness(tied, { gymDays: ['Mon', 'Wed'] }).days;
  assert.equal(tiedScores[0].score - tiedScores[1].score, 0);
  assert.equal(oapDay(buildDeterministicBrief(tied)), 'Wed');
});

// 4. Handstand reduced-support ------------------------------------------------

test('[V34-4] adequate wall capacity requires a reduced-support balance drill', () => {
  const intake = {
    age: 13,
    primary_goals: ['Achieve a freestanding handstand'],
    current_numbers: 'Wall-facing handstand about 15 seconds; back-to-wall about 25 seconds.',
  };
  assert.equal(wallHandstandSeconds(intake), 25);
  const brief = buildV34ArchitectureBrief(intake);
  assert.match(brief, /reduced-support balance-correction drill/);
  assert.match(brief, /toe pulls|heel pulls|wall floats|fingertip/);
  assert.match(brief, /Kick-ups plus wall holds alone are insufficient/);
});

// 5-7. Prescription consistency ----------------------------------------------

test('[V34-5] a 4 x 2 row cannot claim 4 attempts per set', () => {
  const p = block(1, ['Session A\tControlled Handstand Kick-up\tBodyweight\t4\t2\t60-90 sec\tN/A\tPerform 4 attempts per set.\t']);
  const flags = collectPrescriptionConsistencyFlags(p, {});
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V34_NOTE_PER_SET_MISMATCH');
  assert.equal(flags[0].note_claim, 4);
  assert.equal(flags[0].prescribed_reps, 2);
});

test('[V34-5b] a total-attempt claim must equal sets x reps', () => {
  const bad = block(1, ['Session A\tControlled Handstand Kick-up\tBodyweight\t4\t3\t60-90 sec\tN/A\tThat is 15 total attempts.\t']);
  assert.equal(collectPrescriptionConsistencyFlags(bad, {})[0].code, 'V34_NOTE_TOTAL_MISMATCH');
  const good = block(1, ['Session A\tControlled Handstand Kick-up\tBodyweight\t4\t3\t60-90 sec\tN/A\tThat is 12 total attempts.\t']);
  assert.equal(collectPrescriptionConsistencyFlags(good, {}).length, 0);
  // A ceiling is not an equality claim.
  const ceiling = block(1, ['Session A\tControlled Handstand Kick-up\tBodyweight\t4\t3\t60-90 sec\tN/A\tUp to 10 total attempts if quality holds.\t']);
  assert.equal(collectPrescriptionConsistencyFlags(ceiling, {}).length, 0);
});

test('[V34-6] an RPE-selected row may not reference a load that was never established', () => {
  const p = block(2, ['Fri\tChin-up\tRPE-selected load\t3\t4\t2-3 min\t7.5\tOtherwise hold +50 kg from last week.\t']);
  const flags = collectPrescriptionConsistencyFlags(p, {});
  assert.equal(flags[0].code, 'V34_NOTE_UNDEFINED_LOAD_REFERENCE');
  assert.equal(flags[0].load, '+50kg');
  // The same note is legitimate when the intake documents that benchmark.
  assert.equal(collectPrescriptionConsistencyFlags(p, { current_numbers: 'Weighted Chin-up: +50 kg x 3' }).length, 0);
});

test('[V34-7] an unconditional "add one set" cannot survive an unchanged prescription', () => {
  const bad = block(2, ['Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t2-3 min\t8\tAdd one more single this week.\t']);
  assert.equal(collectPrescriptionConsistencyFlags(bad, {})[0].code, 'V34_NOTE_UNCONDITIONAL_ADDITION');
  // Explicitly conditional/earned language is valid coaching and is left alone.
  const ok = block(2, ['Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t2-3 min\t8\tIf every single was clean at target RPE you may add one more single, otherwise repeat.\t']);
  assert.equal(collectPrescriptionConsistencyFlags(ok, {}).length, 0);
});

test('[V34-7b] the release gate throws a retriable error rather than inventing a fix', () => {
  class Retriable extends Error { constructor(code, amendment, details) { super(amendment); this.code = code; this.details = details; } }
  const p = block(1, ['Session A\tControlled Handstand Kick-up\tBodyweight\t4\t2\t60-90 sec\tN/A\tPerform 4 attempts per set.\t']);
  assert.throws(() => validatePrescriptionConsistency(p, {}, Retriable), (e) => e.code === 'V34_NOTE_PER_SET_MISMATCH');
  assert.equal(validatePrescriptionConsistency(block(1, ['Session A\tX\tBodyweight\t4\t2\t60 sec\tN/A\tClean entries only.\t']), {}, Retriable).ok, true);
});

// 8-9. Workload accounting ----------------------------------------------------

test('[V34-8] session duration counts rests and transitions, not just work', () => {
  assert.equal(restSeconds('2-3 min'), 180);
  assert.equal(restSeconds('90 sec'), 90);
  assert.equal(restSeconds('2:30'), 150);
  const p = block(1, [
    'Session A\t[WARMUP]\tN/A\t1\t8 min\tN/A\t3\tPrep.\t',
    'Session A\tPull-up\tBodyweight\t4\t6\t2 min\t7\tQuality.\t',
  ]);
  const [session] = sessionDurations(p, 1);
  // 8 warm-up + (4x6x5s = 2) work + 3 rests x 2 min = 6 + one transition 1.5
  assert.ok(session.minutes > 15 && session.minutes < 20, `expected rest+transition to dominate, got ${session.minutes}`);
  const noRest = sessionDurations(block(1, ['Session A\tPull-up\tBodyweight\t4\t6\t\t7\tQuality.\t']), 1)[0];
  assert.ok(session.minutes > noRest.minutes, 'prescribed rest must increase the estimate');
});

test('[V34-9] weekly running accounting includes interval reps and warm-up/cooldown', () => {
  const p = block(1, [
    'Mon\tRun\tEasy\t1\t30 min\tN/A\t5\tZone 2.\t',
    'Tue\t[WARMUP] Run\tEasy jog\t1\t12 min\tN/A\t4\tIncludes 3 x 80 m strides.\t',
    'Tue\tRun\t1:42 per 400 m\t6\t400 m\t2:15\t8\tIntervals; cooldown 10 min easy.\t',
  ]);
  const km = projectedWeeklyRunningKm(p, 1);
  // 5.0 easy + 2.0 warm-up + 0.24 strides + 2.4 reps + 1.67 cooldown
  assert.ok(km > 10, `interval reps and warm-up/cooldown must be counted, got ${km}`);
  assert.equal(statedRunningBaselineKm({ notes: 'about 18-20 km/week' }).high, 20);
  const signals = runningVolumeSignals(p.replace('30 min', '150 min'), { notes: 'about 18-20 km/week', injuries: 'shin splint history' });
  assert.equal(signals[0].code, 'V34_RUNNING_VOLUME_ABOVE_BASELINE');
  assert.equal(signals[0].impact_history, true);
});

test('[V34-9b] a plan inside the tolerated baseline raises no volume signal', () => {
  const p = block(1, ['Mon\tRun\tEasy\t1\t30 min\tN/A\t5\tZone 2.\t']);
  assert.deepEqual(runningVolumeSignals(p, { notes: 'about 18-20 km/week' }), []);
});

// 10. Source-linked symptom response -----------------------------------------

test('[V34-10] symptom response targets the provocative or newest stressor, not always easy running', () => {
  const rules = buildSymptomResponseRules({
    primary_goals: ['Improve 3 km'],
    secondary_goals: ['Improve 10 km ruck with 20 kg'],
    notes: 'Previous shin-splint irritation.',
  }).join(' ');
  assert.match(rules, /SYMPTOM RESPONSE IS SOURCE-LINKED, NOT BLANKET/);
  assert.match(rules, /during or in the 24h after the quality\/interval session, reduce that session first/);
  assert.match(rules, /after loaded carrying, hold or reduce the ruck variable/);
  assert.match(rules, /Only when symptoms are diffuse .* should easy-running volume be the first/s);
  assert.match(rules, /increased in the last 7-10 days .* remove or reduce THAT variable first/s);
  // No impact history: no rules at all.
  assert.deepEqual(buildSymptomResponseRules({ primary_goals: ['Bench press'] }), []);
});

// 11. Maintenance holds -------------------------------------------------------

test('[V34-11] maintenance defaults to hold across build weeks', () => {
  const rules = buildMaintenanceHoldRules({ maintenance_goals: ['Maintain useful squat and deadlift strength'] }).join(' ');
  assert.match(rules, /MAINTENANCE DEFAULTS TO HOLD/);
  assert.match(rules, /do not progress just because the calendar advanced/);
  assert.match(rules, /correct and expected for a maintenance lift .* to read identically across several weeks/s);
  assert.deepEqual(buildMaintenanceHoldRules({}), []);
});

// 12-13. Soft ceilings and stop rules ----------------------------------------

test('[V34-12] excessive secondary pulling is flagged against an endurance primary', () => {
  const brief = buildV34ArchitectureBrief({
    primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
    secondary_goals: ['Improve strict pull-ups from 14 toward 18-20'],
  });
  assert.match(brief, /SECONDARY PULLING ALLOCATION/);
  assert.match(brief, /roughly 10 or fewer genuinely hard sets per week/);
  // Not applied when pulling is the primary goal.
  assert.doesNotMatch(buildV34ArchitectureBrief({ primary_goals: ['Improve strict pull-ups'] }), /SECONDARY PULLING ALLOCATION/);
});

test('[V34-13] heavily concurrent athletes get an intra-session stop rule', () => {
  const brief = buildV34ArchitectureBrief({ sport: 'MMA', sport_sessions_per_week: 5, primary_goals: ['220kg back squat'] });
  assert.match(brief, /INTRA-SESSION STOP RULE/);
  assert.match(brief, /stop after 2 sets if the RPE ceiling is exceeded/);
  assert.match(brief, /Never require the final set purely because the table lists it/);
  assert.doesNotMatch(buildV34ArchitectureBrief({ primary_goals: ['220kg back squat'] }), /INTRA-SESSION STOP RULE/);
});

// 14-15. Regression on the accepted v33 artifacts -----------------------------

test('[V34-14] the accepted v33 artifacts stay parseable and raise only the known +50 kg defect', () => {
  const AH = { current_numbers: 'Back Squat: 205 kg 1RM\nOne-Arm Pull-up: 2 strict reps each arm\nOverhead Press: 80 kg x 4\nWeighted Chin-up: +80 kg 1RM' };
  const TAC = { current_numbers: '3 km: 13:30\nWeighted Pull-up: +30 kg x 5\nStrict Pull-ups: 14 reps' };
  assert.deepEqual(collectPrescriptionConsistencyFlags(readLive('youth_gymnastics'), {}), []);
  assert.deepEqual(collectPrescriptionConsistencyFlags(readLive('tactical_3k'), TAC), [], 'benchmark back-references are legitimate');
  const hybrid = collectPrescriptionConsistencyFlags(readLive('advanced_hybrid'), AH);
  assert.equal(hybrid.length, 1);
  assert.equal(hybrid[0].code, 'V34_NOTE_UNDEFINED_LOAD_REFERENCE');
  assert.equal(hybrid[0].load, '+50kg');
});

test('[V34-15] accounting runs cleanly on all three accepted artifacts', () => {
  for (const avatar of ['advanced_hybrid', 'youth_gymnastics', 'tactical_3k']) {
    const program = readLive(avatar);
    for (let week = 1; week <= 4; week++) {
      const durations = sessionDurations(program, week);
      assert.ok(durations.length > 0, `${avatar} week ${week} must parse into sessions`);
      for (const d of durations) assert.ok(d.minutes > 0 && d.minutes < 240, `${avatar} ${d.day} duration sane`);
    }
  }
  // Youth carries a 60-minute ceiling; the accepted artifact must respect it.
  for (const d of sessionDurations(readLive('youth_gymnastics'), 1)) {
    assert.ok(d.minutes <= 60, `${d.day} projected ${d.minutes} min exceeds the youth ceiling`);
  }
});

test('[V34-15b] the brief is empty for an intake with none of the triggering facts', () => {
  assert.equal(buildV34ArchitectureBrief({ primary_goals: ['General fitness'] }), '');
});
