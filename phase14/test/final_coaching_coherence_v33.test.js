import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeFinalNoteCoherence } from '../engine/final_note_coherence.js';
import { normalizeAdvancedHybridWeek4OapConsolidation } from '../engine/advanced_hybrid_oap_consolidation_normalizer.js';
import { normalizeTactical3KRaceSpecificity } from '../engine/coaching_spec_v1_convergence_normalizer.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE } from './fixtures/advanced_hybrid_launch.js';

// ---------------------------------------------------------------------------
// v32 -> v33 final coaching coherence.
// Every defect below was observed in the accepted v32 live artifacts, so these
// run against those artifacts where possible rather than synthetic prose only.
// ---------------------------------------------------------------------------

const LIVE = path.join(process.cwd(), '..', 'docs', 'qa', 'live-three-avatar', 'latest');
const readLive = (name) => {
  return fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', `${name}-program.txt`), 'utf8');
};

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;

function rowFields(program, week, dayExercise) {
  const blk = program.match(new RegExp(`START_WEEK${week}_TSV[\\s\\S]*?END_WEEK${week}_TSV`))[0];
  const line = blk.split('\n').find((l) => l.startsWith(dayExercise));
  if (!line) return null;
  const c = line.split('\t');
  return { sets: c[3], reps: c[4], note: c[7] };
}

// --- generic note coherence -------------------------------------------------

test('[NC] a note may not claim more sets than the row prescribes', () => {
  const p = block(1, ['Session A\tBar Muscle-up Transition Drill\tBand\t3\t2\t75-90 sec\t6\tSame band only if doubles stay crisp; otherwise stay at 4 clean sets.\t']);
  const out = normalizeFinalNoteCoherence(p, {});
  assert.match(rowFields(out.program, 1, 'Session A').note, /stay at 3 clean sets/);
  assert.doesNotMatch(out.program, /stay at 4 clean sets/);
});

test('[NC] a note may not claim a set reduction that did not happen', () => {
  const p = [
    block(3, ['Mon\tOne-Arm Pull-up\tBodyweight\t3\t1 per arm\t2-3 min\t8\tBest quality of the block.\t']),
    block(4, ['Mon\tOne-Arm Pull-up\tBodyweight\t3\t1 per arm\t2-3 min\t7.5-8\tReduce one set, but keep the best clean Week 3 standard on each side.\t']),
  ].join('\n\n');
  const out = normalizeFinalNoteCoherence(p, {});
  const note = rowFields(out.program, 4, 'Mon').note;
  assert.doesNotMatch(note, /Reduce one set/i);
  assert.match(note, /Hold the set count and consolidate through rep quality/i);
  assert.match(note, /best clean Week 3 standard/, 'the qualitative half of the note must survive');
});

test('[NC] a genuine set reduction keeps its note untouched', () => {
  const p = [
    block(3, ['Mon\tOne-Arm Pull-up\tBodyweight\t4\t1 per arm\t2-3 min\t8\tBuild week.\t']),
    block(4, ['Mon\tOne-Arm Pull-up\tBodyweight\t3\t1 per arm\t2-3 min\t7.5\tReduce one set, but keep the best clean Week 3 standard.\t']),
  ].join('\n\n');
  const out = normalizeFinalNoteCoherence(p, {});
  assert.match(rowFields(out.program, 4, 'Mon').note, /Reduce one set/i);
});

test('[NC] a note may not reference reps that are not prescribed, or a scheme that disagrees', () => {
  const p = block(3, ['Tue\tAssisted One-Arm Pull-up\tRPE-selected\t2\t1 per arm\t2 min\t6-6.5\tIf elbows feel good, add the third rep; otherwise keep 3x2 with less assistance.\t']);
  const out = normalizeFinalNoteCoherence(p, {});
  const note = rowFields(out.program, 3, 'Tue').note;
  assert.doesNotMatch(note, /third rep/i);
  assert.doesNotMatch(note, /3x2/);
  assert.match(note, /keep 2 x 1/);
  assert.match(note, /^[A-Z]/, 'note must still read as a sentence after clause removal');
});

test('[NC] an attempt ceiling above the prescribed total is clamped to the prescription', () => {
  const p = block(3, ['Session A\tControlled Handstand Kick-up\tBodyweight\t4\t3\t60-90 sec\tN/A\tUp to 15 total attempts only if entries stay controlled. Better balance beats more tries.\t']);
  const out = normalizeFinalNoteCoherence(p, {});
  const note = rowFields(out.program, 3, 'Session A').note;
  assert.match(note, /Up to 12 total attempts/);
  assert.match(note, /Better balance beats more tries/, 'qualitative coaching language is preserved');
});

test('[NC] qualitative coaching, safety and symptom language is never rewritten', () => {
  const note = 'If shin symptoms return, hold the newest progression and reduce impact. Keep every rep strict and stop well before failure.';
  const p = block(1, [`Mon\tRun\tEasy\t1\t25 min\tN/A\t5\t${note}\t`]);
  const out = normalizeFinalNoteCoherence(p, {});
  assert.equal(out.repaired, false);
  assert.equal(rowFields(out.program, 1, 'Mon').note, note);
});

test('[NC] warm-up drill schemes inside warm-up rows are left alone', () => {
  const p = block(1, ['Tue\t[WARMUP] Run\tEasy jog\t1\t12 min\tN/A\t4\tScapular pull-up 2 x 5-6; Band pull-apart x 10-12; 3 x 60-80 m relaxed strides.\t']);
  const out = normalizeFinalNoteCoherence(p, {});
  assert.equal(out.repaired, false);
});

test('[NC] the pass is idempotent on the live artifacts', () => {
  for (const avatar of ['advanced_hybrid', 'youth_gymnastics', 'tactical_3k']) {
    const once = normalizeFinalNoteCoherence(readLive(avatar), {});
    const twice = normalizeFinalNoteCoherence(once.program, {});
    assert.equal(twice.program, once.program, `${avatar} must be stable`);
    assert.equal(twice.repaired, false);
  }
});

test('[NC] every v32 live note defect is repaired and Tactical needs no repair', () => {
  assert.equal(normalizeFinalNoteCoherence(readLive('tactical_3k'), {}).repaired, false);
  const hybrid = normalizeFinalNoteCoherence(readLive('advanced_hybrid'), {});
  assert.doesNotMatch(hybrid.program, /add the third rep|keep 3x2/);
  const youth = normalizeFinalNoteCoherence(readLive('youth_gymnastics'), {});
  assert.doesNotMatch(youth.program, /stay at 4 clean sets/);
  assert.doesNotMatch(youth.program, /Up to 15 total attempts/);
});

// --- Advanced Hybrid OAP progression ---------------------------------------

test('[AH] strict OAP gains a stated build-week progression axis without any added volume', () => {
  const live = readLive('advanced_hybrid');
  const out = normalizeAdvancedHybridWeek4OapConsolidation(live, ADVANCED_HYBRID_LAUNCH_INTAKE);
  const setsOf = (p, w) => rowFields(p, w, 'Mon\tOne-Arm Pull-up').sets;
  for (const week of [1, 2, 3, 4]) {
    assert.equal(setsOf(out.program, week), setsOf(live, week), `Week ${week} strict OAP volume must be unchanged`);
  }
  // Weeks 1-3 each state a distinct, non-volume progression axis.
  assert.match(rowFields(out.program, 1, 'Mon\tOne-Arm Pull-up').note, /Week 1 standard:/);
  assert.match(rowFields(out.program, 2, 'Mon\tOne-Arm Pull-up').note, /Week 2 advance:/);
  assert.match(rowFields(out.program, 3, 'Mon\tOne-Arm Pull-up').note, /Week 3 advance:/);
  // The Week 3 option is earned and explicitly optional -- never prescribed failure.
  const w3 = rowFields(out.program, 3, 'Mon\tOne-Arm Pull-up').note;
  assert.match(w3, /earned, optional/i);
  assert.match(w3, /skipped entirely on any grind, miss or elbow niggle/i);
  assert.doesNotMatch(out.program, /to failure|max test|AMRAP/i);
});

test('[AH] the build-standard cue does not increase sets week over week', () => {
  const out = normalizeAdvancedHybridWeek4OapConsolidation(readLive('advanced_hybrid'), ADVANCED_HYBRID_LAUNCH_INTAKE);
  const sets = [1, 2, 3, 4].map((w) => Number(rowFields(out.program, w, 'Mon\tOne-Arm Pull-up').sets));
  for (let i = 1; i < sets.length; i++) {
    assert.ok(sets[i] <= sets[0] || sets[i] === sets[i - 1], `week ${i + 1} must not inflate strict volume`);
  }
  assert.deepEqual(sets, [3, 3, 3, 3]);
});

test('[AH] OAP build standards are idempotent and skip non-hybrid intakes', () => {
  const live = readLive('advanced_hybrid');
  const once = normalizeAdvancedHybridWeek4OapConsolidation(live, ADVANCED_HYBRID_LAUNCH_INTAKE);
  const twice = normalizeAdvancedHybridWeek4OapConsolidation(once.program, ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(twice.program, once.program);
  const other = normalizeAdvancedHybridWeek4OapConsolidation(live, { primary_goals: ['Run a marathon'] });
  assert.equal(other.repaired, false);
  assert.equal(other.program, live);
});

// --- Tactical aerobic anchoring --------------------------------------------

const TACTICAL_INTAKE = {
  age: 27, experience: 'advanced', days_per_week: 3,
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min'],
  current_numbers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min'].join('\n'),
  performance_markers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min'],
  injuries: 'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
  notes: 'Currently runs 3 sessions per week, about 18-20 km/week: one interval session, one easy run and one longer aerobic run. Currently does 1 ruck per week, usually 8-10 km with 20 kg. Wants combat-ready / special-operations-style fitness.',
};

test('[T3K] the block states an explicit weekly running-volume anchor tied to the demonstrated baseline', () => {
  const out = normalizeTactical3KRaceSpecificity(readLive('tactical_3k'), TACTICAL_INTAKE);
  assert.ok(out.repairs.some((r) => r.type === 'tactical_weekly_running_volume_anchor'));
  const guidance = out.program.split('START_WEEK1_TSV')[0];
  assert.match(guidance, /18-20 km per week/, 'anchored to the athlete\'s actual baseline');
  assert.match(guidance, /3 running exposures/, 'preserves the established run frequency');
  assert.match(guidance, /rebuild toward/i, 'states how volume is restored when symptom-free');
  assert.match(guidance, /never by adding a fourth running day/i, 'forbids adding an impact day');
  assert.match(guidance, /If shin symptoms return, cut easy-run duration first/i, 'symptom gate is explicit');
});

test('[T3K] anchoring adds no session, no distance and no impact', () => {
  const live = readLive('tactical_3k');
  const out = normalizeTactical3KRaceSpecificity(live, TACTICAL_INTAKE);
  const runRows = (p) => (p.match(/^\w+\tRun\t/gm) || []).length;
  const ruckRows = (p) => (p.match(/^\w+\tBackpack Carry\t/gm) || []).length;
  assert.equal(runRows(out.program), runRows(live));
  assert.equal(ruckRows(out.program), ruckRows(live));
  // Easy-run durations and the interval progression are untouched.
  for (const dose of ['25 min', '35 min', '20 min', '30 min']) {
    assert.equal((out.program.match(new RegExp(dose, 'g')) || []).length, (live.match(new RegExp(dose, 'g')) || []).length, `${dose} unchanged`);
  }
  for (const rep of ['1:42-1:45 per 400 m', '2:08-2:11 per 500 m', '2:33-2:36 per 600 m', '1:38-1:40 per 400 m']) {
    assert.ok(out.program.includes(rep), `interval progression preserved: ${rep}`);
  }
});

test('[T3K] three meaningful running exposures and one primary quality session survive', () => {
  const out = normalizeTactical3KRaceSpecificity(readLive('tactical_3k'), TACTICAL_INTAKE);
  const w1 = out.program.match(/START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV/)[0];
  const runs = w1.split('\n').filter((l) => /^\w+\tRun\t/.test(l) && !/\[WARMUP\]/.test(l));
  assert.equal(runs.length, 3, 'the established three running exposures are preserved');
  const quality = runs.filter((l) => /\d{1,2}:\d{2}/.test(l) && /\d{3} m/.test(l));
  assert.equal(quality.length, 1, 'exactly one primary event-specific quality session');
});

test('[T3K] the anchor is idempotent and skipped when no baseline is documented', () => {
  const live = readLive('tactical_3k');
  const once = normalizeTactical3KRaceSpecificity(live, TACTICAL_INTAKE);
  const twice = normalizeTactical3KRaceSpecificity(once.program, TACTICAL_INTAKE);
  assert.equal(twice.program, once.program);
  const noBaseline = { ...TACTICAL_INTAKE, notes: 'Wants combat-ready / special-operations-style fitness.' };
  const out = normalizeTactical3KRaceSpecificity(live, noBaseline);
  assert.equal(out.repairs.some((r) => r.type === 'tactical_weekly_running_volume_anchor'), false);
});

// --- Youth must not regress ------------------------------------------------

test('[YG] generic note synchronization preserves the accepted Youth architecture', () => {
  const live = readLive('youth_gymnastics');
  const out = normalizeFinalNoteCoherence(live, {}).program;
  // Only note text may change: every structured row field is byte-identical.
  const fields = (p) => p.split('\n').filter((l) => l.includes('\t')).map((l) => l.split('\t').slice(0, 7).join('\t'));
  assert.deepEqual(fields(out), fields(live), 'no prescription field may change');
  for (const marker of [
    /Controlled Handstand Kick-up/,
    /Bar Muscle-up Transition Drill/,
    /Attempt count is a ceiling, not a quota/,
    /best clean Week-3 assistance level/i,
  ]) assert.match(out, marker, `Youth feature preserved: ${marker}`);
});
