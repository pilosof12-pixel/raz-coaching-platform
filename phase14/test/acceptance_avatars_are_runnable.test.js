// An avatar that cannot get past the clarification gate can never be verified.
//
// advanced_hybrid last reached the model on 16 September. Every run since then
// stopped at the door with a 422: "A few details are needed before I can build
// this accurately", asking weight_class_plan. The athlete trains MMA five times a
// week, the gate reasonably wants to know whether a weight cut is underway, and
// nobody had ever answered it in the fixture. So the gate was right, the avatar
// was incomplete, and the result was six weeks in which the Advanced Hybrid
// pipeline could not be exercised live at all while its tests sat red.
//
// This asserts the property that failed silently: every avatar the acceptance
// workflow can select must be answerable enough to actually build.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  detectIntakeClarifications, addOptionalQuestions, requiredClarifications,
} from '../intake_clarification.js';

const WORKFLOW = fs.readFileSync(
  new URL('../../.github/workflows/live-three-avatar-acceptance.yml', import.meta.url), 'utf8',
);

// The workflow builds its avatars in two literal shapes: the original three as a
// plain object, the rest through Object.assign. Both are lifted here rather than
// duplicated, so this test breaks if an avatar's intake changes.
function avatarIntakes() {
  const found = [];
  const consent = () => ({ accepted: true, accepted_at: Date.now(), version: '1' });
  const weeksFromNow = (n) => new Date(Date.now() + n * 7 * 864e5).toISOString().slice(0, 10);
  const daysBefore = (d, n) => new Date(Date.parse(d) - n * 864e5).toISOString().slice(0, 10);
  const FIGHT_DAY = weeksFromNow(4);
  void consent; void daysBefore; void FIGHT_DAY;

  const plain = /const \w+=\{id:'([^']+)',intake:(\{[\s\S]*?\n {10}\}\})/g;
  for (const m of WORKFLOW.matchAll(plain)) {
    try {
      // eslint-disable-next-line no-eval
      found.push([m[1], eval(`(${m[2].replace(/\}\}\s*$/, '}')})`)]);
    } catch { /* the assign-shaped ones are picked up below */ }
  }
  const assigned = /const \w+=\{id:'([^']+)',intake:Object\.assign\(([\s\S]*?),\{privacy_consent/g;
  for (const m of WORKFLOW.matchAll(assigned)) {
    try {
      // eslint-disable-next-line no-eval
      found.push([m[1], eval(`(${m[2]})`)]);
    } catch { /* skip anything this cannot lift */ }
  }
  return found;
}

test('the workflow defines the avatars this test can read', () => {
  const avatars = avatarIntakes();
  assert.ok(avatars.length >= 6, `only lifted ${avatars.length} avatars; the shapes have changed`);
  const ids = avatars.map(([id]) => id);
  for (const expected of ['advanced_hybrid', 'youth_gymnastics', 'tactical_3k', 'advanced_calisthenics']) {
    assert.ok(ids.includes(expected), `${expected} is not readable from the workflow`);
  }
});

test('every acceptance avatar can actually reach the model', () => {
  const blocked = [];
  for (const [id, intake] of avatarIntakes()) {
    const asked = addOptionalQuestions(detectIntakeClarifications(intake), intake);
    const required = requiredClarifications(asked);
    if (required.length) blocked.push(`${id}: ${required.map((q) => q.id).join(', ')}`);
  }
  assert.deepEqual(blocked, [],
    'these avatars stop at the clarification gate, so no live run can ever verify them');
});
