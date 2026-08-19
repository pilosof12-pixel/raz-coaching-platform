import test from "node:test";
import assert from "node:assert/strict";
import { ANALYTICS_EVENTS, isAllowedAnalyticsEvent } from "../analytics.js";

test("analytics accepts only the fixed launch funnel allowlist", () => {
  for (const event of ANALYTICS_EVENTS) assert.equal(isAllowedAnalyticsEvent(event), true);
  for (const bad of ["", "token", "injury_text", "program_content", "user_email", "anything_else", null, 42]) {
    assert.equal(isAllowedAnalyticsEvent(bad), false);
  }
});

test("analytics allowlist contains no identifying or content-bearing fields", () => {
  const names = [...ANALYTICS_EVENTS].join(" ").toLowerCase();
  for (const forbidden of ["token", "email", "injury_text", "program_text", "ip_address", "user_name", "bodyweight", "notes"]) {
    assert.equal(names.includes(forbidden), false);
  }
});
