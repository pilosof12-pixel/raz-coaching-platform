import test from 'node:test';
import assert from 'node:assert/strict';

import { trimExcessSupportVolume } from '../engine/mrv_support_trim.js';
import { validateWeeklyVolumeBudgetSemantic } from '../engine/semantic_program_qa.js';
import { TACTICAL_3K_INTAKE, tactical3KGoldenProgram } from './fixtures/golden_programs.js';

function rewrite(program, exerciseName, sets) {
  return program.split('\n').map((line) => {
    if (!line.includes('\t')) return line;
    const cells = line.split('\t');
    if (cells[1] === exerciseName) cells[3] = String(sets);
    return cells.join('\t');
  }).join('\n');
}

function setsFor(program, exerciseName) {
  return program.split('\n')
    .filter((line) => line.includes(`\t${exerciseName}\t`))
    .map((line) => Number(line.split('\t')[3]));
}

test('gross non-goal GPP volume is trimmed deterministically before spending another AI repair attempt', () => {
  // MRV push reference is 20 sets and the hard gate is >135% of that reference.
  // Use 30 support sets so the fixture is intentionally and unambiguously over the
  // production ceiling instead of sitting inside the legal buffer.
  const bloated = rewrite(tactical3KGoldenProgram(), 'Push-up', 30);
  assert.throws(
    () => validateWeeklyVolumeBudgetSemantic(bloated, TACTICAL_3K_INTAKE),
    (err) => err?.code === 'WEEKLY_MRV_EXCEEDED',
  );

  const repaired = trimExcessSupportVolume(bloated, TACTICAL_3K_INTAKE);
  assert.equal(repaired.repaired, true);
  assert.ok(repaired.reductions.length > 0);
  assert.equal(Boolean(repaired.unresolved), false);
  assert.doesNotThrow(() => validateWeeklyVolumeBudgetSemantic(repaired.program, TACTICAL_3K_INTAKE));

  const pushSets = setsFor(repaired.program, 'Push-up');
  assert.ok(pushSets.length > 0);
  assert.ok(pushSets.every((sets) => sets >= 2 && sets < 30));
  assert.deepEqual(
    setsFor(repaired.program, 'Weighted Pull-up'),
    setsFor(bloated, 'Weighted Pull-up'),
    'direct pull-up goal work must be untouched while trimming unrelated GPP',
  );
});

test('MRV repair fails closed instead of cutting direct goal exposure to make the spreadsheet pass', () => {
  const bloated = rewrite(tactical3KGoldenProgram(), 'Weighted Pull-up', 30);
  assert.throws(
    () => validateWeeklyVolumeBudgetSemantic(bloated, TACTICAL_3K_INTAKE),
    (err) => err?.code === 'WEEKLY_MRV_EXCEEDED',
  );

  const repaired = trimExcessSupportVolume(bloated, TACTICAL_3K_INTAKE);
  assert.equal(Boolean(repaired.unresolved), true);
  assert.deepEqual(setsFor(repaired.program, 'Weighted Pull-up'), setsFor(bloated, 'Weighted Pull-up'));
});
