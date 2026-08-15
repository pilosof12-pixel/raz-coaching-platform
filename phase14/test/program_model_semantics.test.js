import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateSportDayCoupling,
  RetriableValidationError,
} from "../engine/exercise_dictionary.js";

const HEADER = "Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults";

function program(rows) {
  return [
    "START_WEEK1_TSV",
    HEADER,
    ...rows,
    "END_WEEK1_TSV",
  ].join("\n");
}

const HYBRID_INTAKE = {
  days_per_week: 3,
  training_location: "commercial_gym",
  equipment: ["barbell", "rack", "plates", "pull-up bar", "20 kg ruck"],
};

test("SPORT_DAY_COUPLING regression: endurance-only days do not count toward requested strength sessions", () => {
  const hybridWeek = program([
    "Mon\tBack Squat\t120 kg\t3\t5\t180s\tRIR 2\tstrength\t",
    "Mon\tEasy Run\tN/A\t1\t25 min\tN/A\tRPE 5\teasy aerobic\t",
    "Tue\tEasy Run\tN/A\t1\t35 min\tN/A\tRPE 5\teasy aerobic\t",
    "Wed\tWeighted Pull-up\tBW+20 kg\t4\t5\t180s\tRIR 2\tstrength\t",
    "Fri\tOverhead Press\t55 kg\t3\t5\t180s\tRIR 2\tstrength\t",
    "Sat\tRuck Carry\t20 kg\t1\t10 km\tN/A\tRPE 5\tsteady state ruck\t",
  ]);

  assert.doesNotThrow(() => validateSportDayCoupling(hybridWeek, HYBRID_INTAKE));
});

test("SPORT_DAY_COUPLING regression: two strength days still fail when three are requested", () => {
  const underScheduled = program([
    "Mon\tBack Squat\t120 kg\t3\t5\t180s\tRIR 2\tstrength\t",
    "Tue\tEasy Run\tN/A\t1\t35 min\tN/A\tRPE 5\teasy aerobic\t",
    "Wed\tWeighted Pull-up\tBW+20 kg\t4\t5\t180s\tRIR 2\tstrength\t",
    "Sat\tRuck Carry\t20 kg\t1\t10 km\tN/A\tRPE 5\tsteady state ruck\t",
  ]);

  assert.throws(
    () => validateSportDayCoupling(underScheduled, HYBRID_INTAKE),
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
