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
