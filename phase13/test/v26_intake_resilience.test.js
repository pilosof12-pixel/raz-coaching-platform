import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const storage = fs.readFileSync(new URL("../storage.js", import.meta.url), "utf8");

test("specific gym days opens the day selector on limited mode", () => {
  assert.match(app, /bindChoice\("gym-availability-choice",\s*"gym_availability_mode",\s*"gym-availability-details",\s*"limited"\)/);
  assert.match(app, /panel\.classList\.toggle\("hidden", hidden\.value !== showWhen\)/);
});

test("intake draft survives refresh and build errors", () => {
  assert.match(app, /raz_intake_draft_v1/);
  assert.match(app, /window\.localStorage\.setItem/);
  assert.match(app, /function restoreDraft\(/);
  assert.match(app, /saveDraftNow\(\);\s*\n\s*const intake = collectIntake\(\)/);
});

test("job tracking retries transient Supabase fetch failures", () => {
  assert.match(storage, /function withSupabaseRetry\(/);
  assert.match(storage, /fetch failed/);
  assert.match(storage, /withSupabaseRetry\("createJob\/insert"/);
  assert.match(storage, /withSupabaseRetry\("getJob\/select"/);
});
