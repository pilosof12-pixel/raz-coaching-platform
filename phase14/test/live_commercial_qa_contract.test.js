import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'live-commercial-qa.html'), 'utf8');
const js = fs.readFileSync(path.join(publicDir, 'live-commercial-qa.js'), 'utf8');

test('commercial QA helper stays CSP-safe and credential-free', () => {
  assert.match(html, /<script src="\/live-commercial-qa\.js" defer><\/script>/);
  assert.doesNotMatch(html, /<script>(?:.|\n)*?<\/script>/);
  assert.doesNotMatch(html + js, /[a-f0-9]{32}/i, 'QA helper must not embed Program Pass or personal-code credentials');
});

test('commercial QA helper uses the deployed Program Pass API contracts', () => {
  assert.match(js, /\/api\/program-pass-status/);
  assert.match(js, /method: 'POST'/);
  assert.match(js, /\/api\/adjust/);
  assert.match(js, /JSON\.stringify\(\{ token, request \}\)/);
  assert.match(js, /\/api\/set-language/);
  assert.match(js, /JSON\.stringify\(\{ token, language \}\)/);
  assert.match(js, /\/api\/client-data/);
  assert.match(js, /method: 'DELETE'/);
});

test('commercial QA helper covers the remaining adjustment and export matrix checks', () => {
  assert.match(html, /Force safe failed adjustment/);
  assert.match(html, /Check 7th-adjustment rejection/);
  assert.match(html, /Switch to Hebrew/);
  assert.match(html, /Switch to English/);
  assert.match(html, /Export latest program spreadsheet/);
  assert.match(html, /Delete coaching data and verify entitlement survives/);
  assert.match(html, /exceljs\.lib\.js/);
  assert.match(html, /spreadsheet\.js/);
  assert.match(js, /adjustments_used/);
  assert.match(js, /adjustments_remaining/);
  assert.match(js, /buildStrengthSpreadsheet/);
});
