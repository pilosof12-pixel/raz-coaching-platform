import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreProgram, formatScorecard, classifyFinding, DIMENSIONS, CLASSIFICATION,
} from '../engine/v39_coaching_rubric.js';

// Coaching Acceptance Rubric v1.0 is frozen. These tests pin the frozen caps and
// the frozen definition of a 9+, so a later change to scoring cannot quietly
// move the target.

test('[R1] a clean program scores 10 across every dimension and meets the 9+ standard', () => {
  const r = scoreProgram([]);
  for (const d of DIMENSIONS) assert.equal(r.scores[d], 10, `${d} starts at 10`);
  assert.equal(r.overall, 10);
  assert.equal(r.hardViolations.length, 0);
  assert.equal(r.meetsNinePlus, true);
  assert.deepEqual(r.capsApplied, []);
});

test('[R2] any unresolved HARD rule caps the overall at 7.9', () => {
  const r = scoreProgram([{ code: 'V38_INCOMPLETE_SESSION', message: 'x' }]);
  assert.equal(r.overall, 7.9);
  assert.ok(r.capsApplied.some((c) => /HARD RULE/.test(c)));
  assert.equal(r.meetsNinePlus, false);
});

test('[R3] safety below 8 caps at 7.9 even with no other fault', () => {
  // One hard safety finding drops safety to 7.
  const r = scoreProgram([{ code: 'COACH_SPEC_V1_T3K_SHIN_SYMPTOM_GATE_MISSING', message: 'x' }]);
  assert.equal(r.scores.safety, 7);
  assert.ok(r.capsApplied.some((c) => /safety below 8/.test(c)));
  assert.equal(r.overall, 7.9);
});

test('[R4] recovery below 7 and specificity below 7 each cap at 8.4', () => {
  const recovery = scoreProgram([
    { code: 'V38_CONSECUTIVE_CONFLICTING_EXPOSURE', message: 'x' },
    { code: 'COACH_SPEC_V1_AH04_PULL_SPACING', message: 'x' },
  ]);
  assert.ok(recovery.scores.recovery_management < 7);
  assert.ok(recovery.capsApplied.some((c) => /recovery management below 7/.test(c)));

  const specificity = scoreProgram([
    { code: 'COACH_SPEC_V1_T3K_400_ONLY_BLOCK', message: 'x' },
    { code: 'COACH_SPEC_V1_YG04_BALANCE_SPECIFICITY', message: 'x' },
  ]);
  assert.ok(specificity.scores.specificity < 7);
  assert.ok(specificity.capsApplied.some((c) => /specificity below 7/.test(c)));
});

test('[R5] a SOFT finding lowers the score but never blocks a release', () => {
  const r = scoreProgram([{ code: 'V38_MISSING_MOVEMENT_CATEGORY', message: 'x' }]);
  assert.equal(r.hardViolations.length, 0, 'soft findings are not hard violations');
  assert.equal(r.softFlags.length, 1);
  assert.equal(r.scores.exercise_selection, 9);
  assert.ok(r.overall > 9, 'a single soft flag must not cap the program');
  assert.equal(r.meetsNinePlus, true, 'a soft flag alone still meets the frozen 9+ bar');
});

test('[R6] a rule violated in several weeks counts once, not once per week', () => {
  const once = scoreProgram([{ code: 'V38_SKILL_WITHOUT_FOUNDATION', message: 'x' }]);
  const fourTimes = scoreProgram([1, 2, 3, 4].map(() => ({ code: 'V38_SKILL_WITHOUT_FOUNDATION', message: 'x' })));
  assert.equal(fourTimes.scores.exercise_selection, once.scores.exercise_selection);
  assert.equal(fourTimes.hardViolations.length, 1);
  assert.equal(fourTimes.hardViolations[0].instances, 4, 'instance count is still reported');
});

test('[R7] the frozen 9+ definition requires >=8 everywhere and >=9 on safety', () => {
  // Two distinct soft findings on one dimension take it to 8: still 9+.
  const eight = scoreProgram([
    { code: 'V38_MISSING_MOVEMENT_CATEGORY', message: 'x' },
    { code: 'V34_DUPLICATE_SPECIFIC_RAMP', message: 'x' },
  ]);
  assert.equal(eight.scores.exercise_selection, 8);
  assert.equal(eight.meetsNinePlus, true);

  // A soft safety flag takes safety to 9: still allowed. Two would not be.
  const safetyNine = scoreProgram([{ code: 'V34_RUNNING_VOLUME_ABOVE_BASELINE', message: 'x' }]);
  assert.equal(safetyNine.scores.safety, 9);
  assert.equal(safetyNine.meetsNinePlus, true);
});

test('[R8] every registered rule maps to a real dimension and a valid classification', () => {
  for (const code of ['V38_INCOMPLETE_SESSION', 'V34_WARMUP_TARGET_MISMATCH', 'V35_CONFLICTING_SYMPTOM_ALGORITHM', 'COACH_SPEC_V1_AH06_MAINTENANCE_OVERLOAD']) {
    const { classification, dimension } = classifyFinding(code);
    assert.ok(DIMENSIONS.includes(dimension), `${code} -> known dimension`);
    assert.ok([CLASSIFICATION.HARD, CLASSIFICATION.SOFT, CLASSIFICATION.CONTEXT].includes(classification));
  }
  // An unknown code degrades safely rather than throwing.
  const unknown = classifyFinding('SOMETHING_NEW');
  assert.equal(unknown.classification, CLASSIFICATION.SOFT);
  assert.ok(DIMENSIONS.includes(unknown.dimension));
});

test('[R9] the scorecard reports caps, hard rules and review flags separately', () => {
  const r = scoreProgram([
    { code: 'V38_INCOMPLETE_SESSION', message: 'x' },
    { code: 'V38_MISSING_MOVEMENT_CATEGORY', message: 'x' },
  ]);
  const card = formatScorecard(r, 'demo');
  assert.match(card, /Coaching Acceptance Rubric v1\.0 — demo/);
  assert.match(card, /OVERALL\s+7\.9\/10/);
  assert.match(card, /meets frozen 9\+ standard: no/);
  assert.match(card, /unresolved HARD rules:/);
  assert.match(card, /flagged for review \(SOFT\/CONTEXT, not release-blocking\)/);
});

test('[R10] the cross-week event-progression rule no longer collides with frozen T3K-08', async () => {
  // The frozen specification assigns T3K-08 to the sacrifice hierarchy. The
  // pre-existing cross-week progression rule was renumbered to T3K-10.
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../engine/coaching_spec_v1_quality.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(src, /T3K-08/, 'T3K-08 must be free for the sacrifice hierarchy');
  assert.match(src, /T3K-10/, 'cross-week event progression is now T3K-10');
});
