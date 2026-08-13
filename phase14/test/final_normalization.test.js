import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  coreExerciseName,
  matchDictionary,
  hardSubstitute,
} from '../engine/exercise_dictionary.js';

test('Dumbbell Reverse Lunge resolves to the canonical closed-set exercise', () => {
  const core = coreExerciseName('Dumbbell Reverse Lunge');
  const m = matchDictionary(core);
  assert.equal(m.status, 'alias');
  assert.equal(m.canonical, 'Reverse Lunge');
});

test('cool-down purpose prefix is removed before canonical run lookup', () => {
  const core = coreExerciseName('[COOL-DOWN] Easy Jog/Walk');
  assert.equal(core, 'Jog/Walk');
  const m = matchDictionary(core);
  assert.equal(m.status, 'alias');
  assert.equal(m.canonical, 'Run');
});

test('hard-substitute canonicalizes known aliases before marking true hallucinations for review', () => {
  const program = [
    'START_WEEK1_TSV',
    'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
    'Mon\tDumbbell Reverse Lunge\tRPE-selected\t3\t8\t90 sec\t7\twork\t',
    'Mon\tImaginary Dragon Squat\tBodyweight\t3\t8\t90 sec\t7\twork\t',
    'END_WEEK1_TSV',
  ].join('\n');
  const out = hardSubstitute('EXERCISE_HALLUCINATION', program, { language: 'en' });
  assert.match(out, /\tReverse Lunge\t/);
  assert.doesNotMatch(out, /\[REVIEW\] Dumbbell Reverse Lunge/);
  assert.match(out, /\[REVIEW\] Imaginary Dragon Squat/);
});

test('server owns formula marker metadata and strips model-provided markers first', () => {
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(src, /SERVER-AUTHORITATIVE-FORMULA-MARKER/);
  assert.match(src, /QA_FORMULA_VIOLATION_COUNT/);
});
