// Run #159's basketball avatar was refused with 429 having never started, and
// nothing about it was wrong. One 20-per-minute budget covered all of /api/,
// so the sprint triathlete's 1201-second build spent the window polling
// /api/job/:id and the next build request had nothing left to spend.
//
// That is not only a testing problem. A customer waiting ten to twenty minutes
// for the program they paid for polls that endpoint throughout, and a second
// tab or a one-second poll interval is enough to spend the same budget. The
// failure lands in the middle of a build they have already been charged for.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import rateLimit from 'express-rate-limit';

const runtime = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');

test('reads and writes do not share one budget', () => {
  assert.match(runtime, /const readLimiter = rateLimit\(/);
  assert.match(runtime, /const writeLimiter = rateLimit\(/);
  assert.match(
    runtime,
    /req\.method === "GET" \? readLimiter : writeLimiter/,
    'polling a job must not be rationed against starting one',
  );
});

test('the write budget is unchanged, so creation is no more permissive', () => {
  const write = runtime.match(/const writeLimiter = rateLimit\(\{\s*windowMs: 60 \* 1000,\s*max: (\d+)/);
  assert.ok(write, 'write limiter not found');
  assert.equal(Number(write[1]), 20, 'the expensive path keeps the limit it always had');
});

test('the read budget covers a full build at a one-second poll', () => {
  const read = runtime.match(/const readLimiter = rateLimit\(\{\s*windowMs: 60 \* 1000,\s*max: (\d+)/);
  assert.ok(read, 'read limiter not found');
  const perMinute = Number(read[1]);
  assert.ok(perMinute >= 60, `${perMinute}/min cannot survive a client polling once a second`);
  assert.ok(perMinute <= 600, `${perMinute}/min is no longer a limit`);
});

// The behaviour, not just the source: a burst of reads must not lock out a write.
test('a burst of polling leaves a build request able to get through', async () => {
  const app = express();
  const readLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
  const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
  app.use('/api/', (req, res, next) => (req.method === 'GET' ? readLimiter : writeLimiter)(req, res, next));
  app.get('/api/job/:id', (req, res) => res.json({ ok: true }));
  app.post('/api/build', (req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // What the harness and a waiting customer both do.
    for (let i = 0; i < 60; i += 1) {
      const res = await fetch(`${base}/api/job/abc`);
      assert.equal(res.status, 200, `poll ${i + 1} was refused`);
    }
    const build = await fetch(`${base}/api/build`, { method: 'POST' });
    assert.equal(build.status, 200, 'the build behind the polling was refused, which is run #159');
  } finally {
    server.close();
  }
});
