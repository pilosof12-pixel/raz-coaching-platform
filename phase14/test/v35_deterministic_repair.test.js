import test from 'node:test';
import assert from 'node:assert/strict';

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { collectAllV34ConsistencyFlags } from '../engine/v34_prescription_consistency.js';
import { collectCoachingStandardFlags } from '../engine/v35_coaching_standards.js';

// The live v35 run exhausted four repair attempts on a single code:
//   A1 -> A2 -> A3 -> A4 : V34_PROGRESSION_LANGUAGE_MISMATCH
// The model could not tell which of two disagreeing statements was authoritative.
// It never needed to: the structured prescription wins and the note is restated.
const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const program = (head, weeks) => `${head}\n\n${weeks.join('\n\n')}`;
const YOUTH = { age: 13, primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'] };
const TACTICAL = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve strict pull-ups from 14 toward 18-20'],
  notes: 'about 18-20 km/week', injuries: 'Previous shin-splint irritation.',
};
const allFlags = (p, i) => [...collectAllV34ConsistencyFlags(p, i), ...collectCoachingStandardFlags(p, i)];

test('[D1] the exact Youth loop-exhausting shape converges in a single pass', () => {
  const youth = program('Skill work leads every session.', [
    block(3, [
      'Session A\tBar Muscle-up Transition Drill\tLight band\t3\t2\t90 sec\t6\tSame band if doubles stay crisp; otherwise stay at 4 clean sets.\t',
      'Session A\tExplosive Hip-to-Bar Pull-up\tBodyweight\t4\t2\t2 min\t6\tPull fast and high.\t',
    ]),
    block(4, [
      'Session A\tBar Muscle-up Transition Drill\tLight band\t3\t2\t90 sec\t6\tKeep the Week 3 standard with slightly less total work.\t',
      'Session A\tExplosive Hip-to-Bar Pull-up\tBodyweight\t4\t2\t2 min\t6\tMatch Week 3 output; fewer total reps.\t',
    ]),
  ]);
  assert.ok(allFlags(youth, YOUTH).some((f) => f.code === 'V34_PROGRESSION_LANGUAGE_MISMATCH'));
  const repaired = repairDeterministicContradictions(youth, YOUTH);
  assert.deepEqual(allFlags(repaired.program, YOUTH), [], 'one pass must clear every flag');
  // The prescription is untouched: only the derived text moved.
  assert.match(repaired.program, /Bar Muscle-up Transition Drill\tLight band\t3\t2\t/);
  assert.match(repaired.program, /Explosive Hip-to-Bar Pull-up\tBodyweight\t4\t2\t/);
  assert.doesNotMatch(repaired.program, /less total work|fewer total reps/);
});

test('[D2] repair is idempotent and leaves a compliant program byte-identical', () => {
  const clean = program('The long run is held at the tolerated dose.', [
    block(1, ['Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tTop triple; stop early if bar speed falls.\t']),
    block(2, ['Mon\tBack Squat\t172.5 kg\t3\t3\t3 min\t8\tSmall load step if Week 1 was clean.\t']),
  ]);
  const once = repairDeterministicContradictions(clean, {});
  assert.equal(once.repaired, false);
  assert.equal(once.program, clean);
  const messy = program('Overview.', [
    block(1, ['Session A\tKick-up\tBodyweight\t4\t2\t60 sec\tN/A\tThree quality attempts per set.\t']),
  ]);
  const first = repairDeterministicContradictions(messy, {});
  const second = repairDeterministicContradictions(first.program, {});
  assert.equal(second.program, first.program);
  assert.equal(second.repaired, false);
});

test('[D3] a genuine reduction keeps its wording; only false claims are restated', () => {
  const real = program('Overview.', [
    block(3, ['Session A\tTransition Drill\tBand\t4\t2\t90 sec\t6\tBuild.\t']),
    block(4, ['Session A\tTransition Drill\tBand\t2\t2\t90 sec\t6\tKeep the standard with less total work.\t']),
  ]);
  const out = repairDeterministicContradictions(real, {});
  assert.match(out.program, /with less total work/, 'a true reduction claim must survive untouched');
});

test('[D4] a load claim is restated to the load actually prescribed', () => {
  const p = program('Overview.', [
    block(3, ['Sun\tOverhead Press\t67.5 kg\t4\t4\t2-3 min\t7.5\tHold the build-week dose.\t']),
    block(4, ['Sun\tOverhead Press\t70 kg\t4\t4\t2-3 min\t7.5\tRepeat this load only if Week 3 stayed inside the cap.\t']),
  ]);
  const out = repairDeterministicContradictions(p, {});
  assert.match(out.program, /Take 70 kg only if Week 3 stayed inside the cap/);
  assert.deepEqual(collectAllV34ConsistencyFlags(out.program, {}), []);
  assert.match(out.program, /Overhead Press\t70 kg\t4\t4\t/, 'the prescription itself is never rewritten');
});

test('[D5] a warm-up ramp is regenerated from the work load and duplicates are dropped', () => {
  const p = block(1, [
    'Mon\t[WARMUP] Weighted Pull-up\tN/A\t1\t8 min\tN/A\t3\tRamp Weighted Pull-up: +10 kg x 5, +20 kg x 3, +27.5 kg x 1-2 before +30 kg work sets.\t',
    'Mon\tWeighted Pull-up\t+22.5 kg\t3\t4\t3 min\t7\tSubmaximal support.\t',
  ]);
  const out = repairDeterministicContradictions(p, {});
  assert.deepEqual(collectAllV34ConsistencyFlags(out.program, {}), []);
  assert.match(out.program, /before \+?22\.5 kg work sets\./);
  assert.doesNotMatch(out.program, /before \+?30 kg work sets\./);
});

test('[D6] accessory volume is held when the primary quality advances, never raised', () => {
  const p = program('Overview.', [
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
  const out = repairDeterministicContradictions(p, TACTICAL);
  assert.match(out.program, /Fri\tPull-up\tBodyweight\t4\t8\t/, 'pull-up held at the Week 2 set count');
  assert.match(out.program, /Fri\tReverse Lunge\tRPE-selected\t2\t8 per leg\t/, 'lunge held at the Week 2 set count');
  // The primary quality progression is never touched.
  assert.match(out.program, /Tue\tRun\t2:34 per 600 m\t4\t600 m\t/);
  assert.deepEqual(collectCoachingStandardFlags(out.program, TACTICAL).filter((f) => f.code === 'V35_SECONDARY_VOLUME_CREEP'), []);
});

test('[D7] a false narrative build claim is restated and a competing symptom rule is dropped', () => {
  const p = program(
    'The long run builds through the block. If shin irritation returns, first reduce the most recently increased impact stressor. If shin symptoms return, cut easy-run duration first.',
    [1, 2, 3].map((w) => block(w, [`Sat\tRun\tEasy\t1\t20 km\tN/A\t6\tLong run.\t`])));
  const out = repairDeterministicContradictions(p, TACTICAL);
  assert.doesNotMatch(out.program, /long run builds/i);
  assert.match(out.program, /is held at the tolerated dose/);
  assert.doesNotMatch(out.program, /cut easy-run duration first/i);
  assert.match(out.program, /most recently increased impact stressor/, 'the source-linked hierarchy survives');
  assert.deepEqual(collectCoachingStandardFlags(out.program, TACTICAL), []);
});

test('[D8] structural problems are deliberately left for the gates, not silently invented away', () => {
  // An undefined load reference cannot be resolved without inventing a number.
  const p = block(1, ['Fri\tChin-up\tRPE-selected load\t3\t4\t2 min\t7\tOtherwise hold +50 kg.\t']);
  const out = repairDeterministicContradictions(p, {});
  const remaining = collectAllV34ConsistencyFlags(out.program, {}).map((f) => f.code);
  assert.ok(remaining.includes('V34_NOTE_UNDEFINED_LOAD_REFERENCE'), 'this must still reach the gate');
});
