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

// The rule (engine rule 60c, and the owner's): skill, then strength, then
// hypertrophy/accessories. Power primers sit between skill and heavy strength.
// The old reorder knew no skill tier and put "primary strength" first for
// everyone but the youth athlete.
const day = (lines) => [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${header}\n${lines.join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');
const squat = 'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tHeavy triples.\t';
const oap = 'Mon\tOne-Arm Pull-up\tBodyweight\t3\t1 each side\t3 min\t8\tStrict singles.\t';
const pseudo = 'Mon\tPseudo Planche Push-up\tBodyweight\t2\t6\t90s\t7\tPressing support.\t';
const jump = 'Mon\tBox Jump\tBodyweight\t3\t3\t90s\t6\tStep down; full reset.\t';
const curl = 'Mon\tMachine Hamstring Curl\tRPE-selected load\t2\t10\t60s\t7\tAccessory.\t';

test('an adult whose goal names the skill trains it, and any primer, before strength and accessories', () => {
  const intake = { age: 30, primary_goals: ['220kg back squat', '4 One arm pullups'] };
  // Skill and primer share the fresh tier in the order written.
  assert.deepEqual(order(forceIntradayReorder(day([curl, squat, jump, oap]), intake)),
    ['Box Jump', 'One-Arm Pull-up', 'Back Squat', 'Machine Hamstring Curl']);
  assert.deepEqual(order(forceIntradayReorder(day([curl, oap, squat, jump]), intake)),
    ['One-Arm Pull-up', 'Box Jump', 'Back Squat', 'Machine Hamstring Curl']);
});

test('skill work that only supports another goal is not promoted ahead of the primary lift', () => {
  // engine_instructions line 535: a barbell-primary athlete's support skill
  // does not have to lead.
  const intake = { age: 30, primary_goals: ['220kg back squat'] };
  const out = order(forceIntradayReorder(day([squat, pseudo]), intake));
  assert.equal(out[0], 'Back Squat');
});

test("a primer and the competition lift keep the order the coach wrote; both precede strength", () => {
  // Owner: an explosive push-up is plyometric skill work in essence, and a good
  // potentiation before the snatch. Either order is legitimate, so neither is forced.
  const snatch = 'Day -5\tSnatch\t95 kg\t2\t1\t2 min\t7\tCrisp singles.\t';
  const push = 'Day -5\tExplosive Push-up\tBodyweight\t3\t3\t90s\t7\tPrimer.\t';
  const front = 'Day -5\tFront Squat\t130 kg\t2\t2\t3 min\t7\tStrength.\t';
  const plank = 'Day -5\tSide Plank\tBodyweight\t1\t20 sec\t30s\t5\tTrunk.\t';
  const intake = { age: 26, primary_goals: ['Snatch 120 kg at the national qualifier'] };
  assert.deepEqual(order(forceIntradayReorder(day([plank, front, push, snatch]), intake)), ['Explosive Push-up', 'Snatch', 'Front Squat', 'Side Plank']);
  assert.deepEqual(order(forceIntradayReorder(day([front, snatch, push]), intake)), ['Snatch', 'Explosive Push-up', 'Front Squat']);
});

test('a youth athlete\'s primary skill still comes strictly first, ahead of any primer', () => {
  const jump = 'Session A\tBox Jump\tBodyweight\t3\t3\t90s\t6\tPrimer.\t';
  const drill = 'Session A\tBar Muscle-up Transition Drill\tModerate band\t3\t1\t90s\tN/A\tClean singles.\t';
  assert.deepEqual(order(forceIntradayReorder(day([jump, drill]), { age: 13 })), ['Bar Muscle-up Transition Drill', 'Box Jump']);
});
