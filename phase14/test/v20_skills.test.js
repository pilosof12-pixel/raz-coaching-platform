// test/v20_skills.test.js
//
// Engine v20 tests: equipment-qualifier tolerance (FIX A) + elite skill
// progression system (FIX B) + skill calibration validator (FIX C).
// Run with:  node --test test/v20_skills.test.js
//
// These import the dependency-free engine modules directly (no server boot).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  coreExerciseName,
  validateAndCalibrateSkills,
  SkillCalibrationError,
} from "../engine/exercise_dictionary.js";

import {
  SKILL_PROGRESSIONS,
  getGoalFamily,
  selectRungForSkill,
} from "../engine/skill_progressions.js";

const HEADER = "Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults";

function program(rows) {
  return ["START_WEEK1_TSV", HEADER, ...rows, "END_WEEK1_TSV"].join("\n");
}

// ---------------------------------------------------------------------------
// FIX A — equipment-qualifier stripping in coreExerciseName.
// ---------------------------------------------------------------------------
test("coreExerciseName strips (bar) equipment qualifier", () => {
  assert.equal(coreExerciseName("Archer Pull-Up (bar)"), "Archer Pull-Up");
});

test("coreExerciseName strips (Weighted Vest) equipment qualifier", () => {
  assert.equal(coreExerciseName("Pistol Squat (Weighted Vest)"), "Pistol Squat");
});

test("coreExerciseName strips (Parallel Bars) equipment qualifier", () => {
  assert.equal(coreExerciseName("L-Sit (Parallel Bars)"), "L-Sit");
});

// ---------------------------------------------------------------------------
// FIX B — goal→family fuzzy matching and rung selection.
// ---------------------------------------------------------------------------
test("getGoalFamily maps planche and front-lever phrases", () => {
  assert.equal(getGoalFamily("full planche progression"), "planche");
  assert.equal(getGoalFamily("front lever full progression"), "front_lever");
});

test("selectRungForSkill: tuck-planche 15s athlete selects Advanced Tuck or higher", () => {
  const sel = selectRungForSkill(
    "planche",
    { planche: { tuck_planche_hold_s: 15 } },
    { equipment: ["floor"], training_location: "home" }
  );
  assert.equal(sel.gated, false);
  const advIdx = SKILL_PROGRESSIONS.get("planche").rungs.findIndex((r) =>
    /advanced tuck planche/i.test(r.name)
  );
  assert.ok(sel.rungIndex >= advIdx, `expected rung >= ${advIdx}, got ${sel.rungIndex}`);
});

// ---------------------------------------------------------------------------
// FIX C — skill calibration validator.
// ---------------------------------------------------------------------------
test("validateAndCalibrateSkills throws SKILL_UNDER_PROGRAMMED for tuck-planche athlete on Planche Lean", () => {
  const intake = {
    primary_goals: ["full planche progression"],
    current_numbers: "tuck planche hold 15s",
    equipment: ["floor"],
    training_location: "home",
  };
  const prog = program([
    "Mon\tPlanche Lean\tBW\t3\t20-30s\t90s\tRIR 2\tskill\t",
  ]);
  assert.throws(
    () => validateAndCalibrateSkills(prog, intake),
    (err) => {
      assert.ok(err instanceof SkillCalibrationError);
      assert.equal(err.code, "SKILL_UNDER_PROGRAMMED");
      assert.equal(err.details.family, "planche");
      return true;
    }
  );

  const ok = program(["Mon\tAdvanced Tuck Planche\tBW\t4\t8-15s\t2 min\tRIR 1\tskill\t"]);
  assert.doesNotThrow(() => validateAndCalibrateSkills(ok, intake));
});

test("validateAndCalibrateSkills throws SKILL_PREREQ_VIOLATION for Iron Cross without ring evidence", () => {
  const intake = {
    primary_goals: ["iron cross"],
    current_numbers: "10 pull-ups, 3 dips",
    equipment: ["rings"],
    training_location: "home",
  };
  const prog = program([
    "Mon\tIron Cross Negative\tBW\t3\t3s\t3 min\tRIR 0\tskill\t",
  ]);
  assert.throws(
    () => validateAndCalibrateSkills(prog, intake),
    (err) => {
      assert.ok(err instanceof SkillCalibrationError);
      assert.equal(err.code, "SKILL_PREREQ_VIOLATION");
      assert.equal(err.details.family, "iron_cross");
      assert.ok(err.details.missing.length > 0);
      return true;
    }
  );
});

test("Human Flag goal without vertical structure gates: prereq violation on over-program, metadata note when at rung 0", () => {
  const intake = {
    primary_goals: ["human flag"],
    current_numbers: "5 pull-ups",
    equipment: ["floor"],
    training_location: "home",
  };
  const over = program(["Mon\tTuck Human Flag Hold\tBW\t4\t10s\t2 min\tRIR 1\tskill\t"]);
  assert.throws(
    () => validateAndCalibrateSkills(over, intake),
    (err) => {
      assert.ok(err instanceof SkillCalibrationError);
      assert.equal(err.code, "SKILL_PREREQ_VIOLATION");
      assert.equal(err.details.family, "human_flag");
      return true;
    }
  );

  // At the gated beginner rung the warning remains structured QA metadata.
  // Internal review markers must never poison an otherwise client-safe program.
  const rung0 = SKILL_PROGRESSIONS.get("human_flag").rungs[0].name;
  const okProg = program([`Mon\t${rung0}\tBW\t3\t30-45s\t60s\tRIR 2\tskill\t`]);
  const res = validateAndCalibrateSkills(okProg, intake);
  assert.equal(res.ok, true);
  assert.ok(res.annotations.some((a) => a.family === "human_flag" && a.type === "gated"));
  assert.equal(/\[REVIEW\]/.test(res.program), false);
});

test("Hebrew goal phrases route to the correct advanced skill family", () => {
  assert.equal(getGoalFamily("פלאנץ מלא"), "planche");
  assert.equal(getGoalFamily("מתח יד אחת"), "one_arm_pull_up");
  assert.equal(getGoalFamily("דגל אנושי"), "human_flag");
  assert.equal(getGoalFamily("פרונט לבר"), "front_lever");
});

test("90-degree HSPU ladder never emits the fabricated wall 90-degree variation", () => {
  const skill = SKILL_PROGRESSIONS.get("hspu");
  assert.ok(skill);
  assert.equal(skill.rungs.some((r) => /90[-\s]?degree\s+wall/i.test(r.name)), false);
  assert.ok(skill.rungs.some((r) => /90[-\s]?degree\s+handstand\s+push/i.test(r.name)));
});
