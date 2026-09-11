// Say what actually decides the weight.
//
// The camp prescribed "RPE-selected load" and then told the athlete the set was
// "about 86% of your +35 kg x 3 benchmark". Those are two instructions in one
// row: if RPE selects the weight then the percentage did not, and printing it
// claims a precision the set does not have.
//
// The rule: RPE is the real determinant, and a load reference is a starting
// point -- last week's load, adjusted a little. If the target RPE arrives under
// the reference weight, the lighter weight is correct.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectPrescriptionIntegrityFlags, repairPrescriptionIntegrity, buildPrescriptionIntegrityBrief,
} from '../engine/v92_prescription_integrity.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const CORE = JSON.parse(read('acceptance_intakes.json'));
const COMP = JSON.parse(read('competition_avatars.json'));

const DAY = 86400000;
const onSaturday = (w) => {
  const d = new Date(Date.now() + w * 7 * DAY);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 6 + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const FIGHT = onSaturday(4);
const FIGHTER = {
  ...COMP.mma_fight_camp,
  competition_date: FIGHT,
  weigh_in_date: new Date(Date.parse(FIGHT) - DAY).toISOString().slice(0, 10),
  event_type: 'combat',
  event_priority: 'A',
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, name, load, note) => [day, name, load, '2', '3', '90 sec', '7', note, ''].join('\t');
const week = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const stop = 'Stop the session early if bar speed drops.';

test('a percentage on a by-feel row is false precision', () => {
  const program = [1, 2, 3, 4].map((n) => week(n, [
    row('Tue', 'Pull-up', 'RPE-selected load', 'About 86% of your +35 kg x 3 benchmark. ' + stop),
  ])).join('\n');
  const flags = collectPrescriptionIntegrityFlags(program, FIGHTER)
    .filter((f) => f.code === 'V92_FALSE_PRECISION_LOAD');
  assert.equal(flags.length, 4, 'every week carrying the claim is flagged');
  assert.match(flags[0].detail, /RPE selects the weight then the percentage did not/);
});

test('the repair keeps the reference but says RPE decides', () => {
  const program = [1, 2, 3, 4].map((n) => week(n, [
    row('Tue', 'Pull-up', 'RPE-selected load', 'Added load only. About 86% of your +35 kg x 3 benchmark. ' + stop),
  ])).join('\n');
  const fixed = repairPrescriptionIntegrity(program, FIGHTER);
  assert.ok(!/86%/.test(fixed), 'the number that decided nothing is gone');
  assert.match(fixed, /RPE decides/);
  assert.match(fixed, /lighter weight is the right one/,
    'undershooting the reference at the target RPE is correct, not a miss');
  assert.match(fixed, /Added load only/, 'the real coaching cue survives');
  assert.equal(collectPrescriptionIntegrityFlags(fixed, FIGHTER).length, 0);
  assert.equal(repairPrescriptionIntegrity(fixed, FIGHTER), fixed, 'repair is not idempotent');
});

test('a prescribed weight may state its percentage', () => {
  // "86 kg is 77% of 112" is arithmetic about a load the row actually names.
  // Only a by-feel row makes the percentage a claim it cannot support.
  const program = [1, 2, 3, 4].map((n) => week(n, [
    row('Tue', 'Snatch', '86 kg', '86 kg is 77% of 112. ' + stop),
  ])).join('\n');
  assert.equal(collectPrescriptionIntegrityFlags(program, FIGHTER)
    .filter((f) => f.code === 'V92_FALSE_PRECISION_LOAD').length, 0);
});

test('a row that already subordinates the number is left alone', () => {
  const program = [1, 2, 3, 4].map((n) => week(n, [
    row('Tue', 'Pull-up', 'RPE-selected load', 'About 86% of your best, but RPE decides. ' + stop),
  ])).join('\n');
  assert.equal(collectPrescriptionIntegrityFlags(program, FIGHTER)
    .filter((f) => f.code === 'V92_FALSE_PRECISION_LOAD').length, 0);
});

test('nothing new is introduced in the event week', () => {
  const program = [
    week(1, [row('Tue', 'Pull-up', 'RPE-selected load', stop)]),
    week(2, [row('Tue', 'Pull-up', 'RPE-selected load', stop)]),
    week(3, [row('Tue', 'Pull-up', 'RPE-selected load', stop)]),
    week(4, [row('Tue', 'Pull-up', 'RPE-selected load', stop), row('Tue', 'Nordic Curl', 'Bodyweight', stop)]),
  ].join('\n');
  const flags = collectPrescriptionIntegrityFlags(program, FIGHTER)
    .filter((f) => f.code === 'V92_NOVEL_EXERCISE_NEAR_EVENT');
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /Nordic Curl/);

  const fixed = repairPrescriptionIntegrity(program, FIGHTER);
  assert.ok(!/Nordic Curl/.test(fixed), 'the unfamiliar movement is dropped');
  assert.match(fixed, /Pull-up/, 'the familiar work stays');
  assert.equal(repairPrescriptionIntegrity(fixed, FIGHTER), fixed, 'repair is not idempotent');
});

test('the event week says when to stop', () => {
  const program = [1, 2, 3, 4].map((n) => week(n, [
    row('Tue', 'Pull-up', 'RPE-selected load', 'Crisp reps.'),
  ])).join('\n');
  assert.ok(collectPrescriptionIntegrityFlags(program, FIGHTER)
    .some((f) => f.code === 'V92_NO_FATIGUE_STOP_RULE'));

  const fixed = repairPrescriptionIntegrity(program, FIGHTER);
  assert.equal(collectPrescriptionIntegrityFlags(fixed, FIGHTER).length, 0,
    'the repair must answer its own flag');
  assert.equal(repairPrescriptionIntegrity(fixed, FIGHTER), fixed, 'repair is not idempotent');
  assert.match(fixed, /bar speed drops|soreness/);
});

test('an athlete with no event only has the honesty rule applied', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    const clean = [1, 2, 3, 4].map((n) => week(n, [row('Mon', 'Back Squat', '100 kg', 'Work sets.')])).join('\n');
    assert.equal(collectPrescriptionIntegrityFlags(clean, intake).length, 0, id);
    assert.equal(repairPrescriptionIntegrity(clean, intake), clean, id);
  }
});

test('the brief names RPE as the determinant', () => {
  const brief = buildPrescriptionIntegrityBrief(FIGHTER);
  assert.match(brief, /RPE is the real determinant/);
  assert.match(brief, /INTRODUCES NOTHING NEW/);
  assert.match(brief, /SAY WHEN TO STOP/);
});
