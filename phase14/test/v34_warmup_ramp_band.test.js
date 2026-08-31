import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { collectWarmupSanityFlags, repairWarmupRampTarget } from '../engine/v34_prescription_consistency.js';

const FLAT = fs.readFileSync(new URL('./fixtures/run92_weightlifter_flat.txt', import.meta.url), 'utf8');

// Monday's Clean and Jerk work rows prescribe 118-122 kg in Week 1.
const withRamp = (target) => FLAT.replace(
  /(Mon\t\[WARMUP\] Deep Squat Hold\t[^\n]*?)(Keep the warm-up specific and non-fatiguing\.)/,
  `$1Ramp Clean and Jerk: 60 kg x 3, 90 kg x 2 before +${target} kg work sets. $2`,
);
const mismatches = (p) => collectWarmupSanityFlags(p).filter((f) => f.code === 'V34_WARMUP_TARGET_MISMATCH');

test('a ramp aimed inside the prescribed band is not a contradiction', () => {
  // The live weightlifter build died on exactly this: the work rows prescribe a
  // band, the ramp names one number inside it, and the rule compared that
  // number against the top of the band only.
  for (const target of [118, 120, 122]) {
    assert.equal(mismatches(withRamp(target)).length, 0, `${target} kg inside 118-122 was flagged`);
  }
});

test('a ramp aimed outside the band is still a contradiction', () => {
  for (const target of [110, 126]) {
    const flags = mismatches(withRamp(target));
    assert.equal(flags.length, 1, `${target} kg outside 118-122 was not flagged`);
    assert.match(flags[0].message, /118-122 kg/, 'the message must name the whole band');
  }
});

test('the mismatch has a deterministic repair, so it cannot exhaust the attempts', () => {
  // Classified HARD with no repair, this code could only be regenerated: four
  // attempts, then the build failed and the client was charged for nothing.
  for (const target of [110, 126]) {
    const bad = withRamp(target);
    const repaired = repairWarmupRampTarget(bad, {});
    assert.equal(mismatches(repaired).length, 0, `${target} kg not repaired`);
    assert.match(repaired, /before \+122 kg work sets/, 'the ramp should aim at the work band');
    assert.equal(repairWarmupRampTarget(repaired, {}), repaired, 'repair is not idempotent');
    assert.equal((repaired.match(/START_WEEK\d_TSV/g) || []).length, 4, 'week tables damaged');
  }
});

test('the repair leaves a coherent ramp alone', () => {
  const clean = withRamp(120);
  assert.equal(repairWarmupRampTarget(clean, {}), clean);
});

test('the repair writes its result back rather than dropping it', () => {
  // parseWeek exposes no block regex; replacing on an undefined one coerces to
  // the string "undefined", matches nothing and loses the repair silently.
  const repaired = repairWarmupRampTarget(withRamp(126), {});
  assert.notEqual(repaired, withRamp(126), 'the repair returned its input unchanged');
  assert.ok(repaired.includes('START_WEEK1_TSV'), 'week 1 block lost');
});
