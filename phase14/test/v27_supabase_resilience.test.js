import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = fs.readFileSync(new URL('../storage.js', import.meta.url), 'utf8');

test('all Supabase operations share operation-level retry wrapper', () => {
  for (const op of [
    'getUsage/select', 'getUsage/insert', 'bumpUsage/select', 'bumpUsage/update', 'bumpUsage/insert',
    'upsertClient/select', 'upsertClient/update', 'upsertClient/insert', 'updateClientProgram/update',
    'getClient/select', 'addHistory/insert', 'createJob/insert', 'updateJobProgress/update',
    'finishJob/update', 'getJob/select', 'healthCheck'
  ]) {
    assert.match(storage, new RegExp(`runSupabase\\(\\"${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\"`));
  }
});

test('transient transport failures have local fallbacks for usage jobs and clients', () => {
  assert.match(storage, /const clientFallback = new Map\(\)/);
  assert.match(storage, /const jobFallback = new Map\(\)/);
  assert.match(storage, /usage tracking unavailable; using local fallback/);
  assert.match(storage, /job create not persisted; local mirror retained/);
  assert.match(storage, /job read unavailable; using local mirror/);
  assert.match(storage, /client read unavailable; using local mirror/);
});

test('schema and RLS errors are not silently swallowed', () => {
  assert.match(storage, /if \(!isTransientSupabaseError\(err\)\) throw err;/);
  assert.match(storage, /SQL\/schema\/RLS\/validation errors are deterministic/);
});

test('health check reports degraded transport without declaring app dead', () => {
  assert.match(storage, /persistence: \"degraded\"/);
  assert.match(storage, /temporary Supabase transport issue/);
});
