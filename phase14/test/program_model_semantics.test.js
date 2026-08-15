import { test } from "node:test";
import assert from "node:assert/strict";

import { RetriableValidationError } from "../engine/exercise_dictionary.js";
import {
  deriveGoalFamilies,
  directGoalExposures,
  modalityDaysForWeek,
  parseProgramModel,
  strengthDaysForWeek,
} from "../engine/program_model.js";
import {
  validateDirectGoalExposureSemantic,
  validateSportDayCouplingSemantic,
  validateWeeklyVolumeBudgetSemantic,
} from "../engine/semantic_program_qa.js";

const HEADER = "Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults";

function program(rows) {
  return [
    "START_WEEK1_TSV",
    HEADER,
    ...rows,
    "END_WEEK1_TSV",
  ].join("\n");
}

function fourWeekProgram(rows) {
  return [1, 2, 3, 4].map((week) => [
    `START_WEEK${week}_TSV`,
    HEADER,
    ...rows,
    `END_WEEK${week}_TSV`,
  ].join("\n")).join("\n\n");
}

const HYBRID_INTAKE = {
  days_per_week: 3,
  training_location: "commercial_gym",
  equipment: ["barbell", "rack", "plates", "pull-up bar", "20 kg ruck"],
};

test("ProgramModel separates strength, running and ruck semantics on a hybrid week", () => {
  const hybridWeek = program([
    "Mon\tBack Squat\t120 kg\t3\t5\t180s\tRIR 2\tstrength\t",
    "Mon\tEasy Run\tN/A\t1\t25 min\tN/A\tRPE 5\teasy aerobic\t",
    "Tue\tEasy Run\tN/A\t1\t35 min\tN/A\tRPE 5\teasy aerobic\t",
    "Wed\tWeighted Pull-up\tBW+20 kg\t4\t5\t180s\tRIR 2\tstrength\t",
    "Fri\tOverhead Press\t55 kg\t3\t5\t180s\tRIR 2\tstrength\t",
    "Sat\tRuck Carry\t20 kg\t1\t10 km\tN/A\tRPE 5\tsteady state ruck\t",
  ]);
  const model = parseProgramModel(hybridWeek, HYBRID_INTAKE);
  assert.deepEqual(strengthDaysForWeek(model, 1).map((d) => d.day), ["monday", "wednesday", "friday"]);
  assert.deepEqual(modalityDaysForWeek(model, 1, "running").map((d) => d.day), ["monday", "tuesday"]);
  assert.deepEqual(modalityDaysForWeek(model, 1, "ruck").map((d) => d.day), ["saturday"]);
});

test("SPORT_DAY_COUPLING regression: endurance-only days do not count toward requested strength sessions", () => {
  const hybridWeek = program([
    "Mon\tBack Squat\t120 kg\t3\t5\t180s\tRIR 2\tstrength\t",
    "Mon\tEasy Run\tN/A\t1\t25 min\tN/A\tRPE 5\teasy aerobic\t",
    "Tue\tEasy Run\tN/A\t1\t35 min\tN/A\tRPE 5\teasy aerobic\t",
    "Wed\tWeighted Pull-up\tBW+20 kg\t4\t5\t180s\tRIR 2\tstrength\t",
    "Fri\tOverhead Press\t55 kg\t3\t5\t180s\tRIR 2\tstrength\t",
    "Sat\tRuck Carry\t20 kg\t1\t10 km\tN/A\tRPE 5\tsteady state ruck\t",
  ]);

  assert.doesNotThrow(() => validateSportDayCouplingSemantic(hybridWeek, HYBRID_INTAKE));
});

test("SPORT_DAY_COUPLING regression: two strength days still fail when three are requested", () => {
  const underScheduled = program([
    "Mon\tBack Squat\t120 kg\t3\t5\t180s\tRIR 2\tstrength\t",
    "Tue\tEasy Run\tN/A\t1\t35 min\tN/A\tRPE 5\teasy aerobic\t",
    "Wed\tWeighted Pull-up\tBW+20 kg\t4\t5\t180s\tRIR 2\tstrength\t",
    "Sat\tRuck Carry\t20 kg\t1\t10 km\tN/A\tRPE 5\tsteady state ruck\t",
  ]);

  assert.throws(
    () => validateSportDayCouplingSemantic(underScheduled, HYBRID_INTAKE),
    (err) => {
      assert.ok(err instanceof RetriableValidationError);
      assert.equal(err.code, "SPORT_DAY_COUPLING_VIOLATION");
      const mismatch = err.details.violations.find((v) => v.type === "gym_day_count_mismatch");
      assert.ok(mismatch);
      assert.equal(mismatch.requested, 3);
      assert.equal(mismatch.scheduled, 2);
      return true;
    }
  );
});

test("weekly volume regression: four valid weeks are never summed against one weekly reference", () => {
  const candidate = fourWeekProgram([
    "Mon\tWeighted Pull-up\tBW+10 kg\t10\t3\t120s\t7\tquality pulling\t",
    "Thu\tPull-up\tBW\t10\t5\t120s\t7\tquality pulling\t",
  ]);

  const result = validateWeeklyVolumeBudgetSemantic(candidate, { days_per_week: 2 });
  assert.equal(result.accounting_scope, "per_week");
  assert.equal(result.weeks.length, 4);
  assert.deepEqual(result.weeks.map((week) => week.totals.pull), [20, 20, 20, 20]);
});

test("weekly volume regression: a genuinely gross single-week overload still fails closed", () => {
  const candidate = program([
    "Mon\tWeighted Pull-up\tBW+10 kg\t20\t3\t120s\t7\texcessive pulling\t",
    "Thu\tPull-up\tBW\t20\t5\t120s\t7\texcessive pulling\t",
  ]);

  assert.throws(
    () => validateWeeklyVolumeBudgetSemantic(candidate, { days_per_week: 2 }),
    (err) => {
      assert.ok(err instanceof RetriableValidationError);
      assert.equal(err.code, "WEEKLY_MRV_EXCEEDED");
      assert.equal(err.details.accounting_scope, "per_week");
      assert.equal(err.details.over[0].week, 1);
      assert.equal(err.details.over[0].pattern, "pull");
      assert.equal(err.details.over[0].total, 40);
      return true;
    },
  );
});

test("semantic goal parsing treats hyphens as presentation and preserves specific named goals", () => {
  const goals = deriveGoalFamilies({
    primary_goals: ["First bar muscle-up", "Freestanding handstand"],
    secondary_goals: ["Improve strict pull-ups"],
  });
  assert.deepEqual(goals.map((g) => g.family), ["bar_muscle_up", "handstand", "pull_up"]);
});

test("compound maintenance goals produce multiple explicit goal families", () => {
  const goals = deriveGoalFamilies({
    maintenance_goals: ["Maintain useful squat and deadlift strength"],
  });
  assert.deepEqual(goals.map((g) => g.family), ["squat", "deadlift"]);
});

test("coaching notes cannot turn a pull-up into direct bar muscle-up exposure", () => {
  const intake = { primary_goals: ["First bar muscle-up"], days_per_week: 1 };
  const candidate = program([
    "Mon\tStrict Pull-up\tBW\t4\t5\t120s\t7\tDirect bar muscle-up transition support and target-skill intent.\t",
  ]);
  const model = parseProgramModel(candidate, intake);
  const exercise = model.weeks[0].days[0].exercises[0];
  assert.equal(exercise.base_movement, "pull_up");
  assert.equal(exercise.modality, "strength");
  assert.equal(exercise.direct_goal_exposure, false);
  assert.equal(directGoalExposures(model, "bar_muscle_up", 1).length, 0);
  assert.throws(
    () => validateDirectGoalExposureSemantic(candidate, intake),
    (err) => err.code === "NAMED_GOAL_DIRECT_EXPOSURE_MISSING",
  );
});

test("coaching notes cannot turn wall holding into freestanding handstand balance exposure", () => {
  const intake = { primary_goals: ["Freestanding handstand"], days_per_week: 1 };
  const candidate = program([
    "Mon\tWall Handstand Hold\tBW\t4\t20 sec\t60s\tN/A\tFreestanding handstand balance practice and unsupported balance target.\t",
  ]);
  const model = parseProgramModel(candidate, intake);
  const exercise = model.weeks[0].days[0].exercises[0];
  assert.equal(exercise.base_movement, "handstand");
  assert.equal(exercise.direct_goal_exposure, false);
  assert.equal(directGoalExposures(model, "handstand", 1).length, 0);
});

test("10 km ruck remains ruck even when the note discusses 3K running priorities", () => {
  const candidate = program([
    "Sat\tBackpack Carry\t20 kg\t1\t10 km\tN/A\t5\tSupport the 3K running goal without adding another run.\t",
  ]);
  const model = parseProgramModel(candidate, { secondary_goals: ["Improve 10 km ruck"] });
  const exercise = model.weeks[0].days[0].exercises[0];
  assert.equal(exercise.base_movement, "ruck");
  assert.equal(exercise.modality, "ruck");
  assert.deepEqual(modalityDaysForWeek(model, 1, "running"), []);
  assert.equal(directGoalExposures(model, "ruck", 1).length, 1);
});
