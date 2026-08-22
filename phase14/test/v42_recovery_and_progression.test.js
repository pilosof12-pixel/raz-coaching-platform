import test from 'node:test';
import assert from 'node:assert/strict';

import {
  weekLoadProfile, elevatedRiskContext, fixedWeeklyCommitmentLoad,
  sportScheduleByDay, rpeFactor, KM_PER_ENDURANCE_SET_EQUIVALENT,
} from '../engine/v42_weekly_load.js';
import { collectRecoveryBudgetFlags, buildRecoveryBudgetBrief } from '../engine/v42_recovery_budget.js';
import {
  collectProgressionDisciplineFlags, buildProgressionDisciplineBrief, risingDimensions, STRESS_DIMENSIONS,
} from '../engine/v42_progression_discipline.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const program = (weeks) => ['Overview.', ...weeks].join('\n\n');

const MMA_WEEK = {
  sport: 'MMA',
  sport_schedule: [
    { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
    { day: 'Sat', intensity: 'moderate' },
  ],
  injuries: 'None reported',
};
const SHIN = { injuries: 'Previous shin-splint irritation with abrupt running-volume increases.', sport_schedule: [] };
const CLEAN = { injuries: 'None reported', sport_schedule: [] };

// --- item 8: the measurements everything else reads -------------------------

test('[W1] a week is measured per day, including days the plan wrote nothing on', () => {
  const p = program([block(1, ['Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tTop sets.\t'])]);
  const profile = weekLoadProfile(p, 1, MMA_WEEK);
  const byDay = Object.fromEntries(profile.days.map((d) => [d.day.toLowerCase(), d]));
  assert.ok(byDay.mon.stressUnits > 0);
  // Wednesday carries a hard sport session and no gym work; it still costs.
  assert.equal(byDay.wed.workSets, 0);
  assert.ok(byDay.wed.stressUnits > 0, 'a sport-only day still spends recovery');
});

test('[W2] session labels that are not weekdays are still measured', () => {
  // A flexible schedule produces "Session A"/"Session B". Keying on weekdays
  // silently dropped every row of such a program and reported an empty week.
  const p = program([block(1, [
    'Session A\tRing Dip\tBodyweight\t3\t5\t2 min\t7\tClean reps.\t',
    'Session B\tRing Row\tBodyweight\t3\t8\t90 sec\t7\tControlled.\t',
  ])]);
  const profile = weekLoadProfile(p, 1, CLEAN);
  assert.deepEqual(profile.days.map((d) => d.day), ['Session A', 'Session B']);
  assert.ok(profile.days.every((d) => d.workSets === 3));
});

test('[W3] distance work is costed by distance, not by set count', () => {
  const short = program([block(1, ['Tue\tRun\tN/A\t1\t5 km\tN/A\t5\tEasy.\t'])]);
  const long = program([block(1, ['Tue\tRun\tN/A\t1\t20 km\tN/A\t5\tEasy.\t'])]);
  const a = weekLoadProfile(short, 1, CLEAN).days[0].stressUnits;
  const b = weekLoadProfile(long, 1, CLEAN).days[0].stressUnits;
  assert.ok(b > a * 3, `20 km must cost far more than 5 km, got ${a} vs ${b}`);
  assert.equal(KM_PER_ENDURANCE_SET_EQUIVALENT, 5);
});

test('[W4] an easy effort rating does not make a long run cheap', () => {
  // The dose of a long run is the distance; the impact is spent either way.
  const easy = program([block(1, ['Tue\tRun\tN/A\t1\t16 km\tN/A\t4\tConversational.\t'])]);
  const hard = program([block(1, ['Tue\tRun\tN/A\t1\t16 km\tN/A\t8\tThreshold.\t'])]);
  const a = weekLoadProfile(easy, 1, CLEAN).days[0].stressUnits;
  const b = weekLoadProfile(hard, 1, CLEAN).days[0].stressUnits;
  assert.ok(a >= b * 0.5, `easy 16 km must not be discounted to nothing: ${a} vs ${b}`);
});

test('[W5] intensity separates heavy primary work from light accessory volume', () => {
  assert.ok(rpeFactor('8') > rpeFactor('6'));
  assert.ok(rpeFactor('6-6.5') < rpeFactor('8'));
  const heavy = program([block(1, ['Mon\tBack Squat\t170 kg\t3\t3\t3 min\t9\tTop.\t'])]);
  const light = program([block(1, ['Mon\tBack Squat\t100 kg\t3\t3\t3 min\t5\tTechnique.\t'])]);
  assert.ok(weekLoadProfile(heavy, 1, CLEAN).days[0].stressUnits > weekLoadProfile(light, 1, CLEAN).days[0].stressUnits);
});

test('[W6] the athlete\'s own sport week is a fixed cost, not optional work', () => {
  assert.equal(sportScheduleByDay(MMA_WEEK).size, 5);
  assert.equal(fixedWeeklyCommitmentLoad(MMA_WEEK).sessions, 5);
  assert.ok(fixedWeeklyCommitmentLoad(MMA_WEEK).stressUnits > fixedWeeklyCommitmentLoad(CLEAN).stressUnits);
});

test('[W7] elevated risk comes from injury history or an already-dense week', () => {
  assert.equal(elevatedRiskContext(CLEAN).elevated, false);
  assert.equal(elevatedRiskContext(SHIN).injuryHistory, true);
  assert.equal(elevatedRiskContext(MMA_WEEK).elevated, true, 'five uncontrolled sport sessions is elevated risk');
  assert.equal(elevatedRiskContext(MMA_WEEK).injuryHistory, false);
});

// --- item 6: recovery budget -------------------------------------------------

test('[R1] a day promising low cost may not carry heavy primary work', () => {
  const p = program([block(1, [
    'Mon\t[WARMUP] Band Pull-Apart\tLight band\t2\t15\t30 sec\t3\tRecovery-contingent low-cost day; keep it crisp.\t',
    'Mon\tBack Squat\t175 kg\t3\t3\t3 min\t8\tTop sets.\t',
  ])]);
  const flags = collectRecoveryBudgetFlags(p, CLEAN);
  const hit = flags.find((f) => f.code === 'V42_LOW_COST_CLAIM_CONTRADICTED');
  assert.ok(hit, 'a low-cost day carrying 3x3 at RPE 8 is a contradiction');
  assert.equal(hit.scope, 'day');
});

test('[R2] an honest support row keeps its low-cost label', () => {
  // A note lives on a row and describes that row. Reading every row-level
  // "low-cost support" note as a promise about the whole day produced false
  // contradictions on rows that were being accurate about themselves.
  const p = program([block(1, [
    'Sun\tOverhead Press\t65 kg\t2\t4\t2 min\t7\tDirect strict work.\t',
    'Sun\tMachine Hamstring Curl\tRPE-selected load\t2\t8\t75 sec\t6.5\tLow-cost lower support only.\t',
  ])]);
  assert.deepEqual(collectRecoveryBudgetFlags(p, CLEAN).filter((f) => f.code === 'V42_LOW_COST_CLAIM_CONTRADICTED'), []);
});

test('[R3] a conditional or earned addition is not a low-cost promise', () => {
  const p = program([block(1, [
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tIf every single was clean you may add ONE extra single - earned, optional, and skipped on any grind.\t',
  ])]);
  assert.deepEqual(collectRecoveryBudgetFlags(p, CLEAN).filter((f) => f.code === 'V42_LOW_COST_CLAIM_CONTRADICTED'), []);
});

test('[R4] primary work on the hardest sport day is raised unless the plan says why', () => {
  const silent = program([block(1, ['Fri\tBack Squat\t145 kg\t3\t4\t3 min\t7\tSteady volume.\t'])]);
  const hit = collectRecoveryBudgetFlags(silent, MMA_WEEK).find((f) => f.code === 'V42_PRIMARY_WORK_ON_HARD_SPORT_DAY');
  assert.ok(hit);
  assert.equal(hit.day, 'Fri');

  const stated = program([block(1, ['Fri\tBack Squat\t145 kg\t3\t4\t3 min\t7\tStop at 2 sets if legs feel beat up from MMA.\t'])]);
  assert.deepEqual(collectRecoveryBudgetFlags(stated, MMA_WEEK).filter((f) => f.code === 'V42_PRIMARY_WORK_ON_HARD_SPORT_DAY'), []);
});

test('[R5] conditioning may not all land on days that already carry sport', () => {
  const stacked = program([block(1, [
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tTop.\t',
    'Thu\tRun\tN/A\t1\t16 km\tN/A\t5\tLong run.\t',
  ])]);
  const hit = collectRecoveryBudgetFlags(stacked, MMA_WEEK).find((f) => f.code === 'V42_CONDITIONING_STACKED_ON_SPORT_DAYS');
  assert.ok(hit, 'the whole week of running on an MMA day is worth raising');
  assert.equal(hit.km, 16);

  const spread = program([block(1, [
    'Mon\tRun\tN/A\t1\t16 km\tN/A\t5\tLong run on a non-sport day.\t',
  ])]);
  assert.deepEqual(collectRecoveryBudgetFlags(spread, MMA_WEEK).filter((f) => f.code === 'V42_CONDITIONING_STACKED_ON_SPORT_DAYS'), []);
});

test('[R6] an athlete with no sport week raises no placement or stacking findings', () => {
  const p = program([block(1, [
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tTop.\t',
    'Tue\tRun\tN/A\t1\t10 km\tN/A\t5\tEasy.\t',
  ])]);
  const codes = collectRecoveryBudgetFlags(p, CLEAN).map((f) => f.code);
  assert.ok(!codes.includes('V42_PRIMARY_WORK_ON_HARD_SPORT_DAY'));
  assert.ok(!codes.includes('V42_CONDITIONING_STACKED_ON_SPORT_DAYS'));
});

// --- item 10: one stressor at a time ----------------------------------------

test('[P1] several stress dimensions may not rise together under elevated risk', () => {
  const p = program([
    block(1, ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t7\tSteady.\t']),
    block(2, ['Mon\tBack Squat\t150 kg\t4\t6\t3 min\t8\tPush on.\t']),
  ]);
  const hit = collectProgressionDisciplineFlags(p, SHIN).find((f) => f.code === 'V42_MULTIPLE_STRESSORS_RAISED');
  assert.ok(hit);
  assert.deepEqual(hit.dimensions.sort(), ['load', 'reps', 'sets']);
});

test('[P2] distance and pace are stress dimensions, and faster pace is more stress', () => {
  const p = program([
    block(1, ['Tue\tRun\tN/A\t1\t8 km\tN/A\t5\tEasy at 5:30/km.\t']),
    block(2, ['Tue\tRun\tN/A\t1\t10 km\tN/A\t6\tPick it up to 5:00/km.\t']),
  ]);
  const hit = collectProgressionDisciplineFlags(p, SHIN)[0];
  assert.ok(hit);
  assert.deepEqual(hit.dimensions.sort(), ['distance', 'pace']);
  assert.deepEqual(risingDimensions({ pace: 300 }, { pace: 330 }), [], 'a slower pace is not more stress');
});

test('[P3] assistance counts inverted: less help is more stress', () => {
  assert.deepEqual(STRESS_DIMENSIONS, ['load', 'reps', 'sets', 'distance', 'pace', 'assistance']);
  const p = program([
    block(1, ['Mon\tBanded Pull-up\tHeavy band assistance\t3\t5\t2 min\t7\tBuild the pattern.\t']),
    block(2, ['Mon\tBanded Pull-up\tLight band assistance\t3\t6\t2 min\t7\tKeep it clean.\t']),
  ]);
  const hit = collectProgressionDisciplineFlags(p, SHIN)[0];
  assert.ok(hit, 'dropping assistance while adding reps is two dimensions');
  assert.ok(hit.dimensions.includes('assistance'));
});

test('[P4] one dimension at a time raises nothing', () => {
  const p = program([
    block(1, ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t7\tSteady.\t']),
    block(2, ['Mon\tBack Squat\t145 kg\t3\t5\t3 min\t7\tSmall step.\t']),
  ]);
  assert.deepEqual(collectProgressionDisciplineFlags(p, SHIN), []);
});

test('[P5] a progression the athlete gates on their own response is one decision', () => {
  const p = program([
    block(1, ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t7\tSteady.\t']),
    block(2, ['Mon\tBack Squat\t150 kg\t4\t6\t3 min\t8\tOnly if Week 1 stayed at or under the cap.\t']),
  ]);
  assert.deepEqual(collectProgressionDisciplineFlags(p, SHIN), []);
});

test('[P6] outside an elevated-risk context this is ordinary programming', () => {
  const p = program([
    block(1, ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t7\tSteady.\t']),
    block(2, ['Mon\tBack Squat\t150 kg\t4\t6\t3 min\t8\tPush on.\t']),
  ]);
  assert.deepEqual(collectProgressionDisciplineFlags(p, CLEAN), []);
});

// --- prevention --------------------------------------------------------------

test('[B1] both rules brief the model rather than only judging it afterwards', () => {
  // Detection alone can only lower a program's score. The brief is the half
  // that changes what gets generated in the first place.
  const recovery = buildRecoveryBudgetBrief(MMA_WEEK);
  assert.match(recovery, /Tue=moderate/);
  assert.match(recovery, /Hardest sport day/);
  assert.match(recovery, /low-cost/i);

  const discipline = buildProgressionDisciplineBrief(SHIN);
  assert.match(discipline, /one of load, reps, sets, distance, pace, assistance/);
  assert.equal(buildProgressionDisciplineBrief(CLEAN), '', 'no brief where the rule does not apply');
});
