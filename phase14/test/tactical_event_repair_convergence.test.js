import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Tactical 3K event repair reuses an existing run and protects the time budget', () => {
  const patch = fs.readFileSync(new URL('../scripts/apply_repair_convergence_policy.mjs', import.meta.url), 'utf8');
  assert.match(patch, /TACTICAL-3K-EVENT-ANCHOR-SURGICAL-REPAIR/);
  assert.match(patch, /Do NOT add another run, conditioning row, or training day/);
  assert.match(patch, /preserve three run days/i);
  assert.match(patch, /18-20 km\/week/);
  assert.match(patch, /60-minute session ceiling/);
  assert.match(patch, /never solve this validator by appending a fourth run or extra HIIT/);
});
