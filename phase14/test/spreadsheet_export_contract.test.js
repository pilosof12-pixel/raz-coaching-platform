import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const launch = fs.readFileSync(new URL('../scripts/apply_launch_runtime.mjs', import.meta.url), 'utf8');
const parity = fs.readFileSync(new URL('../public/spreadsheet-parity.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const APPROVED_WEEK_HEADERS = [
  'Exercise',
  'Load / Target',
  'Sets',
  'Reps / Duration',
  'Rest',
  'Effort',
  'Coaching Note',
  'Log',
  'Video',
  'Status',
  'Done',
];

test('production start always runs launch:prepare before the server', () => {
  assert.match(pkg.scripts.start, /npm run phase15:build\s*&&\s*npm run launch:prepare\s*&&\s*node pass_preflight\.js/);
});

test('launch runtime pins approved spreadsheet exporter after legacy parser and before app initialization', () => {
  assert.match(launch, /const legacySpreadsheetTag = '<script src="spreadsheet\.js"><\/script>';/);
  assert.match(launch, /const paritySpreadsheetTag = '<script src="spreadsheet-parity\.js"><\/script>';/);
  assert.match(launch, /const appTag = '<script src="app\.js"><\/script>';/);
  assert.match(launch, /parityPos > legacyPos && appPos > parityPos/);
  assert.match(launch, /approved spreadsheet exporter must load after spreadsheet\.js and before app\.js/);
});

test('approved weekly spreadsheet contract is exactly 11 columns and never exposes Day as a data column', () => {
  const match = parity.match(/const headers=\[([^\]]+)\];/);
  assert.ok(match, 'renderWeek approved headers array not found');
  const headers = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(headers, APPROVED_WEEK_HEADERS);
  assert.equal(headers.includes('Day'), false);
});

test('approved exporter renders day/session labels as section bands before the 11-column table', () => {
  const renderWeekStart = parity.indexOf('function renderWeek(ws, intake, week)');
  const renderWeekEnd = parity.indexOf('async function buildParitySpreadsheet', renderWeekStart);
  assert.ok(renderWeekStart >= 0 && renderWeekEnd > renderWeekStart, 'renderWeek function not found');
  const renderWeek = parity.slice(renderWeekStart, renderWeekEnd);

  const sessionBand = renderWeek.indexOf('mergeTitle(ws,row,11,`${sessionLabel(intake,s,i).toUpperCase()}');
  const headers = renderWeek.indexOf("const headers=['Exercise','Load / Target'");
  assert.ok(sessionBand >= 0, 'session/day section band not found');
  assert.ok(headers > sessionBand, '11-column header must come after the section band');
  assert.match(renderWeek, /const ss=sessions\(week\)/);
});

test('flexible schedules export Session A/B rather than invented weekdays', () => {
  assert.match(parity, /return flexible \? `Session \$\{String\.fromCharCode\(65\+i\)\}`/);
});

test('approved exporter remains the final client spreadsheet implementation', () => {
  assert.match(parity, /window\.buildStrengthSpreadsheet=buildParitySpreadsheet/);
  assert.match(parity, /Overview/);
  assert.match(parity, /Warm-Up/);
  assert.match(parity, /Week \$\{w\.week\}/);
});
