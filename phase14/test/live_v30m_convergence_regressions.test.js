import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichSpecificWarmups } from '../engine/specific_warmup_enrichment.js';
import { normalizeAdvancedHybridOHPComplement } from '../engine/advanced_hybrid_ohp_normalizer.js';
import { normalizeTactical3KRaceSpecificity } from '../engine/coaching_spec_v1_convergence_normalizer.js';
import { endurancePerformanceIntegrityFlags } from '../engine/phase15_elite_guardrails.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE } from './fixtures/advanced_hybrid_launch.js';

// ---------------------------------------------------------------------------
// v30m live defects.
//   Hybrid : held OHP work row vs stale warm-up ramp target (coherence).
//   Tactical: EVENT_PROGRESSING_SESSION_MISSING surviving four repair passes.
// Both are exercised through the production call ORDER, not isolated functions.
// ---------------------------------------------------------------------------

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const fourWeeks = (rows, intro = '') => `${intro ? `${intro}\n\n` : ''}${[1, 2, 3, 4].map((w) => block(w, rows(w))).join('\n\n')}`;

// --- Advanced Hybrid -------------------------------------------------------

// Week 1 presses 67.5 kg; the model proposes 70 kg in Week 2 and 72.5 kg in
// Week 3. The high-concurrency rule holds both build weeks at the Week 1 dose,
// so every warm-up ramp must follow the load actually prescribed.
function hybridProposedPressProgression() {
  const press = [67.5, 70, 72.5, 70];
  return fourWeeks((w) => [
    `Sun\t[WARMUP] Overhead Press\t20-${[55, 57.5, 60, 55][w - 1]} kg ramp\t3\t3\t60-90 sec\tN/A\tCompact ramp; keep shoulders fresh.; Ramp Overhead Press: 27.5 kg x 5, 42.5 kg x 3, 55 kg x 1-2 before ${press[w - 1]} kg work sets.; Keep the warm-up specific and non-fatiguing.\t`,
    `Sun\tOverhead Press\t${press[w - 1]} kg\t4\t4\t2-3 min\t7.5\tDirect strict press exposure; no layback.\t`,
    'Mon\tBack Squat\t170 kg\t3\t3\t3 min\t8\tPrimary squat.\t',
    `Tue\tRun\tConversational easy pace\t1\t20 km\tN/A\t5-6\tSecondary marathon run.\t`,
  ], 'Primary work stays centered on strict One-Arm Pull-up quality, with strict Overhead Press progressing without stealing freshness from MMA.');
}

// Production order: warm-up enrichment runs first, load stabilisation after it.
function productionHybridSequence(program, intake) {
  return normalizeAdvancedHybridOHPComplement(enrichSpecificWarmups(program), intake).program;
}

function pressWeek(program, week) {
  const blk = program.match(new RegExp(`START_WEEK${week}_TSV[\\s\\S]*?END_WEEK${week}_TSV`))[0];
  return {
    work: blk.match(/^\w+\tOverhead Press\t([\d.]+) kg\t/m)?.[1],
    rampTarget: blk.match(/Ramp Overhead Press:[^;]*?before ([\d.]+) kg work sets/)?.[1],
    note: blk.match(/^\w+\tOverhead Press\t[^\t]*\t[^\t]*\t[^\t]*\t[^\t]*\t[^\t]*\t([^\t]*)\t/m)?.[1] || '',
  };
}

test('[AH] held OHP weeks keep the work row, the warm-up ramp target and the narrative in agreement', () => {
  const out = productionHybridSequence(hybridProposedPressProgression(), ADVANCED_HYBRID_LAUNCH_INTAKE);
  for (const week of [2, 3]) {
    const { work, rampTarget, note } = pressWeek(out, week);
    assert.equal(work, '67.5', `Week ${week} work row should hold the Week 1 dose`);
    assert.equal(rampTarget, '67.5', `Week ${week} warm-up ramp must target the load actually prescribed`);
    assert.match(note, /hold|quality|bar speed/i, `Week ${week} note should describe a deliberate hold, not a load increase`);
    assert.doesNotMatch(note, /increase the load|add \d+(?:\.\d+)? kg/i);
  }
  // Week 1 and Week 4 are untouched by the hold and must stay self-consistent.
  for (const week of [1, 4]) {
    const { work, rampTarget } = pressWeek(out, week);
    assert.equal(rampTarget, work, `Week ${week} ramp target should match its own work load`);
  }
  assert.doesNotMatch(out, /before 72\.5 kg work sets/, 'no stale Week 3 ramp target may survive');
  assert.equal(/before 70 kg work sets/.test(out.match(/START_WEEK2_TSV[\s\S]*?END_WEEK2_TSV/)[0]), false);
  assert.doesNotMatch(out, /strict Overhead Press progressing/i, 'narrative must not claim load progression during a deliberate hold');
});

test('[AH] the ramp sync survives decimal ramp steps (the defect that made it silently no-op)', () => {
  // "27.5 kg x 5" contains a period; the previous [^.]*? matcher could not cross
  // it, so the sync never fired on any real program.
  const out = productionHybridSequence(hybridProposedPressProgression(), ADVANCED_HYBRID_LAUNCH_INTAKE);
  const w2 = out.match(/START_WEEK2_TSV[\s\S]*?END_WEEK2_TSV/)[0];
  assert.match(w2, /Ramp Overhead Press: [\d.]+ kg x 5, [\d.]+ kg x 3, [\d.]+ kg x 1-2 before 67\.5 kg work sets\./);
});

test('[AH] OHP work/ramp coherence is stable across a repeated normalization pass', () => {
  // Whole-program byte identity is NOT the invariant here: the OHP normalizer
  // legitimately inserts the Push Press complement, which a second warm-up
  // enrichment pass would then warm up. That composition is non-idempotent on the
  // unpatched baseline too, so this asserts the property this fix owns -- the
  // work row and its ramp target stay in agreement no matter how often it runs.
  const once = productionHybridSequence(hybridProposedPressProgression(), ADVANCED_HYBRID_LAUNCH_INTAKE);
  const twice = productionHybridSequence(once, ADVANCED_HYBRID_LAUNCH_INTAKE);
  for (const week of [1, 2, 3, 4]) {
    const a = pressWeek(once, week);
    const b = pressWeek(twice, week);
    assert.equal(a.rampTarget, a.work, `pass 1 week ${week} must agree`);
    assert.equal(b.rampTarget, b.work, `pass 2 week ${week} must agree`);
    assert.equal(b.work, a.work, `week ${week} work load must not drift between passes`);
  }
  // The normalizer itself, applied twice without re-enrichment, is a fixed point.
  const stable = normalizeAdvancedHybridOHPComplement(once, ADVANCED_HYBRID_LAUNCH_INTAKE).program;
  assert.equal(normalizeAdvancedHybridOHPComplement(stable, ADVANCED_HYBRID_LAUNCH_INTAKE).program, stable);
});

// --- Tactical 3K -----------------------------------------------------------

const TACTICAL_INTAKE = {
  age: 27, experience: 'advanced', days_per_week: 3,
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'Improve strict pull-ups from 14 toward 18-20'],
  maintenance_goals: ['Maintain useful squat and deadlift strength while staying athletic and relatively weight-stable'],
  current_numbers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min', 'Back Squat: 140 kg x 5', 'Deadlift: 180 kg x 3'].join('\n'),
  performance_markers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min'],
  injuries: 'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
  notes: 'Currently runs 3 sessions per week, about 18-20 km/week. Currently does 1 ruck per week, usually 8-10 km with 20 kg. Wants combat-ready / special-operations-style fitness without random punishment circuits.',
};

function eventFlagKeys(program, intake) {
  const m = program.match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i);
  if (!m) return null;
  const lines = m[1].split('\n');
  const hdr = lines[0].split('\t');
  const idx = Object.fromEntries(hdr.map((h, i) => [h.trim().toLowerCase(), i]));
  const parsed = {
    idx: { day: idx.day, exercise: idx.exercise, weight: idx.weight, sets: idx.sets, reps: idx.reps, notes: idx.notes },
    rows: lines.slice(1).map((l) => ({ cells: l.split('\t') })),
  };
  return endurancePerformanceIntegrityFlags(program, intake, parsed)
    .filter((f) => f.code === 'EVENT_PROGRESSING_SESSION_MISSING')
    .map((f) => f.details?.key);
}

// The v30m candidate shape: three runs a week and one ruck, with the quality
// session expressed inline ("5 x 800 m") and Sets left at 1.
function tacticalCandidate(qualityRow, ruckLoad = '20 kg') {
  return fourWeeks((w) => [
    'Mon\t[WARMUP]\tN/A\t1\t8 min\tN/A\t3\tGeneral prep.\t',
    'Mon\tBack Squat\t120 kg\t3\t5\t3 min\t7\tMaintenance squat.\t',
    'Mon\tPull-up\tBodyweight\t4\t6\t2 min\t7\tSubmaximal quality volume.\t',
    'Tue\t[WARMUP] Run\tEasy jog + drills\t1\t12 min\tN/A\t3\tAnkle and calf prep.\t',
    qualityRow(w),
    `Thu\tBackpack Carry\t${ruckLoad}\t1\t${[8, 8.5, 9, 8][w - 1]} km\tN/A\t6\tControlled ruck walk.\t`,
    'Fri\tDeadlift\t155 kg\t2\t3\t3 min\t7\tMaintenance pull.\t',
    'Fri\tRun\tEasy conversational pace\t1\t35 min\tN/A\t4\tEasy aerobic run; keep it genuinely easy.\t',
  ], 'If shin symptoms return, hold the newest run or ruck dose, reduce impact, and repeat the prior tolerated week.');
}

const INLINE_QUALITY = (w) => `Tue\tRun\tHard repeats\t1\t${[5, 6, 5, 4][w - 1]} x ${[800, 800, 1000, 800][w - 1]} m\t2:30\t8\tPrimary 3K quality session.\t`;
const RPE_ONLY_QUALITY = (w) => `Tue\tRun\tRPE 8 effort\t${[5, 6, 5, 4][w - 1]}\t${[800, 800, 1000, 800][w - 1]} m\t2:30\t8\tPrimary 3K quality session.\t`;
const VALID_QUALITY = (w) => `Tue\tRun\t${[400, 400, 600, 400][w - 1]} m @ 1:42-1:45\t${[5, 6, 4, 4][w - 1]}\t${[400, 400, 600, 400][w - 1]} m\t2:15\t8\tPrimary 3K quality at current capacity.\t`;

test('[T3K] a non-running modality instance of the flag is cleared, not just the running one', () => {
  // This is the v30m root cause: the surviving flag was never the running one.
  // The rucking modality definition is installed by the phase15 build, so under a
  // partial build there is simply no rucking goal to evaluate. Assert the
  // invariant that holds either way: whatever modalities the validator rejects
  // before normalization, none of them survive it.
  const program = tacticalCandidate(VALID_QUALITY);
  const before = eventFlagKeys(program, TACTICAL_INTAKE);
  assert.equal(before.includes('running'), false, 'the running session here is already valid');
  const out = normalizeTactical3KRaceSpecificity(program, TACTICAL_INTAKE);
  assert.deepEqual(eventFlagKeys(out.program, TACTICAL_INTAKE), []);
  if (before.includes('rucking')) {
    // Full production build: prove the ruck row is what got repaired.
    assert.ok(out.repairs.some((r) => r.type === 'tactical_ruck_event_pace_anchored'));
  }
});

test('[T3K] normalization clears every modality instance of the event-progression flag', () => {
  for (const [name, quality] of [['inline scheme', INLINE_QUALITY], ['RPE-only', RPE_ONLY_QUALITY], ['already valid', VALID_QUALITY]]) {
    const program = tacticalCandidate(quality);
    const out = normalizeTactical3KRaceSpecificity(program, TACTICAL_INTAKE);
    assert.deepEqual(eventFlagKeys(out.program, TACTICAL_INTAKE), [], `${name}: flag must be gone for all modalities`);
    assert.deepEqual(out.event_progression.post_repair_flag_keys, [], `${name}: contract must report a clean postcondition`);
    assert.equal(out.event_progression.unrepaired_reason, null, `${name}: no unrepaired reason expected`);
  }
});

test('[T3K] an inline "5 x 800 m" scheme with Sets=1 is recognized and canonicalized', () => {
  const out = normalizeTactical3KRaceSpecificity(tacticalCandidate(INLINE_QUALITY), TACTICAL_INTAKE);
  const w1 = out.program.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0];
  const row = w1.match(/^Tue\tRun\t([^\t]*)\t([^\t]*)\t([^\t]*)\t/m);
  assert.ok(row, 'the key run row must still exist');
  assert.ok(Number(row[2]) >= 2, `repetition count must be recovered from the inline scheme, got sets=${row[2]}`);
  assert.match(row[1], /\d{1,2}:\d{2}/, 'the canonicalized row must carry a clock target');
});

test('[T3K] the ruck row gains a current-capacity pace without extra volume, load or sessions', () => {
  const program = tacticalCandidate(VALID_QUALITY);
  const out = normalizeTactical3KRaceSpecificity(program, TACTICAL_INTAKE);
  const w1 = out.program.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0];
  const ruck = w1.match(/^Thu\tBackpack Carry\t([^\t]*)\t([^\t]*)\t([^\t]*)\t/m);
  // 10 km in 95 min is 9:30/km: the band must be anchored there, not at goal pace.
  assert.match(ruck[1], /20 kg @ 9:30-9:40\/km/);
  assert.equal(ruck[2], '1', 'ruck set count unchanged');
  assert.equal(ruck[3], '8 km', 'ruck distance unchanged');
  // Row counts identical: annotation only, nothing inserted.
  const rows = (p) => p.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0].split('\n').length;
  assert.equal(rows(out.program), rows(program));
});

test('[T3K] shin-symptom gating survives every repair', () => {
  const out = normalizeTactical3KRaceSpecificity(tacticalCandidate(INLINE_QUALITY), TACTICAL_INTAKE);
  assert.match(out.program, /If shin symptoms return, hold the newest run or ruck dose/i);
});

test('[T3K] the running repair does not mutate the rucking row into a run, or vice versa', () => {
  const out = normalizeTactical3KRaceSpecificity(tacticalCandidate(INLINE_QUALITY), TACTICAL_INTAKE);
  const w1 = out.program.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0];
  assert.equal((w1.match(/^Thu\tBackpack Carry\t/gm) || []).length, 1, 'exactly one ruck row remains');
  assert.equal((w1.match(/^Tue\tRun\t/gm) || []).length, 1, 'exactly one key run row, no duplicate');
  assert.match(w1, /^Fri\tRun\tEasy conversational pace/m, 'easy aerobic running is preserved');
});

test('[T3K] an already-valid program is not mutated by the event-progression repair', () => {
  // Give the ruck row a pace up front so nothing is left to repair.
  const program = tacticalCandidate(VALID_QUALITY, '20 kg @ 9:30-9:40/km');
  assert.deepEqual(eventFlagKeys(program, TACTICAL_INTAKE), []);
  const out = normalizeTactical3KRaceSpecificity(program, TACTICAL_INTAKE);
  const w1 = (p) => p.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0];
  assert.equal(w1(out.program), w1(program));
});

test('[T3K] normalization is idempotent', () => {
  const once = normalizeTactical3KRaceSpecificity(tacticalCandidate(INLINE_QUALITY), TACTICAL_INTAKE);
  const twice = normalizeTactical3KRaceSpecificity(once.program, TACTICAL_INTAKE);
  assert.equal(twice.program, once.program);
  assert.deepEqual(twice.event_progression.post_repair_flag_keys, []);
});

test('[T3K] the convergence contract never claims success while a flag survives', () => {
  const out = normalizeTactical3KRaceSpecificity(tacticalCandidate(INLINE_QUALITY), TACTICAL_INTAKE);
  const keys = eventFlagKeys(out.program, TACTICAL_INTAKE);
  if (keys.length) {
    assert.ok(out.event_progression.unrepaired_reason, 'a surviving flag must carry a deterministic reason');
  } else {
    assert.equal(out.event_progression.unrepaired_reason, null);
  }
  // Diagnostics are structural only -- no client free text.
  assert.deepEqual(
    Object.keys(out.event_progression).sort(),
    ['applicable', 'post_repair_event_bearing', 'post_repair_flag_keys', 'post_repair_running_flag', 'repair_attempted', 'target_row_found', 'unrepaired_reason'],
  );
});

test('[T3K] a non-Tactical intake is untouched and reports why', () => {
  const out = normalizeTactical3KRaceSpecificity(tacticalCandidate(INLINE_QUALITY), ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(out.repaired, false);
  assert.equal(out.event_progression.applicable, false);
  assert.equal(out.event_progression.unrepaired_reason, 'not_tactical_3k_like');
});
