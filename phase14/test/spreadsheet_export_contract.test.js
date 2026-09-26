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
];

test('production start always runs launch:prepare before the server', () => {
  assert.match(pkg.scripts.start, /npm run phase15:build\s*&&\s*npm run launch:prepare\s*&&\s*node pass_preflight\.js/);
});

test('launch runtime pins approved spreadsheet exporter after legacy parser and before app initialization', () => {
  assert.match(launch, /const legacySpreadsheetTag = '<script src="spreadsheet\.js"><\/script>';/);
  assert.match(launch, /const paritySpreadsheetTag = '<script src="spreadsheet-parity\.js"><\/script>';/);
  assert.match(launch, /const appTag = '<script src="app\.js"><\/script>';/);
  assert.match(launch, /html = html\.replace\(legacySpreadsheetTag, `\$\{legacySpreadsheetTag\}\\n  \$\{paritySpreadsheetTag\}`\)/);
  assert.match(launch, /legacyPos >= 0 && parityPos > legacyPos && appPos > parityPos/);
  assert.match(launch, /generationProgressPos > intakePolishPos/);
});

test('approved weekly spreadsheet contract is exactly 8 columns, ending in Log, and never exposes Day as a data column', () => {
  const match = parity.match(/const headers=\[([^\]]+)\];/);
  assert.ok(match, 'renderWeek approved headers array not found');
  const headers = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(headers, APPROVED_WEEK_HEADERS);
  assert.equal(headers.includes('Day'), false);
});

test('approved exporter renders day/session labels as section bands before the 8-column table', () => {
  const renderWeekStart = parity.indexOf('function renderWeek(');
  const renderWeekEnd = parity.indexOf('async function buildParitySpreadsheet', renderWeekStart);
  assert.ok(renderWeekStart >= 0 && renderWeekEnd > renderWeekStart, 'renderWeek function not found');
  const renderWeek = parity.slice(renderWeekStart, renderWeekEnd);

  // Assert the band as it is actually built. The previous form referred to an
  // implementation that no longer exists and only matched because renderWeekEnd
  // resolved to -1, so the slice ran past the end of the function.
  const sessionBand = renderWeek.indexOf('band.value=sessionLabel(intake,session,i)');
  const headers = renderWeek.indexOf("const headers=['Exercise','Load / Target'");
  assert.ok(sessionBand >= 0, 'session/day section band not found');
  assert.ok(headers < sessionBand, 'the header is written once, before the per-session bands');
  assert.match(renderWeek, /ws\.mergeCells\(row,1,row,8\)/, 'the band spans the 8-column table');
  assert.match(renderWeek, /const ss=sessions\(week\)/);
});

test('flexible schedules export Session A/B rather than invented weekdays', async () => {
  // Was a grep for the exact expression, which broke the moment "Session" had to
  // become translatable. Render it instead: what matters is the label the client
  // reads, not how it is spelled in the source.
  const { renderParityWorkbook, cellText } = await import('./helpers/render_client_workbook.mjs');
  const fsMod = await import('node:fs');
  const program = fsMod.readFileSync(new URL('../run143-advanced-calisthenics-for-coach.txt', import.meta.url), 'utf8');
  const intake = JSON.parse(fsMod.readFileSync(new URL('./fixtures/run138_advanced_calisthenics_intake.json', import.meta.url), 'utf8'));

  const { wb } = await renderParityWorkbook(program, intake);
  const labels = [];
  const wu = wb.getWorksheet('Warm-Up');
  for (let r = 5; r <= 20; r += 1) { const v = cellText(wu.getCell(r, 1)); if (v) labels.push(v); }
  assert.ok(labels.includes('Session A') && labels.includes('Session B'),
    `flexible intake must export lettered sessions, got ${JSON.stringify(labels)}`);
  assert.ok(!labels.some((v) => /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(v)),
    'a flexible athlete was never promised a particular weekday');
});

test('approved exporter remains the final client spreadsheet implementation', () => {
  assert.match(parity, /window\.buildStrengthSpreadsheet=buildParitySpreadsheet/);
  assert.match(parity, /Overview/);
  assert.match(parity, /Warm-Up/);
  assert.match(parity, /Week \$\{w\.week\}/);
});
