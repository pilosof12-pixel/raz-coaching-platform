// The repair chain, held to what it currently achieves on every program we have
// actually delivered.
//
// The stress suite ratchets ten fixtures against per-avatar severity ceilings.
// This ratchets the other twenty-six: real delivered programs, including the
// four the coach scored himself. They overlap but are not the same set, and a
// repair that converges on a fixture can still behave differently on the fresh
// output that fixture was derived from.
//
// Numbers below are measurements, not targets. Lower them when the corpus
// improves; do not raise them to make a change pass.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sweep } from '../scripts/grade_delivered.mjs';

const total = (rows) => rows.reduce((n, r) => n + r.severity, 0);
const findings = (rows) => rows.reduce((n, r) => n + r.findings.length, 0);

test('the repair chain takes the delivered corpus from 21.35 severity to 4.40', () => {
  const before = sweep({ repaired: false });
  const after = sweep({ repaired: true });

  assert.equal(before.length, 26, 'corpus size changed; re-baseline deliberately');
  assert.equal(after.length, 26);

  assert.equal(Number(total(before).toFixed(2)), 21.35);
  assert.ok(total(after) <= 4.40 + 1e-9,
    `residual severity ${total(after).toFixed(2)} above the 4.40 ceiling`);
});

test('no delivered program gets worse for being repaired', () => {
  // The chain is allowed to leave a finding it cannot fix. It is not allowed to
  // introduce one. This is the whole-corpus form of the brokeSomething() guard
  // each destructive repair runs on itself.
  const before = new Map(sweep({ repaired: false }).map((r) => [r.file, r.severity]));
  for (const r of sweep({ repaired: true })) {
    assert.ok(r.severity <= before.get(r.file) + 1e-9,
      `${r.file} went from ${before.get(r.file).toFixed(2)} to ${r.severity.toFixed(2)}`);
  }
});

test('seventeen of the twenty-six repair to zero severity', () => {
  const clean = sweep({ repaired: true }).filter((r) => r.severity === 0).length;
  assert.ok(clean >= 17, `only ${clean} programs at zero severity, was 17`);
});

test('the residual is 29 findings and every one of them is known', () => {
  // Enumerated so a new kind of residual cannot hide inside an unchanged count.
  // Each of these is either a training decision nobody has made, or arithmetic
  // that cannot be satisfied -- five lower-leg days cannot avoid a run of three
  // in seven.
  const after = sweep({ repaired: true });
  assert.equal(findings(after), 29);

  const KNOWN = new Set([
    'IMPROVEMENT_GOAL_FLAT', 'ACCESSORY_REDUNDANCY', 'RECOVERY_DAYS_BELOW_MINIMUM',
    'STATED_PROGRESSION_ABSENT', 'CONSECUTIVE_TRAINING_DAYS', 'CONSECUTIVE_LOWER_LEG_DAYS',
    'MODALITY_SUBSTITUTION_KEEPS_THE_NUMBER', 'COMPROMISED_RUNNING_MISSING',
    'COMPONENT_LOAD_UNANCHORED', 'TAPER_VOLUME_NOT_REDUCED',
    'HEAVY_LOWER_WITHIN_48H_OF_SPEED',
  ]);
  for (const r of after) {
    for (const f of r.findings) {
      assert.ok(KNOWN.has(f.rule), `unrecognised residual ${f.rule} on ${r.file}`);
    }
  }
});
