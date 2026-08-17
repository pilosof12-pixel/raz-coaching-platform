import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = fs.readFileSync(path.join(here, '..', 'server.js'), 'utf8');

test('privacyScrub keeps formula QA server-side and never appends an internal marker to the client program', () => {
  const start = server.indexOf('function privacyScrub(text, intake) {');
  const end = server.indexOf('// ---------- App ----------', start);
  assert.ok(start >= 0 && end > start);
  const block = server.slice(start, end);
  assert.match(block, /stripAndFlagFormulaViolations\(text, intake\)/);
  assert.match(block, /FORMULA-QA-SERVER-SIDE-ONLY/);
  assert.doesNotMatch(block, /out\s*\+=\s*[\"']\\n<!--\s*QA_FORMULA_VIOLATION_COUNT/i);
});
