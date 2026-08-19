import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = fs.readFileSync(new URL('../storage.js', import.meta.url), 'utf8');

test('all current Supabase operations use the shared operation-level wrapper', () => {
  for (const op of [
    'getUsage/select',
    'bumpUsage/upsert',
    'upsertClient/upsert',
    'updateClientProgram/update',
    'getClient/select',
    'addHistory/insert',
    'createJob/upsert',
    'updateJobProgress/update',
    'finishJob/update',
    'getJob/select',
    'listRecentClients/select',
    'healthCheck',
  ]) {
    assert.match(storage, new RegExp(`runSupabase\\(\\"${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\"`));
  }
});

test('jobs clients and usage retain explicit local mirrors during transport failures', () => {
  assert.match(storage, /const clientFallback = new Map\(\)/);
  assert.match(storage, /const jobFallback = new Map\(\)/);
  assert.match(storage, /const usageFallback = new Map\(\)/);
  assert.match(storage, /usage tracking unavailable; using local fallback/);
  assert.match(storage, /mirrorClient\(token,intakeJSON,program,now,now\)/);
  assert.match(storage, /mirrorJob\(row\)/);
  assert.match(storage, /return clientFallback\.get\(token\)\|\|null/);
  assert.match(storage, /return jobFallback\.get\(id\)\|\|null/);
});

test('foreground client persistence and reads still reject non-transient Supabase errors', () => {
  const guards = storage.match(/if \(!isTransientSupabaseError\(err\)\) throw err;/g) || [];
  assert.ok(guards.length >= 4, `Expected at least four deterministic-error guards, found ${guards.length}`);
  assert.match(storage, /async upsertClient\(token,intakeJSON,program,now\)/);
  assert.match(storage, /async updateClientProgram\(token,program,now\)/);
  assert.match(storage, /async getClient\(token\)/);
  assert.match(storage, /async getJob\(id\)/);
});

test('best-effort background writes update local mirrors before remote persistence', () => {
  assert.match(storage, /historyFallback\.push\(row\).*persistEventually\(\"history\"/s);
  assert.match(storage, /mirrorJob\(row\).*persistEventually\(\"job create\"/s);
  assert.match(storage, /mirrorJob\(\{id,stage,attempt,detail,updated_at:now\}\).*persistEventually\(\"job progress\"/s);
  assert.match(storage, /mirrorJob\(\{id,status,program:program\|\|null,error:error\|\|null,updated_at:now\}\).*persistEventually\(\"job finish\"/s);
});

test('health check reports degraded transport without declaring app dead', () => {
  assert.match(storage, /persistence:\"degraded\"/);
  assert.match(storage, /temporary Supabase transport issue/);
});
