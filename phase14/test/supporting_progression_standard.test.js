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
  assert.equal(flags[0].code, 'V93_SUPPORTING_PROGRESSION_UNSTATED');
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
  assert.equal(flags[0].code, 'V94_WEEK_SCOPE_CLAIM_CONTRADICTED');
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
