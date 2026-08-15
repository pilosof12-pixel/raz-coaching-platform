import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchDictionary,
  matchComposedExercise,
  validateExercisesAgainstDictionary,
  RetriableValidationError,
} from '../engine/exercise_dictionary.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function program(exercise) {
  return ['START_WEEK1_TSV', HEADER, `Mon\t${exercise}\tBW\t3\t5\t90s\tRIR 2\t\t`, 'END_WEEK1_TSV'].join('\n');
}

const legitimate = [
  'Controlled Handstand Kick-up',
  'Bar Muscle-up Transition Drill',
  'Belt Split Squat',
  'Belt Squat Reverse Lunge',
  'Tempo Belt Squat Split Squat',
  'Box-Assisted Iron Cross Eccentric',
  'Band-Assisted Iron Cross Hold',
  'Partner-Assisted Maltese Isometric',
  'Band-Assisted Bar Muscle-up Transition Drill',
  'Paused Pull-up',
  'Tempo Bulgarian Split Squat',
];

for (const exercise of legitimate) {
  test(`controlled composition accepts legitimate drill: ${exercise}`, () => {
    const result = validateExercisesAgainstDictionary(program(exercise), {});
    assert.equal(result.ok, true);
    assert.notEqual(matchDictionary(exercise).status, 'miss');
  });
}

test('composed variants retain deterministic equipment metadata', () => {
  assert.deepEqual(matchComposedExercise('Belt Squat Split Squat')?.requirements, ['machine']);
  assert.deepEqual(matchComposedExercise('Band-Assisted Iron Cross Eccentric')?.requirements, ['rings', 'bands']);
  assert.deepEqual(matchComposedExercise('Band-Assisted Bar Muscle-up Transition Drill')?.requirements, ['pull_up_bar', 'bands']);
});

test('composition grammar does not turn arbitrary exercise-sounding strings into valid movements', () => {
  const fabricated = [
    'Cable Belt Squat Iron Cross Curl',
    'TRX Tuck Human Flag',
    'Box-Assisted Barbell Human Flag Press',
    'Band-Assisted Sprint Isometric',
    'Tempo Cable Muscle-up Lunge',
  ];
  for (const exercise of fabricated) {
    assert.equal(matchDictionary(exercise).status, 'miss', exercise);
    assert.throws(
      () => validateExercisesAgainstDictionary(program(exercise), {}),
      (err) => err instanceof RetriableValidationError && err.code === 'EXERCISE_HALLUCINATION',
      exercise,
    );
  }
});
