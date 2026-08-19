import test from "node:test";
import assert from "node:assert/strict";
import { validateLaunchIntake } from "../intake_validation.js";

function valid() {
  return {
    primary_goals: ["Increase squat strength"],
    experience: "Intermediate (1–3 years)",
    days_per_week: "4",
    equipment: "Full commercial gym",
    training_location: "commercial_gym",
    language: "en",
    sport_schedule: [],
  };
}

test("valid launch intake passes", () => {
  assert.equal(validateLaunchIntake(valid()), null);
});

test("missing or malformed required intake is rejected before AI", () => {
  const cases = [
    [{ ...valid(), primary_goals: [] }, /primary goal/i],
    [{ ...valid(), primary_goals: [""] }, /short list/i],
    [{ ...valid(), experience: "" }, /experience/i],
    [{ ...valid(), days_per_week: "1" }, /between 2 and 6/i],
    [{ ...valid(), days_per_week: "seven" }, /between 2 and 6/i],
    [{ ...valid(), equipment: "" }, /equipment/i],
    [{ ...valid(), training_location: "moon_base" }, /training location/i],
    [{ ...valid(), language: "xx" }, /English or Hebrew/i],
    [{ ...valid(), sport_schedule: {} }, /malformed/i],
  ];
  for (const [payload, rx] of cases) assert.match(validateLaunchIntake(payload), rx);
});

test("optional coaching fields can be absent without blocking a build", () => {
  const payload = valid();
  delete payload.sport_schedule;
  assert.equal(validateLaunchIntake(payload), null);
});
