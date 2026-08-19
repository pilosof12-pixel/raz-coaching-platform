import test from 'node:test';
import assert from 'node:assert/strict';

import { parseProgramModel } from '../engine/program_model.js';
import { validateGoalComponentCoverageSemantic } from '../engine/goal_progression_graph.js';

const INTAKE = {
  age: 13,
  primary_goals: ['Achieve a freestanding handstand'],
  current_numbers: 'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
  clarification_answers: {
    benchmark_handstand: 'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
  },
};

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function week(n, includeWall = true) {
  const rows = [
    includeWall ? 'Session A\tWall Handstand Hold\tBodyweight\t3\t15 sec\t60 sec\t6\tSubstantive wall-supported line capacity.\t' : null,
    'Session A\tControlled Handstand Kick-up\tBodyweight\t5\t1 attempt\t45 sec\t5\tFresh entry and independent-balance practice.\t',
  ].filter(Boolean);
  return [`START_WEEK${n}_TSV`, HEADER, ...rows, `END_WEEK${n}_TSV`].join('\n');
}

function program(withWall = true) {
  return [1, 2, 3, 4].map((n) => week(n, withWall)).join('\n\n');
}

test('handstand component coverage reads ProgramModel display_name for wall and balance rows', () => {
  const candidate = program(true);
  const model = parseProgramModel(candidate, INTAKE);
  for (const week of model.weeks) {
    const names = week.days.flatMap((day) => day.exercises.map((exercise) => exercise.display_name));
    assert.ok(names.includes('Wall Handstand Hold'));
    assert.ok(names.includes('Controlled Handstand Kick-up'));
    assert.equal(week.days.flatMap((day) => day.exercises).some((exercise) => Object.hasOwn(exercise, 'exercise')), false);
  }
  const result = validateGoalComponentCoverageSemantic(candidate, INTAKE, model);
  assert.equal(result.ok, true);
  assert.equal(result.handstand.weeks.every((row) => row.wall_static > 0 && row.entry_balance > 0), true);
});

test('handstand component coverage still rejects kick-up-only programming', () => {
  assert.throws(
    () => validateGoalComponentCoverageSemantic(program(false), INTAKE),
    (error) => error?.code === 'GOAL_COMPONENT_COVERAGE_MISSING',
  );
});
