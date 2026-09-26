// Run #143 prescribed Freestanding Handstand Push-up Negative as 3x1, 3x1, 3x1,
// 2x1, with RPE moving 7, 7, 7.5, 7. "Freestanding handstand push-up" is one of
// this athlete's stated secondary goals and that row is its only direct exposure,
// so for three weeks the goal's own exposure asked for exactly the same thing.
//
// The coach charged it -- "the freestanding negative itself doesn't meaningfully
// progress" -- and asked for a skill-relevant dimension to advance instead. A
// negative has no reps to add without ceasing to be one clean attempt, and no
// load to add. It has time under control on the way down.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectEccentricTempoFlags, repairEccentricTempo,
  isEccentricExposure, statedDescent, descentLadder,
} from '../engine/eccentric_tempo_progression.js';
import { auditProgramStructure } from '../engine/v38_structural_audit.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));
const DELIVERED = fs.readFileSync(path.join(here, '..', 'run143-advanced-calisthenics-for-coach.txt'), 'utf8');

const descents = (program) => program.split('\n')
  .filter((l) => /Push-up Negative/.test(l))
  .map((l) => statedDescent(l.split('\t')[7]));

test('an eccentric exposure is told apart from a hold and from a normal set', () => {
  assert.equal(isEccentricExposure('Freestanding Handstand Push-up Negative'), true);
  assert.equal(isEccentricExposure('Freestanding Handstand Hold'), false);
  assert.equal(isEccentricExposure('Back-to-Wall Handstand Push-Up'), false,
    'the wall press is a normal set and progresses by reps');
});

test('a flat exposure for a stated goal is caught', () => {
  const flags = collectEccentricTempoFlags(DELIVERED, INTAKE);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'ECCENTRIC_EXPOSURE_DOES_NOT_PROGRESS');
  assert.match(flags[0].exercise, /Handstand Push-up Negative/);
});

test('the block progresses the descent and week 4 holds week 3', () => {
  const { program, moves } = repairEccentricTempo(DELIVERED, INTAKE);
  assert.deepEqual(moves.map((m) => m.seconds), [3, 4, 5, 5],
    'three weeks of build, then consolidation at the week 3 standard');
  assert.deepEqual(descents(program), [3, 4, 5, 5]);
  assert.deepEqual(collectEccentricTempoFlags(program, INTAKE), [],
    'the repair must satisfy the rule that flagged it');
});

test('the repair settles', () => {
  const once = repairEccentricTempo(DELIVERED, INTAKE).program;
  const twice = repairEccentricTempo(once, INTAKE);
  assert.equal(twice.program, once);
  assert.equal(twice.moves.length, 0, 'a gate whose repair keeps moving never converges');
});

test('a tempo the model already chose is the baseline, not overwritten', () => {
  // Choosing training for an athlete is composing, not repairing. Where the model
  // stated a descent, week 1 keeps it and the block grows from there.
  const withBaseline = DELIVERED.replace(
    /One clean controlled negative only/g, 'Lower for 5s. One clean controlled negative only',
  );
  const { program, moves } = repairEccentricTempo(withBaseline, INTAKE);
  assert.deepEqual(descents(program), [5, 6, 7, 7]);
  assert.ok(!moves.some((m) => m.week === 1), 'week 1 already said what it wanted');
  assert.deepEqual(descentLadder(5), { 1: 5, 2: 6, 3: 7, 4: 7 });
});

test('an eccentric no goal names is left alone', () => {
  // The rule is about a goal whose only exposure stands still, not about every
  // negative in the block.
  const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const program = [1, 2, 3, 4].map((n) => [
    `START_WEEK${n}_TSV`, HEAD,
    'Fri\tNordic Hamstring Curl Negative\tBW\t3\t4\t120s\t7\tControlled.\t',
    `END_WEEK${n}_TSV`,
  ].join('\n')).join('\n\n');
  assert.deepEqual(collectEccentricTempoFlags(program, INTAKE), [],
    'no goal of this athlete names a hamstring curl');
});

test('an exposure in fewer than three weeks is not judged', () => {
  // Two weeks is not a failure to progress; there may be nothing to progress yet.
  const twoWeeks = DELIVERED
    .replace(/^Fri\tFreestanding Handstand Push-up Negative.*$/m, 'Fri\tFreestanding Handstand Hold\tBW\t3\t10s\t120s\t6\tClean line.\t');
  const flags = collectEccentricTempoFlags(twoWeeks, INTAKE);
  assert.deepEqual(flags, [], 'three build-week exposures are needed before the shape is judged');
});

test('the rule reaches production through the structural audit', () => {
  // A rule nothing calls checks nothing. This is the path that makes it bite.
  const codes = auditProgramStructure(DELIVERED, INTAKE).map((f) => f.code);
  assert.ok(codes.includes('ECCENTRIC_EXPOSURE_DOES_NOT_PROGRESS'),
    'the audit must raise it, or the gate is decorative');
});

test('the delivered program comes out of the bundle progressing', () => {
  const settled = collectRepairableValidationFailures(DELIVERED, INTAKE);
  assert.equal(settled.ok, true, 'the bundle must repair it rather than refuse the build');
  assert.deepEqual(descents(settled.program), [3, 4, 5, 5]);
  assert.deepEqual(collectEccentricTempoFlags(settled.program, INTAKE), []);
});
