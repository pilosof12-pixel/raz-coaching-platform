import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWeekTsvShape } from '../engine/tsv_shape.js';
import { allWeekTsvShapeFlags } from '../engine/phase15_final_qa.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const full = (d, n, note = 'Steady effort.') => [d, n, '100 kg', '3', '5', '2 min', '7', note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

test('a correctly shaped program comes back untouched', () => {
  const p = [1, 2, 3, 4].map((n) => wk(n, [full('Tue', 'Back Squat'), full('Fri', 'Bench Press')])).join('\n\n');
  const r = normalizeWeekTsvShape(p);
  assert.equal(r.repaired, false);
  assert.equal(r.program, p);
});

test('a row missing its trailing column is padded, not rewritten', () => {
  const short = 'Tue\tBack Squat\t100 kg\t3\t5\t2 min\t7\tSteady effort.';
  const r = normalizeWeekTsvShape(wk(1, [short]));
  assert.equal(r.repaired, true);
  assert.equal(r.rows, 1);
  const line = r.program.split('\n').find((l) => l.startsWith('Tue\t'));
  assert.equal(line.split('\t').length, 9);
  assert.equal(line.split('\t')[7], 'Steady effort.', 'the note is where it was');
});

test('a stray tab inside the note folds back into the note', () => {
  const long = 'Fri\tBench Press\t80 kg\t3\t5\t2 min\t7\tKeep it tight\tand square\t';
  const r = normalizeWeekTsvShape(wk(1, [long]));
  const cells = r.program.split('\n').find((l) => l.startsWith('Fri\t')).split('\t');
  assert.equal(cells.length, 9);
  assert.equal(cells[1], 'Bench Press', 'the structured fields keep their meaning');
  assert.equal(cells[3], '3');
  assert.equal(cells[7], 'Keep it tight and square');
});

test('a line of prose inside the table is removed rather than made into a day', () => {
  const r = normalizeWeekTsvShape(wk(1, [full('Tue', 'Back Squat'), 'This week is about sharpening.']));
  assert.ok(!/sharpening/.test(r.program), 'prose is not padded into a phantom row');
  assert.match(r.program, /Back Squat/);
});

test('the header is never rewritten here', () => {
  const badHeader = `START_WEEK1_TSV\nDay\tExercise\tWeight\n${full('Tue', 'Back Squat')}\nEND_WEEK1_TSV`;
  const r = normalizeWeekTsvShape(badHeader);
  assert.match(r.program, /\nDay\tExercise\tWeight\n/, 'a wrong header is a different defect');
});

test('the repair is idempotent', () => {
  const p = wk(1, ['Tue\tBack Squat\t100 kg\t3\t5\t2 min\t7\tNote', 'Fri\tRow\t60\t3\t8\t2 min\t7\ta\tb\t']);
  const once = normalizeWeekTsvShape(p).program;
  assert.equal(normalizeWeekTsvShape(once).program, once);
  assert.equal(normalizeWeekTsvShape(once).repaired, false);
});

// The failure this exists to prevent: forty-six column-count flags in one
// fight camp week, thrown by final QA with no repair behind them, which ended
// the build and charged the customer for nothing.
test('the bundle clears the shape flags that used to end a build', () => {
  const intake = {
    age: 30, language: 'en', experience: 'advanced', days_per_week: 2,
    available_gym_days: ['Tue', 'Fri'], training_location: 'commercial_gym',
    equipment: 'Full commercial gym.', primary_goals: ['Get stronger'],
    current_numbers: 'Back Squat: 150 kg x 1', qa_diagnostics: true,
  };
  const short = (d, n) => `${d}\t${n}\t100 kg\t3\t5\t2 min\t7\tWork at a steady effort.`;
  const program = [1, 2, 3, 4]
    .map((n) => wk(n, [short('Tue', 'Back Squat'), short('Fri', 'Bench Press')])).join('\n\n');

  assert.ok(allWeekTsvShapeFlags(program).length >= 8, 'the fixture is malformed to begin with');
  const res = collectRepairableValidationFailures(program, intake, {});
  assert.equal(allWeekTsvShapeFlags(res.program).length, 0, 'the bundle must hand on a readable table');
  assert.ok(!res.flags.some((f) => f.code === 'TSV_ROW_COLUMN_COUNT_MISMATCH'));
});
