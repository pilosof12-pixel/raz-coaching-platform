import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ASSISTED_SKILL_STATIC,
  assistedBarMuscleUpGoal,
  buildAssistedSkillBrief,
  collectAssistedSkillFlags,
  normalizeAssistedSkillProgression,
} from '../engine/assisted_skill_progression.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';
import { validateYouthCoachingSpecV1HardRules } from '../engine/coaching_spec_v1_quality.js';

const YOUTH = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8')).youth_gymnastics;
const DELIVERED = fs.readFileSync(new URL('./fixtures/youth_gymnastics-program.txt', import.meta.url), 'utf8');

const banded = (program, week) => {
  const parsed = parseWeek(program, week);
  return parsed.rows
    .filter((c) => /Banded Muscle-up/i.test(String(c[parsed.exercise])))
    .map((c) => ({ sets: c[parsed.sets], reps: c[parsed.reps], weight: c[parsed.load], note: c[parsed.notes] }));
};

test('a component drill progressing does not excuse the integrated skill standing still', () => {
  // The transition drill moves from "Moderate band assistance" to "Lightest
  // band assistance"; the Banded Muscle-up beside it is identical all four
  // weeks. The goal is named after the integrated movement.
  assert.equal(assistedBarMuscleUpGoal(YOUTH), true);
  const flags = collectAssistedSkillFlags(DELIVERED, YOUTH);
  assert.ok(flags.length >= 1);
  assert.equal(flags[0].code, ASSISTED_SKILL_STATIC);
  const weights = new Set([1, 2, 3].flatMap((w) => banded(DELIVERED, w).map((r) => r.weight)));
  assert.equal(weights.size, 1, 'the delivered block asks for one assistance level throughout');
});

test('assistance comes off week by week', () => {
  const out = normalizeAssistedSkillProgression(DELIVERED, YOUTH);
  assert.equal(out.repaired, true);
  const weights = [1, 2, 3, 4].map((w) => banded(out.program, w)[0].weight);
  assert.equal(new Set(weights).size, 4, 'every week names its own rung');
  assert.match(weights[2], /lightest/i);
  assert.match(weights[3], /Week 3/i, 'Week 4 consolidates on what was owned');
});

test('the dose never moves -- this is assistance reduction, not fatigue', () => {
  // "At age 13, I'd rather have short, frequent, high-quality attempts... The
  // progression should be skill quality and assistance reduction, not fatigue."
  const out = normalizeAssistedSkillProgression(DELIVERED, YOUTH);
  for (const w of [1, 2, 3, 4]) {
    for (const row of banded(out.program, w)) {
      assert.equal(row.sets, '2', `week ${w} sets`);
      assert.equal(row.reps, '1', `week ${w} reps`);
    }
  }
});

test('each week states what earns the next rung', () => {
  const out = normalizeAssistedSkillProgression(DELIVERED, YOUTH);
  assert.match(banded(out.program, 1)[0].note, /if both singles are fast and the catch is clean/i);
  assert.match(banded(out.program, 2)[0].note, /drop one band only if/i);
  // "Once the lightest useful assistance is owned, permit 1-3 fresh unassisted
  // attempts before assisted work."
  assert.match(banded(out.program, 3)[0].note, /up to 3 fresh unassisted attempts before the assisted singles/i);
});

test('no repair of ours writes the language YG-07 refuses', () => {
  const out = normalizeAssistedSkillProgression(DELIVERED, YOUTH);
  for (const w of [1, 2, 3, 4]) {
    for (const row of banded(out.program, w)) {
      assert.doesNotMatch(`${row.note} ${row.weight}`, /to failure|amrap|forced rep|grind(?:er|ing)?/i);
    }
  }
  validateYouthCoachingSpecV1HardRules(out.program, YOUTH);
});

test('an athlete who already owns the skill is not given the acquisition ladder', () => {
  const owns = { ...YOUTH, current_numbers: 'Bar muscle-up achieved and consistent; 12 strict pull-ups.' };
  assert.equal(assistedBarMuscleUpGoal(owns), false);
  assert.deepEqual(collectAssistedSkillFlags(DELIVERED, owns), []);
  assert.equal(buildAssistedSkillBrief(owns), '');
  // A ring muscle-up is not a bar muscle-up, and this athlete has one.
  assert.equal(assistedBarMuscleUpGoal(YOUTH), true);
});

test('the repair converges and is idempotent', () => {
  const once = normalizeAssistedSkillProgression(DELIVERED, YOUTH);
  assert.deepEqual(collectAssistedSkillFlags(once.program, YOUTH), []);
  const twice = normalizeAssistedSkillProgression(once.program, YOUTH);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('the brief is bulleted and the chain applies the repair', () => {
  const brief = buildAssistedSkillBrief(YOUTH);
  for (const line of brief.split('\n')) assert.ok(line.startsWith('*') || line.startsWith('  '), line.slice(0, 40));
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizeAssistedSkillProgression\(candidate, intake\)/);
});
