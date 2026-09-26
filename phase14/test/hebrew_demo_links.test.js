// A Hebrew program's links have to reach the English demonstration.
//
// The exercise name is the demo hyperlink, and it was sending Hebrew straight
// into a YouTube query: "פיסטול סקוואט" returned Hebrew-language results rather
// than a Pistol Squat demonstration, and for most movements nothing useful at all.
//
// Two things were wrong. LOCALIZATION_RULES asked for the English canonical in
// parentheses only on a movement's FIRST appearance in a week, so every row after
// it lost the one thing the link resolver can read. And the browser's
// Hebrew->English fallback table had drifted to 16 of the engine's 29 entries --
// Pistol Squat among the missing ones.
//
// Worth knowing when reading this: normalizeExerciseName strips everything that
// is not a-z0-9, so every Hebrew name normalizes to the empty string. Hebrew can
// only be resolved before normalization, by the parenthetical or by the table.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HEBREW_EXERCISE_MAP } from '../engine/exercise_dictionary.js';
import { renderParityWorkbook } from './helpers/render_client_workbook.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const HEBREW_CHAR = /[֐-׿]/;

function loadResolver() {
  const sandbox = { console };
  sandbox.window = sandbox; sandbox.self = sandbox;
  sandbox.document = { getElementById: () => null };
  sandbox.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(path.join(
      ROOT, 'public/data', String(url).includes('overrides') ? 'exercise_demo_overrides.json' : 'exercise_demos.json',
    ), 'utf8')),
  });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/exerciseDemos.js'), 'utf8'), sandbox);
  return sandbox.window.ExerciseDemos;
}

test('the browser table covers every Hebrew name the engine knows', async () => {
  // The drift is the defect. The engine's table is authoritative; this one is the
  // copy the client's links depend on, and nothing was keeping them in step.
  const demos = loadResolver();
  await demos.load();
  const missing = [];
  for (const [hebrew, english] of HEBREW_EXERCISE_MAP) {
    const resolved = demos.resolveExerciseDemo(hebrew);
    const url = decodeURIComponent(String(resolved?.url || ''));
    if (HEBREW_CHAR.test(url)) missing.push(`${hebrew} (expected ${english})`);
  }
  assert.deepEqual(missing, [], 'these resolve to a Hebrew query rather than the English demo');
});

test('the English canonical in parentheses is what actually guarantees the link', async () => {
  const demos = loadResolver();
  await demos.load();
  // A movement in no table at all still links correctly when the cell carries it.
  const resolved = demos.resolveExerciseDemo('תרגיל שלא קיים בשום טבלה (Zercher Squat)');
  const url = decodeURIComponent(String(resolved?.url || ''));
  assert.doesNotMatch(url, HEBREW_CHAR, 'the parenthetical is read before normalization');
  assert.match(url, /Zercher Squat/);
});

test('a bare Hebrew name still resolves through the fallback table', async () => {
  const demos = loadResolver();
  await demos.load();
  // Programs translated under the old rule carry bare Hebrew on most rows.
  for (const [name, english] of [['פיסטול סקוואט', 'Pistol Squat'], ['חתירה הפוכה', 'Inverted Row']]) {
    const url = decodeURIComponent(String(demos.resolveExerciseDemo(name)?.url || ''));
    assert.doesNotMatch(url, HEBREW_CHAR, `${name} must not become a Hebrew query`);
    assert.ok(url.includes(english) || url.includes('watch?v='), `${name} -> ${url}`);
  }
});

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const hebrewProgram = (names) => [1, 2, 3, 4].map((n) => [
  `START_WEEK${n}_TSV`, HEAD,
  ...names.map((nm) => `Mon\t${nm}\tמשקל גוף\t3\t5\t120s\t7\tביצוע נקי ומבוקר.\t`),
  `END_WEEK${n}_TSV`,
].join('\n')).join('\n\n');

const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

async function assertNoHebrewLinks(program, withDemoLibrary) {
  const { wb } = await renderParityWorkbook(program, INTAKE, ROOT, null, withDemoLibrary);

  let checked = 0;
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= 30; r += 1) {
      for (const col of [1, 2]) {
        const cell = ws.getCell(r, col);
        if (!cell.hyperlink) continue;
        checked += 1;
        const url = decodeURIComponent(String(cell.hyperlink));
        assert.doesNotMatch(url, HEBREW_CHAR,
          `${ws.name} r${r}c${col} links to a Hebrew search: ${url}`);
      }
    }
  }
  assert.ok(checked >= 5, `expected the Hebrew workbook to carry links, found ${checked}`);
}

test('no link in a Hebrew workbook points at a Hebrew search', async () => {
  // The production path: the demo library is loaded, so bare Hebrew from a
  // program translated under the old rule still resolves through the table.
  await assertNoHebrewLinks(hebrewProgram([
    'מתח (Pull-up)', 'מאסל-אפ בטבעות (Ring Muscle-up)', 'פיסטול סקוואט', 'חתירה הפוכה', 'פלאנק',
  ]), true);
});

test('links stay English even if the demo library never loads', async () => {
  // buildParitySpreadsheet catches a demo-library load failure and carries on, and
  // that branch used to put the raw name into the query. With the current
  // localization rule -- English canonical on every row -- the English is in the
  // cell itself, so the degraded path is still correct without any table at all.
  await assertNoHebrewLinks(hebrewProgram([
    'מתח (Pull-up)', 'פיסטול סקוואט (Pistol Squat)', 'חתירה הפוכה (Inverted Row)', 'פלאנק (Plank)',
    'מאסל-אפ בטבעות (Ring Muscle-up)',
  ]), false);
});

test('the localization rule asks for the English name on every row', async () => {
  // The rule is the mechanism; the tables above are only the safety net. It used
  // to say "the first time it appears in a week, then just Hebrew after".
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /ALWAYS keep the English canonical name in parentheses/);
  assert.match(server, /on EVERY row, not only the first appearance in a week/);
  assert.doesNotMatch(server, /the first time it appears in a week, then just Hebrew after/);
});
