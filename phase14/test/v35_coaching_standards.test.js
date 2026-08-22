import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  collectNarrativeClaimFlags,
  collectSymptomAlgorithmFlags,
  collectSecondaryVolumeCreepFlags,
  collectBlockSpecificityFlags,
  collectVolumeNarrativeFlags,
  collectCoachingStandardFlags,
  validateCoachingStandards,
} from '../engine/v35_coaching_standards.js';

// Each gate encodes a standard the reviewing coach applied by hand. The fixtures
// are the shapes actually found in docs/qa/live-three-avatar/latest.
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
const program = (head, weeks) => `${head}\n\n${weeks.join('\n\n')}`;

const TACTICAL = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve strict pull-ups from 14 toward 18-20'],
  notes: 'Currently runs 3 sessions per week, about 18-20 km/week.',
  injuries: 'Previous shin-splint irritation.',
};

test('[S1] a "long run builds" claim must be visible in the prescribed distances', () => {
  const flat = program('The long run builds through the block before dropping back.', [1, 2, 3, 4].map((w) =>
    block(w, [`Sat\tRun\tEasy\t1\t${[20, 20, 20, 18][w - 1]} km\tN/A\t6\tLong run.\t`])));
  const flags = collectNarrativeClaimFlags(flat, {});
  assert.equal(flags[0].code, 'V35_NARRATIVE_PROGRESSION_CLAIM_UNSUPPORTED');
  assert.deepEqual(flags[0].weekly_km, [20, 20, 20, 18]);

  const rising = program('The long run builds through the block before dropping back.', [1, 2, 3, 4].map((w) =>
    block(w, [`Sat\tRun\tEasy\t1\t${[18, 19, 21, 18][w - 1]} km\tN/A\t6\tLong run.\t`])));
  assert.deepEqual(collectNarrativeClaimFlags(rising, {}), []);

  const honest = program('The long run is held at the tolerated dose, then consolidated.', [1, 2, 3, 4].map((w) =>
    block(w, [`Sat\tRun\tEasy\t1\t${[20, 20, 20, 18][w - 1]} km\tN/A\t6\tLong run.\t`])));
  assert.deepEqual(collectNarrativeClaimFlags(honest, {}), []);
});

test('[S2] two competing symptom-response hierarchies are rejected', () => {
  const conflicting = program(
    'If shin irritation returns, first reduce the most recently increased impact stressor. If shin symptoms return, cut easy-run duration first.',
    [block(1, ['Mon\tRun\tEasy\t1\t30 min\tN/A\t5\tZone 2.\t'])]);
  assert.equal(collectSymptomAlgorithmFlags(conflicting, TACTICAL)[0].code, 'V35_CONFLICTING_SYMPTOM_ALGORITHM');

  const coherent = program(
    'If shin irritation returns, first reduce the most recently increased impact stressor: the interval session if symptoms follow it, the ruck if they follow loaded carrying.',
    [block(1, ['Mon\tRun\tEasy\t1\t30 min\tN/A\t5\tZone 2.\t'])]);
  assert.deepEqual(collectSymptomAlgorithmFlags(coherent, TACTICAL), []);

  // The gate applies whenever impact symptoms are in scope, from the intake OR
  // from the program's own text -- a self-contradiction is a defect either way.
  assert.equal(collectSymptomAlgorithmFlags(conflicting, { primary_goals: ['Bench press'] }).length, 1);
  // With no impact context anywhere, it stays out of the way entirely.
  const unrelated = program('If your elbows feel beat up, drop the heaviest pressing set first.',
    [block(1, ['Mon\tBench Press\t100 kg\t3\t5\t3 min\t7\tPress.\t'])]);
  assert.deepEqual(collectSymptomAlgorithmFlags(unrelated, { primary_goals: ['Bench press'] }), []);
});

test('[S3] accessory volume may not rise in the same week the primary quality advances', () => {
  const creeping = program('Block overview.', [
    block(2, [
      'Tue\tRun\t2:08 per 500 m\t5\t500 m\t2:30\t8\tQuality.\t',
      'Fri\tPull-up\tBodyweight\t4\t8\t2 min\t7\tSupport.\t',
      'Fri\tReverse Lunge\tRPE-selected\t2\t8 per leg\t90 sec\t7\tSupport.\t',
    ]),
    block(3, [
      'Tue\tRun\t2:34 per 600 m\t4\t600 m\t2:45\t8\tLonger reps.\t',
      'Fri\tPull-up\tBodyweight\t5\t8\t2 min\t7\tSupport.\t',
      'Fri\tReverse Lunge\tRPE-selected\t3\t8 per leg\t90 sec\t7\tSupport.\t',
    ]),
  ]);
  const flags = collectSecondaryVolumeCreepFlags(creeping, TACTICAL);
  const named = flags.map((f) => f.exercise).sort();
  assert.deepEqual(named, ['pull-up', 'reverse lunge']);
  assert.equal(flags[0].week, 3);

  // Accessories holding while the primary advances is the intended shape.
  const held = creeping.replace('Fri\tPull-up\tBodyweight\t5', 'Fri\tPull-up\tBodyweight\t4')
    .replace('Fri\tReverse Lunge\tRPE-selected\t3', 'Fri\tReverse Lunge\tRPE-selected\t2');
  assert.deepEqual(collectSecondaryVolumeCreepFlags(held, TACTICAL), []);
});

test('[S3b] accessory volume may rise in a week the primary does not advance', () => {
  const p = program('Block overview.', [
    block(2, ['Tue\tRun\t2:08 per 500 m\t5\t500 m\t2:30\t8\tQuality.\t', 'Fri\tPull-up\tBodyweight\t4\t8\t2 min\t7\tSupport.\t']),
    block(3, ['Tue\tRun\t2:08 per 500 m\t5\t500 m\t2:30\t8\tSame quality.\t', 'Fri\tPull-up\tBodyweight\t5\t8\t2 min\t7\tSupport.\t']),
  ]);
  assert.deepEqual(collectSecondaryVolumeCreepFlags(p, TACTICAL), []);
});

test('[S4] a block may not be called race-specific when its quality never nears event demand', () => {
  // 3 km goal of 12:00 is 240 s/km; every rep here sits around 257 s/km.
  const overstated = program('This is a race-specific block aimed at sub-12:00.', [
    block(1, ['Tue\tRun\t1:43 per 400 m\t5\t400 m\t2:15\t8\tQuality.\t']),
    block(2, ['Tue\tRun\t2:09 per 500 m\t5\t500 m\t2:30\t8\tQuality.\t']),
  ]);
  const flags = collectBlockSpecificityFlags(overstated, TACTICAL);
  assert.equal(flags[0].code, 'V35_BLOCK_SPECIFICITY_OVERSTATED');
  assert.equal(flags[0].goal_pace_s_per_km, 240);
  assert.ok(flags[0].fastest_quality_s_per_km > 240);

  // Describing it honestly as developmental is accepted.
  const honest = overstated.replace('This is a race-specific block aimed at sub-12:00.', 'This is a developmental block that builds toward the target standard.');
  assert.deepEqual(collectBlockSpecificityFlags(honest, TACTICAL), []);

  // Quality genuinely at event demand is accepted even with the claim.
  const specific = program('This is a race-specific block aimed at sub-12:00.', [
    block(1, ['Tue\tRun\t1:35 per 400 m\t5\t400 m\t2:15\t8\tAt event demand.\t']),
    block(2, ['Tue\tRun\t1:34 per 400 m\t5\t400 m\t2:15\t8\tAt event demand.\t']),
  ]);
  assert.deepEqual(collectBlockSpecificityFlags(specific, TACTICAL), []);
});

test('[S5] a stated baseline anchor must match the computed weekly volume', () => {
  const understated = program(
    'Weekly running volume anchor: your baseline is about 18-20 km per week. Easy-run durations are set at or slightly below that baseline on purpose.',
    [block(1, ['Mon\tRun\tEasy\t1\t25 min\tN/A\t5\tZone 2.\t', 'Fri\tRun\tEasy\t1\t30 min\tN/A\t5\tZone 2.\t'])]);
  const flags = collectVolumeNarrativeFlags(understated, TACTICAL);
  assert.equal(flags[0].code, 'V35_VOLUME_NARRATIVE_MISMATCH');
  assert.ok(flags[0].projected_km < 18);

  // Volume actually near the baseline raises nothing.
  const honest = understated.replace('1\t25 min', '1\t55 min').replace('1\t30 min', '1\t60 min');
  assert.deepEqual(collectVolumeNarrativeFlags(honest, TACTICAL), []);

  // No baseline documented: the gate does not apply.
  assert.deepEqual(collectVolumeNarrativeFlags(understated, { primary_goals: ['Improve 3 km'] }), []);
});

test('[S6] the gate throws a retriable error and passes a compliant program', () => {
  class Retriable extends Error { constructor(code, amendment, details) { super(amendment); this.code = code; this.details = details; } }
  const bad = program('The long run builds through the block.', [1, 2].map((w) =>
    block(w, [`Sat\tRun\tEasy\t1\t20 km\tN/A\t6\tLong run.\t`])));
  assert.throws(() => validateCoachingStandards(bad, {}, Retriable), (e) => e.code === 'V35_NARRATIVE_PROGRESSION_CLAIM_UNSUPPORTED');
  const clean = program('The long run is held at the tolerated dose.', [block(1, ['Sat\tRun\tEasy\t1\t20 km\tN/A\t6\tLong run.\t'])]);
  assert.equal(validateCoachingStandards(clean, {}, Retriable).ok, true);
});

test('[S7] Youth raises no coaching-standard flags: the gates stay silent when nothing is wrong', () => {
  const YG = { age: 13, primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'] };
  assert.deepEqual(collectCoachingStandardFlags(readLive('youth_gymnastics'), YG), []);
});

test('[S8] the gates reproduce the reviewer findings on the current live artifacts', () => {
  const AH = { primary_goals: ['220kg back squat', '4 One arm pullups'], secondary_goals: ['100kg overhead press', 'Marathon'] };
  const hybrid = collectCoachingStandardFlags(readLive('advanced_hybrid'), AH).map((f) => f.code);
  assert.ok(hybrid.includes('V35_NARRATIVE_PROGRESSION_CLAIM_UNSUPPORTED'), 'Hybrid summary claims the long run builds while it is held');

  const tactical = collectCoachingStandardFlags(readLive('tactical_3k'), TACTICAL);
  const codes = tactical.map((f) => f.code);
  assert.ok(codes.includes('V35_CONFLICTING_SYMPTOM_ALGORITHM'), 'Tactical states two symptom hierarchies');
  assert.ok(codes.includes('V35_SECONDARY_VOLUME_CREEP'), 'Tactical raises accessory volume in the Week 3 progression week');
  assert.ok(codes.includes('V35_VOLUME_NARRATIVE_MISMATCH'), 'Tactical claims the baseline while projecting well under it');
});
