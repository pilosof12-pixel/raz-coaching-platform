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
  'Strict Pull-up',
  'Strict Chin-up',
  'Strict Ring Dip',
  'Strict Push-up',
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
  assert.deepEqual(matchComposedExercise('Strict Pull-up')?.requirements, ['pull_up_bar']);
  assert.deepEqual(matchComposedExercise('Strict Ring Dip')?.requirements, ['rings']);
});

test('endurance execution labels canonicalize to structured movement identity', () => {
  const cases = [
    ['Easy Run', 'Run'],
    ['Long Run', 'Run'],
    ['Interval Run', 'Run'],
    ['Threshold Run', 'Run'],
    ['Run Intervals', 'Run'],
    ['Ruck', 'Backpack Carry'],
    ['Ruck March', 'Backpack Carry'],
    ['Loaded March', 'Backpack Carry'],
  ];
  for (const [label, canonical] of cases) {
    const match = matchDictionary(label);
    assert.equal(match.status, 'alias', label);
    assert.equal(match.canonical, canonical, label);
    const result = validateExercisesAgainstDictionary(program(label), {});
    assert.equal(result.ok, true, label);
    assert.match(result.program, new RegExp(`\\t${canonical.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\t`), label);
  }
});

test('composition grammar does not turn arbitrary exercise-sounding strings into valid movements', () => {
  const fabricated = [
    'Cable Belt Squat Iron Cross Curl',
    'TRX Tuck Human Flag',
    'Box-Assisted Barbell Human Flag Press',
    'Band-Assisted Sprint Isometric',
    'Tempo Cable Muscle-up Lunge',
    'Strict Sprint',
    'Strict Sled Push',
    'Strict Cable Row',
    'Tactical Run Circuit',
    'Loaded March Press',
    'Ruck Burpee Complex',
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
