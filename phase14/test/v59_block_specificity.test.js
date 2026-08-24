import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { repairBlockSpecificityClaim } from '../engine/v59_block_specificity_repair.js';
import { validateCoachingStandards } from '../engine/v35_coaching_standards.js';

const INTAKE = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  performance_markers: ['3 km: 13:30'],
  current_numbers: ['3 km: 13:30'],
};

// A block whose fastest quality rep is materially slower than goal demand.
const BODY = [
  'START_WEEK1_TSV',
  'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
  'Tue\tRun\t1:43-1:45 per 400 m\t5\t400 m\t2:00\t8\tIntervals.\t',
  'END_WEEK1_TSV',
].join('\n');

const build = (narrative) => `${narrative}\n${BODY}`;
const count = (program) => {
  const res = validateCoachingStandards(program, INTAKE);
  const list = Array.isArray(res) ? res : (res && res.flags) || [];
  return list.filter((f) => f.code === 'V35_BLOCK_SPECIFICITY_OVERSTATED').length;
};

// The rule must still do its job. This is the overstatement it exists for.
test('a genuine race-specific claim is still flagged', () => {
  assert.equal(count(build('This is a race-specific block for the event.')), 1);
});

test('a bare goal claim with no framing is still flagged', () => {
  assert.equal(count(build('This block delivers sub-12:00.')), 1);
});

// The rule used to reject the remedy its own message prescribes, which is what
// cost a live Tactical build all four attempts: the model was told to describe
// the block as developmental, did exactly that, and was rejected each time.
test('the remedy the rule prescribes is accepted by the rule', () => {
  assert.equal(count(build('This is a developmental block toward sub-12:00, not a race-specific block.')), 0);
});

test('naming the goal honestly is not overstating it', () => {
  assert.equal(count(build('This block moves you toward sub-12:00 over 3 km.')), 0);
  assert.equal(count(build('A transition block, building toward the 3 km standard.')), 0);
});

test('the repair clears every shape and is idempotent', () => {
  for (const narrative of [
    'This is a race-specific block for the event.',
    'This block delivers sub-12:00.',
    'This is a race-specific block delivering sub-12:00.',
  ]) {
    const program = build(narrative);
    assert.equal(count(program), 1, `expected a finding for: ${narrative}`);
    const fixed = repairBlockSpecificityClaim(program, INTAKE);
    assert.equal(count(fixed), 0, `expected convergence for: ${narrative}`);
    assert.equal(repairBlockSpecificityClaim(fixed, INTAKE), fixed);
  }
});

// The framing text must not contain the phrase the detector reads for, or the
// repair re-triggers the rule it just cleared.
test('the framing text does not re-trigger the detector', () => {
  const fixed = repairBlockSpecificityClaim(build('This block delivers sub-12:00.'), INTAKE);
  assert.equal(/race[- ]specific|event[- ]specific/i.test(fixed.split('START_WEEK1_TSV')[0]), false);
});

test('a program with no finding is returned byte-identical', () => {
  const clean = build('A developmental block building toward the 3 km standard.');
  assert.equal(repairBlockSpecificityClaim(clean, INTAKE), clean);
});

// The prescription is never touched: this repair only names the block.
test('the repair changes no prescribed row', () => {
  const program = build('This is a race-specific block.');
  const fixed = repairBlockSpecificityClaim(program, INTAKE);
  assert.equal(fixed.slice(fixed.indexOf('START_WEEK1_TSV')), BODY);
});

test('the live run #76 Tactical program is untouched', () => {
  const p = path.join(process.cwd(), '..', 'docs/qa/live-three-avatar/latest/tactical_3k-program.txt');
  if (!fs.existsSync(p)) return;
  const program = fs.readFileSync(p, 'utf8');
  assert.equal(repairBlockSpecificityClaim(program, INTAKE), program);
});
