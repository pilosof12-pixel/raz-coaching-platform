import test from 'node:test';
import assert from 'node:assert/strict';
import { collectProgressionLanguageFlags } from '../engine/v34_prescription_consistency.js';
import { repairSafeObjectiveLanguage } from '../engine/quality_preserving_fast_repairs.js';

function block(week, note, load='120 kg', sets='3', reps='5') {
  return [
    `START_WEEK${week}_TSV`,
    'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
    `Mon\tBack Squat\t${load}\t${sets}\t${reps}\t3 min\t7\t${note}\t`,
    `END_WEEK${week}_TSV`,
  ].join('\n');
}

test('repairs a false note-only reduction claim without changing prescription', () => {
  const program = [
    block(1, 'Controlled baseline dose.'),
    block(2, 'Reduce volume while preserving clean technique.'),
    block(3, 'Controlled baseline dose.'),
    block(4, 'Controlled baseline dose.'),
  ].join('\n\n');

  const flags = collectProgressionLanguageFlags(program);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V34_PROGRESSION_LANGUAGE_MISMATCH');

  const repaired = repairSafeObjectiveLanguage(program, flags);
  assert.equal(repaired.changed, true);
  assert.equal(repaired.changed_rows, 1);
  assert.match(repaired.program, /Back Squat\t120 kg\t3\t5\t3 min\t7\tuse the listed volume while preserving clean technique\./i);
  assert.equal(collectProgressionLanguageFlags(repaired.program).length, 0);
});

test('does not touch structured fields when the false claim lives outside Notes', () => {
  const program = [
    block(1, 'Controlled baseline dose.'),
    block(2, 'Controlled technique.', 'Reduce volume'),
    block(3, 'Controlled baseline dose.'),
    block(4, 'Controlled baseline dose.'),
  ].join('\n\n');

  const flags = collectProgressionLanguageFlags(program);
  assert.equal(flags.length, 1);
  const repaired = repairSafeObjectiveLanguage(program, flags);
  assert.equal(repaired.changed, false);
  assert.equal(repaired.program, program);
});
