import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { classifyExercise, isFoundationalStrength, dayGap, CATEGORY, ROLE } from '../engine/v38_movement_taxonomy.js';
import {
  auditProgramStructure, auditSessionCompleteness, auditWeeklyCoverage,
  auditFoundationalStrength, auditCircularScheduling, auditLoadedCarryProgression,
  structuralCoverageReport,
} from '../engine/v38_structural_audit.js';
import { buildSessionSkeleton, buildSkeletonBrief, mandatoryWeeklyCategories } from '../engine/v38_session_skeleton.js';

// The v37 live artifacts are the negative fixtures: a coach rated these 6-6.5/10
// on architecture while every validator passed. Each test below pins one of the
// structural defects that review identified.
const LIVE = path.join(process.cwd(), '..', 'docs', 'qa', 'live-three-avatar', 'latest');
// These read the coach-reviewed artifacts, pinned under test/fixtures. Reading
// docs/qa/live-three-avatar/latest instead made the suite's baseline move with
// every acceptance run -- a failed avatar deletes its artifact, and a fresh one
// replaces the program the assertions were written against -- so real
// regressions were indistinguishable from artifact churn. New live output is
// audited separately; these stay fixed so they can detect a regression.
const readLive = (n) => {
  return fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', `${n}-program.txt`), 'utf8');
};
const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;

const HYBRID = {
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'], sport: 'MMA', sport_sessions_per_week: 5,
  sport_schedule: [{ day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' }, { day: 'Sat', intensity: 'moderate' }],
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'], maintenance_goals: ['Maintain muscle mass'],
};
const YOUTH = {
  age: 13, primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
};
const TACTICAL = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'Improve strict pull-ups from 14 toward 18-20'],
};

// --- taxonomy ---------------------------------------------------------------

test('[T1] skill drills are not classified as foundational strength', () => {
  for (const skill of ['Bar Muscle-up Transition Drill', 'Banded Muscle-up', 'Controlled Handstand Kick-up', 'Wall Handstand Hold']) {
    assert.equal(classifyExercise(skill).role, ROLE.SKILL_PRACTICE, `${skill} is skill practice`);
    assert.equal(isFoundationalStrength(skill), false, `${skill} must not count as foundational strength`);
  }
  for (const real of ['Ring Row', 'Pull-up', 'Ring Dip', 'Push-up', 'Overhead Press']) {
    assert.equal(isFoundationalStrength(real), true, `${real} is foundational strength`);
  }
});

test('[T2] categories resolve to the coverage vocabulary, most specific first', () => {
  assert.equal(classifyExercise('Ring Hamstring Curl').category, CATEGORY.HIP_DOMINANT);
  assert.equal(classifyExercise('Ring Row').category, CATEGORY.HORIZONTAL_PULL);
  assert.equal(classifyExercise('One-Arm Pull-up').category, CATEGORY.VERTICAL_PULL);
  assert.equal(classifyExercise('Back Squat').category, CATEGORY.KNEE_DOMINANT);
  assert.equal(classifyExercise('Pistol Squat').category, CATEGORY.UNILATERAL_LOWER);
  assert.equal(classifyExercise('Backpack Carry').category, CATEGORY.LOADED_CARRY);
  assert.equal(classifyExercise('Neck Isometric').category, CATEGORY.TISSUE_CAPACITY);
});

test('[T3] the week is circular: Sunday precedes Monday', () => {
  assert.equal(dayGap('sun', 'mon'), 1);
  assert.equal(dayGap('mon', 'tue'), 1);
  assert.equal(dayGap('fri', 'mon'), 3);
});

// --- 2.1 session completeness ------------------------------------------------

test('[T4] a casual two-exercise session is rejected; a declared microdose is not', () => {
  const casual = block(1, [
    'Sun\tOverhead Press\t70 kg\t4\t4\t3 min\t7.5\tDirect press exposure.\t',
    'Sun\tBack Squat\t145 kg\t3\t5\t3 min\t7\tSecondary squat volume.\t',
  ]);
  const f = auditSessionCompleteness(casual, HYBRID);
  assert.equal(f[0].code, 'V38_INCOMPLETE_SESSION');
  assert.equal(f[0].exercise_count, 2);

  const declared = block(1, [
    'Sun\tOverhead Press\t70 kg\t4\t4\t3 min\t7.5\tDeliberate microdose: time-constrained day, kept short to protect Monday.\t',
    'Sun\tBack Squat\t145 kg\t3\t5\t3 min\t7\tSecondary squat volume.\t',
  ]);
  assert.deepEqual(auditSessionCompleteness(declared, HYBRID), []);
});

test('[T5] an endurance-only or carry-only day is not an incomplete strength session', () => {
  const running = block(1, ['Thu\tRun\tEasy conversational pace\t1\t18 km\tN/A\t6\tLong run.\t']);
  assert.deepEqual(auditSessionCompleteness(running, HYBRID), []);
  const ruck = block(1, ['Sat\tBackpack Carry\t20 kg @ 9:20/km\t1\t60 min\tN/A\t6\tControlled ruck.\t']);
  assert.deepEqual(auditSessionCompleteness(ruck, TACTICAL), []);
});

// --- 2.2 weekly coverage -----------------------------------------------------

test('[T6] a week with no horizontal pulling or pressing is flagged', () => {
  const w = block(1, [
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tPrimary.\t',
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tHeavy.\t',
    'Tue\tRing Hamstring Curl\tBodyweight\t2\t8\t90 sec\t7\tPosterior.\t',
    'Tue\tSide Plank\tBodyweight\t2\t30 sec\t60 sec\t6\tTrunk.\t',
    'Fri\tReverse Lunge\tRPE-selected\t2\t6\t90 sec\t7\tUnilateral.\t',
    'Fri\tNeck Isometric\tBodyweight\t2\t20 sec\t60 sec\t6\tCapacity.\t',
  ]);
  const f = auditWeeklyCoverage(w, HYBRID);
  assert.equal(f[0].code, 'V38_MISSING_MOVEMENT_CATEGORY');
  assert.ok(f[0].missing.includes(CATEGORY.HORIZONTAL_PULL));
  assert.ok(f[0].missing.includes(CATEGORY.HORIZONTAL_PUSH));
});

test('[T7] adding a row and a dip clears the coverage finding', () => {
  const w = block(1, [
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tPrimary.\t',
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tHeavy.\t',
    'Mon\tBarbell Row\t80 kg\t3\t8\t2 min\t7\tHorizontal pull.\t',
    'Tue\tRing Dip\tBodyweight\t3\t6\t2 min\t7\tHorizontal push.\t',
    'Tue\tRing Hamstring Curl\tBodyweight\t2\t8\t90 sec\t7\tPosterior.\t',
    'Tue\tSide Plank\tBodyweight\t2\t30 sec\t60 sec\t6\tTrunk.\t',
    'Fri\tReverse Lunge\tRPE-selected\t2\t6\t90 sec\t7\tUnilateral.\t',
    'Fri\tCalf Raise\tRPE-selected\t2\t12\t60 sec\t7\tTissue capacity.\t',
  ]);
  assert.deepEqual(auditWeeklyCoverage(w, HYBRID), []);
});

// --- 2.4 foundational strength ----------------------------------------------

test('[T8] Youth Session B with skill work but no foundational push or pull is rejected', () => {
  const w = block(1, [
    'Session A\tBar Muscle-up Transition Drill\tLight band\t3\t1\t90 sec\t6\tSkill.\t',
    'Session A\tRing Dip\tBodyweight\t3\t4\t90 sec\t7\tPush.\t',
    'Session A\tRing Row\tBodyweight\t2\t8\t90 sec\t7\tPull.\t',
    'Session B\tControlled Handstand Kick-up\tBodyweight\t3\t2\t75 sec\tN/A\tSkill.\t',
    'Session B\tBanded Muscle-up\tBand\t2\t1\t90 sec\t6\tSkill.\t',
    'Session B\tBox Jump\tBodyweight\t3\t3\t90 sec\t6\tPower.\t',
    'Session B\tPistol Squat\tBodyweight\t3\t4\t90 sec\t7\tLower.\t',
  ]);
  const f = auditFoundationalStrength(w, YOUTH);
  assert.equal(f.length, 1, 'only Session B is at fault');
  assert.equal(f[0].session, 'Session B');
  assert.deepEqual(f[0].missing, ['foundational pulling', 'foundational pushing']);
});

test('[T9] giving Session B a row and a push-up clears it', () => {
  const w = block(1, [
    'Session B\tControlled Handstand Kick-up\tBodyweight\t3\t2\t75 sec\tN/A\tSkill.\t',
    'Session B\tBanded Muscle-up\tBand\t2\t1\t90 sec\t6\tSkill.\t',
    'Session B\tRing Row\tBodyweight\t3\t8\t90 sec\t7\tPull.\t',
    'Session B\tRing Push-up\tBodyweight\t3\t8\t90 sec\t7\tPush.\t',
  ]);
  assert.deepEqual(auditFoundationalStrength(w, YOUTH), []);
});

// --- 2.3 circular scheduling -------------------------------------------------

test('[T10] Sunday squat volume immediately before Monday heavy squat is rejected', () => {
  const w = block(1, [
    'Sun\tBack Squat\t145 kg\t3\t5\t3 min\t7\tSecondary volume.\t',
    'Sun\tOverhead Press\t70 kg\t4\t4\t3 min\t7.5\tPress.\t',
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tHeavy primary.\t',
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tPrimary skill.\t',
  ]);
  const f = auditCircularScheduling(w, HYBRID);
  assert.ok(f.length >= 1, 'the sun->mon adjacency must be caught');
  const clash = f.find((x) => x.from === 'sun' && x.to === 'mon');
  assert.ok(clash, 'specifically sun -> mon');
  assert.equal(clash.code, 'V38_CONSECUTIVE_CONFLICTING_EXPOSURE');
});

test('[T11] separating the secondary squat to a non-adjacent day clears the conflict', () => {
  const w = block(1, [
    'Fri\tBack Squat\t145 kg\t3\t5\t3 min\t7\tSecondary volume.\t',
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tHeavy primary.\t',
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tPrimary skill.\t',
  ]);
  assert.deepEqual(auditCircularScheduling(w, HYBRID).filter((x) => x.tissue === 'axial/lower-body'), []);
});

// --- 5.3 loaded-carry progression -------------------------------------------

test('[T12] a ruck that only accelerates while duration falls is rejected', () => {
  const p = [1, 2, 3, 4].map((w) => block(w, [
    `Sat\tBackpack Carry\t20 kg @ ${['9:20', '9:10', '9:00', '8:55'][w - 1]}/km\t1\t${[60, 58, 54, 50][w - 1]} min\tN/A\t6\tRuck.\t`,
  ])).join('\n\n');
  const f = auditLoadedCarryProgression(p, TACTICAL);
  assert.equal(f[0].code, 'V38_CARRY_PACE_ONLY_PROGRESSION');
  assert.equal(f[0].target_km, 10);
});

test('[T13] a ruck that develops duration alongside pace is accepted', () => {
  const p = [1, 2, 3, 4].map((w) => block(w, [
    `Sat\tBackpack Carry\t20 kg @ ${['9:20', '9:20', '9:10', '9:10'][w - 1]}/km\t1\t${[60, 66, 72, 60][w - 1]} min\tN/A\t6\tRuck.\t`,
  ])).join('\n\n');
  assert.deepEqual(auditLoadedCarryProgression(p, TACTICAL), []);
});

// --- skeleton ----------------------------------------------------------------

test('[T14] the skeleton separates the primary and secondary exposures on the circular week', () => {
  const sk = buildSessionSkeleton(HYBRID);
  assert.ok(sk, 'a skeleton is produced for a declared gym schedule');
  const gap = dayGap(sk.primary, sk.secondary);
  assert.notEqual(gap, 1, 'secondary must not fall the day after primary');
  assert.notEqual(gap, 6, 'nor the day before it');
});

test('[T15] the brief states mandatory categories and the circular-week rule', () => {
  const brief = buildSkeletonBrief(HYBRID);
  assert.match(brief, /SESSION COMPLETENESS/);
  assert.match(brief, /horizontal pulling \(a row\)/);
  assert.match(brief, /horizontal pressing/);
  assert.match(brief, /THE WEEK IS A CYCLE: Sunday is the day before Monday/);
  assert.match(brief, /FOUNDATIONAL STRENGTH IS NOT OPTIONAL/);
  assert.ok(mandatoryWeeklyCategories(HYBRID).includes(CATEGORY.HORIZONTAL_PULL));
  // A skeleton is only emitted when the athlete declares gym days.
  assert.equal(buildSessionSkeleton({ primary_goals: ['General fitness'] }), null);
});

// --- the live artifacts as negative fixtures ---------------------------------

test('[T16] the v37 live programs reproduce every structural defect the review found', () => {
  const hybrid = auditProgramStructure(readLive('advanced_hybrid'), HYBRID);
  const hCodes = new Set(hybrid.map((f) => f.code));
  assert.ok(hCodes.has('V38_INCOMPLETE_SESSION'), 'Hybrid: two-exercise Sunday');
  const hCoverage = hybrid.filter((f) => f.code === 'V38_MISSING_MOVEMENT_CATEGORY');
  assert.ok(hCoverage.length, 'Hybrid: no horizontal pull/push');
  assert.ok(hCoverage.every((f) => f.severity === 'advisory'), 'coverage is advisory, not a release block');
  assert.ok(hCoverage.some((f) => f.missing.includes('horizontal_pull') && f.missing.includes('horizontal_push')));
  assert.ok(hCodes.has('V38_CONSECUTIVE_CONFLICTING_EXPOSURE'), 'Hybrid: sun->mon squat conflict');
  assert.ok(hybrid.some((f) => f.from === 'sun' && f.to === 'mon'));

  const youth = auditProgramStructure(readLive('youth_gymnastics'), YOUTH);
  const yb = youth.find((f) => f.code === 'V38_SKILL_WITHOUT_FOUNDATION' && f.session === 'Session B');
  assert.ok(yb, 'Youth: Session B skill work without foundational strength');

  const tactical = auditProgramStructure(readLive('tactical_3k'), TACTICAL);
  assert.ok(tactical.some((f) => f.code === 'V38_CARRY_PACE_ONLY_PROGRESSION'), 'Tactical: ruck pace-only progression');
});

test('[T17] a structurally complete week raises no hard finding', () => {
  const good = [1, 2].map((w) => block(w, [
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tPrimary skill.\t',
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tHeavy primary.\t',
    'Mon\tBarbell Row\t80 kg\t3\t8\t2 min\t7\tHorizontal pull.\t',
    'Mon\tSide Plank\tBodyweight\t2\t30 sec\t60 sec\t6\tTrunk.\t',
    'Tue\tRing Dip\tBodyweight\t3\t6\t2 min\t7\tHorizontal push.\t',
    'Tue\tRomanian Deadlift\t100 kg\t3\t8\t2 min\t7\tHip dominant.\t',
    'Tue\tCalf Raise\tRPE-selected\t2\t12\t60 sec\t7\tTissue capacity.\t',
    'Fri\tBack Squat\t145 kg\t3\t5\t3 min\t7\tSecondary volume.\t',
    'Fri\tReverse Lunge\tRPE-selected\t2\t6\t90 sec\t7\tUnilateral.\t',
    'Fri\tOverhead Press\t70 kg\t3\t5\t2 min\t7\tVertical push.\t',
  ])).join('\n\n');
  assert.deepEqual(auditProgramStructure(good, HYBRID).filter((f) => f.severity === 'hard'), []);
});

test('[T18] the coverage report names each session and the missing categories', () => {
  const report = structuralCoverageReport(readLive('advanced_hybrid'), HYBRID);
  assert.match(report, /Week 1/);
  assert.match(report, /missing required:/);
  assert.match(report, /horizontal_pull/);
});

test('[T19] the coach-approved golden Tactical program raises no hard structural finding', async () => {
  // Positive architectural fixture: a program the coach rated 9+ must pass every
  // hard rule. If it does not, the rule is wrong, not the program.
  const { tactical3KGoldenProgram, TACTICAL_3K_INTAKE } = await import('./fixtures/golden_programs.js');
  const hard = auditProgramStructure(tactical3KGoldenProgram(), TACTICAL_3K_INTAKE).filter((f) => f.severity === 'hard');
  assert.deepEqual(hard, [], `golden must pass hard rules, got: ${hard.map((f) => f.code).join(', ')}`);
});
