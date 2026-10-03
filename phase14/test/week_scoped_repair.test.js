import test from 'node:test';
import assert from 'node:assert/strict';

import { weeksImplicatedBy, scopeRepairPrompt, spliceWeekBlocks } from '../engine/week_scoped_repair.js';

test('the weeks every failing rule names', () => {
  assert.deepEqual(weeksImplicatedBy([{ code: 'A', details: { week: 4 } }, { code: 'B', details: { flags: [{ week: 4 }, { week: 3 }] } }]), [3, 4]);
  assert.deepEqual(weeksImplicatedBy([{ code: 'TARGET_MODALITY_EXPOSURE_REDUCED', message: 'Week 4: running is a named primary performance goal.' }]), [4]);
});

test('a rule that names no week, or all four, means a full repair', () => {
  assert.equal(weeksImplicatedBy([{ code: 'A', details: { week: 2 } }, { code: 'PROGRESSION_ARCHITECTURE_MISSING', message: 'The block does not progress.' }]), null);
  assert.equal(weeksImplicatedBy([1, 2, 3, 4].map((week) => ({ code: 'X', details: { week } }))), null);
  assert.equal(weeksImplicatedBy([]), null);
});

test('the prompt asks for those weeks only', () => {
  const full = 'Repair it.\nReturn the COMPLETE corrected client program with all four START_WEEKn_TSV / END_WEEKn_TSV blocks. Return no repair commentary outside the normal client-facing deliverable.\nCANDIDATE';
  const scoped = scopeRepairPrompt(full, [4]);
  assert.doesNotMatch(scoped, /COMPLETE corrected client program/);
  assert.match(scoped, /Return ONLY the corrected START_WEEK4_TSV \.\.\. END_WEEK4_TSV block,/);
  assert.match(scoped, /CANDIDATE$/);
});

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const program = (tag) => `Intro.\n\n${[1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${header}\nMon\tRun\t${tag}${w}\t1\t5 km\tN/A\t4\tEasy.\t\nEND_WEEK${w}_TSV`).join('\n\n')}`;

test('returned weeks are spliced in and everything else is kept', () => {
  const reply = `Here is week 4.\nSTART_WEEK4_TSV\n${header}\nWed\tRun\tnew\t1\t6 km\tN/A\t4\tFixed.\t\nEND_WEEK4_TSV`;
  const out = spliceWeekBlocks(program('old'), reply, [4]);
  assert.match(out, /^Intro\./);
  assert.match(out, /old1[\s\S]*old2[\s\S]*old3/);
  assert.match(out, /START_WEEK4_TSV\n[^\n]+\nWed\tRun\tnew/);
  assert.doesNotMatch(out, /old4/);
  assert.doesNotMatch(out, /Here is week 4/);
});

test('a reply missing a requested week is not spliced', () => {
  assert.equal(spliceWeekBlocks(program('old'), 'no blocks here', [4]), null);
  const onlyThree = `START_WEEK3_TSV\n${header}\nMon\tRun\tx\t1\t5 km\tN/A\t4\tx\t\nEND_WEEK3_TSV`;
  assert.equal(spliceWeekBlocks(program('old'), onlyThree, [3, 4]), null);
});

test('a $ in the returned week is copied literally', () => {
  const reply = `START_WEEK2_TSV\n${header}\nMon\tRun\t$1 pace\t1\t5 km\tN/A\t4\tx\t\nEND_WEEK2_TSV`;
  assert.match(spliceWeekBlocks(program('old'), reply, [2]), /\$1 pace/);
});

import fs from 'node:fs';
const runtime = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');

test('the built runtime asks for the failing weeks and splices them back', () => {
  assert.match(runtime, /scopeRepairPrompt\(buildInternalQualityRepairPrompt\(intake, repairCandidate, cumulativeRepairFeedback\), scopedWeeks\)/);
  assert.match(runtime, /const spliced = spliceWeekBlocks\(repairCandidate, raw, scopedWeeks\);/);
  // The splice happens before the structural check and the full quality chain,
  // so a spliced program is judged exactly like any other candidate.
  const splice = runtime.indexOf('const spliced = spliceWeekBlocks');
  const structural = runtime.indexOf('if (!isValidProgram(raw)) {', splice);
  const chain = runtime.indexOf('const finished = runQualityChain(program);', splice);
  assert.ok(splice > 0 && structural > splice && chain > structural);
  // A reply that cannot be placed falls back to a full repair.
  assert.match(runtime, /qaTrace\.push\("S" \+ attempt \+ ":splice-failed"\);\s*repairWeeks = null;/);
  assert.match(runtime, /repairWeeks = repairCandidate \? weeksImplicatedBy\(err\?\.flags\) : null;/);
});
