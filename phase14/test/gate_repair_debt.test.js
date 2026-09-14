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
  // Only gates that can actually refuse a build. A rule whose collector nothing
  // calls cannot kill anything, and counting it here pointed the work at the
  // wrong place -- see the unenforced list below for that problem.
  const naked = ledger().filter((r) => r.reachable && !r.wired.length && !r.tested && !r.stressed);
  const unlisted = naked.filter((r) => !registry.accepted[r.code]);
  assert.deepEqual(unlisted.map((r) => r.code), [],
    'A new gate can refuse a program with no way to answer it. Give it a deterministic repair, '
    + 'exercise it in the stress suite, or add it to docs/qa/gate_repair_registry.json with a reason.');
});

test('a rule does not stop being enforced without anyone noticing', () => {
  // V84_CONTRAINDICATED_MOVEMENT_PRESCRIBED was written, tested, and called by
  // nothing. For as long as that was true, the most specific safety information
  // in the whole intake -- the athlete's own account of what reproduces their
  // symptoms -- was checked against the program by nobody. Some rules are
  // deliberately brief-only, but the set must be a decision rather than a
  // discovery.
  const unenforced = ledger().filter((r) => !r.reachable).map((r) => r.code).sort();
  const listed = [...(registry.unenforced || [])].sort();
  assert.deepEqual(unenforced.filter((c) => !listed.includes(c)), [],
    'this rule is no longer enforced anywhere. Wire it with a repair, or list it in '
    + 'docs/qa/gate_repair_registry.json under "unenforced" to say that is intended.');
  assert.deepEqual(listed.filter((c) => !unenforced.includes(c)), [],
    'these are enforced again and should leave the unenforced list');
});

test('the registry does not outlive the debt it records', () => {
  // A code that has since been repaired or exercised should leave the registry,
  // so the list is what is still owed rather than what once was.
  const all = ledger();
  const byCode = new Map(all.map((r) => [r.code, r]));
  const stale = Object.keys(registry.accepted).filter((code) => {
    const r = byCode.get(code);
    return r && (!r.reachable || r.wired.length || r.tested || r.stressed);
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
