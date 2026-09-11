// Generator artifacts are not coaching.
//
// The coach's read of the Hebrew program: "[WARMUP] Skipping Warm-up" reads
// like a generator artifact rather than a client-facing program; the skipping
// warm-up already listed scapular pull-ups and band pull-aparts and then a
// separate band pull-apart warm-up row followed it; and the same closing
// sentence appeared on every session, which is what makes an output feel
// templated rather than coached.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

import { enrichSpecificWarmups } from '../engine/specific_warmup_enrichment.js';

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, name, load, sets, reps, note) =>
  [day, name, load, sets, reps, '90 sec', '7', note, ''].join('\t');
const week = (rows) => `START_WEEK1_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK1_TSV`;

const warmupRows = (program) => program.split('\n')
  .filter((l) => /^\w+\t\[WARMUP\]/.test(l));

test('a session carries one warm-up block, not two', () => {
  const program = week([
    row('Mon', '[WARMUP] Skipping Warm-up', 'Bodyweight', '1', '5 min', 'Skip 3 min; Scapular pull-up 2 x 5-6; Band pull-apart x 10-12'),
    row('Mon', '[WARMUP] Band Pull-Apart Warm-up', 'Light band', '2', '15', 'Band pull-apart x 10-12'),
    row('Mon', 'Back Squat', '140 kg', '3', '5', 'Work sets.'),
  ]);
  const out = enrichSpecificWarmups(program);
  assert.equal(warmupRows(out).length, 1, `expected one warm-up block, got:\n${warmupRows(out).join('\n')}`);
  // Nothing the second block said is lost.
  assert.match(out, /Skip 3 min/);
  assert.match(out, /Band pull-apart/);
});

test('the merged block does not repeat a drill it already listed', () => {
  const program = week([
    row('Mon', '[WARMUP] Skipping Warm-up', 'Bodyweight', '1', '5 min', 'Band pull-apart x 10-12'),
    row('Mon', '[WARMUP] Band Pull-Apart Warm-up', 'Light band', '2', '15', 'Band pull-apart x 10-12'),
    row('Mon', 'Back Squat', '140 kg', '3', '5', 'Work sets.'),
  ]);
  const out = enrichSpecificWarmups(program);
  const note = warmupRows(out)[0].split('\t')[7];
  const occurrences = (note.match(/Band pull-apart x 10-12/g) || []).length;
  assert.equal(occurrences, 1, `the drill is listed ${occurrences} times: ${note}`);
});

test('no closing boilerplate is appended to every session', () => {
  const program = week([
    row('Mon', '[WARMUP] Deep Squat Hold', 'Bodyweight', '1', '5 min', 'Hips and ankles.'),
    row('Mon', 'Back Squat', '140 kg', '3', '5', 'Work sets.'),
  ]);
  const out = enrichSpecificWarmups(program);
  assert.ok(!/Keep the warm-up specific and non-fatiguing/i.test(out),
    'the same sentence on every session is what makes output read as templated');
});

test('a session with a single warm-up is left structurally alone', () => {
  const program = week([
    row('Mon', '[WARMUP] Deep Squat Hold', 'Bodyweight', '1', '5 min', 'Hips and ankles.'),
    row('Mon', 'Back Squat', '140 kg', '3', '5', 'Work sets.'),
  ]);
  const out = enrichSpecificWarmups(program);
  assert.equal(warmupRows(out).length, 1);
  assert.match(out, /Back Squat/);
});

test('a Hebrew client gets Hebrew drills inside Hebrew notes', () => {
  // Every mixed-language fragment in the delivered Hebrew program came from the
  // drill list: five English strings, twelve appearances each, sitting inside
  // otherwise-Hebrew coaching notes.
  const program = week([
    row('Mon', '[WARMUP] Deep Squat Hold', 'Bodyweight', '1', '5 min', 'חימום כללי קצר.'),
    row('Mon', 'Back Squat', '140 kg', '3', '5', 'סטים עבודה.'),
    row('Mon', 'Pull-up', 'Bodyweight', '3', '6', 'משיכה.'),
  ]);
  const note = (t) => t.split('\n').find((l) => /\[WARMUP\]/.test(l)).split('\t')[7];

  const he = note(enrichSpecificWarmups(program, { language: 'he' }));
  const hebrew = /[֐-׿]/;
  const drills = he.split(/\s*;\s*/).map((x) => x.trim())
    .filter((x) => x && !/^Ramp /.test(x) && x !== 'חימום כללי קצר.');
  assert.ok(drills.length > 0, 'the warm-up should carry drills');
  for (const d of drills) {
    assert.ok(hebrew.test(d), `drill left in English inside a Hebrew note: "${d}"`);
  }

  // English clients are unaffected.
  const en = note(enrichSpecificWarmups(program, { language: 'en' }));
  assert.match(en, /Squat-and-reach|Scapular pull-up/);
});

test('the ramp line keeps its one canonical form for the rules that parse it', () => {
  // Four modules parse "Ramp <Name>: ... before <N> kg work sets.", one of them
  // a repair loop. Emitting Hebrew at source would make them quietly stop
  // governing Hebrew clients, so the wrapper is localised at the view instead.
  const program = week([
    row('Mon', '[WARMUP] Deep Squat Hold', 'Bodyweight', '1', '5 min', 'חימום.'),
    row('Mon', 'Back Squat', '140 kg', '3', '5', 'סטים עבודה.'),
  ]);
  const out = enrichSpecificWarmups(program, { language: 'he' });
  assert.match(out, /Ramp Back Squat:[^;\t]*before 140 kg work sets\./,
    'the parseable form survives so the ramp-target rule still governs');
});

test('the live generation path passes the intake, not just the QA bundle', () => {
  // The drills were translated and the Hebrew program still came back with
  // twelve English fragments: the intake reached enrichSpecificWarmups on the
  // QA-bundle path but not on the primary generation path, which is injected
  // into the server by the build scripts. lang defaulted to English and the
  // translation never ran where it mattered.
  for (const script of ['scripts/final_pipeline_lock.mjs', 'scripts/apply_advanced_hybrid_oap_pipeline_wiring.mjs']) {
    const src = fs.readFileSync(new URL(`../${script}`, import.meta.url), 'utf8');
    const withIntake = 'enrichSpecificWarmups(repairUnbenchmarkedVariationLoads(fixInvalidExerciseNames(raw), intake), intake)';
    const withoutIntake = 'enrichSpecificWarmups(repairUnbenchmarkedVariationLoads(fixInvalidExerciseNames(raw), intake))';
    assert.ok(src.includes(withIntake), `${script} must hand the intake to enrichSpecificWarmups`);
    assert.ok(!src.includes(withoutIntake), `${script} still calls enrichSpecificWarmups without the intake`);
  }
});
