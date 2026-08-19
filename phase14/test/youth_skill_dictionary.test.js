import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExercisesAgainstDictionary, RetriableValidationError } from '../engine/exercise_dictionary.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function program(rows) {
  return ['START_WEEK1_TSV', HEADER, ...rows, 'END_WEEK1_TSV'].join('\n');
}

test('youth handstand and bar muscle-up drills are accepted canonical exercises', () => {
  const prog = program([
    'Mon\tControlled Handstand Kick-up\tBW\t3\t3-5 reps\t60s\tN/A\tSkill quality\t',
    'Tue\tBar Muscle-up Transition Drill\tBW\t4\t3-5 reps\t90s\tN/A\tSmooth turnover\t',
  ]);
  const res = validateExercisesAgainstDictionary(prog, {});
  assert.equal(res.ok, true);
  assert.equal(res.unknown.length, 0);
});

test('dictionary still blocks genuinely unknown invented youth skill names', () => {
  const prog = program([
    'Mon\tFloating Phoenix Muscle-up Drill\tBW\t3\t5\t90s\tN/A\tInvented\t',
  ]);
  assert.throws(
    () => validateExercisesAgainstDictionary(prog, {}),
    (err) => err instanceof RetriableValidationError && err.code === 'EXERCISE_HALLUCINATION'
  );
});
