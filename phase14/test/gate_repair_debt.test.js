// A gate may not ship without an answer.
//
// Fifty-five paid avatar builds produced twenty-eight programs. Thirteen of the
// failures were dead builds: a flag QA could not clear, asked of the model four
// times, four times refused, and nothing saved. In twelve of the thirteen the
// killing flag was already there on an earlier attempt, so three of the four
// generations were paid for and bought nothing.
//
// Every one of those gates was found by a paid run. They are all the same
// shape: a rule that can refuse a program and no deterministic way to answer
// it. This test makes that shape visible before a run finds it. A new blocking
// code must either have a repair the production chain calls, be exercised by a
// test or a stress perturbation, or be written down in the registry with a
// reason. It may not simply appear.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);

function ledger() {
  execFileSync(process.execPath, ['scripts/audit_gate_repair_ledger.mjs'], {
    cwd: new URL('.', root).pathname, stdio: 'ignore',
  });
  return JSON.parse(fs.readFileSync(new URL('docs/qa/gate_repair_ledger.json', root), 'utf8'));
}

const registry = JSON.parse(fs.readFileSync(new URL('docs/qa/gate_repair_registry.json', root), 'utf8'));

test('no blocking code is unrepaired, unexercised and unaccounted for', () => {
  const naked = ledger().filter((r) => !r.wired.length && !r.tested && !r.stressed);
  const unlisted = naked.filter((r) => !registry.accepted[r.code]);
  assert.deepEqual(unlisted.map((r) => r.code), [],
    'A new gate can refuse a program with no way to answer it. Give it a deterministic repair, '
    + 'exercise it in the stress suite, or add it to docs/qa/gate_repair_registry.json with a reason.');
});

test('the registry does not outlive the debt it records', () => {
  // A code that has since been repaired or exercised should leave the registry,
  // so the list is what is still owed rather than what once was.
  const all = ledger();
  const byCode = new Map(all.map((r) => [r.code, r]));
  const stale = Object.keys(registry.accepted).filter((code) => {
    const r = byCode.get(code);
    return r && (r.wired.length || r.tested || r.stressed);
  });
  assert.deepEqual(stale, [], 'these codes now have an answer and should be removed from the registry');
});

test('every code that has killed a paid build can now be answered', () => {
  // The thirteen from the acceptance evidence. A code here with no repair and
  // no coverage is not a risk, it is a defect we have already paid for.
  const all = ledger();
  const killers = all.filter((r) => r.killedLive);
  assert.ok(killers.length >= 13, `expected the live killers to be recognised, found ${killers.length}`);
  const unanswered = killers.filter((r) => !r.wired.length && !r.tested && !r.stressed);
  assert.deepEqual(unanswered.map((r) => r.code), []);
});
