import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("production server supports OpenAI primary with Gemini fallback", () => {
  assert.match(src, /OPENAI_API_KEY/);
  assert.match(src, /gpt-5\.6-luna/);
  assert.match(src, /runOpenAIResponse/);
  assert.match(src, /falling back to Gemini/i);
});

test("adjustments use the validated generation pipeline", () => {
  assert.match(src, /generateValidatedAdjustment/);
  assert.match(src, /privacyScrub\(await generateValidatedAdjustment/);
});

test("build and adjust share the same validator sequence", () => {
  assert.match(src, /generateValidatedFromPrompt/);
  for (const name of [
    "validateExercisesAgainstDictionary",
    "validateAndCalibrateSkills",
    "validateEquipmentAgainstLocation",
    "enforceUnilateralIntensityFloor",
    "enforceIntradayConditioningOrder",
    "validateSportDayCoupling",
    "validateWeeklyVolumeBudget",
  ]) assert.match(src, new RegExp(name));
});
