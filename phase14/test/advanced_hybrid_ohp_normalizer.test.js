import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeAdvancedHybridOHPComplement } from '../engine/advanced_hybrid_ohp_normalizer.js';
import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE, advancedHybridLaunchProgram } from './fixtures/advanced_hybrid_launch.js';

function withoutPushPress(program) {
  return String(program)
    .split('\n')
    .filter((line) => !/^Sun\tPush Press\t/i.test(line))
    .join('\n');
}

function removeWeek2OHP(program) {
  let inWeek2 = false;
  return String(program).split('\n').filter((line) => {
    if (/START_WEEK2_TSV/.test(line)) inWeek2 = true;
    if (/END_WEEK2_TSV/.test(line)) inWeek2 = false;
    return !(inWeek2 && /^Tue\tOverhead Press\t/i.test(line));
  }).join('\n');
}

const advancedIntake = {
  age: 31,
  days_per_week: 4,
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport_sessions_per_week: 5,
  sport: 'MMA / grappling 5 sessions per week',
  primary_goals: ['Back Squat 220 kg', '4 strict One-Arm Pull-ups'],
  secondary_goals: ['Overhead Press 100 kg', 'Marathon'],
  maintenance_goals: ['Maintain muscle'],
  current_numbers: 'Back Squat 205 kg 1RM | One-Arm Pull-up 2 strict each arm | Overhead Press 80 kg x 4',
};

function advancedFourFamilyProgram() {
  const squat = [160, 162.5, 165, 157.5];
  const oapReps = [2, 2, 3, 2];
  const ohp = [75, 77.5, 80, 72.5];
  const run = [10, 10.5, 11, 9];
  const head = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  return [1, 2, 3, 4].map((w) => [
    `START_WEEK${w}_TSV`, head,
    `Mon\tBack Squat\t${squat[w - 1]} kg\t3\t3\t3 min\t7.5\tIf technique, RPE and recovery are on target, use the listed load; otherwise hold the prior load.\t`,
    `Mon\tOne-Arm Pull-up\tBodyweight\t2\t${oapReps[w - 1]} per arm\t3 min\t7\tClean primary-goal reps only.\t`,
    `Sun\tOverhead Press\t${ohp[w - 1]} kg\t4\t4\t2-3 min\t7.5\tSecondary press work.\t`,
    `Fri\tPush Press\tRPE-selected load\t3\t3\t2-3 min\t6.5\tLow-cost secondary press support.\t`,
    `Sun\tRun\tEasy conversational pace\t1\t${run[w - 1]} km\tN/A\t5\tSecondary marathon exposure.\t`,
    `END_WEEK${w}_TSV`,
  ].join('\n')).join('\n\n');
}

test('Advanced Hybrid OHP complement converges missing Push Press without changing strict OHP', () => {
  const raw = withoutPushPress(advancedHybridLaunchProgram());
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(raw, ADVANCED_HYBRID_LAUNCH_INTAKE),
    (error) => error?.code === 'ADVANCED_HYBRID_OHP_ARCHITECTURE',
  );

  const fixed = normalizeAdvancedHybridOHPComplement(raw, ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(fixed.repaired, true);
  // The complement repair adds one Push Press per week and invents no strict OHP.
  // It is counted by its own repairs rather than by the total, because this
  // launch fixture also presses a flat 70 kg for four weeks against a named
  // 100 kg goal -- the defect the coach charged -- so the press now steps too.
  assert.equal(fixed.repairs.filter((r) => r.exercise === 'Push Press').length, 4);
  assert.equal((fixed.program.match(/\tPush Press\t/g) || []).length, 4);
  assert.equal((fixed.program.match(/\tOverhead Press\t/g) || []).length, 4);
  assert.match(fixed.program, /START_WEEK4_TSV[\s\S]*?\tPush Press\tRPE-selected load\t1\t3\t2-3 min\t6\t/);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(fixed.program, ADVANCED_HYBRID_LAUNCH_INTAKE));
});

test('normalizer is idempotent when Push Press already exists', () => {
  const original = advancedHybridLaunchProgram();
  const fixed = normalizeAdvancedHybridOHPComplement(original, ADVANCED_HYBRID_LAUNCH_INTAKE);
  // No Push Press is added, because the block already has one every week.
  // Deloading the existing Week 4 row is a different action and is allowed.
  assert.equal(fixed.repairs.some((r) => r.exercise === 'Push Press' && r.action !== 'deload_complementary_press'), false);
  assert.equal((fixed.program.match(/\tPush Press\t/g) || []).length,
    (original.match(/\tPush Press\t/g) || []).length);
  // The flat 70 kg press does step, once, and then the normalizer is a fixed
  // point -- which is the property this test is really here to hold.
  const again = normalizeAdvancedHybridOHPComplement(fixed.program, ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(again.program, fixed.program);
});

test('normalizer fails closed when strict OHP itself is missing', () => {
  const raw = removeWeek2OHP(withoutPushPress(advancedHybridLaunchProgram()));
  const fixed = normalizeAdvancedHybridOHPComplement(raw, ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(fixed.repairs.some((r) => r.week === 2), false);
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(fixed.program, ADVANCED_HYBRID_LAUNCH_INTAKE),
    (error) => error?.code === 'ADVANCED_HYBRID_OHP_ARCHITECTURE',
  );
});

test('normalizer is a no-op outside high-concurrency hybrid intakes', () => {
  const raw = withoutPushPress(advancedHybridLaunchProgram());
  const intake = { ...ADVANCED_HYBRID_LAUNCH_INTAKE, sport_sessions_per_week: 0, sport_schedule: [] };
  const fixed = normalizeAdvancedHybridOHPComplement(raw, intake);
  assert.equal(fixed.repaired, false);
  assert.equal(fixed.program, raw);
});

test('shared production bundle wires the deterministic OHP complement before semantic release QA', () => {
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizeAdvancedHybridOHPComplement/);
  assert.match(bundle, /type: 'advanced_hybrid_ohp_complement'/);
});

// Coach review of the delivered Advanced Hybrid (9.0): "The secondary goal is
// 100 kg OHP, with current performance 80x4, yet the only strict OHP exposure is
// 65 kg, 65, 65, 67.5... I don't want more total pressing. I want the existing
// pressing budget allocated better. Do not leave a named 100 kg strength goal
// essentially flat for three weeks."
test('a named press goal is not left flat when the hierarchy has no objection', async () => {
  const fsm = await import('node:fs');
  const A = JSON.parse(fsm.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
  const { parseWeek } = await import('../engine/v34_workload_accounting.js');
  const delivered = fsm.readFileSync(new URL('./fixtures/advanced_hybrid-program.txt', import.meta.url), 'utf8');

  const press = (program, week) => {
    const parsed = parseWeek(program, week);
    const row = parsed.rows.find((c) => /^Overhead Press$/i.test(String(c[parsed.exercise]).trim()));
    const warm = parsed.rows.find((c) => /\[WARMUP\]/i.test(String(c[parsed.exercise])) && /Ramp Overhead Press/.test(String(c[parsed.notes])));
    return {
      load: String(row[parsed.load]).trim(),
      note: String(row[parsed.notes]),
      ramp: warm ? String(warm[parsed.notes]).match(/before ([\d.]+) kg work sets/)?.[1] : null,
    };
  };

  // The block progresses squat and One-Arm Pull-up and holds the marathon, so
  // stepping the press makes three progressing families -- AH-01 refuses at four.
  for (const w of [1, 2, 3]) assert.equal(press(delivered, w).load, '65 kg');

  const out = normalizeAdvancedHybridOHPComplement(delivered, A.advanced_hybrid);
  assert.equal(press(out.program, 1).load, '65 kg');
  assert.equal(press(out.program, 2).load, '67.5 kg');
  assert.equal(press(out.program, 3).load, '70 kg');

  // The warm-up ramp follows the load actually prescribed; a stale ramp is how
  // this row broke before.
  for (const w of [1, 2, 3]) assert.equal(press(out.program, w).ramp, press(out.program, w).load.replace(' kg', ''));

  // Conditional language, because AH-01's sibling rule refuses an unconditional
  // increase on a major lift -- and because the athlete may not have earned it.
  assert.match(press(out.program, 2).note, /only if .*crisp at or under RPE 8|otherwise repeat/i);
  // No extra pressing: the coach asked for the existing budget reallocated.
  for (const w of [2, 3]) {
    const parsed = parseWeek(out.program, w);
    const row = parsed.rows.find((c) => /^Overhead Press$/i.test(String(c[parsed.exercise]).trim()));
    assert.equal(row[parsed.sets], '2');
    assert.equal(row[parsed.reps], '4');
  }
  // And it settles.
  assert.equal(normalizeAdvancedHybridOHPComplement(out.program, A.advanced_hybrid).program, out.program);
});

test('a press the hierarchy held is never stepped back up', () => {
  // The hold flattens the press; a step that reads "flat" as "never progressed"
  // would put it straight back, and the two repairs would oscillate for ever.
  // That is the failure this module was written to prevent.
  const original = advancedFourFamilyProgram();
  const once = normalizeAdvancedHybridOHPComplement(original, advancedIntake);
  assert.match(once.program, /START_WEEK2_TSV[\s\S]*?Overhead Press\t75 kg/i);
  const twice = normalizeAdvancedHybridOHPComplement(once.program, advancedIntake);
  assert.equal(twice.program, once.program, 'the held press must be a fixed point');
  assert.match(twice.program, /START_WEEK3_TSV[\s\S]*?Overhead Press\t75 kg/i);
});

test('the complementary press consolidates in Week 4 like everything else', async () => {
  const fsm = await import('node:fs');
  const A = JSON.parse(fsm.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
  const { parseWeek } = await import('../engine/v34_workload_accounting.js');
  const delivered = fsm.readFileSync(new URL('./fixtures/advanced_hybrid-program.txt', import.meta.url), 'utf8');

  const pushSets = (program, week) => {
    const parsed = parseWeek(program, week);
    const c = parsed.rows.find((r) => /^Push Press$/i.test(String(r[parsed.exercise]).trim()));
    return c ? c[parsed.sets] : null;
  };

  // makePushPressRow already writes 1 set in Week 4 and 2 in the build weeks, so
  // that is this module's own statement of the right dose. A block that arrived
  // with its own Push Press never went through that path: the delivered one
  // carries 2 x 3 in all four weeks, identical through a consolidation week the
  // rest of the block deloads.
  assert.equal(pushSets(delivered, 4), '2');
  const out = normalizeAdvancedHybridOHPComplement(delivered, A.advanced_hybrid);
  assert.equal(pushSets(out.program, 4), '1');
  // Build weeks are untouched -- this never adds pressing, and the coach asked
  // for Push Press to be the optional press, not a standing one.
  for (const w of [1, 2, 3]) assert.equal(pushSets(out.program, w), '2', `week ${w}`);
  assert.equal(normalizeAdvancedHybridOHPComplement(out.program, A.advanced_hybrid).program, out.program);
});
