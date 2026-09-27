// The v24 client-spreadsheet contract.
//
// These assertions used to grep public/spreadsheet.js. That file still exists and
// still exports a builder, but spreadsheet-parity.js overrides
// window.buildStrengthSpreadsheet after it loads, so nothing in it has reached a
// client in a long time. Three of these tests had been failing for as long as
// anyone has a record of, and it did not matter, because they described a file
// that no longer ships -- while the shipped file genuinely lacked two of the three
// things they were asking for.
//
// They now hold the same contract against the exporter that actually runs, and
// render the workbook rather than grepping for a literal, because a grep is what
// let the Hebrew support sit in dead code with a passing test over it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderParityWorkbook, cellText } from './helpers/render_client_workbook.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));
const PROGRAM = fs.readFileSync(path.join(ROOT, 'run143-advanced-calisthenics-for-coach.txt'), 'utf8');

test('spreadsheet keeps ambiguous rep ranges as text', async () => {
  // "8-10" is what a spreadsheet reads as the 8th of October. ExcelJS writes a JS
  // string as a string-typed cell so Excel does not re-parse it on open, but a
  // General-format cell is fair game the moment the athlete edits it or the file
  // is imported by Sheets or LibreOffice. The legacy exporter set the text format
  // on every dose cell; the premium one that replaced it did not, and the corpus
  // carries 45 of these.
  const { CORPUS } = await import('../scripts/corpus.mjs');
  const entry = CORPUS.find(([file]) => fs.readFileSync(path.join(here, 'fixtures', file), 'utf8').includes('\t8-10\t'));
  assert.ok(entry, 'no fixture with an ambiguous range to check');

  const program = fs.readFileSync(path.join(here, 'fixtures', entry[0]), 'utf8');
  const { wb } = await renderParityWorkbook(program, entry[1], ROOT, null, true);

  let found = 0;
  for (const name of ['Week 1', 'Week 2', 'Week 3', 'Week 4']) {
    const ws = wb.getWorksheet(name);
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (!/^\d{1,2}\s*-\s*\d{1,2}$/.test(cellText(cell))) return;
        found += 1;
        assert.equal(cell.numFmt, '@', `${name}: "${cellText(cell)}" is not formatted as text`);
        assert.equal(typeof cell.value, 'string', `${name}: "${cellText(cell)}" is not a string`);
      });
    });
  }
  assert.ok(found > 0, 'expected at least one ambiguous range in the rendered workbook');
});

test('spreadsheet includes client program context without internal scores', async () => {
  const { wb } = await renderParityWorkbook(PROGRAM, INTAKE, ROOT, null, true);
  const overview = wb.getWorksheet('Overview');
  const labels = [];
  for (let r = 1; r <= 40; r += 1) labels.push(cellText(overview.getCell(r, 1)));

  for (const label of ['Primary goals', 'Training frequency', 'Equipment', 'Pain / injury']) {
    assert.ok(labels.includes(label), `the client's own context is missing: ${label}`);
  }
  // Concurrent sport is conditional, and rightly so -- this athlete plays none,
  // and a row reading "None reported" is noise. Assert the condition instead.
  assert.ok(!labels.includes('Concurrent sport'), 'no sport in this intake, so no row');
  const { wb: withSport } = await renderParityWorkbook(
    PROGRAM, { ...INTAKE, sport: 'Brazilian jiu-jitsu, twice a week' }, ROOT, null, true,
  );
  const sportLabels = [];
  for (let r = 1; r <= 40; r += 1) sportLabels.push(cellText(withSport.getWorksheet('Overview').getCell(r, 1)));
  assert.ok(sportLabels.includes('Concurrent sport'), 'an athlete who plays a sport is told the block accounts for it');

  // And nothing from our side of the wall. This sheet has carried "EXACT LIVE
  // PRODUCTION ACCEPTANCE" and an "approved 11-column template" before now.
  let all = '';
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => { all += `${cellText(cell)}\n`; });
    });
  }
  for (const banned of [/\bQA\b/, /acceptance/i, /\bscore\b/i, /rubric/i, /\[REVIEW\]/, /validator/i, /severity/i]) {
    assert.doesNotMatch(all, banned, `internal vocabulary reached the client: ${banned}`);
  }
});

test('spreadsheet supports Hebrew RTL', async () => {
  // This is the assertion that mattered most and checked least: it passed against
  // spreadsheet.js, whose `rightToLeft: isHebrew` has not run in a long time,
  // while every Hebrew client opened a left-to-right workbook.
  const hebrew = PROGRAM.replace(/Strict on rings with false grip\./g, 'אחיזה מלאה בטבעות.');
  const { wb } = await renderParityWorkbook(hebrew, INTAKE, ROOT, null, true);
  for (const ws of wb.worksheets) {
    assert.equal(ws.views?.[0]?.rightToLeft, true, `${ws.name} must be right-to-left`);
  }
  assert.equal(wb.getWorksheet('Overview').getCell(4, 1).alignment.readingOrder, 'rtl');

  const { wb: english } = await renderParityWorkbook(PROGRAM, INTAKE, ROOT, null, true);
  for (const ws of english.worksheets) {
    assert.ok(!ws.views?.[0]?.rightToLeft, `${ws.name} must stay left-to-right for an English program`);
  }
});
