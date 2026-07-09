// test/v19_validators.test.js
//
// Engine v19 validator unit tests. Run with:  node --test test/v19_validators.test.js
//
// These import the dependency-free engine/exercise_dictionary.js module directly
// (server.js pulls in express + native storage and cannot be imported here).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateExercisesAgainstDictionary,
  validateEquipmentAgainstLocation,
  enforceUnilateralIntensityFloor,
  ELITE_UNILATERAL_TRIGGER,
  enforceIntradayConditioningOrder,
  validateSportDayCoupling,
  validateWeeklyVolumeBudget,
  reformatWarmupCells,
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

// ---------------------------------------------------------------------------
// TEST 1: Assault Bike in an outdoor_park intake fails equipment validation.
// ---------------------------------------------------------------------------
test("validateEquipmentAgainstLocation: Assault Bike forbidden in outdoor_park", () => {
  const intake = {
    training_location: "outdoor_park",
    equipment: ["pull-up bar", "dip bars", "resistance bands"],
  };
  const prog = program([
    "Mon\tAssault Bike\tBW\t3\t10 cal\t60s\tRIR 2\tconditioning\t",
  ]);
  assert.throws(
    () => validateEquipmentAgainstLocation(prog, intake),
    (err) => {
      assert.ok(err instanceof RetriableValidationError);
      assert.equal(err.code, "EQUIPMENT_VIOLATION");
      assert.ok(err.details.violations.some((v) => /assault bike/i.test(v.exercise)));
      return true;
    }
  );

  // Control: a bodyweight movement legal in the park does NOT throw.
  const legal = program(["Mon\tPull-up\tBW\t4\t8\t90s\tRIR 2\t\t"]);
  assert.doesNotThrow(() => validateEquipmentAgainstLocation(legal, intake));
});

// ---------------------------------------------------------------------------
// TEST 2: "TRX Tuck Human Flag" fails the dictionary; "Tuck Human Flag Hold" passes.
// ---------------------------------------------------------------------------
test("validateExercisesAgainstDictionary: invented name flagged, real ladder rung accepted", () => {
  const fake = program([
    "Wed\tTRX Tuck Human Flag\tBW\t4\t5\t120s\tRIR 2\t\t",
  ]);
  assert.throws(
    () => validateExercisesAgainstDictionary(fake, {}),
    (err) => {
      assert.ok(err instanceof RetriableValidationError);
      assert.equal(err.code, "EXERCISE_HALLUCINATION");
      assert.ok(err.details.unknown.some((u) => /tuck human flag/i.test(u.exercise)));
      return true;
    }
  );

  const real = program([
    "Wed\tTuck Human Flag Hold\tBW\t4\t20s\t120s\tRIR 2\t\t",
  ]);
  const res = validateExercisesAgainstDictionary(real, {});
  assert.equal(res.ok, true);
  assert.equal(res.unknown.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 3: elite pistol benchmark triggers the floor; "TRX Squat" working set fails.
// ---------------------------------------------------------------------------
test("enforceUnilateralIntensityFloor: locked-out TRX Squat fails for elite pistol athlete", () => {
  const intake = {
    training_location: "commercial_gym",
    equipment: ["barbell", "rack", "plates", "dumbbells"],
    current_numbers: "pistol squat BW+10kg x 12",
  };
  assert.equal(ELITE_UNILATERAL_TRIGGER(intake), true);

  const prog = program([
    "Fri\tTRX Squat 10-12 reps\tBW\t3\t10-12\t90s\tRIR 2\t\t",
  ]);
  assert.throws(
    () => enforceUnilateralIntensityFloor(prog, intake),
    (err) => {
      assert.ok(err instanceof RetriableValidationError);
      assert.equal(err.code, "UNILATERAL_UNDERSTIMULATION");
      assert.ok(err.details.violations.some((v) => /trx squat/i.test(v.exercise)));
      return true;
    }
  );

  // Control: a strong loaded unilateral movement is fine, and a non-elite athlete
  // is never gated.
  const ok = program(["Fri\tBulgarian Split Squat\t60 kg\t4\t6\t120s\tRIR 2\t\t"]);
  assert.doesNotThrow(() => enforceUnilateralIntensityFloor(ok, intake));
  assert.doesNotThrow(() =>
    enforceUnilateralIntensityFloor(prog, { current_numbers: "back squat 100kg x 5" })
  );
});

// ---------------------------------------------------------------------------
// TEST 4 (replaced): three semicolon-separated warmup drills collapse into ONE
//         row where the Exercise cell holds 3 newline-separated lines, prefix once.
// ---------------------------------------------------------------------------
test("reformatWarmupCells: three semicolon drills become one row, newline-separated", () => {
  const prog = program([
    "Mon\t[WARMUP] Jumping Jacks x 2 min; Leg Swings 2x10; Deep Squat Hold x 30s\tBW\t1\tas listed\t30s\tRIR 3\tprep\t",
    "Mon\tBack Squat\t150 kg\t5\t5\t180s\tRIR 2\t\t",
  ]);
  const out = reformatWarmupCells(prog);
  const lines = out.split("\n");
  // ONE physical TSV row still carries the warmup (no row explosion).
  const warmupRows = lines.filter((l) => l.includes("[WARMUP]"));
  assert.equal(warmupRows.length, 1, `expected 1 warmup row, got ${warmupRows.length}`);

  const cell = warmupRows[0].split("\t")[1];
  // Prefix appears exactly once.
  assert.equal((cell.match(/\[WARMUP\]/g) || []).length, 1);
  // Three drills, separated by two literal "\n" escapes -> three in-cell lines.
  const drillLines = cell.split("\\n");
  assert.equal(drillLines.length, 3, `expected 3 in-cell lines, got ${drillLines.length}`);
  assert.ok(/Jumping Jacks/.test(cell));
  assert.ok(/Leg Swings/.test(cell));
  assert.ok(/Deep Squat Hold/.test(cell));

  // The non-warmup working row is untouched (still exactly one Back Squat row).
  assert.equal(lines.filter((l) => l.includes("Back Squat")).length, 1);
});

// ---------------------------------------------------------------------------
// TEST 5: a day where hard conditioning precedes strength gets reordered so
//         the squat comes first.
// ---------------------------------------------------------------------------
test("enforceIntradayConditioningOrder: Airbike moved after Back Squat", () => {
  const prog = program([
    "Mon\tAirbike Intervals RPE 9-10\tBW\t6\t30s/90s\t90s\tRPE 9\tconditioning\t",
    "Mon\tBack Squat\t150 kg\t3\t3\t180s\tRIR 2\t\t",
  ]);
  const out = enforceIntradayConditioningOrder(prog, {});
  const lines = out.split("\n").filter((l) => l.includes("\t") && !/^Day\t/.test(l));
  const squatIdx = lines.findIndex((l) => /Back Squat/.test(l));
  const bikeIdx = lines.findIndex((l) => /Airbike/.test(l));
  assert.ok(squatIdx >= 0 && bikeIdx >= 0);
  assert.ok(squatIdx < bikeIdx, "Back Squat must precede Airbike after reorder");
  // The reordered conditioning row is annotated.
  assert.ok(/Reordered: hard conditioning must follow strength/.test(lines[bikeIdx]));
});

// ---------------------------------------------------------------------------
// TEST 6: heavy_lower on Fri immediately before a Sat/Sun sport block fails.
// ---------------------------------------------------------------------------
test("validateSportDayCoupling: heavy lower Fri before Sat sport fails 48h rule", () => {
  const intake = { sport_days: ["Sat", "Sun"], sport: "BJJ", sport_intensity: "hard rolls" };
  const prog = program([
    "Fri\tBack Squat\t180 kg\t3\t3\t180s\tRIR 2\t\t",
    "Fri\tRomanian Deadlift\t140 kg\t3\t6\t120s\tRIR 2\t\t",
  ]);
  assert.throws(
    () => validateSportDayCoupling(prog, intake),
    (err) => {
      assert.ok(err instanceof RetriableValidationError);
      assert.equal(err.code, "SPORT_DAY_COUPLING_VIOLATION");
      assert.ok(err.details.violations.some((v) => v.type === "lower_before_sport"));
      return true;
    }
  );

  // Control: same heavy lower on Mon (48h+ from Sat sport) does not throw.
  const okProg = program(["Mon\tBack Squat\t180 kg\t3\t3\t180s\tRIR 2\t\t"]);
  assert.doesNotThrow(() => validateSportDayCoupling(okProg, intake));
});

// ---------------------------------------------------------------------------
// TEST 7: BJJ 5x/wk hard rolling + 20 programmed pull sets exceeds pull MRV.
// ---------------------------------------------------------------------------
test("validateWeeklyVolumeBudget: sport + strength pull volume exceeds MRV", () => {
  const intake = {
    sport: "BJJ",
    sport_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    sport_intensity: "hard rolling 5x/wk",
    training_location: "commercial_gym",
    equipment: ["barbell", "rack", "plates", "dumbbells"],
  };
  // 4 pull rows x 5 sets = 20 strength pull sets; sport adds 6*5 = 30 -> 50 > 25.
  const prog = program([
    "Mon\tWeighted Pull-up\tBW+20\t5\t5\t180s\tRIR 2\t\t",
    "Tue\tBarbell Row\t100 kg\t5\t8\t120s\tRIR 2\t\t",
    "Wed\tLat Pulldown\t80 kg\t5\t10\t90s\tRIR 2\t\t",
    "Thu\tCable Row\t70 kg\t5\t10\t90s\tRIR 2\t\t",
  ]);
  assert.throws(
    () => validateWeeklyVolumeBudget(prog, intake),
    (err) => {
      assert.ok(err instanceof RetriableValidationError);
      assert.equal(err.code, "WEEKLY_MRV_EXCEEDED");
      assert.ok(err.details.over.some((o) => o.pattern === "pull"));
      return true;
    }
  );

  // Control: no sport + modest pull volume stays under ceiling.
  const okProg = program(["Mon\tWeighted Pull-up\tBW+20\t4\t5\t180s\tRIR 2\t\t"]);
  assert.doesNotThrow(() => validateWeeklyVolumeBudget(okProg, {}));
});

// ---------------------------------------------------------------------------
// TEST 8: reformatWarmupCells edge cases — a single-drill warmup is left alone,
//         and the Hebrew [חימום] prefix is preserved when collapsing drills.
// ---------------------------------------------------------------------------
test("reformatWarmupCells: single drill untouched, Hebrew prefix preserved", () => {
  // Single drill (no separators) -> no change.
  const single = program(["Mon\t[WARMUP] Dead Bug 2x10/side\tBW\t2\t10/side\t30s\tRIR 3\t\t"]);
  const outSingle = reformatWarmupCells(single);
  const singleCell = outSingle.split("\n").find((l) => l.includes("[WARMUP]")).split("\t")[1];
  assert.ok(!singleCell.includes("\\n"), "single-drill warmup should not gain newlines");

  // Hebrew warmup prefix with three drills -> one row, prefix kept once.
  const heb = program([
    "Mon\t[חימום] קפיצות x 2 דקות; מתיחות רגליים 2x10; סקוואט עמוק x 30s\tBW\t1\tas listed\t30s\tRIR 3\t\t",
  ]);
  const outHeb = reformatWarmupCells(heb);
  const hebRows = outHeb.split("\n").filter((l) => l.includes("[חימום]"));
  assert.equal(hebRows.length, 1, "Hebrew warmup should stay one row");
  const hebCell = hebRows[0].split("\t")[1];
  assert.equal((hebCell.match(/\[חימום\]/g) || []).length, 1);
  assert.equal(hebCell.split("\\n").length, 3, "expected 3 in-cell Hebrew drill lines");
});
