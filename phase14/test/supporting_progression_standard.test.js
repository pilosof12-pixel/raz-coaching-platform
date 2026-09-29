import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectSupportingProgressionFlags,
  normalizeSupportingProgressionStandard,
} from '../engine/supporting_progression_standard.js';
import {
  collectWeekScopeClaimFlags,
  normalizeWeekScopeClaims,
} from '../engine/week_scope_claims.js';

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, ex, load, sets, reps, rpe, notes) =>
  [day, ex, load, String(sets), String(reps), '90 sec', String(rpe), notes, ''].join('\t');
const block = (w, rows) => `START_WEEK${w}_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;

// A supporting lift frozen through the build weeks under one unchanging note,
// beside a goal movement that does progress -- the exact shape the coach marked
// down. The whole-week repetition detector cannot see this, because the week is
// not repeated: only this row is.
function flatSupport({ note = 'Upright torso and no fatigue-chasing.', load = '18 kg' } = {}) {
  return [1, 2, 3, 4].map((w) => block(w, [
    row('Mon', 'Rowing Ergometer', `${[250, 250, 300, 300][w - 1]} m`, w === 4 ? 3 : 4, 'intervals', 7, 'Goal erg work.'),
    row('Mon', 'Goblet Squat', w === 4 ? '20 kg' : load, w === 4 ? 2 : 3, 6, '6-7', note),
    row('Mon', 'Dead Bug', 'BW', 2, 8, 5, 'Trunk control.'),
  ])).join('\n\n');
}

test('a supporting lift frozen across the build weeks under one note is flagged', () => {
  const flags = collectSupportingProgressionFlags(flatSupport(), {});
  assert.equal(flags.length, 1);
  assert.equal(flags[0].exercise, 'Goblet Squat');
  assert.equal(flags[0].code, 'V97_SUPPORTING_PROGRESSION_UNSTATED');
});

test('low-cost trunk, tissue and GPP work may hold flat without a standard', () => {
  // Dead Bug is frozen in all four weeks of the fixture and must never be
  // flagged: holding it is ordinary coaching, not a defect.
  const flags = collectSupportingProgressionFlags(flatSupport(), {});
  assert.equal(flags.some((f) => /dead bug/i.test(f.exercise)), false);
});

test('a deliberate hold that says what advances instead is left alone', () => {
  const held = flatSupport({
    note: 'Hold the Week 1 load on purpose; progress the control of the lowering and finish at the same or lower RPE.',
  });
  assert.deepEqual(collectSupportingProgressionFlags(held, {}), []);
  assert.equal(normalizeSupportingProgressionStandard(held, {}).repaired, false);
});

test('the repair states the per-week standard and changes no prescription', () => {
  const before = flatSupport();
  const after = normalizeSupportingProgressionStandard(before, {});
  assert.equal(after.repaired, true);

  // Every structured field is byte-identical; only notes moved.
  const fields = (p) => p.split('\n').filter((l) => l.includes('\t'))
    .map((l) => l.split('\t').slice(0, 7).join('\t'));
  assert.deepEqual(fields(after.program), fields(before));

  const notes = [1, 2, 3].map((w) => after.program
    .match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?END_WEEK${w}_TSV`))[0]
    .split('\n').find((l) => l.includes('\tGoblet Squat\t')).split('\t')[7]);
  assert.match(notes[0], /Week 1 standard:/);
  assert.match(notes[1], /Week 2 advance:/);
  assert.match(notes[2], /Week 3 advance:/);
  assert.equal(new Set(notes).size, 3, 'the three build weeks must no longer read identically');
  // The earned option is optional and symptom-gated, never a prescribed grind.
  assert.match(notes[2], /earned, optional/i);
  assert.doesNotMatch(after.program, /to failure|AMRAP|max out/i);
});

test('the repair converges in one pass and is idempotent', () => {
  const once = normalizeSupportingProgressionStandard(flatSupport(), {});
  assert.deepEqual(collectSupportingProgressionFlags(once.program, {}), []);
  const twice = normalizeSupportingProgressionStandard(once.program, {});
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});

// --- week-scoped claims ------------------------------------------------------

function scopedClaim(laterLoad) {
  return [1, 2, 3].map((w) => block(w, [
    row('Wed', 'Barbell Hip Thrust', w === 1 ? '20 kg' : laterLoad, 3, 8, 6,
      w === 1
        ? 'Start with the empty bar only this week to reload the posterior chain; if it feels above RPE 7, cut to 2 sets.'
        : 'Keep the same execution standard.'),
  ])).join('\n\n');
}

test('a week-scoped claim contradicted by a later week is flagged and corrected', () => {
  const bad = scopedClaim('20 kg');
  const flags = collectWeekScopeClaimFlags(bad, {});
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'V98_WEEK_SCOPE_CLAIM_CONTRADICTED');
  assert.deepEqual(flags[0].contradicted_in, [2, 3]);

  const fixed = normalizeWeekScopeClaims(bad, {});
  assert.equal(fixed.repaired, true);
  const note = fixed.program.split('\n').find((l) => l.includes('\tBarbell Hip Thrust\t')).split('\t')[7];
  assert.equal(note, 'Start with the empty bar to reload the posterior chain; if it feels above RPE 7, cut to 2 sets.');
  assert.deepEqual(collectWeekScopeClaimFlags(fixed.program, {}), []);
});

test('a week-scoped claim the later weeks honour is left exactly as written', () => {
  const good = scopedClaim('30 kg');
  assert.deepEqual(collectWeekScopeClaimFlags(good, {}), []);
  const out = normalizeWeekScopeClaims(good, {});
  assert.equal(out.repaired, false);
  assert.equal(out.program, good);
});

test('both repairs are wired into the production bundle before release QA', async () => {
  const fs = await import('node:fs');
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, /normalizeSupportingProgressionStandard\(candidate, intake\)/);
  assert.match(bundle, /normalizeWeekScopeClaims\(candidate, intake\)/);
});

// --- benchmarks the athlete flagged and the block never mentioned ------------

import {
  collectUntestedBenchmarkFlags,
  normalizeUntestedBenchmarkDisclosure,
} from '../engine/untested_benchmark_disclosure.js';

const RETURNING = {
  current_numbers: 'Goblet squat: 24 kg x 8 comfortable\nDeadlift: not attempted since the injury',
  injuries: 'L4/L5 disc herniation nine months ago. Cleared for graded loading.',
  pain: { active: true, description: 'Occasional low-back stiffness' },
};

const HINGE_BLOCK = `Guidance paragraph for the block.\n\n${[1, 2, 3].map((w) => block(w, [
  row('Wed', 'Barbell Hip Thrust', '20 kg', 3, 8, 6, 'Posterior chain.'),
  row('Mon', 'Goblet Squat', '18 kg', 3, 6, '6-7', 'Upright torso.'),
])).join('\n\n')}`;

test('a benchmark the intake flags as untested and the block omits is flagged', () => {
  const flags = collectUntestedBenchmarkFlags(HINGE_BLOCK, RETURNING);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].exercise, 'Deadlift');
  assert.equal(flags[0].code, 'V99_UNTESTED_BENCHMARK_UNADDRESSED');
});

test('the disclosure names the covering work and defers the retest to the clinician', () => {
  const out = normalizeUntestedBenchmarkDisclosure(HINGE_BLOCK, RETURNING);
  assert.equal(out.repaired, true);
  const guidance = out.program.split('START_WEEK1_TSV')[0];
  assert.match(guidance, /About the deadlift/i);
  assert.match(guidance, /Barbell Hip Thrust trains the same pattern/);
  assert.match(guidance, /clinician's input/);
  // Guidance only: not one prescription row moves.
  const rows = (p) => p.split('\n').filter((l) => l.includes('\t'));
  assert.deepEqual(rows(out.program), rows(HINGE_BLOCK));
  assert.deepEqual(collectUntestedBenchmarkFlags(out.program, RETURNING), []);
  assert.equal(normalizeUntestedBenchmarkDisclosure(out.program, RETURNING).program, out.program);
});

test('a benchmark the block actually programs needs no disclosure', () => {
  const withDeadlift = HINGE_BLOCK.replaceAll('\tBarbell Hip Thrust\t', '\tDeadlift\t');
  assert.deepEqual(collectUntestedBenchmarkFlags(withDeadlift, RETURNING), []);
  assert.equal(normalizeUntestedBenchmarkDisclosure(withDeadlift, RETURNING).repaired, false);
});

test('a benchmark the intake never raises is left alone', () => {
  const quiet = { current_numbers: 'Goblet squat: 24 kg x 8 comfortable' };
  assert.deepEqual(collectUntestedBenchmarkFlags(HINGE_BLOCK, quiet), []);
});

// --- self-selected loads need a way to be selected ---------------------------

import {
  collectSelfSelectedLoadFlags,
  normalizeSelfSelectedLoadProtocol,
} from '../engine/self_selected_load_protocol.js';

const UNSPECIFIED = `Guidance.\n\n${block(1, [
  row('Tue', 'Seated Cable Row', 'RPE-selected load', 2, 10, '6-7', 'Horizontal pulling balance.'),
  row('Tue', 'Seated Calf Raise', 'RPE-selected load', 2, 12, 6, 'Tissue-capacity work.'),
  row('Tue', 'Push-up', 'RPE-selected load', 2, 8, 6, 'Pressing floor.'),
  row('Mon', 'Rowing Ergometer', 'N/A', 1, '25 min', '3-4', 'Easy aerobic.'),
  row('Mon', 'Goblet Squat', '18 kg', 3, 6, '6-7', 'Anchored to her benchmark.'),
])}`;

test('a load left to the athlete with no way to choose it is flagged', () => {
  const flags = collectSelfSelectedLoadFlags(UNSPECIFIED, {});
  assert.deepEqual(flags.map((f) => f.exercise), ['Seated Cable Row', 'Seated Calf Raise']);
  assert.equal(flags[0].code, 'V100_SELF_SELECTED_LOAD_WITHOUT_PROTOCOL');
});

test('anchored loads, bodyweight movements and endurance rows are left alone', () => {
  const named = collectSelfSelectedLoadFlags(UNSPECIFIED, {}).map((f) => f.exercise);
  // A kilogram figure needs no protocol; a push-up is not asking for a weight;
  // an erg is dosed by split and duration.
  assert.equal(named.includes('Goblet Squat'), false);
  assert.equal(named.includes('Push-up'), false);
  assert.equal(named.includes('Rowing Ergometer'), false);
});

test('the protocol derives reps in reserve from the row own target RPE', () => {
  const out = normalizeSelfSelectedLoadProtocol(UNSPECIFIED, {});
  assert.equal(out.repaired, true);
  const noteFor = (name) => out.program.split('\n').find((l) => l.includes(`\t${name}\t`)).split('\t')[7];
  // RPE 6-7 leaves 3-4 in reserve; a flat RPE 6 leaves 4.
  assert.match(noteFor('Seated Cable Row'), /about 3-4 clean reps still in reserve/);
  assert.match(noteFor('Seated Calf Raise'), /about 4 clean reps still in reserve/);
  // It also says where to write the number down, so next week can repeat it.
  assert.match(noteFor('Seated Cable Row'), /write it in the Results column/);
  assert.deepEqual(collectSelfSelectedLoadFlags(out.program, {}), []);
});

test('the load protocol changes no prescription field and is idempotent', () => {
  const out = normalizeSelfSelectedLoadProtocol(UNSPECIFIED, {});
  const fields = (p) => p.split('\n').filter((l) => l.includes('\t'))
    .map((l) => l.split('\t').slice(0, 7).join('\t'));
  assert.deepEqual(fields(out.program), fields(UNSPECIFIED));
  const twice = normalizeSelfSelectedLoadProtocol(out.program, {});
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, out.program);
});

test('a rowing ergometer is endurance, not general conditioning', async () => {
  const { CATEGORY, classifyExercise } = await import('../engine/v38_movement_taxonomy.js');
  // For a masters rower returning to a 2 km, this is the primary goal movement.
  // Classifying it as GPP made the block's most important row invisible to every
  // rule that reasons about endurance.
  for (const name of ['Rowing Ergometer', 'Rowing Erg', 'Row Erg']) {
    assert.equal(classifyExercise(name).category, CATEGORY.ENDURANCE, name);
  }
  // The generic sled/bike conditioning rule it sits in front of still applies.
  assert.equal(classifyExercise('Sled Push').category, CATEGORY.GPP);
  // And a cable row is still a horizontal pull, not an erg.
  assert.equal(classifyExercise('Seated Cable Row').category, CATEGORY.HORIZONTAL_PULL);
});

// --- the model is told, not just corrected -----------------------------------

test('the coach brief asks for all four standards up front', async () => {
  const { buildCoachStandardBrief } = await import('../engine/coach_standard_brief.js');
  const brief = buildCoachStandardBrief({
    primary_goals: ['Race a 2 km erg again'],
    current_numbers: '2 km erg: 8:58\nDeadlift: not attempted since the injury',
  });
  // A repair writes a repair's prose. These exist so the coach writes it first.
  assert.match(brief, /SUPPORTING WORK EITHER MOVES OR STATES ITS STANDARD/);
  assert.match(brief, /A SELF-SELECTED LOAD SAYS HOW TO SELECT IT/);
  assert.match(brief, /A WEEK-SCOPED CLAIM MUST BE TRUE/);
  assert.match(brief, /A BENCHMARK THE ATHLETE FLAGGED IS ADDRESSED/);
  assert.match(brief, /THE CONSOLIDATION WEEK IS NOT WHERE THE PROGRESSION GOES/);
  assert.match(brief, /FOR A YOUTH ATHLETE, NEVER WRITE FAILURE LANGUAGE AT ALL/);
  // And it names the failure mode the repair itself fell into first time round.
  assert.match(brief, /same sentence on five different exercises/i);
});

test('the four note repairs run after every pass that can still change a prescription', async () => {
  const fs = await import('node:fs');
  const bundle = fs.readFileSync(new URL('../engine/repairable_validation_bundle.js', import.meta.url), 'utf8');

  // Live run #149 shipped a Youth block whose Ring Push-up sat at 2x8 with a
  // byte-identical note in all three build weeks. The rule had flagged it and
  // the repair had run -- before a later normalizer pass froze the rows. The
  // rule judged a program that no longer existed by the time it was delivered.
  const at = (needle) => {
    const i = bundle.indexOf(needle);
    assert.ok(i > 0, `anchor missing: ${needle}`);
    return i;
  };
  const lastRowChangingPass = Math.max(
    at('normalizeYouthSkillAcquisitionQuality(candidate, intake)'),
    at('normalizeYouthWeek4Consolidation(candidate, intake)'),
    at('normalizeTactical3KRaceSpecificity(candidate, intake)'),
    at('trimExcessSupportVolume(candidate, intake)'),
  );
  for (const call of [
    'normalizeSelfSelectedLoadProtocol(candidate, intake)',
    'normalizeWeekScopeClaims(candidate, intake)',
    'normalizeSupportingProgressionStandard(candidate, intake)',
    'normalizeUntestedBenchmarkDisclosure(candidate, intake)',
  ]) {
    assert.ok(
      bundle.lastIndexOf(call) > lastRowChangingPass,
      `${call} must run after the last pass that can change a prescription`,
    );
  }
});

test('the build standard never writes language a youth block is refused for', async () => {
  const { validateYouthCoachingSpecV1HardRules } = await import('../engine/coaching_spec_v1_quality.js');
  const YOUTH = {
    age: 13,
    primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
    days_per_week: 2,
  };
  const H2 = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const youthRow = (ex, note) => ['Session A', ex, 'BW', '2', '8', '90s', '7', note, ''].join('\t');
  const stop = 'Prescribed attempts are a ceiling, not a quota: stop the set early if quality, symmetry or balance breaks down.';
  const block2 = (w) => `START_WEEK${w}_TSV\n${H2}\n${[
    youthRow('Ring Push-up', `Keep the rings stable and the body rigid. ${stop}`),
    youthRow('Ring Row', `Pull the chest to the rings. ${stop}`),
  ].join('\n')}\nEND_WEEK${w}_TSV`;
  const frozen = [1, 2, 3, 4].map(block2).join('\n\n');

  const out = normalizeSupportingProgressionStandard(frozen, YOUTH);
  assert.equal(out.repaired, true, 'the fixture is the defect this rule exists for');
  // YG-07 strips only negated forms, so "skipped on any grind" -- which an
  // earlier version of this cue wrote -- reads as prescribing a grind and got
  // every youth program this repair touched refused.
  assert.doesNotMatch(out.program, /\bgrind(?:er|ers|ing)?\b/i);
  assert.doesNotMatch(out.program, /to failure|amrap|forced rep/i);
  assert.doesNotThrow(() => validateYouthCoachingSpecV1HardRules(out.program, YOUTH));
});
