import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, '..', f), 'utf8');

// Live run #63 lost the Advanced Hybrid and Tactical avatars to "job
// disappeared": five consecutive 404s from /api/job/:id after minutes of
// healthy polling. Job state lived only in a process-local Map, durable
// persistence was fire-and-forget, and a rejection from any background job
// terminated the process -- so one failed write silently destroyed every build
// in flight and left the caller with no status at all.

test('[J1] background jobs are spawned with a rejection handler', () => {
  const server = read('server.js');
  const spawns = server.match(/^\s*run(?:Build|Adjust|SetLanguage)Job\(.*$/gm) || [];
  assert.ok(spawns.length >= 3, 'expected the three fire-and-forget job spawns');
  for (const line of spawns) {
    assert.match(line, /\.catch\(/, `unguarded background job spawn: ${line.trim()}`);
  }
});

test('[J2] recording a job failure cannot itself reject', () => {
  const server = read('server.js');
  // Every finishJob call on an error path is wrapped, so a storage outage
  // reports a failed build instead of taking the process down with it.
  const errorFinishes = server.match(/await store\.finishJob\([^)]*"error"[^)]*\)/g) || [];
  assert.ok(errorFinishes.length >= 2);
  assert.match(server, /async function failJobSafely/);
  assert.match(server, /catch \(storeErr\) \{[\s\S]{0,120}could not record job failure/);
});

test('[J3] the process survives a rejection from a background job', () => {
  const server = read('server.js');
  assert.match(server, /process\.on\("unhandledRejection"/);
  assert.match(server, /process\.on\("uncaughtException"/);
});

test('[J4] job creation is awaited, not fire-and-forget', () => {
  const storage = read('storage.js');
  const create = storage.slice(storage.indexOf('async createJob(id,token,kind,now) {'));
  const body = create.slice(0, create.indexOf('async staleJobs'));
  assert.doesNotMatch(body, /persistEventually/, 'createJob must not persist in the background');
  assert.match(body, /await runSupabase\("createJob\/upsert"/);
});

test('[J5] both storage backends can list interrupted jobs', () => {
  const storage = read('storage.js');
  const backends = storage.match(/async staleJobs\(/g) || [];
  assert.equal(backends.length, 2, 'supabase and sqlite must both implement staleJobs');
  // Reaping is keyed on updated_at, never created_at: a build that is merely
  // slow between progress stages must never be killed by the reaper.
  assert.match(storage, /row\?\.status==="pending" && Number\(row\.updated_at\|\|0\) < cutoff/);
  assert.match(storage, /status='pending' AND updated_at < \?/);
});

test('[J6] the reaper waits far longer than any real gap between progress stages', async () => {
  const server = read('server.js');
  const m = server.match(/const STALE_JOB_MS = Number\(process\.env\.STALE_JOB_MS \|\| (\d+) \* (\d+) \* (\d+)\)/);
  assert.ok(m, 'STALE_JOB_MS must be defined');
  const stale = Number(m[1]) * Number(m[2]) * Number(m[3]);
  const timeout = Number((server.match(/BUILD_JOB_TIMEOUT_MS \|\| (\d+)/) || [])[1]);
  assert.ok(stale > timeout, `stale cutoff ${stale}ms must exceed the build timeout ${timeout}ms`);
  assert.ok(stale >= 10 * 60 * 1000, 'a live build may sit in one stage for several minutes');
});

test('[J7] an interrupted job is reported to its caller, not left pending forever', () => {
  const server = read('server.js');
  assert.match(server, /async function reapInterruptedJobs/);
  assert.match(server, /store\.finishJob\(job\.id, "error"/);
  assert.match(server, /interrupted before it finished/);
  // The reaper is scheduled, and does not keep the process alive by itself.
  assert.match(server, /setInterval\(\s*\(\) => reapInterruptedJobs\(\)/);
  assert.match(server, /jobReaper\.unref\?\.\(\)/);
});

test('[J8] the reaper resolves an interrupted job and leaves a live one alone', async (t) => {
  // Source-text assertions above pin the wiring; this exercises the behaviour.
  // Uses the local sqlite backend, so it is skipped where that is unavailable.
  let store;
  try {
    const { makeStorage } = await import('../storage.js');
    store = await makeStorage();
  } catch {
    return t.skip('storage backend unavailable in this environment');
  }
  if (store.backend !== 'sqlite' || typeof store.staleJobs !== 'function') {
    return t.skip('sqlite backend required');
  }

  const STALE_JOB_MS = 15 * 60 * 1000;
  const now = Date.now();
  // Fresh ids per run: the sqlite file persists between runs and job id is a
  // primary key, so fixed ids would collide on the second invocation.
  const id = () => randomBytes(16).toString('hex');
  const liveId = id();
  const deadId = id();
  await store.createJob(liveId, 'tok-live', 'build', now);
  await store.createJob(deadId, 'tok-dead', 'build', now - STALE_JOB_MS - 60_000);

  const stale = (await store.staleJobs(now - STALE_JOB_MS)).filter((j) => j.id === liveId || j.id === deadId);
  assert.deepEqual(stale.map((j) => j.id), [deadId], 'only the interrupted job is stale');

  for (const job of stale) {
    await store.finishJob(job.id, 'error', null, 'The build was interrupted before it finished.', Date.now());
  }

  const live = await store.getJob(liveId);
  const dead = await store.getJob(deadId);
  assert.equal(live.status, 'pending', 'a slow but living build must never be reaped');
  assert.equal(dead.status, 'error');
  assert.match(dead.error, /interrupted before it finished/);
});
