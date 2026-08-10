import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "raz-pass-test-"));
process.env.ENTITLEMENTS_SQLITE_DB_PATH = path.join(tmpDir, "entitlements.db");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;

const { makeEntitlementStore } = await import("../entitlements.js");

function code(ch) { return ch.repeat(32); }

test("Program Pass issues with one block, 56-day access and six adjustments", async () => {
  const store = await makeEntitlementStore();
  const now = 1_800_000_000_000;
  const pass = await store.issuePass(code("a"), now, 6);
  assert.equal(pass.status, "issued");
  assert.equal(pass.adjustment_limit, 6);
  assert.equal(pass.adjustment_count, 0);
  assert.equal(pass.initial_build_completed_at, null);
  const active = await store.activatePass(code("a"), code("b"), now, 56);
  assert.equal(active.status, "active");
  assert.equal(active.activated_token, code("b"));
  assert.equal(active.expires_at, now + 56 * 24 * 60 * 60 * 1000);
});

test("activation is idempotent for the same token and cannot move to another token", async () => {
  const store = await makeEntitlementStore();
  const now = 1_800_000_100_000;
  await store.issuePass(code("c"), now, 6);
  const first = await store.activatePass(code("c"), code("d"), now, 56);
  const retry = await store.activatePass(code("c"), code("d"), now + 1000, 56);
  const stolen = await store.activatePass(code("c"), code("e"), now + 2000, 56);
  assert.equal(retry.activated_token, code("d"));
  assert.equal(retry.expires_at, first.expires_at);
  assert.equal(stolen.activated_token, code("d"));
});

test("successful build marker is durable and idempotent", async () => {
  const store = await makeEntitlementStore();
  const now = 1_800_000_200_000;
  await store.issuePass(code("f"), now, 6);
  await store.activatePass(code("f"), code("1"), now, 56);
  const completed = await store.markInitialBuildCompleted(code("1"), now + 5000);
  const repeated = await store.markInitialBuildCompleted(code("1"), now + 9000);
  assert.equal(completed.initial_build_completed_at, now + 5000);
  assert.equal(repeated.initial_build_completed_at, now + 5000);
});

test("substantive adjustment counter persists independently of coaching history", async () => {
  const store = await makeEntitlementStore();
  const now = 1_800_000_300_000;
  await store.issuePass(code("2"), now, 6);
  await store.activatePass(code("2"), code("3"), now, 56);
  for (let i = 0; i < 6; i++) await store.incrementAdjustment(code("3"));
  assert.equal(await store.successfulAdjustmentCount(code("3")), 6);
  const reopened = await makeEntitlementStore();
  const pass = await reopened.getPassForToken(code("3"));
  assert.equal(pass.adjustment_count, 6);
  assert.equal(await reopened.successfulAdjustmentCount(code("3")), 6);
});

test("expiredTokens returns only passes older than the retention cutoff", async () => {
  const store = await makeEntitlementStore();
  const now = 1_800_000_400_000;
  await store.issuePass(code("4"), now, 6);
  await store.issuePass(code("5"), now, 6);
  await store.activatePass(code("4"), code("6"), now, 1);
  await store.activatePass(code("5"), code("7"), now, 10);
  const cutoff = now + 2 * 24 * 60 * 60 * 1000;
  const expired = await store.expiredTokens(cutoff);
  assert.deepEqual(expired, [code("6")]);
});
