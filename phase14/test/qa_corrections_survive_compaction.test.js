// A fresh regeneration carries "=== ACCUMULATED QA CORRECTIONS ===" after the
// base prompt, and the compact OpenAI prompt -- rebuilt from the intake --
// dropped it. The model was asked again with no word about what had failed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');
const start = runtime.indexOf('function qaCorrectionsFrom(src) {');
const end = runtime.indexOf('\n}\n', start) + 2;
const qaCorrectionsFrom = new Function(`${runtime.slice(start, end)}; return qaCorrectionsFrom;`)();

test('the compact prompt keeps the corrections a regeneration carries', () => {
  assert.match(runtime, /\]\.join\("\\n"\)[^;]*\+ qaCorrectionsFrom\(src\); \/\/ QA-CORRECTIONS-SURVIVE-COMPACTION/);
  const src = 'A NEW CLIENT has submitted...\n=== CLIENT INTAKE ===\n{}\n\n=== ACCUMULATED QA CORRECTIONS ===\nWeek 4 runs twice; keep three runs.';
  assert.equal(qaCorrectionsFrom(src), '\n\n=== ACCUMULATED QA CORRECTIONS ===\nWeek 4 runs twice; keep three runs.');
  assert.equal(qaCorrectionsFrom('A NEW CLIENT has submitted... no corrections'), '');
});

test('long corrections are bounded to the newest, under the prompt ceiling', () => {
  const src = `=== ACCUMULATED QA CORRECTIONS ===\n${'old '.repeat(5000)}NEWEST`;
  const out = qaCorrectionsFrom(src);
  assert.ok(out.length < 8200);
  assert.match(out, /earlier corrections omitted/);
  assert.match(out, /NEWEST$/);
});
