// Does the gate accept what the chain produces?
//
// The corpus ratchet next door measures the coach's severity after repair,
// which is quality. This measures the thing that costs money: whether
// validateRepairableProgramBundle -- the gate a live build must satisfy before
// it may ship -- accepts the repaired program at all.
//
// A program it refuses is a live build that regenerates, and run #132 is what
// that costs: four calls, an hour, no program, and the last of an OpenAI
// balance. Every unconverged fixture here is that failure waiting for an
// athlete to trigger it, so the count belongs in a test rather than in
// someone's head.
//
// Numbers are measurements, not targets. Raise the accepted count when the
// chain improves; never lower it to make a change pass.

import test from 'node:test';
import assert from 'node:assert/strict';

import { convergence } from '../scripts/corpus_convergence.mjs';

const rows = convergence();

test('the chain converges on at least 20 of the 26 delivered programs', () => {
  assert.equal(rows.length, 26, 'corpus size changed; re-baseline deliberately');
  const accepted = rows.filter((r) => r.accepted).length;
  assert.ok(accepted >= 20, `only ${accepted} of 26 converge; this number must not fall`);
});

test('no fixture is blocked by a defect the chain inflicts on itself', () => {
  // run81's carry was the second of these found in one day. The delivered
  // program was clean and repairRuckDistance wrote 76, 75, 74, 74 minutes into
  // it -- each week's duration computed from that week's pace against a fixed
  // target distance, so improving pace shortened the carry and the gate saw a
  // block whose duration fell and whose distance never moved. The first was
  // v50 deleting the only foundational pull off a skill day.
  //
  // Both were invisible because nothing measured convergence. This names the
  // ones we know about so a regression is loud.
  const blocked = rows.filter((r) => !r.accepted).map((r) => r.file).sort();
  assert.ok(!blocked.includes('run81_tactical_3k.txt'),
    'the carry repair must not re-introduce V38_CARRY_PACE_ONLY_PROGRESSION');
  assert.ok(!blocked.includes('run130_advanced_calisthenics.txt'));
});

test('the unconverged set is exactly the one we have accounted for', () => {
  const blocked = rows.filter((r) => !r.accepted).map((r) => r.file).sort();
  assert.deepEqual(blocked, [
    'mma_fight_camp-program.txt',
    'run114_weightlifter_peak.txt',
    'run116_dual_event_hyrox.txt',
    'run84_tactical_3k.txt',
    'run96_weightlifter_intensification.txt',
    'run97_mma_camp_delivered.txt',
  ], 'a new fixture stopped converging, or one started; re-baseline deliberately');
});

test('the fight-camp calendar no longer blocks its own builds', () => {
  // Six codes came off these programs in sequence, and every one was ours: a
  // 90s rest against a 120s alactic minimum, three sets against a two-set
  // primer cap, a movement the week already carried, rows swapped in after the
  // fight-week clock was written, a calendar that assumed the bout was always
  // in week 4, and then a calendar that blanked the days past it while the week
  // table still trained on them.
  //
  // The last one was the coach's ruling rather than a bug: Day 0 ends the
  // pre-event phase, not the delivered four weeks, so days after it are
  // classified as post-event instead of erased. Two of these programs now
  // converge outright.
  const stillBlocked = rows.filter((r) => !r.accepted && /mma|fight_camp/.test(r.file));
  assert.equal(stillBlocked.length, 2, 'run113 and run92 converge now');
  const codes = new Set(stillBlocked.flatMap((r) => r.codes));
  assert.deepEqual([...codes], ['V92_NOVEL_EXERCISE_NEAR_EVENT'],
    'what is left is a different rule about novelty, not the calendar');
});
