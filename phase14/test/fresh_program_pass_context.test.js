import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate = fs.readFileSync(new URL('../public/program-pass-gate.js', import.meta.url), 'utf8');

test('fresh Program Pass preserves intake draft but overrides stale personal token', () => {
  assert.match(gate, /body\.pass_code\s*=\s*freshPass/);
  assert.match(gate, /delete body\.token/);
  assert.match(gate, /localStorage\.removeItem\("coaching_token"\)/);
  assert.doesNotMatch(gate, /removeItem\("coaching_intake_draft_v1"\)/);
});
