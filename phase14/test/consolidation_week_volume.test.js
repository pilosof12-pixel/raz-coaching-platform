// A consolidation week cannot carry more work than the week it consolidates.
//
// Run #138's block says week 4 is "a true consolidation week: less non-essential
// volume, same movement standards". It shipped with Dip rising from 2x4 and 2x5
// in week 3 to 3x4 and 3x5 in week 4 -- direct pressing volume up fifty per cent
// in the week that was supposed to bring it down. The coach charged 0.20.
//
// Nothing wrote that increase. The support-volume trim works against a
// recoverable-volume ceiling with no view of the block, so the heavy build weeks
// were trimmed and the already-light final week was not, and the taper inverted
// underneath a repair doing its own job correctly. The invariant is stated after
// every repair that can change a set count.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairConsolidationWeekVolume } from '../engine/consolidation_week_volume.js';
import { validateRepairableProgramBundle } from '../engine/repairable_validation_bundle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DELIVERED = fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics.txt'), 'utf8');
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const wk = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const sets = (program, week, name) => {
  const b = program.match(new RegExp(`START_WEEK${week}_TSV([\\s\\S]*?)END_WEEK${week}_TSV`))[1];
  return b.split('\n').map((l) => l.split('\t'))
    .filter((c) => c.length === 9 && c[1] === name)
    .reduce((n, c) => n + Number(c[3]), 0);
};

const build = (w3Sets, w4Sets) => [1, 2, 3, 4].map((n) => wk(n, [
  'Mon\tWeighted Pull-up\t29 kg\t3\t3\t4 min\t8\tPrimary.\t',
  `Mon\tDip\tRPE-selected load\t${n === 4 ? w4Sets : w3Sets}\t4\t3 min\t8\tPressing.\t`,
  'Mon\tPistol Squat\tBodyweight\t3\t5\t2 min\t7\tLower.\t',
])).join('\n\n');

test('the final week is brought back to the week it consolidates', () => {
  const inverted = build(2, 3);
  assert.equal(sets(inverted, 3, 'Dip'), 2);
  assert.equal(sets(inverted, 4, 'Dip'), 3, 'fixture must start inverted');

  const { program, changed } = repairConsolidationWeekVolume(inverted, INTAKE);
  assert.equal(changed, true);
  assert.equal(sets(program, 4, 'Dip'), 2);
});

test('a final week already at or below the week before is left alone', () => {
  const fine = build(4, 3);
  assert.equal(repairConsolidationWeekVolume(fine, INTAKE).changed, false);
});

test('it only ever removes, and only from the last week', () => {
  const inverted = build(2, 3);
  const { program } = repairConsolidationWeekVolume(inverted, INTAKE);
  for (const w of [1, 2, 3]) {
    assert.equal(sets(program, w, 'Dip'), sets(inverted, w, 'Dip'), `week ${w} must not change`);
  }
  assert.ok(sets(program, 4, 'Dip') < sets(inverted, 4, 'Dip'));
});

test('a final week that is the event week is left to the competition rules', () => {
  const inFourWeeks = new Date(Date.now() + 27 * 86400000).toISOString().slice(0, 10);
  const racing = { ...INTAKE, competition_date: inFourWeeks, event_type: 'strength_meet' };
  assert.equal(repairConsolidationWeekVolume(build(2, 3), racing).changed, false);
});

test('it is idempotent', () => {
  const once = repairConsolidationWeekVolume(build(2, 3), INTAKE).program;
  assert.equal(repairConsolidationWeekVolume(once, INTAKE).changed, false);
});

test("run #138's Dip no longer rises in its own consolidation week", () => {
  const out = validateRepairableProgramBundle(DELIVERED, INTAKE);
  assert.equal(out.ok, true);
  assert.ok(sets(out.program, 4, 'Dip') <= sets(out.program, 3, 'Dip'),
    'week 4 carried more direct pressing than week 3');
});
