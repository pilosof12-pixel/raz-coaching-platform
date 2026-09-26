// The workbook the client actually opens.
//
// Every existing test on this exporter greps the source for a string, which
// proves the literal is in the file and nothing about the workbook. These render
// the real thing through ExcelJS and read the cells back, which is how the
// missing Hebrew support stayed invisible: spreadsheet.js still carries
// `rightToLeft: isHebrew`, the premium exporter replaced it without carrying that
// across, and a source grep of the legacy file kept passing while every Hebrew
// client got a left-to-right workbook.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderParityWorkbook, cellText } from './helpers/render_client_workbook.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));
const ENGLISH = fs.readFileSync(path.join(ROOT, 'run143-advanced-calisthenics-for-coach.txt'), 'utf8');
// A Hebrew program is the same program with its client-facing strings translated;
// the structural tokens stay English, which is what LOCALIZATION_RULES requires.
const HEBREW = ENGLISH.replace(/Strict on rings with false grip\./g, 'אחיזה מלאה בטבעות.');

const fillOf = (cell) => (cell.fill && cell.fill.fgColor ? cell.fill.fgColor.argb : null);

test('an English program produces a left-to-right workbook', async () => {
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE);
  // Array.from, not .map: the workbook is built inside a VM realm, so its arrays
  // have that realm's prototype and strict deepEqual refuses them.
  assert.deepEqual(Array.from(wb.worksheets, (w) => w.name),
    ['Overview', 'Warm-Up', 'Week 1', 'Week 2', 'Week 3', 'Week 4']);
  for (const ws of wb.worksheets) {
    assert.ok(!ws.views?.[0]?.rightToLeft, `${ws.name} must not be right-to-left`);
  }
  const ov = wb.getWorksheet('Overview');
  assert.equal(ov.getCell(4, 1).alignment.readingOrder, 'ltr');
  assert.equal(cellText(ov.getCell(4, 1)), 'ATHLETE PROFILE');
});

test('a Hebrew program produces a right-to-left workbook', async () => {
  const { wb } = await renderParityWorkbook(HEBREW, INTAKE);
  for (const ws of wb.worksheets) {
    assert.equal(ws.views?.[0]?.rightToLeft, true, `${ws.name} must be right-to-left`);
  }
  const ov = wb.getWorksheet('Overview');
  // rightToLeft flips the columns; readingOrder is what lays out the text inside
  // a cell that mixes Hebrew prose with an English exercise name or a load.
  assert.equal(ov.getCell(4, 1).alignment.readingOrder, 'rtl');
  assert.equal(cellText(ov.getCell(4, 1)), 'פרופיל המתאמן');
  assert.equal(cellText(ov.getCell(2, 1)), 'בלוק אימון של 4 שבועות');
});

test('the language follows the program on screen, not the stored intake', async () => {
  // The client can switch an existing program's language after the build, so the
  // export has to match what they are looking at. app.js decides the same way.
  const englishIntake = { ...INTAKE, language: 'en' };
  const { wb } = await renderParityWorkbook(HEBREW, englishIntake);
  assert.equal(wb.getWorksheet('Overview').views[0].rightToLeft, true,
    'a Hebrew program exports as Hebrew even when the intake still says English');
});

test('Hebrew translates the prose and leaves the structure in English', async () => {
  const { wb } = await renderParityWorkbook(HEBREW, INTAKE);
  const ov = wb.getWorksheet('Overview');
  const w1 = wb.getWorksheet('Week 1');

  // Prose this exporter writes itself is translated.
  const colA = [];
  for (let r = 1; r <= 30; r += 1) colA.push(cellText(ov.getCell(r, 1)));
  assert.ok(colA.includes('מבנה השבוע'), 'weekly structure heading');
  assert.ok(colA.includes('כללי התוכנית'), 'program rules heading');
  assert.ok(colA.some((v) => v.startsWith('• ') && /[֐-׿]/.test(v)), 'rules themselves');
  assert.ok(colA.includes('גיל'), 'profile labels');

  // Structural tokens stay English, exactly as they do in the program TSV, so the
  // workbook and the program the client already read agree with each other.
  assert.deepEqual([1, 2, 3, 4].map((c) => cellText(w1.getCell(4, c))),
    ['Exercise', 'Load / Target', 'Sets', 'Reps / Duration']);
  assert.deepEqual(Array.from(wb.worksheets, (w) => w.name),
    ['Overview', 'Warm-Up', 'Week 1', 'Week 2', 'Week 3', 'Week 4']);
});

test('the workbook is black and turquoise', async () => {
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE);
  const ov = wb.getWorksheet('Overview');
  const w1 = wb.getWorksheet('Week 1');
  assert.equal(fillOf(ov.getCell(1, 1)), 'FF000000', 'the title band is black');
  assert.equal(fillOf(w1.getCell(4, 1)), 'FF0E7C6B', 'column headers are deep turquoise');
  assert.equal(fillOf(w1.getCell(5, 1)), 'FFB8EDE4', 'session bands are turquoise');
  assert.equal(fillOf(w1.getCell(6, 1)), 'FFE8F8F5', 'body rows are a turquoise tint');
});

test('every exercise name is a link and looks like one', async () => {
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE);
  const w1 = wb.getWorksheet('Week 1');
  let linked = 0;
  for (let r = 5; r <= 40; r += 1) {
    const cell = w1.getCell(r, 1);
    if (!cell.hyperlink) continue;
    linked += 1;
    assert.match(String(cell.hyperlink), /^https:\/\/www\.youtube\.com\//);
    // Clickable is not enough: a name rendered in body text tells the client
    // nothing, and pressing the exercise title is how they reach the demo.
    assert.equal(cell.font.color.argb, 'FF0E7C6B', `row ${r} link needs the link colour`);
  }
  assert.ok(linked >= 10, `expected the week's exercises to be linked, found ${linked}`);
});

test('the client sheets carry no internal vocabulary', async () => {
  // The Overview subtitle read "EXACT LIVE PRODUCTION ACCEPTANCE — 4-WEEK BLOCK"
  // and the Week sheets described our own data model. That is acceptance-harness
  // language on the first line of the file the client keeps.
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE);
  const banned = /exact live|production acceptance|approved (?:client )?template|approved 11-column|not a permanent data column/i;
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= 12; r += 1) {
      for (let c = 1; c <= 9; c += 1) {
        const value = cellText(ws.getCell(r, c));
        assert.doesNotMatch(value, banned, `${ws.name} r${r}c${c}: ${value}`);
      }
    }
  }
});

test('the weekly structure section says what each session is for', async () => {
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE);
  const ov = wb.getWorksheet('Overview');
  let headerRow = 0;
  for (let r = 1; r <= 40; r += 1) if (cellText(ov.getCell(r, 1)) === 'WEEKLY STRUCTURE') headerRow = r;
  assert.ok(headerRow, 'the section must exist');
  assert.deepEqual([1, 2, 3].map((c) => cellText(ov.getCell(headerRow + 1, c))),
    ['SESSION', 'TYPE', 'COACHING PURPOSE']);
  assert.ok(cellText(ov.getCell(headerRow + 2, 3)).length > 20,
    'the first session needs a stated purpose, not an empty cell');
});

test('the logo is optional and does not disturb the sheet when absent', async () => {
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE);
  const ov = wb.getWorksheet('Overview');
  assert.equal(ov.getImages().length, 0);
  assert.equal(cellText(ov.getCell(1, 1)), 'RAZ — PERFORMANCE PROGRAM',
    'a missing brand asset must never cost the client their title row');
});

test('a brand logo is embedded when one is supplied', async () => {
  const logo = path.join(here, 'fixtures/brand-logo-test.png');
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE, ROOT, logo);
  const ov = wb.getWorksheet('Overview');
  assert.equal(ov.getImages().length, 1, 'public/data/brand-logo.png is picked up when present');
  assert.equal(ov.getRow(1).height, 44, 'the title row grows to fit it');
});
