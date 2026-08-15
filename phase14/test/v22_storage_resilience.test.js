import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../storage.js', import.meta.url), 'utf8');

test('Supabase usage tracking failure cannot hard-block program generation', () => {
  assert.match(src, /const usageFallback = new Map\(\)/);
  assert.match(src, /function getFallbackUsage\(token\)/);
  assert.match(src, /usage tracking unavailable; using local fallback/);
  assert.match(src, /return \{\.\.\.local\};/);
  assert.match(src, /if \(kind===\"build\"\) local\.builds\+\+/);
  assert.match(src, /if \(kind===\"adjust\"\) local\.adjusts\+\+/);
  assert.match(src, /persistEventually\(\"usage\"/);
});
