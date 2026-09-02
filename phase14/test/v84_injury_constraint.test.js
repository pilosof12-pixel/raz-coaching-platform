import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  contraindicated, forbiddenMovements, isDischarged,
  collectInjuryConstraintFlags, buildInjuryConstraintBrief,
} from '../engine/v84_injury_constraint.js';

const HARD = JSON.parse(fs.readFileSync(new URL('./fixtures/hard_avatars.json', import.meta.url), 'utf8'));
const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const BASE = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');

test("what the athlete says they cannot do is read back out", () => {
  assert.match(contraindicated(HARD.masters_return).join(' '), /loaded spinal flexion under fatigue/i);
  assert.match(contraindicated(HARD.inseason_footballer).join(' '), /eccentric hamstring work the day before a match/i);
  assert.match(contraindicated(COMP.mma_fight_camp).join(' '), /heavy back squat/i);
});

test('a named exercise is extracted; a mechanism is not forced into one', () => {
  assert.deepEqual(forbiddenMovements(COMP.mma_fight_camp), ['back squat']);
  // "loaded spinal flexion" names a position, not an exercise, and inventing a
  // list from it would be guessing on the athlete's behalf.
  assert.deepEqual(forbiddenMovements(HARD.masters_return), []);
});

test('an athlete who has been discharged is trained, not treated', () => {
  assert.equal(isDischarged(HARD.masters_return), true);
  assert.equal(isDischarged(HARD.inseason_footballer), false);
  const brief = buildInjuryConstraintBrief(HARD.masters_return);
  assert.match(brief, /Train them\./);
  assert.match(brief, /Do not write a rehabilitation programme/);
  assert.match(brief, /goal movement is also the movement that injured them/);
});

test('the brief quotes the athlete rather than paraphrasing them', () => {
  const brief = buildInjuryConstraintBrief(HARD.masters_return);
  assert.ok(brief.includes(HARD.masters_return.pain.tolerated_movements),
    'the athlete\'s own words must survive into the brief intact');
});

test('a mechanism is honoured as a mechanism', () => {
  const brief = buildInjuryConstraintBrief(HARD.masters_return);
  assert.match(brief, /honour the mechanism/);
  const named = buildInjuryConstraintBrief(COMP.mma_fight_camp);
  assert.match(named, /Do not prescribe: back squat/);
});

test('an athlete with nothing to declare gets no brief', () => {
  assert.equal(buildInjuryConstraintBrief({}), '');
  assert.equal(buildInjuryConstraintBrief({ pain: {} }), '');
});

test('the collector finds a contraindicated movement when one is prescribed', () => {
  const withSquat = BASE.replace(/^(Mon\t)([^\t]+)/m, '$1Back Squat');
  const flags = collectInjuryConstraintFlags(withSquat, COMP.mma_fight_camp);
  assert.ok(flags.length > 0);
  assert.equal(flags[0].code, 'V84_CONTRAINDICATED_MOVEMENT_PRESCRIBED');
  assert.match(flags[0].detail, /outranks any programme logic/);
});

test('the collector is silent when there is nothing declared', () => {
  assert.equal(collectInjuryConstraintFlags(BASE, {}).length, 0);
  assert.equal(collectInjuryConstraintFlags(BASE, HARD.masters_return).length, 0);
});
