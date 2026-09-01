import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The spreadsheet is what the coach reads first, and a phase name is a claim
// about the prescription under it. A block aimed at a meet eight weeks out is
// an intensification build; calling its last week "Consolidate / Express"
// claims the athlete is realising fitness for competition, which reads as more
// advanced than the prescription actually is.
const src = fs.readFileSync(new URL('../public/spreadsheet-parity.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('const DEVELOPMENTAL_NARRATIVE'), src.indexOf('function applyTrackingValidation'));
const weekTitle = new Function('n', 'program', `${fn}; return weekTitle(n, program);`);

const TACTICAL = fs.readFileSync(new URL('./fixtures/run84_tactical_3k.txt', import.meta.url), 'utf8');
const HYBRID = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');

// The opening sentence the engine writes for a build block on a meet runway.
const INTENSIFICATION = 'This is Weeks 1-4 of your 8-week meet runway: a prepeak intensification build, not the taper.\nSTART_WEEK1_TSV';

test('an intensification block is never labelled Express', () => {
  for (let n = 1; n <= 4; n += 1) {
    const title = weekTitle(n, INTENSIFICATION);
    assert.doesNotMatch(title, /EXPRESS|CONSOLIDATE \/ EXPRESS/, `week ${n} claims expression: ${title}`);
  }
});

test('an intensification block is named for what it is', () => {
  assert.equal(weekTitle(1, INTENSIFICATION), 'WEEK 1 — ACCUMULATION');
  assert.equal(weekTitle(2, INTENSIFICATION), 'WEEK 2 — INTENSIFICATION');
  assert.equal(weekTitle(3, INTENSIFICATION), 'WEEK 3 — INTENSIFICATION');
  assert.equal(weekTitle(4, INTENSIFICATION), 'WEEK 4 — SPECIFIC CONSOLIDATION');
});

test('"not the taper" is not mistaken for a taper', () => {
  // The sentence that establishes an intensification block usually contains the
  // word "taper", so the intensification pattern has to be tested first.
  assert.match(weekTitle(4, INTENSIFICATION), /SPECIFIC CONSOLIDATION/);
});

test('non-competition programs keep the labels they had', () => {
  // This change must not reach the three original avatars.
  assert.equal(weekTitle(1, HYBRID), 'WEEK 1 — FOUNDATION');
  assert.equal(weekTitle(2, HYBRID), 'WEEK 2 — BUILD');
  assert.equal(weekTitle(3, TACTICAL), 'WEEK 3 — PEAK LOAD');
  assert.equal(weekTitle(3, 'A race-specific block for the event.\nSTART_WEEK1_TSV'), 'WEEK 3 — SPECIFICITY');
});
