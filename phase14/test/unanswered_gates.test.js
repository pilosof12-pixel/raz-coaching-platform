// Two rules the ledger said were answered, and were not.
//
// Both were credited to a repair exported by the same module: V46's optional
// qualifier to repairCountClaims, which only ever touched count claims, and
// V70's duplicated conditioning to repairCompetitionBlock, which handled the
// RPE ceiling and the taper volume and nothing else. Adjacency is not proof,
// and proving them is what found this.
//
// Worth recording how the first probe lied: repairCountClaims returns
// { program, repaired, repairs }, the probe passed the whole object to the
// collector, the collector found no program in it and reported no flags. The
// gate looked answered because the measurement was broken. Everything below
// asserts on the program string.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { collectLanguageAccuracyFlags, repairOptionalQualifiers } from '../engine/v46_language_accuracy.js';
import { collectCompetitionFlags, repairCompetitionBlock } from '../engine/v70_competition_rules.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const CORE = JSON.parse(read('acceptance_intakes.json'));
const COMP = JSON.parse(read('competition_avatars.json'));

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const r = (d, n, w, s, reps, rest, rpe, note) => [d, n, w, String(s), reps, rest, String(rpe), note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const four = (rows) => [1, 2, 3, 4].map((n) => wk(n, rows)).join('\n\n');
const onSaturday = (w) => {
  const d = new Date(Date.now() + w * 7 * 86400000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 6 + 7) % 7));
  return d.toISOString().slice(0, 10);
};

const HYBRID = CORE.advanced_hybrid;
const FIGHTER = {
  ...COMP.mma_fight_camp, competition_date: onSaturday(4),
  event_type: 'combat', event_priority: 'A',
};

// V46_OPTIONAL_QUALIFIER_ON_PRIMARY
const optionalFlags = (p) => collectLanguageAccuracyFlags(p, HYBRID)
  .filter((f) => f.code === 'V46_OPTIONAL_QUALIFIER_ON_PRIMARY').map((f) => f.code);

test('primary-goal work is not offered as optional', () => {
  const p = four([r('Mon', 'Back Squat', '150 kg', 3, '5', '3 min', 8, 'Work up to a heavy triple. Optional if you feel fresh.')]);
  assert.equal(optionalFlags(p).length, 4, 'the fixture reads as discretionary to begin with');

  const fixed = repairOptionalQualifiers(p, HYBRID);
  assert.deepEqual(optionalFlags(fixed), [], 'the repair must answer its own flag');
  const note = fixed.split('\n').find((l) => /Back Squat/.test(l)).split('\t')[7];
  assert.match(note, /Work up to a heavy triple\./, 'the real coaching survives');
  assert.ok(!/Optional/i.test(note), 'the qualifier does not');
  assert.match(note, /prescribed rather than offered/);
  assert.equal(repairOptionalQualifiers(fixed, HYBRID), fixed, 'repair is not idempotent');
});

test('a qualifier that names a genuine addition is left alone', () => {
  const p = four([r('Mon', 'Back Squat', '150 kg', 3, '5', '3 min', 8, 'Add an extra back-off set, optional if you feel fresh.')]);
  assert.deepEqual(optionalFlags(p), [], 'naming the addition is what the rule asks for');
  assert.equal(repairOptionalQualifiers(p, HYBRID), p);
});

test('work that is not a primary goal may be offered', () => {
  const p = four([r('Mon', 'Calf Raise', '60 kg', 3, '15', '60 sec', 7, 'Optional if you feel fresh.')]);
  assert.deepEqual(optionalFlags(p), []);
  assert.equal(repairOptionalQualifiers(p, HYBRID), p);
});

// V70_COMBAT_CONDITIONING_DUPLICATED
const conditioningFlags = (p) => collectCompetitionFlags(p, FIGHTER)
  .filter((f) => f.code === 'V70_COMBAT_CONDITIONING_DUPLICATED').map((f) => f.code);

test('conditioning a fighter already gets from sparring is not prescribed', () => {
  const p = four([
    r('Tue', 'Trap Bar Deadlift', 'RPE-selected', 3, '3', '2 min', 7, 'Strength.'),
    r('Tue', 'Assault Bike Intervals', '-', 4, '30 sec', '60 sec', 9, 'Conditioning.'),
    r('Fri', 'Bench Press', 'RPE-selected', 3, '3', '2 min', 7, 'Strength.'),
    r('Fri', 'Pull-up', 'BW', 3, '5', '2 min', 7, 'Pulling.'),
  ]);
  assert.ok(conditioningFlags(p).length > 0, 'the fixture duplicates the sport to begin with');

  const fixed = repairCompetitionBlock(p, FIGHTER);
  assert.deepEqual(conditioningFlags(fixed), [], 'the repair must answer its own flag');
  assert.ok(!/Assault Bike/.test(fixed), 'the duplicated conditioning is gone');
  assert.match(fixed, /Trap Bar Deadlift/, 'and the strength work it sat beside is not');
  assert.equal(repairCompetitionBlock(fixed, FIGHTER), fixed, 'repair is not idempotent');
});

test('a day is never emptied to satisfy the rule', () => {
  // The one case the repair deliberately declines: removing the row would
  // leave the session with nothing in it, which is a different defect.
  const p = four([r('Tue', 'Assault Bike Intervals', '-', 4, '30 sec', '60 sec', 9, 'Conditioning.')]);
  const fixed = repairCompetitionBlock(p, FIGHTER);
  assert.match(fixed, /Assault Bike/, 'the only work on the day stays');
});

// --- three that did converge -------------------------------------------------
//
// Unproven is not the same as broken. These three were never demonstrated, and
// proving them is what makes the difference legible: each raises its code, each
// repair clears it, and now the ledger can see that rather than infer it.

import { collectSemanticFlags, repairSemanticProse } from '../engine/v58_semantic_cleanup.js';
import { collectEconomyFlags, repairCampEconomy } from '../engine/v74_camp_economy.js';
import { collectClockFlags, repairClockStatement } from '../engine/v86_training_clock.js';

test('a malformed coaching note is rewritten, not refused', () => {
  const p = four([r('Tue', 'Trap Bar Deadlift', 'RPE-selected', 2, '3', '2 min', 7, 'Work at at the same effort ..')]);
  assert.ok(collectSemanticFlags(p, FIGHTER).map((f) => f.code).includes('V58_MALFORMED_COACHING_PROSE'));
  const fixed = repairSemanticProse(p, FIGHTER);
  assert.ok(!collectSemanticFlags(fixed, FIGHTER).map((f) => f.code).includes('V58_MALFORMED_COACHING_PROSE'),
    'the repair must answer its own flag');
  assert.equal(repairSemanticProse(fixed, FIGHTER), fixed, 'repair is not idempotent');
});

test('a camp session crowded with surplus work is trimmed', () => {
  const p = four([
    r('Tue', 'Trap Bar Deadlift', 'RPE-selected', 3, '3', '2 min', 7, 'Strength.'),
    r('Tue', 'Bicep Curl', '20 kg', 3, '12', '60 sec', 7, 'Arms.'),
    r('Tue', 'Lateral Raise', '10 kg', 3, '15', '60 sec', 7, 'Shoulders.'),
    r('Tue', 'Calf Raise', '60 kg', 3, '15', '60 sec', 7, 'Calves.'),
    r('Tue', 'Plank', '-', 3, '60 sec', '60 sec', 7, 'Trunk.'),
  ]);
  assert.ok(collectEconomyFlags(p, FIGHTER).map((f) => f.code).includes('V74_CAMP_SESSION_TOO_BUSY'));
  const fixed = repairCampEconomy(p, FIGHTER);
  assert.ok(!collectEconomyFlags(fixed, FIGHTER).map((f) => f.code).includes('V74_CAMP_SESSION_TOO_BUSY'),
    'the repair must answer its own flag');
  assert.match(fixed, /Trap Bar Deadlift/, 'the work that earns its place stays');
  assert.equal(repairCampEconomy(fixed, FIGHTER), fixed, 'repair is not idempotent');
});

test('the clock the block is governed by is stated', () => {
  const p = `This block builds strength.\n\n${four([r('Tue', 'Trap Bar Deadlift', 'RPE-selected', 2, '3', '2 min', 7, 'Hold strength.')])}`;
  assert.ok(collectClockFlags(p, FIGHTER).map((f) => f.code).includes('V86_GOVERNING_CLOCK_NOT_STATED'));
  const fixed = repairClockStatement(p, FIGHTER);
  assert.ok(!collectClockFlags(fixed, FIGHTER).map((f) => f.code).includes('V86_GOVERNING_CLOCK_NOT_STATED'),
    'the repair must answer its own flag');
  assert.equal(repairClockStatement(fixed, FIGHTER), fixed, 'repair is not idempotent');
});
