import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = fs.readFileSync(new URL('../storage.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('Supabase client retries transport-level fetch failures', () => {
  assert.match(storage, /const retryFetch = async/);
  assert.match(storage, /attempt < 3/);
  assert.match(storage, /fetch: retryFetch/);
});

test('intake draft persists across refresh and failed builds', () => {
  assert.match(app, /coaching_intake_draft_v1/);
  assert.match(app, /function saveIntakeDraft\(\)/);
  assert.match(app, /function restoreIntakeDraft\(\)/);
  assert.match(app, /window\.localStorage\.setItem/);
  assert.match(app, /restoreIntakeDraft\(\);/);
});
