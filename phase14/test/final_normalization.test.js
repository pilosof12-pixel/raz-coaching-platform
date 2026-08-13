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

test('controlled Weighted descriptor resolves to an existing canonical base movement', () => {
  const core = coreExerciseName('Weighted Glute Bridge');
  const m = matchDictionary(core);
  assert.equal(m.status, 'alias');
  assert.equal(m.canonical, 'Glute Bridge');
});

test('event-distance prefix is not treated as a new exercise identity', () => {
  assert.equal(coreExerciseName('5 km Run'), 'Run');
  assert.equal(coreExerciseName('3K Run'), 'Run');
  assert.equal(coreExerciseName('800 m Run'), 'Run');
  assert.equal(matchDictionary(coreExerciseName('5 km Run')).status, 'hit');
});

test('cool-down purpose prefix is removed before canonical run lookup', () => {
  const core = coreExerciseName('[COOL-DOWN] Easy Jog/Walk');
  assert.equal(core, 'Jog/Walk');
  const m = matchDictionary(core);
  assert.equal(m.status, 'alias');
  assert.equal(m.canonical, 'Run');
});

test('run warm-up and cool-down suffixes resolve to canonical Run', () => {
  for (const label of ['Run Cool-down','Run Cooldown','Run Warm-up','Run Warmup']) {
    const m=matchDictionary(coreExerciseName(label));
    assert.equal(m.status,'alias',label);
    assert.equal(m.canonical,'Run',label);
  }
});

test('hard-substitute canonicalizes known aliases before marking true hallucinations for review', () => {
  const program = [
    'START_WEEK1_TSV',
    'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
    'Mon\tDumbbell Reverse Lunge\tRPE-selected\t3\t8\t90 sec\t7\twork\t',
    'Mon\tWeighted Glute Bridge\t+20 kg\t3\t10\t90 sec\t8\twork\t',
    'Sat\t5 km Run\tN/A\t1\t35 min\tN/A\tN/A\tevent-specific running\t',
    'Sat\tRun Cool-down\tN/A\t1\t5 min\tN/A\tN/A\tEasy jog/walk\t',
    'Mon\tImaginary Dragon Squat\tBodyweight\t3\t8\t90 sec\t7\twork\t',
    'END_WEEK1_TSV',
  ].join('\n');
  const out = hardSubstitute('EXERCISE_HALLUCINATION', program, { language: 'en' });
  assert.match(out, /\tReverse Lunge\t/);
  assert.match(out, /\tGlute Bridge\t\+20 kg\t/);
  assert.match(out, /\t5 km Run\tN\/A\t/);
  assert.match(out, /\tRun\tN\/A\t1\t5 min/);
  assert.doesNotMatch(out, /\[REVIEW\] (?:Dumbbell Reverse Lunge|Weighted Glute Bridge|5 km Run|Run Cool-down)/);
  assert.match(out, /\[REVIEW\] Imaginary Dragon Squat/);
});

test('server owns formula marker metadata and strips model-provided markers first', () => {
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(src, /SERVER-AUTHORITATIVE-FORMULA-MARKER/);
  assert.match(src, /QA_FORMULA_VIOLATION_COUNT/);
});

test('compact runtime prompt preserves explicitly stated current direct endurance frequency', () => {
  const src = fs.readFileSync(new URL('../scripts/build_phase15_runtime.mjs', import.meta.url), 'utf8');
  assert.match(src, /CURRENT-DIRECT-MODALITY-FREQUENCY/);
  assert.match(src, /do not silently reduce that direct modality frequency/i);
});
