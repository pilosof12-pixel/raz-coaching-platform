import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  structureCounts, collectCountClaimFlags, collectTextDefectFlags,
  collectLanguageAccuracyFlags, repairCountClaims, buildLanguageAccuracyBrief,
  LANGUAGE_HARD_CODES,
} from '../engine/v46_language_accuracy.js';

// The coach's example: a program telling a Tactical athlete they have "three
// structured sessions" and then prescribing five. The training was fine; the
// sentence was wrong. A plan that miscounts itself does not read like it was
// written by someone paying attention.

const fixture = (n) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', `${n}-program.txt`), 'utf8');

test('[L1] the structure is counted the way prose talks about it', () => {
  const t = structureCounts(fixture('tactical_3k'), 1);
  assert.equal(t.calendarDays, 5);
  assert.equal(t.strengthDays, 3, 'a day is a strength day if it carries any non-conditioning work');
  const y = structureCounts(fixture('youth_gymnastics'), 1);
  assert.equal(y.calendarDays, 2, 'Session A/B labels count as days');
});

test('[L2] a miscounted session claim is caught', () => {
  const real = fixture('tactical_3k');
  const bad = real.replace(/^.*?\n/, 'You have three structured sessions each week, built around the 3K.\n');
  const flags = collectCountClaimFlags(bad, {});
  assert.equal(flags[0].code, 'V46_COUNT_CLAIM_MISMATCH');
  assert.equal(flags[0].stated, 3);
  assert.equal(flags[0].actual, 5);
});

test('[L3] a claim that matches the program raises nothing', () => {
  // "three real strength sessions ... across five calendar days" is accurate:
  // three strength days and five training days. The rule must not fire on it.
  assert.deepEqual(collectCountClaimFlags(fixture('tactical_3k'), {}), []);
  assert.deepEqual(collectLanguageAccuracyFlags(fixture('youth_gymnastics'), {}), []);
  assert.deepEqual(collectLanguageAccuracyFlags(fixture('advanced_hybrid'), {}), []);
});

test('[L4] the qualifier decides which count a claim is checked against', () => {
  const real = fixture('tactical_3k');
  // Five strength sessions is wrong (there are three) even though five is the
  // correct number of calendar days.
  const wrong = real.replace(/^.*?\n/, 'Your five real strength sessions anchor the block.\n');
  assert.equal(collectCountClaimFlags(wrong, {})[0].actual, 3);
  const right = real.replace(/^.*?\n/, 'Your three real strength sessions anchor the block.\n');
  assert.deepEqual(collectCountClaimFlags(right, {}), []);
});

test('[L5] the count is restated deterministically, keeping the original style', () => {
  const real = fixture('tactical_3k');
  const spelled = real.replace(/^.*?\n/, 'You have three structured sessions each week.\n');
  const a = repairCountClaims(spelled, {});
  assert.equal(a.repaired, true);
  assert.match(a.program.split('\n')[0], /five structured sessions/);
  assert.deepEqual(collectCountClaimFlags(a.program, {}), []);

  const numeral = real.replace(/^.*?\n/, 'You have 3 structured sessions each week.\n');
  const b = repairCountClaims(numeral, {});
  assert.match(b.program.split('\n')[0], /5 structured sessions/, 'a numeral stays a numeral');
});

test('[L6] the repair is idempotent and leaves a correct summary untouched', () => {
  const real = fixture('tactical_3k');
  assert.equal(repairCountClaims(real, {}).repaired, false);
  assert.equal(repairCountClaims(real, {}).program, real);
  const bad = real.replace(/^.*?\n/, 'You have three structured sessions each week.\n');
  const once = repairCountClaims(bad, {});
  assert.equal(repairCountClaims(once.program, {}).repaired, false);
});

test('[L7] proofreading defects in client-facing prose are reported', () => {
  const real = fixture('tactical_3k');
  const messy = real.replace(/^.*?\n/, 'The the plan keeps 3K first , with **bold** left in and TODO finish this\n');
  const defects = collectTextDefectFlags(messy).map((f) => f.defect).sort();
  assert.deepEqual(defects, ['doubled_word', 'markdown_artifact', 'placeholder', 'space_before_punctuation']);
});

test('[L8] clean prose raises no proofreading defect', () => {
  for (const n of ['tactical_3k', 'youth_gymnastics', 'advanced_hybrid']) {
    assert.deepEqual(collectTextDefectFlags(fixture(n)), [], `${n} summary should be clean`);
  }
});

test('[L9] only the mechanically correctable claim blocks a release', () => {
  // Rewriting a client's prose on a regex match risks more damage than the typo.
  assert.deepEqual([...LANGUAGE_HARD_CODES], ['V46_COUNT_CLAIM_MISMATCH']);
  assert.ok(!LANGUAGE_HARD_CODES.has('V46_TEXT_DEFECT'));
});

test('[L10] the model is told to count before it writes the sentence', () => {
  const brief = buildLanguageAccuracyBrief({});
  assert.match(brief, /must match the program below it/);
  assert.match(brief, /Count before you write the sentence/);
  assert.match(brief, /no placeholder text, no raw markdown/);
});
