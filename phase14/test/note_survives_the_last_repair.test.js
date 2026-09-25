// A note is correct only against the prescription as it finally stands.
//
// normalizeFinalNoteCoherence called itself the last deterministic repair. It
// was not: the whole v35 chain runs after it, and so do the count-claim and
// marathon repairs, and any of them can move a set count under a note that had
// just been reconciled to the old one.
//
// Run #139 shipped "add the 5th single only if the first 4 stay clean" on a row
// trimmed to four sets, and "sets of 10 reps" on a row trimmed to one. The coach
// charged both and asked for exactly this: notes rewritten only after the
// prescription is final.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeFinalNoteCoherence } from '../engine/final_note_coherence.js';
import { validateRepairableProgramBundle } from '../engine/repairable_validation_bundle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));
const RUN138 = fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics.txt'), 'utf8');
const RUN139 = fs.readFileSync(path.join(here, 'fixtures/run139_advanced_calisthenics.txt'), 'utf8');

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows) => [1, 2, 3, 4]
  .map((n) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`).join('\n\n');
const noteFor = (program, name) => program.split('\n').map((l) => l.split('\t'))
  .find((c) => c.length === 9 && c[1] === name)[7];

test('a note may not tell the athlete to do a set the row does not contain', () => {
  const p = block([
    'Tue\tFreestanding Handstand Push-up Negative\tBodyweight\t4\t1\t2 min\t7.5\t3-5 second lower under control; add the 5th single only if the first 4 stay clean and repeatable.\t',
    'Tue\tPlank\tBodyweight\t2\t40s\t60s\t7\tTrunk brace.\t',
  ]);
  const out = normalizeFinalNoteCoherence(p, INTAKE).program;
  const note = noteFor(out, 'Freestanding Handstand Push-up Negative');
  assert.equal(/5th single/i.test(note), false);
  // And the removal owns its whole clause: a lazy match left "only if the first
  // 4 stay clean" hanging off the sentence before it.
  assert.equal(/only if the first 4/i.test(note), false, 'the clause must go whole');
  assert.equal(/[;,]\s*$/.test(note), false, 'and must not leave its separator behind');
});

test('one set is not "sets"', () => {
  const p = block([
    'Tue\tInverted Row\tBodyweight\t1\t10\t90s\t6.5\tsets of 10 reps, clean balance set.\t',
    'Tue\tPlank\tBodyweight\t2\t40s\t60s\t7\tTrunk brace.\t',
  ]);
  const note = noteFor(normalizeFinalNoteCoherence(p, INTAKE).program, 'Inverted Row');
  assert.equal(/\bsets of \d/i.test(note), false, `still plural: ${note}`);
});

test('an ordinal within the prescription is left alone', () => {
  const p = block([
    'Tue\tMuscle-up\tBodyweight\t5\t1\t3 min\t7\tStrict singles; add the 4th single only if the first 3 are crisp.\t',
    'Tue\tPlank\tBodyweight\t2\t40s\t60s\t7\tTrunk brace.\t',
  ]);
  const note = noteFor(normalizeFinalNoteCoherence(p, INTAKE).program, 'Muscle-up');
  assert.match(note, /4th single/i, 'five sets are prescribed, so a fourth is real');
});

test('the delivered programs carry no note claiming a set the row lacks', () => {
  for (const [label, program] of [['run138', RUN138], ['run139', RUN139]]) {
    const out = validateRepairableProgramBundle(program, INTAKE);
    assert.equal(out.ok, true, `${label} must still clear the bundle`);
    for (const cells of out.program.split('\n').map((l) => l.split('\t'))) {
      if (cells.length !== 9 || cells[0] === 'Day') continue;
      const sets = Number(cells[3]);
      if (!Number.isFinite(sets)) continue;
      const m = String(cells[7]).match(/add the (\d+)(?:st|nd|rd|th)\s+(?:set|single|double|triple)/i);
      assert.ok(!m || Number(m[1]) <= sets,
        `${label} ${cells[0]} ${cells[1]}: ${sets} sets, note says add the ${m && m[1]}`);
      if (sets === 1) {
        assert.equal(/\bsets of \d/i.test(cells[7]), false,
          `${label} ${cells[0]} ${cells[1]}: one set described as "sets"`);
      }
    }
  }
});
