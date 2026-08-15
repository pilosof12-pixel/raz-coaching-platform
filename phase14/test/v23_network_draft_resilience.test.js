import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = fs.readFileSync(new URL('../storage.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('Supabase operations retry transient transport failures through the shared wrapper', () => {
  assert.match(storage, /function isTransientSupabaseError\(err\)/);
  assert.match(storage, /async function runSupabase\(operation,fn,\{attempts=2\}=\{\}\)/);
  assert.match(storage, /if \(!isTransientSupabaseError\(err\) \|\| attempt===attempts\) throw err;/);
  assert.match(storage, /await sleep\(attempt===1\?200:650\)/);
  assert.match(storage, /runSupabase\(\"getClient\/select\"/);
  assert.match(storage, /runSupabase\(\"finishJob\/update\"/);
});

test('intake draft persists across refresh and failed builds', () => {
  assert.match(app, /coaching_intake_draft_v1/);
  assert.match(app, /function saveIntakeDraft\(\)/);
  assert.match(app, /function restoreIntakeDraft\(\)/);
  assert.match(app, /window\.localStorage\.setItem/);
  assert.match(app, /restoreIntakeDraft\(\);/);
});
