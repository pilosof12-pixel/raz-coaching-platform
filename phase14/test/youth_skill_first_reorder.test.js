// The intraday reorder and the youth freshness rule used to disagree.
//
// Run #163: the model put the bar muscle-up and handstand work first, as the
// youth rule demands. forceIntradayReorder then ranked Ring Dip as primary
// strength and lifted it above all of it, the rule refused the result, and that
// repeated on every attempt until the program shipped carrying
// YOUTH_PRIMARY_SKILL_NOT_FRESH. The two now share one definition of skill.

import test from 'node:test';
import assert from 'node:assert/strict';

import { forceIntradayReorder } from '../engine/exercise_dictionary.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const rows = [
  'Session A\t[WARMUP] Band Pull-Apart Warm-up\tLight band\t2\t12\t30s\t3\tPrep.\t',
  'Session A\tBar Muscle-up Transition Drill\tModerate band\t3\t1\t90s\tN/A\tClean singles.\t',
  'Session A\tControlled Handstand Kick-up\tBodyweight\t3\t2\t60s\tN/A\tQuiet entries.\t',
  'Session A\tRing Dip\tBodyweight\t3\t3\t90s\t7\tSubmaximal. If the last set feels above RPE 8, stop at 2 sets.\t',
  'Session A\tRing Row\tBodyweight\t3\t8\t60s\t7\tFoundation pull.\t',
];
const program = [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');
const order = (p) => p.match(/START_WEEK1_TSV\n([\s\S]*?)\nEND_WEEK1_TSV/)[1].split('\n').slice(1).map((l) => l.split('\t')[1]);

test('a youth athlete keeps primary skill practice straight after the warm-up', () => {
  const out = order(forceIntradayReorder(program, { age: 13 }));
  assert.equal(out[0], '[WARMUP] Band Pull-Apart Warm-up');
  assert.deepEqual(out.slice(1, 3), ['Bar Muscle-up Transition Drill', 'Controlled Handstand Kick-up']);
  assert.ok(out.indexOf('Ring Dip') > out.indexOf('Controlled Handstand Kick-up'));
});

test('an adult day is ordered exactly as before', () => {
  const adult = order(forceIntradayReorder(program, { age: 30 }));
  const unknownAge = order(forceIntradayReorder(program, {}));
  assert.deepEqual(adult, unknownAge);
});
