// The repair chain, held to what it currently achieves on every program we have
// actually delivered.
//
// The stress suite ratchets ten fixtures against per-avatar severity ceilings.
// This ratchets the other twenty-six: real delivered programs, including the
// four the coach scored himself. They overlap but are not the same set, and a
// repair that converges on a fixture can still behave differently on the fresh
// output that fixture was derived from.
//
// Numbers below are measurements, not targets. Lower them when the corpus
// improves; do not raise them to make a change pass.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sweep } from '../scripts/grade_delivered.mjs';

const total = (rows) => rows.reduce((n, r) => n + r.severity, 0);

// Re-baselined once, when ACCESSORY_REDUNDANCY and COMPONENT_LOAD_UNANCHORED
// were connected to the coach's own deduction lines. Both fired and cost zero:
// the first seventeen times across the corpus, which made it the most common
// defect we record and the cheapest. Nothing about the programs changed on the
// day these numbers moved -- 21.35 to 24.56 delivered, 4.40 to 5.45 repaired,
// and seventeen clean programs to fourteen. The three that stopped being clean
// were carrying a defect the whole time that was being charged nothing.
test('the repair chain takes the delivered corpus from 24.56 severity to 5.55', () => {
  const before = sweep({ repaired: false });
  const after = sweep({ repaired: true });

  assert.equal(before.length, 26, 'corpus size changed; re-baseline deliberately');
  assert.equal(after.length, 26);

  assert.equal(Number(total(before).toFixed(2)), 24.56);
  // Tightened from 5.45 after the coach's run #124 review: his taper ballistic
  // ceiling, the competition-order sequencing and the note-named-movement rename
  // between them took the corpus down rather than up, and a ratchet left at the
  // old number would let that be given back.
  // Re-baselined 5.25 -> 5.55, upward, which this file otherwise forbids. The
  // 0.30 is one program, run84, going from 0.00 to 0.50, and it is a defect
  // becoming visible rather than a defect appearing.
  //
  // repairGoalSpeed was driving that block's easy runs to 95% and 97% of 3K
  // goal speed and leaving the words "Easy conversational pace" in front of
  // them: weeks 3 and 4 told a runner whose 3K pace is 4:30/km to run easy at
  // 4:12 and 4:07. Two things were bought with that. The build stopped being
  // refused, because the gate that catches exactly this was the one blocking
  // it -- convergence is 22 -> 23 without it. And STATED_PROGRESSION_ABSENT
  // stopped firing, because rewriting the easy rows every week looked like the
  // progression the prose promises.
  //
  // It is not. The block promises to rebuild easy-run DISTANCE toward the top
  // of an 18-20 km range, and the easy runs are static at 7 km and 5 km in
  // every week. That finding is correct and is now the next thing to repair.
  assert.ok(total(after) <= 5.55 + 1e-9,
    `residual severity ${total(after).toFixed(2)} above the 5.55 ceiling`);
});

test('no delivered program gets worse for being repaired', () => {
  // The chain is allowed to leave a finding it cannot fix. It is not allowed to
  // introduce one. This is the whole-corpus form of the brokeSomething() guard
  // each destructive repair runs on itself.
  const before = new Map(sweep({ repaired: false }).map((r) => [r.file, r.severity]));
  for (const r of sweep({ repaired: true })) {
    assert.ok(r.severity <= before.get(r.file) + 1e-9,
      `${r.file} went from ${before.get(r.file).toFixed(2)} to ${r.severity.toFixed(2)}`);
  }
});

test('thirteen of the twenty-six repair to zero severity', () => {
  // Fourteen until run84's easy-run defect stopped being masked; see the
  // re-baseline note above. That program's 0.00 was bought by prescribing
  // faster-than-race-pace running as conversational.
  const clean = sweep({ repaired: true }).filter((r) => r.severity === 0).length;
  assert.ok(clean >= 13, `only ${clean} programs at zero severity, was 13`);
});

test('every residual finding is a known kind', () => {
  // This used to also assert the count was exactly 29. It is not stable: with
  // the clock moved forward a day at a time the count moves between 28 and 32
  // while the severity does not move at all, because the rules that come and go
  // are the ones charging zero -- a taper compressed into the final week, heavy
  // lower work near a speed session. Pinning the count made the suite fail on
  // Wednesdays for a reason that had nothing to do with the programs.
  //
  // The enumeration is the guard that was doing the work anyway: a new kind of
  // residual cannot hide in a count, known or not.
  const after = sweep({ repaired: true });

  // Collected empirically by grading the corpus with the process clock moved
  // forward one day at a time across two weeks, not by reading them off one run.
  const KNOWN = new Set([
    'ACCESSORY_REDUNDANCY',
    'COMPONENT_LOAD_UNANCHORED',
    'COMPROMISED_RUNNING_MISSING',
    'CONSECUTIVE_LOWER_LEG_DAYS',
    'CONSECUTIVE_TRAINING_DAYS',
    'HEAVY_LOWER_WITHIN_48H_OF_SPEED',
    'IMPROVEMENT_GOAL_FLAT',
    'MODALITY_SUBSTITUTION_KEEPS_THE_NUMBER',
    'RECOVERY_DAYS_BELOW_MINIMUM',
    'STATED_PROGRESSION_ABSENT',
    'TAPER_CUTS_FREQUENCY_NOT_VOLUME',
    'TAPER_VOLUME_NOT_REDUCED',
  ]);
  for (const r of after) {
    for (const f of r.findings) {
      assert.ok(KNOWN.has(f.rule), `unrecognised residual ${f.rule} on ${r.file}`);
    }
  }
});
