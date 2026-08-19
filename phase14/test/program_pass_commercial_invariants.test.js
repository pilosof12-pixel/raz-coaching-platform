import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

async function sqliteStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raz-pass-retry-'));
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  process.env.SUPABASE_ANON_KEY = '';
  process.env.ENTITLEMENTS_SQLITE_DB_PATH = path.join(dir, 'entitlements.db');
  const { makeEntitlementStore } = await import(`../entitlements.js?retry=${Date.now()}-${Math.random()}`);
  return makeEntitlementStore();
}

test('failed initial generation leaves the paid Program Pass retryable and unconsumed', async () => {
  const store = await sqliteStore();
  const code = '1'.repeat(32);
  const token = '2'.repeat(32);
  const now = Date.now();

  await store.issuePass(code, now, 6);
  await store.activatePass(code, token, now + 1, 56);

  // A failed generation intentionally performs no commercial finalization.
  const afterFailure = await store.getPassForToken(token);
  assert.equal(afterFailure.status, 'active');
  assert.equal(afterFailure.initial_build_completed_at, null);
  assert.equal(Number(afterFailure.adjustment_count || 0), 0);

  // Retrying activation with the same token must preserve the same active pass.
  const retry = await store.activatePass(code, token, now + 2, 56);
  assert.equal(retry.activated_token, token);
  assert.equal(retry.initial_build_completed_at, null);
  assert.equal(Number(retry.adjustment_count || 0), 0);
});

test('successful initial generation consumes the build exactly once after completion', async () => {
  const store = await sqliteStore();
  const code = '3'.repeat(32);
  const token = '4'.repeat(32);
  const now = Date.now();

  await store.issuePass(code, now, 6);
  await store.activatePass(code, token, now + 1, 56);
  await store.markInitialBuildCompleted(token, now + 10);
  const completed = await store.getPassForToken(token);
  assert.equal(Number(completed.initial_build_completed_at), now + 10);

  // Commercial completion is idempotent. Polling a completed job again cannot
  // move the paid-build timestamp or consume another block.
  await store.markInitialBuildCompleted(token, now + 20);
  const repeated = await store.getPassForToken(token);
  assert.equal(Number(repeated.initial_build_completed_at), now + 10);
  assert.equal(Number(repeated.adjustment_count || 0), 0);
});

test('failed adjustment does not consume an included adjustment', async () => {
  const store = await sqliteStore();
  const code = '5'.repeat(32);
  const token = '6'.repeat(32);
  const now = Date.now();

  await store.issuePass(code, now, 6);
  await store.activatePass(code, token, now + 1, 56);
  await store.markInitialBuildCompleted(token, now + 2);

  // Failed adjustment: no incrementAdjustment call.
  let pass = await store.getPassForToken(token);
  assert.equal(Number(pass.adjustment_count || 0), 0);

  // Successful adjustment finalizes exactly after success.
  await store.incrementAdjustment(token);
  pass = await store.getPassForToken(token);
  assert.equal(Number(pass.adjustment_count || 0), 1);
});

test('commercial middleware finalizes only done jobs and explicitly permits retry of an activated uncompleted pass', () => {
  const secure = fs.readFileSync(path.join(root, 'server_secure.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

  assert.match(secure, /if\(body\?\.status!=="done"\) return original\(body\)/);
  assert.match(secure, /meta\.kind==="build"\?passStore\.markInitialBuildCompleted/);
  assert.match(secure, /pass\.status==="active"&&!passExpired\(pass\)&&!pass\.initial_build_completed_at/);
  assert.match(secure, /if\(active\.pass\.initial_build_completed_at\)return res\.status\(403\)/);

  // A job reaches done only after client persistence, history and usage succeed.
  const persist = runtime.indexOf('await store.upsertClient(token, intakeJSON, program, now);');
  const history = runtime.indexOf('await store.addHistory(token, "build", intakeJSON, program, now);');
  const usage = runtime.indexOf('await store.bumpUsage(token, "build");');
  const done = runtime.indexOf('await store.finishJob(jobId, "done", program, null, now);');
  const error = runtime.indexOf('await store.finishJob(jobId, "error", null, e.message || "Engine error.", Date.now());');
  assert.ok(persist >= 0 && history > persist && usage > history && done > usage);
  assert.ok(error > done);
});
