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
  // The values come from the brand's own logo artwork -- #00F5D3 on #221F1F --
  // not from a guess at "turquoise". The title band matching the logo's own
  // background is what lets the mark sit on it without a rectangle around it.
  assert.equal(fillOf(ov.getCell(1, 1)), 'FF221F1F', 'the title band is the brand black');
  assert.equal(fillOf(w1.getCell(4, 1)), 'FF007060', 'column headers are a deep shade of the brand hue');
  assert.equal(fillOf(w1.getCell(5, 1)), 'FF93F6E5', 'session bands are a brand turquoise tint');
  assert.equal(fillOf(w1.getCell(6, 1)), 'FFE9FDF9', 'body rows are the faintest tint');
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
    assert.equal(cell.font.color.argb, 'FF007060', `row ${r} link needs the link colour`);
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
  assert.equal(ov.getRow(1).height, 46, 'the title row grows to fit it');
});

test('the coaching the program opens with reaches the client', async () => {
  // The workbook carried the tables and dropped every word of reasoning in front
  // of them: why the week is shaped this way, how weeks 2 to 4 progress, and what
  // to remove first when the elbow complains. On run #143 that last paragraph is
  // the pair of contingencies the coach scored the block 9.1 for, and the athlete
  // it was written for never saw it.
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE);
  const ov = wb.getWorksheet('Overview');
  const column = [];
  for (let r = 1; r <= 40; r += 1) column.push(cellText(ov.getCell(r, 1)));
  const joined = column.join('\n');

  assert.ok(column.includes('HOW THIS BLOCK WORKS'), 'the section must exist');
  assert.match(joined, /Mon and Sat owning the two bent-arm priorities/, 'the session architecture');
  assert.match(joined, /Week 3 is the hardest week/, 'the progression logic');
  assert.match(joined, /medial-elbow ache follows straight-arm work/, 'the first elbow branch');
  assert.match(joined, /soreness instead follows bent-arm pulling/, 'and the second');
});

test('a program with no opening prose simply has no such section', async () => {
  const bare = ENGLISH.slice(ENGLISH.indexOf('START_WEEK1_TSV'));
  const { wb } = await renderParityWorkbook(bare, INTAKE);
  const ov = wb.getWorksheet('Overview');
  const column = [];
  for (let r = 1; r <= 40; r += 1) column.push(cellText(ov.getCell(r, 1)));
  assert.ok(!column.includes('HOW THIS BLOCK WORKS'), 'no heading over an empty section');
  assert.ok(column.includes('WEEKLY STRUCTURE'), 'and the rest of the sheet is unaffected');
});

test('nothing the program prescribes is missing from the workbook', async () => {
  // The narrative was lost for as long as this exporter has existed, and nobody
  // noticed because no test asked the question in general: does everything the
  // program says reach the file the client opens?
  //
  // Loads, rests and coaching notes must survive verbatim. Two shapes change on
  // purpose and are excluded by shape rather than by name: the [WARMUP] prefix is
  // stripped when a warm-up moves to its own sheet, and a warm-up whose drills are
  // one semicolon-joined protocol is split into a row per drill.
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE, ROOT, null, true);
  let haystack = '';
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => { haystack += `${cellText(cell)}\n`; });
    });
  }

  const missing = [];
  const seen = new Set();
  for (const line of ENGLISH.split('\n')) {
    const cells = line.split('\t');
    if (cells.length !== 9 || !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(cells[0])) continue;
    const isWarmup = /^\s*\[WARMUP\]/i.test(cells[1]);
    const check = (label, value) => {
      const v = String(value || '').trim();
      if (!v || seen.has(label + v)) return;
      seen.add(label + v);
      if (!haystack.includes(v)) missing.push(`${label}: ${v.slice(0, 70)}`);
    };
    check('load', cells[2]);
    check('rest', cells[5]);
    if (!isWarmup) { check('exercise', cells[1]); check('note', cells[7]); }
    // A split protocol keeps its drills, which is what matters; assert those.
    if (isWarmup && cells[7].includes(';')) {
      for (const part of cells[7].split(';').map((x) => x.trim()).filter(Boolean)) {
        const drill = part.replace(/\s*x\s*\d.*$/i, '').trim();
        if (drill.length > 6 && !haystack.toLowerCase().includes(drill.toLowerCase())) {
          missing.push(`warm-up drill: ${drill.slice(0, 60)}`);
        }
      }
    }
  }
  assert.deepEqual(missing, [], 'these are prescribed to the athlete and never shown to them');
});

test('every program in the corpus produces a workbook', async () => {
  // The exporter is the last thing between a finished program and the client, and
  // it had only ever been run against one program. A shape it throws on is a
  // build the athlete pays for and cannot open.
  const { CORPUS } = await import('../scripts/corpus.mjs');
  const failures = [];
  for (const [file, intake] of CORPUS) {
    const program = fs.readFileSync(path.join(here, 'fixtures', file), 'utf8');
    try {
      const { wb } = await renderParityWorkbook(program, intake, ROOT, null, true);
      assert.ok(wb.worksheets.length >= 6, `${file} produced ${wb.worksheets.length} sheets`);
    } catch (e) {
      failures.push(`${file}: ${e.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the sheets a client scrolls keep their column titles in view', async () => {
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE);
  for (const name of ['Warm-Up', 'Week 1', 'Week 2', 'Week 3', 'Week 4']) {
    const view = wb.getWorksheet(name).views[0];
    assert.equal(view.state, 'frozen', `${name} must freeze its header`);
    assert.ok(view.ySplit >= 1, `${name} must freeze below the header row`);
  }
});

test('no exercise in any program is left without a link', async () => {
  // "No missing hyperlinks", measured rather than assumed: every exercise cell in
  // every corpus program, on the week sheets and the warm-up sheet. Session bands
  // are section headers spanning the table, not exercises, and carry no link.
  const { CORPUS } = await import('../scripts/corpus.mjs');
  const BAND = /^(?:Session [A-Z]|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/;
  let checked = 0;
  const missing = [];

  for (const [file, intake] of CORPUS) {
    const program = fs.readFileSync(path.join(here, 'fixtures', file), 'utf8');
    const { wb } = await renderParityWorkbook(program, intake, ROOT, null, true);
    for (const name of ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Warm-Up']) {
      const ws = wb.getWorksheet(name);
      if (!ws) continue;
      const col = name === 'Warm-Up' ? 2 : 1;
      ws.eachRow({ includeEmpty: false }, (row, r) => {
        if (r < 5) return;                       // title, subtitle and header rows
        const cell = row.getCell(col);
        const value = cellText(cell).trim();
        if (!value || BAND.test(value)) return;
        checked += 1;
        if (!cell.hyperlink) missing.push(`${file} ${name} r${r}: ${value}`);
        else if (!/^https:\/\/www\.youtube\.com\//.test(String(cell.hyperlink))) {
          missing.push(`${file} ${name} r${r}: ${value} -> ${cell.hyperlink}`);
        }
      });
    }
  }
  assert.ok(checked > 1500, `expected the whole corpus, only checked ${checked}`);
  assert.deepEqual(missing, [], 'these exercises reach the client with nowhere to look');
});

test('the one cell the athlete writes in looks like a field', async () => {
  // The Log column was filled and ruled exactly like the seven cells they are
  // meant to read, so nothing said it was theirs.
  const { wb } = await renderParityWorkbook(ENGLISH, INTAKE, ROOT, null, true);
  const w1 = wb.getWorksheet('Week 1');
  const log = w1.getCell(6, 8);
  const body = w1.getCell(6, 1);
  assert.equal(log.fill.fgColor.argb, 'FFFFFFFF', 'the Log cell is white, not body fill');
  assert.notEqual(body.fill.fgColor.argb, 'FFFFFFFF');
  for (const side of ['top', 'bottom', 'left', 'right']) {
    assert.ok(log.border?.[side], `the Log cell needs a ${side} edge to read as a field`);
  }
  assert.equal(body.border?.bottom?.style, 'hair', 'body rows get a hairline to track across');
});
