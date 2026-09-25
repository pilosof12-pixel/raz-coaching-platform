// Two hard gates that contradicted each other, and the 8.5 minutes it cost.
//
// Run #138 built the advanced calisthenics athlete in four model calls and 509
// seconds, then shipped "delivered with unresolved rules". The QA trace named
// V38_SKILL_WITHOUT_FOUNDATION on every attempt, and the reason it never
// converged was that a second hard gate forbade the only repair for it.
//
// Every skill row was charged one unit of pulling AND one of pushing, whatever
// the skill actually demanded. So Friday -- handstand, planche, front lever,
// wall handstand push-up -- accumulated 2.0 of "vertical pulling" without a
// single pull in it. V38_SKILL_WITHOUT_FOUNDATION then correctly asked for a
// foundational pull on that skill day, and the moment the repair added even the
// lightest one the day crossed 3.0 and V38_CONSECUTIVE_CONFLICTING_EXPOSURE
// refused it against Thursday's heavy pull session. Every donor was refused, the
// repair declined, the model regenerated, and the same structure came back.
//
// A handstand is not a pulling exposure. With the demand following the movement
// the phantom load goes, the repair lands, and the build converges on the first
// call instead of the fourth.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stressSignature, skillDemand } from '../engine/v38_movement_taxonomy.js';
import { auditProgramStructure } from '../engine/v38_structural_audit.js';
import { repairSkillFoundation } from '../engine/skill_foundation_repair.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics.txt'), 'utf8');
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));

test('a pressing skill carries no pulling load and a pulling skill carries no pressing load', () => {
  for (const name of ['Freestanding Handstand Hold', 'Back-to-Wall Handstand Push-Up', 'Advanced Tuck Planche']) {
    const sig = stressSignature(name);
    assert.equal(sig.upperPull, 0, `${name} is pressing, not pulling`);
    assert.equal(sig.upperPush, 1, `${name} still has to read as pressing`);
  }
  for (const name of ['Advanced Tuck Front Lever', 'Back Lever']) {
    const sig = stressSignature(name);
    assert.equal(sig.upperPull, 1, `${name} is pulling`);
    assert.equal(sig.upperPush, 0, `${name} is not pressing`);
  }
});

test('a muscle-up is both, because it really is both', () => {
  const sig = stressSignature('Ring Muscle-up');
  assert.equal(sig.upperPull, 1);
  assert.equal(sig.upperPush, 1);
});

test('an unrecognised skill keeps the conservative reading', () => {
  assert.deepEqual(skillDemand('Some Novel Ring Skill'), { upperPull: 1, upperPush: 1 });
});

test("run #138's calisthenics build converges instead of regenerating", async () => {
  // The build that cost four model calls and 509 seconds. Two hard gates
  // contradicted each other: the foundation rule demanded a pull on a skill day
  // and the adjacency rule refused it against the heavy pull day beside it.
  // The foundation requirement is the microcycle's now, and this athlete's week
  // trains plenty of pulling, so there is nothing to force onto Friday.
  const hard = auditProgramStructure(PROGRAM, INTAKE)
    .filter((f) => f.code === 'V38_SKILL_WITHOUT_FOUNDATION');
  assert.equal(hard.length, 0, 'a week with this much pulling is not missing a foundation');

  const { validateRepairableProgramBundle } = await import('../engine/repairable_validation_bundle.js');
  const result = validateRepairableProgramBundle(PROGRAM, INTAKE);
  assert.equal(result.ok, true, "run #138's own output has to be acceptable on the first call");
  assert.equal((result.errors || []).length, 0);
});

test('no token foundational row is bought for a day that needed nothing', () => {
  const { changed, moves } = repairSkillFoundation(PROGRAM, INTAKE);
  assert.equal(changed, false, 'the week supplies the strength; nothing should be added');
  assert.equal(moves.length, 0);
});

