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

test('the chain converges on at least 18 of the 26 delivered programs', () => {
  assert.equal(rows.length, 26, 'corpus size changed; re-baseline deliberately');
  const accepted = rows.filter((r) => r.accepted).length;
  assert.ok(accepted >= 18, `only ${accepted} of 26 converge; this number must not fall`);
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
    'run113_mma_camp_delivered.txt',
    'run114_weightlifter_peak.txt',
    'run116_dual_event_hyrox.txt',
    'run84_tactical_3k.txt',
    'run92_mma_fight_camp_pre_rules.txt',
    'run96_weightlifter_intensification.txt',
    'run97_mma_camp_delivered.txt',
  ], 'a new fixture stopped converging, or one started; re-baseline deliberately');
});
