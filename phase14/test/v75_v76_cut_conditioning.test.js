import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  cutSize, cutSeverity, cutIsActive, weighInWindow,
  collectWeightCutFlags, repairWeightCutLoad, buildWeightCutBrief,
} from '../engine/v75_weight_cut.js';
import {
  collectConditioningFlags, statedConditioningGap, buildConditioningBrief,
} from '../engine/v76_conditioning_gap.js';
import { intakeClarificationResult } from '../intake_clarification.js';

// Pinned rather than read from docs/qa/.../latest: acceptance runs overwrite
// that directory, and once the engine started preventing these defects the
// live programs stopped exhibiting them -- so the tests were asserting the
// presence of bugs in programs that no longer had any.
const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const FIGHTER = COMP.mma_fight_camp;
const CAMP = fs.readFileSync(new URL('./fixtures/run92_mma_fight_camp_pre_rules.txt', import.meta.url), 'utf8');

test('neither rule touches an athlete with no event', () => {
  const g = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(collectWeightCutFlags(g, intake).length, 0, id);
    assert.equal(collectConditioningFlags(g, intake).length, 0, id);
    assert.equal(buildWeightCutBrief(intake), '', id);
    assert.equal(buildConditioningBrief(intake), '', id);
  }
});

// --- the cut -------------------------------------------------------------------

test('the size of the cut is read from what the athlete wrote', () => {
  assert.equal(cutSize({ weight_vs_class: '81 kg now, 77 kg class' }), 4);
  assert.equal(cutSize({ notes: 'needs to cut 3 kg' }), 3);
  assert.equal(cutSize({ notes: 'no weight class' }), null);
});

// Above roughly 5% of bodyweight is a hard cut whatever the athlete calls it.
test('a large cut escalates regardless of how it was described', () => {
  const s = cutSeverity({ bodyweight: '77 kg', weight_vs_class: '81 kg now, 77 kg class', weight_class_status: 'routine' });
  assert.equal(s.level, 'difficult');
  assert.ok(s.pct > 5);
});

test('weigh-in timing is read as hours before the event', () => {
  const hours = weighInWindow({ weigh_in_date: '2026-10-01', competition_date: '2026-10-02' });
  assert.equal(hours, 24);
  assert.equal(weighInWindow({ notes: 'same-day weigh-in' }), 4);
});

test('effort above the ceiling during a cut is flagged and held', () => {
  const hard = CAMP.replace(/END_WEEK4_TSV/, 'Tue\tTrap Bar Deadlift\t180 kg\t3\t3\t3 min\t9\tHeavy.\t\nEND_WEEK4_TSV');
  assert.ok(collectWeightCutFlags(hard, FIGHTER).some((f) => f.code === 'V75_EFFORT_TOO_HIGH_DURING_CUT'));
  const fixed = repairWeightCutLoad(hard, FIGHTER);
  assert.equal(collectWeightCutFlags(fixed, FIGHTER).length, 0);
  assert.equal(repairWeightCutLoad(fixed, FIGHTER), fixed, 'idempotent');
  assert.match(fixed, /while making weight/);
});

// How to make weight is a medical question, and the engine should say so.
test('the brief refuses to prescribe the cut itself', () => {
  const brief = buildWeightCutBrief({ ...FIGHTER, weight_vs_class: '81 kg now, 77 kg class' });
  assert.match(brief, /medical question/);
  assert.match(brief, /Do not answer weight-cut fatigue with more training/);
});

// --- conditioning ----------------------------------------------------------------

test('the delivered camp adds no duplicate conditioning', () => {
  assert.equal(collectConditioningFlags(CAMP, FIGHTER).length, 0);
});

test('a hard circuit on top of seven sport sessions is refused', () => {
  const bad = CAMP.replace(/END_WEEK2_TSV/, 'Tue\tAssault Bike Intervals\tHard\t5\t60 sec\t60 sec\t9\tCardio.\t\nEND_WEEK2_TSV');
  assert.ok(collectConditioningFlags(bad, FIGHTER).some((f) => f.code === 'V76_CONDITIONING_DUPLICATES_SPORT'));
});

// The rule is not "no conditioning" -- it is that hard work must fill a gap.
test('a stated deficit licenses supplemental conditioning', () => {
  const bad = CAMP.replace(/END_WEEK2_TSV/, 'Tue\tAssault Bike Intervals\tHard\t5\t60 sec\t60 sec\t9\tCardio.\t\nEND_WEEK2_TSV');
  const withGap = { ...FIGHTER, notes: `${FIGHTER.notes} He gasses out in the third round.` };
  assert.equal(statedConditioningGap(withGap), 'stated');
  assert.equal(collectConditioningFlags(bad, withGap).length, 0);
});

test('alactic sled work and easy aerobic work are never the problem', () => {
  const withSled = CAMP.replace(/END_WEEK2_TSV/, 'Tue\tHill Sprint\t10 m\t4\t10 m\t2 min\t8\tAlactic.\t\nEND_WEEK2_TSV');
  assert.equal(collectConditioningFlags(withSled, FIGHTER).length, 0);
});

test('the brief names the qualities worth supplementing', () => {
  const brief = buildConditioningBrief(FIGHTER);
  assert.match(brief, /aerobic base/);
  assert.match(brief, /short alactic power/);
  assert.match(brief, /does not duplicate the sport/i);
});

// --- the intake ------------------------------------------------------------------

test('a fighter is asked about making weight, once', () => {
  const asked = (i) => intakeClarificationResult(i).questions.some((q) => q.id === 'weight_class_plan');
  assert.equal(asked({ primary_goals: ['Win my fight'], sport: 'MMA', competition_date: '2026-10-01' }), true);
  assert.equal(asked({ primary_goals: ['Win my fight'], sport: 'MMA', competition_date: '2026-10-01', weight_class_status: 'difficult' }), false);
  assert.equal(asked({ primary_goals: ['Squat 200kg'], competition_date: '2026-10-01' }), false);
});
