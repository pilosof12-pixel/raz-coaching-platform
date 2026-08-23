import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  collectPowerOutputFlags, collectIntervalPaceOriginFlags, collectSpecGapFlags,
  demonstratedIntervalPace, buildSpecGapBrief,
} from '../engine/v49_spec_gap_rules.js';
import { classifyFinding } from '../engine/v39_coaching_rubric.js';

// An offline audit mapped all seventeen frozen Coaching Specification v1.0 rules
// to the codes the engine emits. Fifteen were enforced. YG-06 and T3K-04 were in
// the specification, briefed to the model, and never checked -- a program could
// break either and pass every gate.

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const program = (weeks) => ['Overview.', ...weeks].join('\n\n');
const readFixture = (n) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', `${n}-program.txt`), 'utf8');

const TACTICAL = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  notes: 'Recent 400 m repeats are around 1:42-1:45 with adequate recovery for repeatability.',
  injuries: 'Previous shin-splint irritation.',
};
const YOUTH = { primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'] };

// --- T3K-04 ------------------------------------------------------------------

test('[S1] demonstrated capacity is read from what the athlete has actually run', () => {
  const d = demonstratedIntervalPace(TACTICAL);
  assert.equal(d.metres, 400);
  // The slower end of a stated range is the repeatable one.
  assert.equal(d.seconds, 105);
  assert.equal(Math.round(d.pace), 263);
  assert.equal(demonstratedIntervalPace({}), null);
});

test('[S2] prescribing goal pace before it is earned is flagged', () => {
  const atGoal = program([block(1, ['Wed\tRun\tN/A\t6\t400 m\t2 min\t8\tRepeats at 1:36 each.\t'])]);
  const flags = collectIntervalPaceOriginFlags(atGoal, TACTICAL);
  assert.equal(flags[0].rule, 'T3K-04');
  assert.equal(flags[0].prescribed_pace_s_per_km, 240);
  assert.equal(flags[0].demonstrated_pace_s_per_km, 263);
});

test('[S3] starting from demonstrated capacity raises nothing', () => {
  const atCapacity = program([block(1, ['Wed\tRun\tN/A\t6\t400 m\t2 min\t8\tRepeats at 1:45 each.\t'])]);
  assert.deepEqual(collectIntervalPaceOriginFlags(atCapacity, TACTICAL), []);
});

test('[S4] an athlete with no stated repeat capacity is not second-guessed', () => {
  const p = program([block(1, ['Wed\tRun\tN/A\t6\t400 m\t2 min\t8\tRepeats at 1:36 each.\t'])]);
  assert.deepEqual(collectIntervalPaceOriginFlags(p, { primary_goals: ['Improve 3 km from 13:30 to sub-12:00'] }), []);
});

// --- YG-06 -------------------------------------------------------------------

test('[S5] power volume rising with nothing said about output is a review signal', () => {
  const p = program([
    block(1, ['Session A\tBox Jump\tBodyweight\t3\t3\t2 min\t7\tLand softly.\t']),
    block(2, ['Session A\tBox Jump\tBodyweight\t4\t4\t2 min\t7\tLand softly.\t']),
  ]);
  const flags = collectPowerOutputFlags(p, YOUTH);
  assert.equal(flags[0].rule, 'YG-06');
  assert.equal(flags[0].previous_volume, 9);
  assert.equal(flags[0].current_volume, 16);
});

test('[S6] protected output earns the extra volume', () => {
  const p = program([
    block(1, ['Session A\tBox Jump\tBodyweight\t3\t3\t2 min\t7\tLand softly.\t']),
    block(2, ['Session A\tBox Jump\tBodyweight\t4\t4\t2 min\t7\tOnly add a rep if jump height is maintained; stop when height drops.\t']),
  ]);
  assert.deepEqual(collectPowerOutputFlags(p, YOUTH), []);
});

test('[S7] holding power volume raises nothing', () => {
  const p = program([
    block(1, ['Session A\tBox Jump\tBodyweight\t3\t3\t2 min\t7\tLand softly.\t']),
    block(2, ['Session A\tBox Jump\tBodyweight\t3\t3\t2 min\t7\tLand softly.\t']),
  ]);
  assert.deepEqual(collectPowerOutputFlags(p, YOUTH), []);
});

// --- calibration against the programs a coach has actually reviewed ----------

test('[S8] neither rule fires on any coach-reviewed program', () => {
  const cases = [
    ['tactical_3k', TACTICAL],
    ['youth_gymnastics', YOUTH],
    ['advanced_hybrid', { primary_goals: ['220kg back squat', '4 One arm pullups'] }],
  ];
  for (const [id, intake] of cases) {
    assert.deepEqual(collectSpecGapFlags(readFixture(id), intake), [], `${id} must stay clean`);
  }
});

test('[S9] both are review signals, as the specification classifies them', () => {
  assert.equal(classifyFinding('COACH_SPEC_V1_YG_POWER_VOLUME_BEFORE_OUTPUT').classification, 'soft');
  assert.equal(classifyFinding('COACH_SPEC_V1_T3K_PACE_FROM_GOAL_NOT_CAPACITY').classification, 'soft');
});

test('[S10] the brief carries the athlete\'s own numbers, not a generic rule', () => {
  const brief = buildSpecGapBrief(TACTICAL);
  assert.match(brief, /263 s\/km/);
  assert.match(brief, /240 s\/km/);
  assert.match(buildSpecGapBrief(YOUTH), /POWER PROGRESSES THROUGH OUTPUT/);
  assert.equal(buildSpecGapBrief({ primary_goals: ['general fitness'] }), '');
});
