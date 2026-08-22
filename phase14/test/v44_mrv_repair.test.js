import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { trimExcessSupportVolume } from '../engine/mrv_support_trim.js';
import { validateWeeklyVolumeBudgetSemantic } from '../engine/semantic_program_qa.js';
import { auditProgramStructure } from '../engine/v38_structural_audit.js';

// Live run #65 lost Advanced Hybrid to four attempts on WEEKLY_MRV_EXCEEDED.
// The repair existed and was wired, but it could only reduce set counts and
// refused to go below two sets. Every accessory in the program was already at
// two sets, and the only rows carrying more were the primary and direct-goal
// exposures it must never touch -- so it had zero legal moves, returned
// unresolved every time, and regeneration produced the same shape again.

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const fourWeeks = (rows) => ['Overview.', block(1, rows), block(2, rows), block(3, rows), block(4, rows)].join('\n\n');

const LIFTER = {
  age: 30, experience: 'advanced', primary_goals: ['220kg back squat'],
  days_per_week: 3, available_gym_days: ['Mon', 'Wed', 'Fri'],
  training_location: 'commercial_gym', sport: '', sport_schedule: [],
  current_numbers: 'Back Squat: 205 kg 1RM', injuries: 'None reported',
};

const PULLS = ['Cable Row', 'Chest-Supported Row', 'Lat Pulldown', 'Face Pull', 'Seated Row', 'Inverted Row'];
function programWith(accessoriesPerDay) {
  const rows = [];
  for (const day of ['Mon', 'Wed', 'Fri']) {
    rows.push(`${day}\tBack Squat\t170 kg\t3\t5\t3 min\t8\tTop sets.\t`);
    rows.push(`${day}\tOverhead Press\t60 kg\t3\t5\t2 min\t7\tStrict.\t`);
    rows.push(`${day}\tPlank\tBodyweight\t2\t45 sec\t60 sec\t6\tBrace.\t`);
    for (const ex of PULLS.slice(0, accessoriesPerDay)) {
      rows.push(`${day}\t${ex}\tRPE-selected load\t2\t12\t90 sec\t7\tSupport.\t`);
    }
  }
  return fourWeeks(rows);
}

const mrvCode = (p, intake) => {
  try { validateWeeklyVolumeBudgetSemantic(p, intake); return null; }
  catch (e) { return e.code; }
};
const hardStructural = (p, intake) => auditProgramStructure(p, intake).filter((f) => f.severity === 'hard').length;

test('[M1] a week built from two-set accessories is now repairable', () => {
  const p = programWith(6);
  assert.equal(mrvCode(p, LIFTER), 'WEEKLY_MRV_EXCEEDED', 'fixture must actually breach the budget');
  const result = trimExcessSupportVolume(p, LIFTER);
  assert.equal(result.repaired, true);
  assert.equal(mrvCode(result.program, LIFTER), null, 'the repair must clear the gate it was called for');
  assert.ok(result.reductions.some((r) => r.action === 'remove'), 'with nothing to trim, the cut order removes a support row');
});

test('[M2] the repair never leaves the program worse than it found it', () => {
  const p = programWith(6);
  const result = trimExcessSupportVolume(p, LIFTER);
  assert.ok(hardStructural(result.program, LIFTER) <= hardStructural(p, LIFTER));
});

test('[M3] a program it cannot fix is returned untouched, not partially gutted', () => {
  // Over-volume driven by primary work the repair must not touch. A partial trim
  // would strip coaching content and still fail the gate, so nothing is kept.
  const rows = [];
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    rows.push(`${day}\tBack Squat\t170 kg\t5\t5\t3 min\t9\tPrimary.\t`);
    rows.push(`${day}\tFront Squat\t140 kg\t5\t5\t3 min\t9\tPrimary.\t`);
    rows.push(`${day}\tPlank\tBodyweight\t2\t45 sec\t60 sec\t6\tBrace.\t`);
  }
  const p = fourWeeks(rows);
  assert.equal(mrvCode(p, LIFTER), 'WEEKLY_MRV_EXCEEDED');
  const result = trimExcessSupportVolume(p, LIFTER);
  assert.equal(result.repaired, false);
  assert.equal(result.program, p, 'an unresolved repair must return the original byte-for-byte');
  assert.ok(result.unresolved);
});

test('[M4] a session is never cut below three work exercises', () => {
  // Trading an over-volume week for a two-exercise session repairs nothing:
  // an incomplete session is itself a hard structural violation.
  const p = programWith(6);
  const result = trimExcessSupportVolume(p, LIFTER);
  for (let week = 1; week <= 4; week++) {
    const m = result.program.match(new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`, 'i'));
    const byDay = new Map();
    for (const line of m[1].split('\n').slice(1)) {
      const cells = line.split('\t');
      if (!cells[1] || /^\s*\[WARMUP\]/i.test(cells[1])) continue;
      byDay.set(cells[0], (byDay.get(cells[0]) || 0) + 1);
    }
    for (const [day, count] of byDay) {
      assert.ok(count >= 3, `Week ${week} ${day} was cut to ${count} work exercises`);
    }
  }
});

test('[M5] a program inside its budget is not touched at all', () => {
  const p = programWith(2);
  assert.equal(mrvCode(p, LIFTER), null);
  const result = trimExcessSupportVolume(p, LIFTER);
  assert.equal(result.repaired, false);
  assert.equal(result.program, p);
});

test('[M6] removals are bounded: a structurally wrong program goes to regeneration', () => {
  // More than a handful of deletions means the program is wrong, not merely over
  // budget, and rewriting it would be inventing a different program.
  const p = programWith(6);
  const capped = trimExcessSupportVolume(p, LIFTER, { maxRemovals: 1 });
  assert.equal(capped.repaired, false);
  assert.equal(capped.program, p);
});

test('[M7] direct-goal and primary exposures are never removed', () => {
  const p = programWith(6);
  const result = trimExcessSupportVolume(p, LIFTER);
  const squats = (result.program.match(/\tBack Squat\t/g) || []).length;
  const presses = (result.program.match(/\tOverhead Press\t/g) || []).length;
  assert.equal(squats, 12, 'three squat days across four weeks must survive');
  assert.equal(presses, 12);
});

// --- the other gate that had no working repair -------------------------------

import { collectNarrativeClaimFlags, longRunBuildClaim, LONG_RUN_BUILD_CLAIMS } from '../engine/v35_coaching_standards.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';

// The second code Hybrid stalled on. A repair existed but matched only "the long
// run builds"; the detector accepted six wordings, so the other five were
// flagged forever and never rewritten -- the same divergence that cost run #63.
const runWeek = (w, km) => `START_WEEK${w}_TSV\n${H}\nThu\tRun\tN/A\t1\t${km} km\tN/A\t5\tEasy.\t\nEND_WEEK${w}_TSV`;
const flatBlock = (head) => [head, runWeek(1, 16), runWeek(2, 16), runWeek(3, 16), runWeek(4, 14)].join('\n\n');

const PHRASINGS = [
  'The long run builds gradually across the block.',
  'Long run builds each week toward the marathon.',
  'The long run progressively increases through Weeks 2-3.',
  'We steadily increase the long run across the block.',
  'The long run steps up in Weeks 2 and 3.',
  'Aerobic base progresses as the long run builds.',
];

test('[N1] every phrasing the detector flags is cleared in one repair pass', () => {
  const unrepairable = [];
  for (const head of PHRASINGS) {
    const p = flatBlock(head);
    assert.ok(collectNarrativeClaimFlags(p, {}).length > 0, `fixture must be flagged: ${head}`);
    const repaired = repairDeterministicContradictions(p, {});
    if (collectNarrativeClaimFlags(repaired.program, {}).length > 0) unrepairable.push(head);
  }
  assert.deepEqual(unrepairable, []);
});

test('[N2] the repair reads the detector claim table, not a private copy', () => {
  assert.ok(LONG_RUN_BUILD_CLAIMS.length >= 2);
  assert.ok(longRunBuildClaim('The long run builds.'));
  assert.ok(longRunBuildClaim('We increase the long run.'));
  assert.equal(longRunBuildClaim('The long run is held at the tolerated dose.'), null);
});

test('[N3] restating replaces the sentence, leaving neighbours intact', () => {
  // Splicing into the middle stranded the claim's adverbs ("held at the
  // tolerated dose gradually across the block") and, where two patterns
  // overlapped, produced nonsense.
  const p = flatBlock('We steadily increase the long run across the block. Keep MMA quality intact.');
  const out = repairDeterministicContradictions(p, {}).program;
  assert.match(out, /The long run is held at the tolerated dose\. Keep MMA quality intact\./);
  assert.doesNotMatch(out, /steadily/);
});

test('[N4] a narrative that matches the prescription is left alone', () => {
  const rising = ['The long run builds across the block.', runWeek(1, 10), runWeek(2, 12), runWeek(3, 14), runWeek(4, 12)].join('\n\n');
  assert.deepEqual(collectNarrativeClaimFlags(rising, {}), []);
  const out = repairDeterministicContradictions(rising, {});
  assert.match(out.program, /The long run builds across the block\./);
});

test('[N5] the restatement is idempotent', () => {
  const p = flatBlock('The long run builds gradually across the block.');
  const once = repairDeterministicContradictions(p, {});
  const twice = repairDeterministicContradictions(once.program, {});
  assert.equal(twice.program, once.program);
});

// --- the gate that blocked run #67 -------------------------------------------

import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';

// Advanced Hybrid spent all four attempts of live run #67 on
// HEAVY_STRENGTH_RAMP_MISSING, failing from the first attempt. A ramp is derived
// arithmetically from the work load by rampText -- the same function the
// enrichment layer already uses -- so asking the model for it again was never
// going to help.
const HYBRID_INTAKE = {
  age: 30, primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'], experience: 'advanced',
  days_per_week: 4, available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  gym_availability_mode: 'limited', goal_priority_model: 'tiered_equal_primary',
  training_location: 'commercial_gym', sport: 'MMA', sport_sessions_per_week: 5,
  sport_schedule: [
    { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
    { day: 'Sat', intensity: 'moderate' },
  ],
  current_numbers: 'Back Squat: 205 kg 1RM\nOne-Arm Pull-up: 2 strict reps each arm\nOverhead Press: 80 kg x 4',
  injuries: 'None reported',
};
const hybridGolden = fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'advanced_hybrid-program.txt'), 'utf8');
const hybridCode = (p) => {
  try { validateAdvancedHybridQualitySemantic(p, HYBRID_INTAKE); return null; }
  catch (e) { return e.code; }
};

test('[K1] a missing heavy ramp is generated from the work load, not regenerated', () => {
  const stripped = hybridGolden.replace(/Ramp [^;\t]*?work sets\./g, 'General prep.');
  assert.equal(hybridCode(stripped), 'HEAVY_STRENGTH_RAMP_MISSING');
  const repaired = repairDeterministicContradictions(stripped, HYBRID_INTAKE);
  assert.equal(hybridCode(repaired.program), null, 'one pass must clear the gate');
  assert.ok(repaired.repairs.some((r) => r.type === 'v45_heavy_ramp_added'));
});

test('[K2] a program that already ramps correctly is left alone', () => {
  const out = repairDeterministicContradictions(hybridGolden, HYBRID_INTAKE);
  assert.equal(out.repairs.filter((r) => r.type === 'v45_heavy_ramp_added').length, 0);
});

test('[K3] one ramp per day, for the heaviest lift, not every loaded row', () => {
  // Ramping every loaded row would turn the warm-up into its own session.
  const stripped = hybridGolden.replace(/Ramp [^;\t]*?work sets\./g, 'General prep.');
  const repaired = repairDeterministicContradictions(stripped, HYBRID_INTAKE);
  const perWeekDay = repaired.repairs.filter((r) => r.type === 'v45_heavy_ramp_added');
  const keys = new Set(perWeekDay.map((r) => `${r.week}|${r.day}`));
  assert.equal(keys.size, perWeekDay.length, 'no day gets two ramps');
});

test('[K4] the ramp repair is idempotent', () => {
  const stripped = hybridGolden.replace(/Ramp [^;\t]*?work sets\./g, 'General prep.');
  const once = repairDeterministicContradictions(stripped, HYBRID_INTAKE);
  const twice = repairDeterministicContradictions(once.program, HYBRID_INTAKE);
  assert.equal(twice.program, once.program);
});
