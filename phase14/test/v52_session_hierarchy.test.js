import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { collectSessionHierarchyFlags, repairSessionHierarchy, goalTierFor, buildSessionHierarchyBrief } from '../engine/v52_session_hierarchy.js';
import { collectProgressionLanguageFlags } from '../engine/v34_prescription_consistency.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { classifyFinding } from '../engine/v39_coaching_rubric.js';

// A coach scored a live Hybrid program 7.3 and named two QA failures the engine
// had reported nothing about: secondary Push Press sitting between the session's
// two primary exposures, and a note instructing "add only 1 km" against a long
// run that stayed at 18 km for three consecutive weeks.

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const HYBRID = { primary_goals: ['220kg back squat', '4 One arm pullups'], secondary_goals: ['100kg overhead press', 'Marathon'] };
const readFixture = (n) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', `${n}-program.txt`), 'utf8');

const mondayRows = (program) => program.split('START_WEEK1_TSV')[1].split('END_WEEK1_TSV')[0]
  .split('\n').filter((l) => l.startsWith('Mon\t') && !/\[WARMUP\]/.test(l)).map((l) => l.split('\t')[1]);

const INTERRUPTED = ['Overview.', block(1, [
  'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1-2 each side\t3 min\t8\tPrimary skill-strength.\t',
  'Mon\tPush Press\tRPE-selected load\t2\t3\t2 min\t7\tSecondary vertical press.\t',
  'Mon\tBack Squat\t172.5 kg\t3\t3\t3 min\t8\tPrimary strength.\t',
  'Mon\tCalf Raise\tRPE-selected load\t2\t12\t60 sec\t7\tTissue work.\t',
])].join('\n\n');

test('[Y1] secondary work between two primary exposures is a finding', () => {
  const flags = collectSessionHierarchyFlags(INTERRUPTED, HYBRID);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V52_SECONDARY_BETWEEN_PRIMARIES');
  assert.deepEqual(flags[0].interrupting, ['Push Press']);
});

test('[Y2] it is repaired by moving the work, never by changing a prescription', () => {
  const repaired = repairSessionHierarchy(INTERRUPTED, HYBRID);
  assert.deepEqual(collectSessionHierarchyFlags(repaired.program, HYBRID), []);
  // Directly after the last primary, not merely somewhere later: anchoring on a
  // stale index landed it after unrelated support work.
  assert.deepEqual(mondayRows(repaired.program), ['One-Arm Pull-up', 'Back Squat', 'Push Press', 'Calf Raise']);
  assert.match(repaired.program, /Push Press\tRPE-selected load\t2\t3\t/, 'the prescription is untouched');
});

test('[Y3] support work between primaries is a coach\'s business, not a rule\'s', () => {
  const withSupport = INTERRUPTED.replace('Mon\tPush Press\tRPE-selected load\t2\t3\t2 min\t7\tSecondary vertical press.\t',
    'Mon\tCalf Raise\tRPE-selected load\t2\t12\t60 sec\t7\tTissue work.\t');
  assert.deepEqual(collectSessionHierarchyFlags(withSupport, HYBRID), []);
});

test('[Y4] a session with one primary exposure is never second-guessed', () => {
  const single = ['Overview.', block(1, [
    'Sun\tOverhead Press\t72.5 kg\t4\t4\t2 min\t7.5\tSecondary press.\t',
    'Sun\tBack Squat\t145 kg\t2\t4\t3 min\t6\tPrimary, light.\t',
  ])].join('\n\n');
  assert.deepEqual(collectSessionHierarchyFlags(single, HYBRID), []);
});

test('[Y5] goal tiers come from the athlete\'s own goals', () => {
  assert.equal(goalTierFor('Back Squat', HYBRID), 'primary');
  assert.equal(goalTierFor('One-Arm Pull-up', HYBRID), 'primary');
  assert.equal(goalTierFor('Push Press', HYBRID), 'secondary');
  assert.equal(goalTierFor('Calf Raise', HYBRID), 'support');
  // An athlete whose goals name no recognisable movement is not second-guessed.
  assert.equal(goalTierFor('Back Squat', { primary_goals: ['feel better'] }), 'support');
});

test('[Y6] no coach-reviewed program raises a hierarchy finding', () => {
  const cases = [
    ['advanced_hybrid', HYBRID],
    ['tactical_3k', { primary_goals: ['Improve 3 km from 13:30 to sub-12:00'], secondary_goals: ['Improve 10 km ruck with 20 kg', 'Improve strict pull-ups'] }],
    ['youth_gymnastics', { primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'], secondary_goals: ['Build a strong general push and pull foundation'] }],
  ];
  for (const [id, intake] of cases) {
    assert.deepEqual(collectSessionHierarchyFlags(readFixture(id), intake), [], `${id} must stay clean`);
  }
});

test('[Y7] it blocks release and briefs the model', () => {
  assert.equal(classifyFinding('V52_SECONDARY_BETWEEN_PRIMARIES').classification, 'hard');
  const brief = buildSessionHierarchyBrief(HYBRID);
  assert.match(brief, /never between them/);
  assert.equal(buildSessionHierarchyBrief({ primary_goals: ['x'] }), '', 'no secondary goals, no brief');
});

// --- the other half of what the coach found ----------------------------------

test('[Y8] an instruction to add distance the prescription never adds is caught', () => {
  // The claim table only ever described reductions and holds, so "add only 1 km"
  // against a flat distance was unchecked.
  const flat = ['Overview.',
    block(1, ['Thu\tRun\tN/A\t1\t18 km\tN/A\t5\tConversational long run.\t']),
    block(2, ['Thu\tRun\tN/A\t1\t18 km\tN/A\t5\tAdd only 1 km and keep the pace equally easy.\t']),
  ].join('\n\n');
  const flags = collectProgressionLanguageFlags(flat, {});
  assert.equal(flags.length, 1);
  assert.equal(flags[0].claim, 'increase:distance');
});

test('[Y9] the instruction is restated whole, taking its condition with it', () => {
  // Splicing over just the claim left "only hold the distance if Week 2
  // recovered cleanly", which asks nothing coherent.
  const flat = ['Overview.',
    block(1, ['Thu\tRun\tN/A\t1\t18 km\tN/A\t5\tEasy long run.\t']),
    block(2, ['Thu\tRun\tN/A\t1\t18 km\tN/A\t5\tOnly extend to 20 km if Week 1 recovered cleanly. Keep the same easy effort.\t']),
  ].join('\n\n');
  const repaired = repairDeterministicContradictions(flat, {});
  assert.deepEqual(collectProgressionLanguageFlags(repaired.program, {}), []);
  assert.match(repaired.program, /Hold the distance\. Keep the same easy effort\./);
});

test('[Y10] a genuine distance increase keeps its wording', () => {
  const rising = ['Overview.',
    block(1, ['Thu\tRun\tN/A\t1\t18 km\tN/A\t5\tEasy long run.\t']),
    block(2, ['Thu\tRun\tN/A\t1\t19 km\tN/A\t5\tAdd only 1 km and keep the pace equally easy.\t']),
  ].join('\n\n');
  assert.deepEqual(collectProgressionLanguageFlags(rising, {}), []);
  assert.match(repairDeterministicContradictions(rising, {}).program, /Add only 1 km/);
});

// --- the key session and the day before it -----------------------------------

import { collectKeySessionCrowdingFlags, repairKeySessionCrowding } from '../engine/v52_session_hierarchy.js';
import { collectScheduleFrequencyFlags, collectOptionalQualifierFlags } from '../engine/v46_language_accuracy.js';
import { auditProgramStructure } from '../engine/v38_structural_audit.js';

// The coach's first priority: recovery-aware scheduling was not overriding the
// template. The engine placed the lower-cost 145 kg squat on Sunday, the day
// before Monday's primary One-Arm Pull-up and 172.5 kg squat. The existing
// adjacency rule only objects when both days breach axial AND lower-body load,
// and a light Sunday squat breaches neither alone.
const HYBRID_SCHED = { ...HYBRID, available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'], days_per_week: 4 };
const CROWDED = ['Overview.', block(1, [
  'Sun\tOverhead Press\t72.5 kg\t4\t4\t2 min\t7.5\tSecondary press.\t',
  'Sun\tBack Squat\t145 kg\t2\t4\t3 min\t6\tLower-cost squat exposure.\t',
  'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1-2 each side\t3 min\t8\tPrimary.\t',
  'Mon\tBack Squat\t172.5 kg\t3\t3\t3 min\t8\tPrimary, heavy.\t',
  'Fri\tChin-up\tRPE-selected load\t2\t4\t2 min\t7.5\tSupport.\t',
  'Fri\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t90 sec\t7\tSupport.\t',
])].join('\n\n');

test('[Y11] the lower-cost exposure may not sit the day before the heavy one', () => {
  const flags = collectKeySessionCrowdingFlags(CROWDED, HYBRID_SCHED);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V52_KEY_SESSION_CROWDED');
  assert.equal(flags[0].crowding_day, 'Sun');
  assert.equal(flags[0].heavy_day, 'Mon');
});

test('[Y12] it is relocated to the training day furthest from the key session', () => {
  const repaired = repairKeySessionCrowding(CROWDED, HYBRID_SCHED);
  assert.deepEqual(collectKeySessionCrowdingFlags(repaired.program, HYBRID_SCHED), []);
  assert.equal(repaired.repairs[0].to, 'Fri', 'Friday is furthest from Monday either way round the week');
  // Primary work leads the session it lands in; appending left a barbell squat
  // sitting after the neck isometrics.
  const friday = repaired.program.split('START_WEEK1_TSV')[1].split('END_WEEK1_TSV')[0]
    .split('\n').filter((l) => l.startsWith('Fri\t')).map((l) => l.split('\t')[1]);
  assert.equal(friday[0], 'Back Squat');
});

test('[Y13] it never relocates onto a day that is not a training day', () => {
  // Choosing from every day present in the week put a barbell squat on the
  // running day, inventing a strength session rather than moving one.
  const withRun = CROWDED.replace('END_WEEK1_TSV', 'Thu\tRun\tN/A\t1\t18 km\tN/A\t5\tLong run.\t\nEND_WEEK1_TSV');
  const repaired = repairKeySessionCrowding(withRun, HYBRID_SCHED);
  for (const r of repaired.repairs) {
    assert.ok(HYBRID_SCHED.available_gym_days.includes(r.to), `${r.to} is not a stated gym day`);
  }
});

test('[Y14] the relocation introduces no structural failure and is idempotent', () => {
  const before = auditProgramStructure(CROWDED, HYBRID_SCHED).filter((f) => f.severity === 'hard').length;
  const once = repairKeySessionCrowding(CROWDED, HYBRID_SCHED);
  assert.ok(auditProgramStructure(once.program, HYBRID_SCHED).filter((f) => f.severity === 'hard').length <= before);
  assert.equal(repairKeySessionCrowding(once.program, HYBRID_SCHED).program, once.program);
});

test('[Y15] no coach-reviewed program is crowded', () => {
  for (const id of ['advanced_hybrid', 'tactical_3k', 'youth_gymnastics']) {
    const intake = id === 'advanced_hybrid' ? HYBRID_SCHED : { primary_goals: ['x'] };
    assert.deepEqual(collectKeySessionCrowdingFlags(readFixture(id), intake), [], `${id} must stay clean`);
  }
});

// --- the rest of the QA leak --------------------------------------------------

test('[Y16] scheduling more days than the athlete agreed to is reported', () => {
  // Sun, Mon, Fri in the base fixture, plus Tue and a Thursday run: five days
  // against the four the athlete asked for.
  const fiveDays = CROWDED.replace('END_WEEK1_TSV',
    'Tue\tAssisted One-Arm Pull-up\tMinimum assistance\t2\t1 per arm\t2 min\t6\tTechnique microdose.\t\n'
    + 'Thu\tRun\tN/A\t1\t18 km\tN/A\t5\tLong run.\t\nEND_WEEK1_TSV');
  const flags = collectScheduleFrequencyFlags(fiveDays, HYBRID_SCHED);
  assert.equal(flags[0].code, 'V46_SCHEDULE_EXCEEDS_STATED_FREQUENCY');
  assert.equal(flags[0].stated, 4);
  assert.equal(flags[0].actual, 5);
});

test('[Y17] an athlete who says they can spread the work is not contradicted', () => {
  // Tactical states exactly this, and flagging it would be arguing with the intake.
  const spread = { days_per_week: 3, notes: 'Can train across five calendar days and is comfortable combining easy running with a strength day.' };
  assert.deepEqual(collectScheduleFrequencyFlags(readFixture('tactical_3k'), spread), []);
});

test('[Y18] "optional" on primary work must name what is optional', () => {
  const isPrimary = (n) => goalTierFor(n, HYBRID) === 'primary';
  const vague = ['Overview.', block(1, [
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tThis session is optional if you are tired.\t',
  ])].join('\n\n');
  assert.equal(collectOptionalQualifierFlags(vague, HYBRID, isPrimary).length, 1);

  // The live program names its addition, so it is correct and must not fire.
  const named = ['Overview.', block(1, [
    'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1\t3 min\t8\tYou may add ONE extra clean single each side - earned, optional, skipped on any grind.\t',
  ])].join('\n\n');
  assert.deepEqual(collectOptionalQualifierFlags(named, HYBRID, isPrimary), []);
});

test('[Y19] "earned" alone means achieved, not discretionary', () => {
  // "Keep the earned standard" is good coaching language; flagging it called a
  // correct note a defect.
  const isPrimary = (n) => goalTierFor(n, HYBRID) === 'primary';
  const earned = ['Overview.', block(1, [
    'Mon\tBack Squat\t172.5 kg\t3\t3\t3 min\t8\tKeep the earned standard, reduce fatigue, stop if technique changes.\t',
  ])].join('\n\n');
  assert.deepEqual(collectOptionalQualifierFlags(earned, HYBRID, isPrimary), []);
});
