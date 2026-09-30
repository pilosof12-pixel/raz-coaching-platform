import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectFreestandingBalanceFlags,
  freestandingHandstandGoal,
  normalizeFreestandingBalance,
} from '../engine/freestanding_balance_progression.js';

const YOUTH = {
  age: 13,
  days_per_week: 2,
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  current_numbers: 'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
};
const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (ex, sets, reps) => ['Session A', ex, 'Bodyweight', String(sets), reps, '60s', 'N/A', 'Skill.', ''].join('\t');
const program = (rows) => [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');

// Entry skill and position capacity, but no balance time -- the shape the coach
// found in the delivered block.
const entryAndWallOnly = program([
  row('Controlled Handstand Kick-up', 3, '2'),
  row('Wall Handstand Hold', 3, '20 sec'),
]);

test('a kick-up is an entry and a wall hold is position capacity; neither is balance', () => {
  assert.equal(freestandingHandstandGoal(YOUTH), true);
  const flags = collectFreestandingBalanceFlags(entryAndWallOnly, YOUTH);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V106_FREESTANDING_BALANCE_MISSING');
  assert.deepEqual(flags[0].weeks, [1, 2, 3, 4]);
});

test('a block that already trains unsupported balance is left alone', () => {
  const withBalance = program([
    row('Controlled Handstand Kick-up', 3, '2'),
    row('Freestanding Handstand Hold', 2, 'up to 8 sec'),
  ]);
  assert.deepEqual(collectFreestandingBalanceFlags(withBalance, YOUTH), []);
  assert.equal(normalizeFreestandingBalance(withBalance, YOUTH).repaired, false);
});

test('the exposure goes in fresh, straight after the entry skill', () => {
  const out = normalizeFreestandingBalance(entryAndWallOnly, YOUTH);
  assert.equal(out.repaired, true);
  const w1 = out.program.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0].split('\n').filter((l) => l.includes('\t'));
  const kick = w1.findIndex((l) => l.includes('\tControlled Handstand Kick-up\t'));
  const hold = w1.findIndex((l) => l.includes('\tFreestanding Handstand Hold\t'));
  assert.equal(hold, kick + 1, 'the entry is the warm-up for the balance');
});

test('what progresses is the hold, not the volume', () => {
  const out = normalizeFreestandingBalance(entryAndWallOnly, YOUTH);
  const cellsFor = (w) => out.program.match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?END_WEEK${w}_TSV`))[0]
    .split('\n').find((l) => l.includes('\tFreestanding Handstand Hold\t')).split('\t');
  // "Do not fix this by adding lots more volume. At age 13, I'd rather have
  // short, frequent, high-quality attempts with clear success criteria."
  for (const w of [1, 2, 3, 4]) assert.equal(cellsFor(w)[3], '2', `week ${w} set count must not move`);
  assert.match(cellsFor(1)[4], /5 sec/);
  assert.match(cellsFor(2)[4], /8 sec/);
  assert.match(cellsFor(3)[4], /12 sec/);
  // And the standard is stated rather than implied.
  assert.match(cellsFor(1)[7], /that second IS the skill/i);
  assert.match(cellsFor(1)[7], /stop the set when the entries stop being controlled/i);
});

test('it counts toward the handstand goal once added', async () => {
  const { parseProgramModel, directGoalExposures } = await import('../engine/program_model.js');
  const out = normalizeFreestandingBalance(entryAndWallOnly, YOUTH);
  const model = parseProgramModel(out.program, YOUTH);
  const names = directGoalExposures(model, 'handstand', 1)
    .map((e) => String((e.exercise || e).display_name || (e.exercise || e).name));
  assert.ok(names.some((n) => /Freestanding Handstand Hold/i.test(n)));
  // The wall hold is position capacity and must still not count as the goal.
  assert.equal(names.some((n) => /Wall Handstand Hold/i.test(n)), false);
});

test('an athlete who already owns the balance is not given the acquisition rung', () => {
  const owns = { ...YOUTH, current_numbers: 'Holds a freestanding handstand for 30 seconds consistently.' };
  assert.equal(freestandingHandstandGoal(owns), false);
  assert.deepEqual(collectFreestandingBalanceFlags(entryAndWallOnly, owns), []);
});

test('the repair converges and is idempotent', () => {
  const once = normalizeFreestandingBalance(entryAndWallOnly, YOUTH);
  assert.deepEqual(collectFreestandingBalanceFlags(once.program, YOUTH), []);
  const twice = normalizeFreestandingBalance(once.program, YOUTH);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

test('the production bundle applies it', async () => {
  const fs = await import('node:fs');
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizeFreestandingBalance\(candidate, intake\)/);
});

test('every note agrees with the dose printed on its own row', () => {
  const out = normalizeFreestandingBalance(entryAndWallOnly, YOUTH);
  const forbidden = /to failure|amrap|forced rep|grind(?:er|ing)?/i;
  let previousSets = null;
  for (const w of [1, 2, 3, 4]) {
    const cells = out.program.match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?END_WEEK${w}_TSV`))[0]
      .split('\n').find((l) => l.includes('\tFreestanding Handstand Hold\t')).split('\t');
    const [, , , sets, , , , note] = cells;
    // Coaching Specification v1.0 YG-07: youth skill work stays technical.
    assert.doesNotMatch(note, forbidden, `week ${w} note uses failure language`);
    // A note claiming the attempts changed while the sheet holds them constant
    // is the kind of contradiction a coach reads as carelessness.
    if (previousSets !== null && sets === previousSets) {
      // Ruling a change out is not announcing one. "not by taking more attempts"
      // is exactly the standard this check exists to protect, so every way of
      // forbidding a change in attempts comes out before the sentence is judged
      // -- the same false positive YG-07 hit with "no grinders".
      const claim = note
        .replace(/\b(?:not|never|rather than|instead of|without)\s+(?:by\s+)?(?:taking\s+|adding\s+|doing\s+)?(?:any\s+)?(?:more|extra|fewer|additional)\s+attempts\b/gi, '');
      assert.doesNotMatch(claim, /fewer attempts|more attempts|extra attempts/i,
        `week ${w} note claims the attempt count moved, but the row still says ${sets} sets`);
    }
    previousSets = sets;
  }
});
