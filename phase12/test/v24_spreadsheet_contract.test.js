import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sheet = fs.readFileSync(path.join(__dirname, '..', 'public', 'spreadsheet.js'), 'utf8');

test('spreadsheet keeps ambiguous rep ranges as text', () => {
  assert.match(sheet, /cell\.numFmt = "@"/);
  assert.match(sheet, /setTextCell/);
});

test('spreadsheet includes client program context without internal scores', () => {
  assert.match(sheet, /Primary goals:/);
  assert.match(sheet, /Strength sessions\/week:/);
  assert.match(sheet, /Concurrent sport:/);
});

test('spreadsheet supports Hebrew RTL', () => {
  assert.match(sheet, /rightToLeft: isHebrew/);
  assert.match(sheet, /readingOrder: isHebrew \? "rtl" : "ltr"/);
});
