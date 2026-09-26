// An isometric hold is prescribed in seconds, not in reps.
//
// Run #142 wrote Freestanding Handstand Hold as 6 sets of 1 rep with "aim for
// 5-8s with a clean line" in the note. The athlete reads the prescription
// columns; "1 rep" tells him nothing about the set, and the work was only
// discoverable in prose. Every other hold in that same block already carried its
// time -- Plank 40s, Advanced Tuck Planche 6s, Front Lever 10s -- so this was a
// row written in the wrong shape rather than a convention the engine lacked.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isHeldMovement, collectIsometricDurationFlags, repairIsometricDuration,
} from '../engine/isometric_duration.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const RUN142 = fs.readFileSync(path.join(here, 'fixtures/run142_advanced_calisthenics.txt'), 'utf8');

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows) => [1, 2, 3, 4]
  .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`).join('\n\n');
const repsOf = (p, name, week = 1) => {
  const b = p.match(new RegExp(`START_WEEK${week}_TSV([\\s\\S]*?)END_WEEK${week}_TSV`))[1];
  return b.split('\n').map((l) => l.split('\t')).find((c) => c.length === 9 && c[1] === name)[4];
};

test('a held movement is told apart from a repeated one', () => {
  for (const n of ['Freestanding Handstand Hold', 'Plank', 'Advanced Tuck Planche',
    'Advanced Tuck Front Lever', 'Dead Hang', 'L-Sit']) {
    assert.equal(isHeldMovement(n), true, `${n} is held`);
  }
  // These all contain a word that appears in hold names.
  for (const n of ['Freestanding Handstand Push-up Negative', 'Wall Handstand Push-up',
    'Australian Pull-up', 'Plank Row', 'Pistol Squat']) {
    assert.equal(isHeldMovement(n), false, `${n} is repeated, not held`);
  }
});

test('a hold whose seconds are only in the note is flagged and repaired', () => {
  const flags = collectIsometricDurationFlags(RUN142, {});
  assert.ok(flags.length, 'run #142 must raise it');
  for (const f of flags) {
    assert.equal(f.code, 'ISOMETRIC_DURATION_MUST_BE_IN_PRESCRIPTION');
    assert.equal(f.exercise, 'Freestanding Handstand Hold');
  }
  const { program } = repairIsometricDuration(RUN142, {});
  assert.deepEqual(collectIsometricDurationFlags(program, {}), []);
  assert.equal(repsOf(program, 'Freestanding Handstand Hold', 1), '5-8s');
  assert.equal(repsOf(program, 'Freestanding Handstand Hold', 2), '6-10s');
  assert.equal(repsOf(program, 'Freestanding Handstand Hold', 3), '8-12s');
});

test('a consolidation week carries the standard it points at', () => {
  // Week 4 names no time because it says to keep what Week 3 established. That
  // is a number the program already holds, so carrying it is restating rather
  // than choosing a hold time.
  const { program } = repairIsometricDuration(RUN142, {});
  assert.equal(repsOf(program, 'Freestanding Handstand Hold', 4), '8-12s');
});

test('a hold that already carries its time is untouched', () => {
  const p = block([
    'Mon\tPlank\tBodyweight\t3\t40s\t60s\t7\tBrace hard.\t',
    'Mon\tAdvanced Tuck Planche\tBodyweight\t4\t6s\t2 min\t8\tLocked elbows.\t',
  ]);
  assert.deepEqual(collectIsometricDurationFlags(p, {}), []);
  assert.equal(repairIsometricDuration(p, {}).changed, false);
});

test('a hold with no time anywhere is left alone rather than invented', () => {
  // Choosing a hold time for an athlete is composing training. Flagging what the
  // repair cannot answer is a gate with no answer, which is the shape that kills
  // a build.
  const p = block(['Mon\tFreestanding Handstand Hold\tBodyweight\t5\t1\t90s\t7\tBalance practice; stop at the first save.\t']);
  assert.deepEqual(collectIsometricDurationFlags(p, {}), []);
  assert.equal(repairIsometricDuration(p, {}).changed, false);
});

test('a repeated movement keeps its reps', () => {
  const p = block(['Mon\tFreestanding Handstand Push-up Negative\tBodyweight\t4\t1\t2 min\t7\tControl a 5s descent.\t']);
  assert.deepEqual(collectIsometricDurationFlags(p, {}), [], 'a 5s tempo cue is not a hold time');
  assert.equal(repairIsometricDuration(p, {}).changed, false);
});

test('it is idempotent', () => {
  const once = repairIsometricDuration(RUN142, {}).program;
  assert.equal(repairIsometricDuration(once, {}).changed, false);
});
