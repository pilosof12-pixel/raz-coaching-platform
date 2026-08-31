import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { renderTaperAudit, auditWeek, collectAuditFlags } from '../engine/v73_taper_audit.js';
import { collectEconomyFlags, repairCampEconomy, collectNoveltyFlags, surplusInSession } from '../engine/v74_camp_economy.js';
import { repairCombatPower } from '../engine/v72_combat_power.js';

// Pinned rather than read from docs/qa/.../latest: acceptance runs overwrite
// that directory, and once the engine started preventing these defects the
// live programs stopped exhibiting them -- so the tests were asserting the
// presence of bugs in programs that no longer had any.
const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const LIFTER = COMP.weightlifter_peak;
const FIGHTER = COMP.mma_fight_camp;
const LIFT_BLOCK = fs.readFileSync(new URL('./fixtures/run92_weightlifter_flat.txt', import.meta.url), 'utf8');
const CAMP = fs.readFileSync(new URL('./fixtures/run92_mma_fight_camp_pre_rules.txt', import.meta.url), 'utf8');

test('an athlete with no event gets no audit and no camp rules', () => {
  const g = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(renderTaperAudit(g, intake), '', id);
    assert.equal(collectAuditFlags(g, intake).length, 0, id);
    assert.equal(collectEconomyFlags(g, intake).length, 0, id);
    assert.equal(collectNoveltyFlags(g, intake).length, 0, id);
  }
});

// --- the audit ---------------------------------------------------------------

test('the audit counts what the coach asked to see', () => {
  const w = auditWeek(LIFT_BLOCK, 1, LIFTER);
  assert.equal(w.sets, 73);
  assert.equal(w.classicShare, 40);
  assert.ok(w.peakIntensityPct >= 85, 'peak % of current max is computed');
  assert.ok(w.accessorySets > 0);
  assert.ok(w.exercises > 0);
});

// The block rated 6.8 held everything flat. The audit says so in one line.
test('the audit states the direction of travel', () => {
  const text = renderTaperAudit(LIFT_BLOCK, LIFTER);
  assert.match(text, /TAPER AUDIT/);
  assert.match(text, /Weeks? out|weeks out/i);
  assert.match(text, /volume unchanged/);
  assert.match(text, /competition-lift share unchanged/);
});

test('a block that ends where it started is refused', () => {
  const flags = collectAuditFlags(LIFT_BLOCK, LIFTER);
  assert.ok(flags.some((f) => f.code === 'V73_BLOCK_DOES_NOT_MOVE'));
});

test('the audit names whether the block reaches the event', () => {
  assert.match(renderTaperAudit(LIFT_BLOCK, LIFTER), /does not reach the event/);
  assert.match(renderTaperAudit(CAMP, FIGHTER), /runs into the event/);
});

test('sport sessions are counted as load in the audit', () => {
  assert.match(renderTaperAudit(CAMP, FIGHTER), /Sport sessions counted as load: 7/);
});

// --- camp economy -------------------------------------------------------------

// "one or two meaningful strength-maintenance patterns" is a claim about the
// session, so surplus is judged per session and not per exercise.
test('two strength patterns are kept and the third is surplus', () => {
  const names = ['Pull-up', 'Bench Press', 'Chest-Supported Row', 'Barbell Hip Thrust'];
  const surplus = surplusInSession(names).map((i) => names[i]);
  assert.deepEqual(surplus, ['Chest-Supported Row', 'Barbell Hip Thrust']);
});

test('speed, sled, neck and trunk work always keep their place', () => {
  for (const n of ['Box Jump', 'Prowler Push', 'Neck Isometric', 'Side Plank']) {
    assert.equal(surplusInSession([n]).length, 0, `${n} should earn its place`);
  }
});

test('a busy camp session is trimmed and converges', () => {
  const withPower = repairCombatPower(CAMP, FIGHTER);
  assert.ok(collectEconomyFlags(withPower, FIGHTER).length > 0, 'the reviewed camp is too busy');
  const lean = repairCampEconomy(withPower, FIGHTER);
  assert.equal(collectEconomyFlags(lean, FIGHTER).length, 0);
  assert.equal(repairCampEconomy(lean, FIGHTER), lean, 'idempotent');
});

// The trim must never remove the speed work the other rule just demanded.
test('trimming never removes the power exposure', () => {
  const lean = repairCampEconomy(repairCombatPower(CAMP, FIGHTER), FIGHTER);
  for (const w of [1, 2, 3, 4]) {
    const week = lean.split(`START_WEEK${w}_TSV`)[1].split(`END_WEEK${w}_TSV`)[0];
    assert.match(week, /Trap Bar Jump|Box Jump|Rotational Throw/, `week ${w} lost its speed exposure`);
  }
});

// --- novelty ------------------------------------------------------------------

test('a movement introduced in the taper is refused', () => {
  const withNovel = CAMP.replace(/END_WEEK4_TSV/, 'Tue\tNordic Curl\tBodyweight\t3\t5\t2 min\t8\tNew.\t\nEND_WEEK4_TSV');
  const flags = collectNoveltyFlags(withNovel, FIGHTER);
  assert.ok(flags.some((f) => f.code === 'V74_NOVEL_EXERCISE_NEAR_EVENT' && /Nordic/i.test(f.exercise)));
});

test('a movement carried through the block is not novel', () => {
  assert.equal(collectNoveltyFlags(CAMP, FIGHTER).length, 0);
});
