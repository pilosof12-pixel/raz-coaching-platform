// TSV_ROW_COLUMN_COUNT_MISMATCH is a blocking gate the ledger carried with
// repairs: [] and killedLive: "2026-09-12 mma_fight_camp". In run #156 it killed
// the youth gymnast as well: four paid attempts raising the same flag until the
// token budget ran out, over rows with the wrong number of tabs. Nothing about
// the coaching was wrong.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { collectTsvRowShapeFlags, repairTsvRowShape } from '../engine/tsv_row_shape_repair.js';
import { allWeekTsvShapeFlags } from '../engine/phase15_final_qa.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const GOOD = 'Mon\tBack Squat\t100 kg\t3\t5\t2 min\t7\tKeep it crisp.\t';
const TABBED = 'Mon\tFront Squat\t90 kg\t3\t5\t2 min\t7\tKeep it crisp.\tThen\tstop.\t';
const SHORT = 'Mon\tChin-up\tBodyweight\t3\t6\t90s\t7\tClean reps.';
const build = (rows) => [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, H, ...rows, `END_WEEK${w}_TSV`].join('\n')).join('\n\n');

const cellsOf = (program, week) => program
  .match(new RegExp(`START_WEEK${week}_TSV\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`))[1]
  .split('\n').slice(1).map((l) => l.split('\t'));

test('a tab typed inside the notes is folded back, not spread across columns', () => {
  const out = repairTsvRowShape(build([GOOD, TABBED, SHORT]));
  assert.equal(out.repaired, true);
  const rows = cellsOf(out.program, 1);
  for (const row of rows) assert.equal(row.length, 9);
  // The surplus belonged to the prose, and the prose keeps it -- with the tabs
  // turned into spaces rather than deleted.
  assert.equal(rows[1][7], 'Keep it crisp. Then stop.');
  // Nothing positional moved: the dose and the movement are where they were.
  assert.equal(rows[1][1], 'Front Squat');
  assert.equal(rows[1][2], '90 kg');
  assert.equal(rows[1][3], '3');
  assert.equal(rows[1][8], '');
});

test('a short row gains the trailing column the contract says is empty', () => {
  const rows = cellsOf(repairTsvRowShape(build([SHORT])).program, 1);
  assert.equal(rows[0].length, 9);
  assert.equal(rows[0][7], 'Clean reps.');
  assert.equal(rows[0][8], '');
});

test('a well-formed program is left exactly alone', () => {
  const clean = build([GOOD]);
  const out = repairTsvRowShape(clean);
  assert.equal(out.repaired, false);
  assert.equal(out.program, clean);
  assert.deepEqual(collectTsvRowShapeFlags(clean), []);
});

test('it clears the gate that was killing builds, and converges', () => {
  const broken = build([GOOD, TABBED, SHORT]);
  assert.ok(allWeekTsvShapeFlags(broken).some((f) => f.code === 'TSV_ROW_COLUMN_COUNT_MISMATCH'));
  const once = repairTsvRowShape(broken);
  assert.deepEqual(allWeekTsvShapeFlags(once.program).filter((f) => f.code === 'TSV_ROW_COLUMN_COUNT_MISMATCH'), []);
  const twice = repairTsvRowShape(once.program);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('the header is never rewritten -- a broken header is a different failure', () => {
  const badHeader = [1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, 'Day\tExercise\tWeight', GOOD, `END_WEEK${w}_TSV`].join('\n')).join('\n\n');
  const out = repairTsvRowShape(badHeader);
  assert.ok(out.program.includes('Day\tExercise\tWeight\n'), 'the header must survive untouched');
  // A short header is a schema problem, and this repair deliberately does not
  // guess a schema -- it only puts tabs back where the schema says they go.
  //
  // The code for that case is named here on purpose: the gate-repair ledger
  // counts a code as answered when a test names it, so asserting it by string
  // would mark real unpaid debt as covered on the strength of a test that only
  // watches it fire. The behaviour is checked instead.
  assert.equal(out.repaired, false, 'nothing to repair: the body row is already well formed');
  const stillFlagged = allWeekTsvShapeFlags(out.program).map((f) => String(f.message || ''));
  assert.ok(stillFlagged.some((m) => /nine required columns/i.test(m)), 'the header failure must survive for the gate to raise');
});

test('the production chain applies it before anything reads rows by position', () => {
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  const repairAt = bundle.indexOf('repairTsvRowShape(candidate)');
  assert.ok(repairAt > 0, 'not wired into the chain');
  // Every later repair reads cells by index, so a stray tab would be misread by
  // all of them if this ran after.
  for (const later of ['repairPhase15Program(candidate)', 'normalizePrimaryVolumeProgression(candidate, intake)']) {
    const laterAt = bundle.indexOf(later);
    assert.ok(laterAt > repairAt, `${later} must run after the shape repair`);
  }
});
