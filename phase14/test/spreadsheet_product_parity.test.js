import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const parity = fs.readFileSync(new URL('../public/spreadsheet-parity.js', import.meta.url), 'utf8');
const launch = fs.readFileSync(new URL('../scripts/apply_launch_runtime.mjs', import.meta.url), 'utf8');

test('client spreadsheet uses the canonical six-tab Youth gymnastics structure', () => {
  assert.match(parity, /addWorksheet\('Overview'\)/);
  assert.match(parity, /addWorksheet\('Warm-Up'\)/);
  assert.match(parity, /addWorksheet\(`Week \$\{w\.week\}`\)/);
  assert.doesNotMatch(parity, /addWorksheet\(['"]README['"]\)/);
  assert.doesNotMatch(parity, /Strength Block - Week/);
});

test('week sheets preserve the approved 8-column client coaching layout', () => {
  for (const header of [
    'Exercise','Load / Target','Sets','Reps / Duration','Rest','Effort',
    'Coaching Note','Log'
  ]) assert.ok(parity.includes(`'${header}'`), header);
});

test('overview and warm-up are first-class client sheets rather than README prose', () => {
  for (const text of ['ATHLETE PROFILE','WEEKLY STRUCTURE','COACHING PURPOSE','PROGRAM RULES']) assert.ok(parity.includes(text), text);
  // The warm-up sheet's real columns. The previous list named an older layout
  // and passed only because those words happened to appear elsewhere in the file.
  for (const text of ['SESSION / DAY','EXERCISE','SETS','REPS / DURATION','REST','COACHING NOTE']) {
    assert.ok(parity.includes(`'${text}'`), text);
  }
});

test('every exercise has a usable hyperlink path even without a curated direct demo', () => {
  assert.match(parity, /resolveExerciseDemo\(name\)/);
  assert.match(parity, /youtube\.com\/results\?search_query=/);
  // The link lives on the exercise name in both sheets, not in a Video column.
  assert.match(parity, /setHyperlink\(ws\.getRow\(row\)\.getCell\(1\),r\.exercise,r\.exercise,false\)/);
  assert.match(parity, /setHyperlink\(ws\.getRow\(row\)\.getCell\(2\),item\.exercise,item\.exercise,false\)/);
});

test('premium parity exporter overrides the legacy exporter before app initialization', () => {
  assert.match(parity, /window\.buildStrengthSpreadsheet=buildParitySpreadsheet/);
  assert.match(launch, /const legacySpreadsheetTag = '<script src="spreadsheet\.js"><\/script>';/);
  assert.match(launch, /const paritySpreadsheetTag = '<script src="spreadsheet-parity\.js"><\/script>';/);
  assert.match(launch, /const appTag = '<script src="app\.js"><\/script>';/);
  assert.match(launch, /parityPos > legacyPos && appPos > parityPos/);
});
