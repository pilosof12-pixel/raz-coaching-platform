import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAdvancedHybridWeek4OapConsolidation } from '../engine/advanced_hybrid_oap_consolidation_normalizer.js';
import { validateAdvancedHybridQualitySemantic } from '../engine/advanced_hybrid_quality.js';

const intake = {
  age: 30,
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  maintenance_goals: ['Maintain muscle mass'],
  days_per_week: 4,
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport: 'MMA',
  sport_sessions_per_week: 5,
  current_numbers: [
    'Back Squat: 205 kg 1RM',
    'One-Arm Pull-up: 2 strict reps each arm',
    'Overhead Press: 80 kg x 4',
    'Running: 1 session a week, about 20 km total, longest recent run about 20 km',
  ].join('\n'),
  notes: 'Advanced hybrid athlete. Primary strength and calisthenics goals outrank the marathon side quest.',
};

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function row(day, exercise, weight, sets, reps, rpe, notes='') {
  return [day, exercise, weight, String(sets), String(reps), '3 min', String(rpe), notes, ''].join('\t');
}
// The Advanced validator demands a real progressive load ramp before every
// heavy barbell exposure, so the fixture has to carry one or it fails on a rule
// that has nothing to do with the OAP consolidation these tests cover.
function ramp(day, exercise, loads) {
  const anchors = loads.map((kg, i) => `${kg} kg x ${5 - i}`).join(', ');
  return row(day, `[WARMUP] ${exercise} ramp`, '', 1, '-', '5', `Empty bar x 8, then ${anchors}.`);
}
function week(n, strictSets) {
  const squatHeavy = [165, 170, 175, 165][n - 1];
  const squatVolume = [145, 150, 155, 145][n - 1];
  const w4 = n === 4;
  const rows = [
    ramp('Mon', 'Back Squat', [60, 100, 130]),
    row('Mon', 'Back Squat', `${squatHeavy} kg`, w4 ? 2 : 3, '3', w4 ? '7' : n === 3 ? '8' : '7.5', 'Primary heavy squat exposure.'),
    ramp('Tue', 'Back Squat', [60, 90, 120]),
    row('Tue', 'Back Squat', `${squatVolume} kg`, w4 ? 1 : 2, '6', w4 ? '6.5' : '7', 'Lower-cost squat specificity exposure.'),
    ramp('Tue', 'Overhead Press', [20, 40, 55]),
    row('Tue', 'Overhead Press', w4 ? '62.5 kg' : '65 kg', w4 ? 1 : 2, '5', w4 ? '6.5' : '7', 'Secondary press exposure.'),
    row('Tue', 'Push Press', w4 ? '60 kg' : '62.5 kg', w4 ? 1 : 2, '3', w4 ? '6' : '7', 'Low-cost complementary vertical press.'),
    row('Fri', 'One-Arm Pull-up', 'BW', strictSets, '1 / arm', w4 ? '7' : '8', 'Strict quality singles, full reset between arms.'),
    row('Fri', 'Weighted Chin-up', '+45 kg', w4 ? 1 : 2, '5', w4 ? '6.5' : '7', 'Bilateral pull support.'),
    row('Sun', 'Assisted One-Arm Pull-up', 'Light band', w4 ? 2 : 3, '2 / arm', w4 ? '6' : '7', 'Clean assisted unilateral volume.'),
    row('Sun', 'Dumbbell Bench Press', 'RPE-selected load', w4 ? 1 : 2, '6', w4 ? '6' : '7', 'Low-cost upper support.'),
    // One easy marathon-support run a week, dropping in Week 4. The marathon is
    // a secondary goal here, and the validator rejects both its absence and any
    // attempt to make it hard.
    row('Sun', 'Run', `${[16, 18, 20, 14][n - 1]} km`, 1, 'continuous', w4 ? '5' : '6', 'Easy conversational pace, marathon support only.'),
  ];
  return `START_WEEK${n}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
}
// Week 3 is addressable on its own. Weeks 1-3 are otherwise byte-identical, so
// a string replace aimed at "the Week 3 row" silently rewrote Week 1 instead and
// the test asserted against a program it never built.
// The Sets cell of every strict One-Arm Pull-up row, week by week. The normalizer
// has two jobs -- cap Week 4 volume, and write the Week 1-3 build standard into
// the notes -- so "the volume repair did nothing" has to be asserted on the set
// cells rather than on the whole program text.
function strictOapSetCells(text) {
  return String(text).split('\n')
    .filter((line) => /\tOne-Arm Pull-up\t/.test(line))
    .map((line) => line.split('\t')[3]);
}

function program(w4StrictSets = 4, w3StrictSets = 3) {
  return [week(1, 3), week(2, 3), week(3, w3StrictSets), week(4, w4StrictSets)].join('\n\n');
}

test('Advanced validator rejects Week 4 strict OAP set volume above Week 3', () => {
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(program(4), intake),
    (error) => error?.code === 'ADVANCED_HYBRID_WEEK4_OAP_VOLUME_INCREASED',
  );
});

test('deterministic Advanced repair caps Week 4 strict OAP volume at Week 3 without touching assisted work', () => {
  const bad = program(4);
  const fixed = normalizeAdvancedHybridWeek4OapConsolidation(bad, intake);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /START_WEEK4_TSV[\s\S]*Fri\tOne-Arm Pull-up\tBW\t3\t1 \/ arm/);
  assert.match(fixed.program, /Sun\tAssisted One-Arm Pull-up\tLight band\t2\t2 \/ arm/);
  assert.match(fixed.program, /Week 4 consolidation: retain Week 3 strict one-arm pull-up quality/i);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(fixed.program, intake));
});

test('Advanced repair is a no-op when Week 4 already holds or reduces strict OAP volume', () => {
  const good = program(3);
  const fixed = normalizeAdvancedHybridWeek4OapConsolidation(good, intake);
  assert.equal(fixed.repairs.some((r) => r.type === 'week4_strict_oap_volume'), false);
  assert.deepEqual(strictOapSetCells(fixed.program), strictOapSetCells(good));
  const again = normalizeAdvancedHybridWeek4OapConsolidation(fixed.program, intake);
  assert.equal(again.repaired, false);
  assert.equal(again.program, fixed.program);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(fixed.program, intake));
});

test('Week 4 set cell with per-arm suffix is parsed exactly like the release validator and converges to an exact set count', () => {
  const bad = program(4).replace(
    'Fri\tOne-Arm Pull-up\tBW\t4\t1 / arm',
    'Fri\tOne-Arm Pull-up\tBW\t4 / arm\t1 / arm',
  );
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(bad, intake),
    (error) => error?.code === 'ADVANCED_HYBRID_WEEK4_OAP_VOLUME_INCREASED',
  );
  const fixed = normalizeAdvancedHybridWeek4OapConsolidation(bad, intake);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /START_WEEK4_TSV[\s\S]*Fri\tOne-Arm Pull-up\tBW\t3\t1 \/ arm/);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(fixed.program, intake));
});

test('Week 3 set range uses the same conservative first-number metric as the release validator', () => {
  const bad = program(3, '2-3');
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(bad, intake),
    (error) => error?.code === 'ADVANCED_HYBRID_WEEK4_OAP_VOLUME_INCREASED',
  );
  const fixed = normalizeAdvancedHybridWeek4OapConsolidation(bad, intake);
  assert.equal(fixed.repaired, true);
  assert.match(fixed.program, /START_WEEK4_TSV[\s\S]*Fri\tOne-Arm Pull-up\tBW\t2\t1 \/ arm/);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(fixed.program, intake));
});

test('set range is left unchanged when its first-number metric already satisfies consolidation', () => {
  const good = program(4).replace(
    'Fri\tOne-Arm Pull-up\tBW\t4\t1 / arm',
    'Fri\tOne-Arm Pull-up\tBW\t3-4\t1 / arm',
  );
  const fixed = normalizeAdvancedHybridWeek4OapConsolidation(good, intake);
  assert.equal(fixed.repairs.some((r) => r.type === 'week4_strict_oap_volume'), false);
  assert.deepEqual(strictOapSetCells(fixed.program), strictOapSetCells(good));
  const again = normalizeAdvancedHybridWeek4OapConsolidation(fixed.program, intake);
  assert.equal(again.repaired, false);
  assert.equal(again.program, fixed.program);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(good, intake));
});

// --- the amendment has to fit the defect -------------------------------------

test('the marathon-subordination amendment names which of the three states it is', () => {
  const noRun = program().split('\n').filter((l) => !/\tRun\t/.test(l)).join('\n');
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(noRun, intake),
    (error) => {
      assert.equal(error.code, 'ADVANCED_HYBRID_MARATHON_SUBORDINATION');
      // Live run #148 failed this rule, read "do not add extra hard endurance
      // work" as "take the running out", came back with none, and failed four
      // more gates for it. A week with no running must be told to add one.
      assert.match(error.amendment, /contains no running at all/i);
      assert.match(error.amendment, /removing running is not the fix/i);
      assert.match(error.amendment, /Add exactly one substantive easy, conversational run/i);
      assert.doesNotMatch(error.amendment, /Do not add extra hard endurance work/i);
      return true;
    },
  );
});

test('a week with two runs is told to drop one, not all of them', () => {
  const extra = program().replace(
    /(START_WEEK1_TSV\n[^\n]*\n)/,
    `$1${row('Sat', 'Run', '10 km', 1, 'continuous', 8, 'Hard tempo effort.')}\n`,
  );
  assert.throws(
    () => validateAdvancedHybridQualitySemantic(extra, intake),
    (error) => {
      assert.equal(error.code, 'ADVANCED_HYBRID_MARATHON_SUBORDINATION');
      assert.match(error.amendment, /contains 2 runs/i);
      assert.match(error.amendment, /Do not remove running altogether/i);
      return true;
    },
  );
});

test('a week with no running at all has the support run restored, not just reported', async () => {
  const { repairMarathonSubordination } = await import('../engine/advanced_hybrid_quality.js');
  // program(3) so Week 4 OAP volume is already legal: this test is about the
  // running, not about the consolidation rule next to it.
  const runless = program(3).split('\n').filter((l) => !/\tRun\t/.test(l)).join('\n');
  // Not overriding sport_schedule here: a short one drops the intake below the
  // high-concurrency threshold and the whole validator skips, which is how this
  // test first "passed" by never running the rule at all.
  const running = intake;

  assert.throws(
    () => validateAdvancedHybridQualitySemantic(runless, running),
    (e) => e.code === 'ADVANCED_HYBRID_MARATHON_SUBORDINATION',
  );

  // Live run #149 shipped a hybrid block with zero run rows for an athlete whose
  // stated secondary goal is a marathon, after four attempts and 455 seconds,
  // because removing the running is a state the model cannot climb back out of.
  const fixed = repairMarathonSubordination(runless, running);
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(fixed, running));

  const runs = fixed.split('\n').filter((l) => /^\w+\tRun\t/.test(l));
  assert.equal(runs.length, 4, 'one support run in every week');
  for (const run of runs) {
    const cells = run.split('\t');
    assert.match(`${cells[2]} ${cells[7]}`, /easy|conversational/i);
    // It goes on a day the athlete is not already in the gym.
    assert.equal(['Mon', 'Tue', 'Fri', 'Sun'].includes(cells[0]), false);
  }
  // Held at the demonstrated volume, so it adds no mileage they do not cover,
  // and Week 4 still consolidates.
  const km = runs.map((r) => Number(r.split('\t')[4].match(/[\d.]+/)[0]));
  assert.deepEqual(km.slice(0, 3), [20, 20, 20]);
  assert.ok(km[3] < km[2], 'Week 4 run comes down');

  assert.equal(repairMarathonSubordination(fixed, running), fixed, 'idempotent');
});

test('nothing is invented when there is no demonstrated running volume to copy', async () => {
  const { repairMarathonSubordination } = await import('../engine/advanced_hybrid_quality.js');
  const runless = program(3).split('\n').filter((l) => !/\tRun\t/.test(l)).join('\n');
  const noBaseline = { ...intake, current_numbers: 'Back Squat: 205 kg 1RM\nOne-Arm Pull-up: 2 strict reps each arm' };
  assert.equal(repairMarathonSubordination(runless, noBaseline), runless);
});

test('a qualified run name is still a run', () => {
  // Live run #149 refused an Advanced Hybrid block four times, spent 455 seconds
  // and delivered it with the rule unresolved, for "containing no running at
  // all" -- while it carried an easy 16/18/20/14 km "Zone-2 Run" every week. The
  // matcher accepted the exact strings "Run" and "Running" and nothing else, so
  // the gate was blind to the name rather than to the work.
  const renamed = program(3).replaceAll('\tRun\t', '\tZone-2 Run\t');
  assert.doesNotThrow(() => validateAdvancedHybridQualitySemantic(renamed, intake));
});

test('the support run is not duplicated when one is already there under another name', async () => {
  const { repairMarathonSubordination } = await import('../engine/advanced_hybrid_quality.js');
  const renamed = program(3).replaceAll('\tRun\t', '\tZone-2 Run\t');
  // The restoration must see the existing run. Adding a second would take this
  // athlete from the ~20 km a week their intake documents to nearly double it,
  // on top of five MMA sessions.
  assert.equal(repairMarathonSubordination(renamed, intake), renamed);
});
