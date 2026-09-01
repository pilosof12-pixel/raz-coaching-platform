import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectIntensificationFlags, repairLateSupportVolume, jerkLockoutIsLimiter,
} from '../engine/v71_intensification.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
// The block delivered by live run #96 and rated 8.8: volume falls 78 -> 59, but
// overhead press holds at 8 sets and back squat at 2 in every single week, so
// the reduction came entirely out of other support work.
const DELIVERED = fs.readFileSync(new URL('./fixtures/run96_weightlifter_intensification.txt', import.meta.url), 'utf8');
const eightWeeksOut = () => new Date(Date.now() + 8 * 7 * 86400000).toISOString().slice(0, 10);
assert.ok(COMP.weightlifter_peak, 'fixture key missing: spreading it would leave an empty intake');
const LIFTER = {
  ...COMP.weightlifter_peak,
  competition_date: eightWeeksOut(), event_type: 'strength_meet', event_priority: 'A',
};

function setsOf(program, week, re) {
  const m = program.match(new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`, 'i'));
  if (!m) return null;
  return m[1].split('\n').slice(1).reduce((n, line) => {
    const c = line.split('\t');
    if (c.length < 5 || /WARMUP/.test(c[1]) || !re.test(c[1])) return n;
    return n + (parseInt(c[3], 10) || 0);
  }, 0);
}
const PRESS = /Overhead Press|Push Press|Strict Press|Shoulder Press|Military Press/i;
const SQUAT = /Back Squat/i;
const pressFlags = (p, i) => collectIntensificationFlags(p, i).filter((f) => f.code === 'V71_SECONDARY_PRESS_NOT_REDUCED');
const squatFlags = (p, i) => collectIntensificationFlags(p, i).filter((f) => f.code === 'V71_SQUAT_SUPPORT_FLAT_IN_FINAL_WEEK');

test('support work riding flat through a specific block is flagged', () => {
  assert.equal(pressFlags(DELIVERED, LIFTER).length, 2, 'weeks 3 and 4 both carry Week 1 pressing volume');
  assert.equal(squatFlags(DELIVERED, LIFTER).length, 1, 'squat support never gives ground in week 4');
});

test('secondary pressing recedes as the meet approaches', () => {
  const repaired = repairLateSupportVolume(DELIVERED, LIFTER);
  assert.equal(setsOf(repaired, 1, PRESS), 8, 'week 1 is the reference and must not move');
  assert.equal(setsOf(repaired, 2, PRESS), 8, 'the trim starts in week 3, not before');
  assert.ok(setsOf(repaired, 3, PRESS) < 8, 'week 3 pressing did not come down');
  assert.ok(setsOf(repaired, 4, PRESS) < setsOf(repaired, 3, PRESS), 'week 4 must be lighter than week 3');
});

test('squat support takes a small step down in the final week', () => {
  const repaired = repairLateSupportVolume(DELIVERED, LIFTER);
  assert.ok(setsOf(repaired, 4, SQUAT) < setsOf(repaired, 3, SQUAT), 'squat support held flat into week 4');
  assert.ok(setsOf(repaired, 4, SQUAT) >= 1, 'maintenance means less of it, not none of it');
});

test('the repair answers its own flags and is idempotent', () => {
  const repaired = repairLateSupportVolume(DELIVERED, LIFTER);
  assert.equal(pressFlags(repaired, LIFTER).length, 0);
  assert.equal(squatFlags(repaired, LIFTER).length, 0);
  assert.equal(repairLateSupportVolume(repaired, LIFTER), repaired, 'repair is not idempotent');
});

test('a stated jerk-lockout limiter protects the pressing volume', () => {
  const limited = { ...LIFTER, notes: `${LIFTER.notes} The jerk lockout is his clear limiter: he misses jerks forward at max.` };
  assert.equal(jerkLockoutIsLimiter(limited), true);
  assert.equal(pressFlags(DELIVERED, limited).length, 0, 'pressing that answers a stated limiter must be left alone');
  assert.equal(setsOf(repairLateSupportVolume(DELIVERED, limited), 4, PRESS), 8);
});

test("the model's own cue text cannot license its own volume", () => {
  // The delivered program says "if lockout speed worsens, hold load" -- that is
  // the model's writing, not the athlete telling us lockout is a limiter.
  assert.match(DELIVERED, /lockout/i, 'fixture should contain incidental lockout cues');
  assert.equal(jerkLockoutIsLimiter(LIFTER), false);
  const cueOnly = { ...LIFTER, notes: `${LIFTER.notes} Cue a fast lockout and quiet ribs.` };
  assert.equal(jerkLockoutIsLimiter(cueOnly), false, 'a coaching cue is not a limiter');
});

test('the classic lifts are never trimmed', () => {
  const repaired = repairLateSupportVolume(DELIVERED, LIFTER);
  for (const week of [1, 2, 3, 4]) {
    assert.equal(setsOf(repaired, week, /^Snatch$|^Clean and Jerk$/i), setsOf(DELIVERED, week, /^Snatch$|^Clean and Jerk$/i),
      `week ${week} classic-lift volume moved`);
  }
});
