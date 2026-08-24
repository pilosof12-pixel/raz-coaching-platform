import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseWeek } from '../engine/v34_workload_accounting.js';
import { collectEnduranceVolumeFlags } from '../engine/v57_endurance_volume_governor.js';
import { collectPrePrimaryLoadFlags } from '../engine/v56_primary_day_protection.js';
import { goalTierFor } from '../engine/v52_session_hierarchy.js';
import { classifyBlockPhase, PHASE } from '../engine/v62_block_phase.js';

// Pinned copies of the programs a coach scored 9.1 and 8.9. Acceptance runs
// rewrite docs/qa/.../latest, so these live here or the suite rots.
const HYBRID = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
const TACTICAL = fs.readFileSync(new URL('./fixtures/run81_tactical_3k.txt', import.meta.url), 'utf8');

const HYBRID_INTAKE = {
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport: 'MMA',
  sport_schedule: [
    { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
    { day: 'Sat', intensity: 'moderate' },
  ],
};
const TACTICAL_INTAKE = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'strict pull-ups 14 toward 18-20'],
  maintenance_goals: ['Maintain useful squat and deadlift strength'],
  current_numbers: ['3 km: 13:30', 'Back Squat: 140 kg x 5', 'Deadlift: 180 kg x 3'].join('\n'),
  performance_markers: ['3 km: 13:30'],
};

function rows(program, week) {
  const p = parseWeek(program, week);
  const rpe = p.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
  return p.rows
    .map((c) => ({
      day: String(c[p.day] || '').trim(),
      name: String(c[p.exercise] || '').trim(),
      load: String(c[p.load] || '').trim(),
      sets: String(c[p.sets] || '').trim(),
      reps: String(c[p.reps] || '').trim(),
      rpe: rpe >= 0 ? String(c[rpe] || '').trim() : '',
    }))
    .filter((r) => r.name && !/^\s*\[WARMUP\]/i.test(r.name));
}
const top = (s) => {
  const n = [...String(s).matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return n.length ? Math.max(...n) : null;
};
const find = (program, week, re) => rows(program, week).filter((r) => re.test(r.name));

// --- item 3: the low-cost accessory governor --------------------------------

test('Tactical lower-body accessories stay cheap beside the running work', () => {
  const flags = collectEnduranceVolumeFlags(TACTICAL, TACTICAL_INTAKE);
  assert.equal(flags.length, 0, 'no accessory may reclaim the recovery the run needs');
  for (let week = 1; week <= 4; week += 1) {
    for (const r of find(TACTICAL, week, /lunge|split squat|hamstring curl|leg (?:curl|extension|press)/i)) {
      assert.ok(top(r.rpe) <= 7, `${r.name} week ${week} at RPE ${r.rpe} must stay a cheap exposure`);
      assert.ok(top(r.sets) <= 2, `${r.name} week ${week} at ${r.sets} sets must stay a minimum dose`);
    }
  }
});

// --- item 4: maintenance goals do not calendar-progress ---------------------

test('Tactical holds its maintenance lifts instead of progressing everything', () => {
  for (const re of [/^Back Squat$/i, /^Deadlift$/i, /^Overhead Press$/i, /Weighted Pull-up/i]) {
    const perWeek = [1, 2, 3, 4].map((w) => find(TACTICAL, w, re)[0]).filter(Boolean);
    if (perWeek.length < 2) continue;
    const loads = perWeek.map((r) => top(r.load)).filter((n) => n != null);
    if (loads.length < 2) continue;
    const first = loads[0];
    for (const l of loads) {
      assert.ok(l <= first * 1.05,
        `${perWeek[0].name} is a maintenance lift and must not climb: ${loads.join(' -> ')}`);
    }
  }
});

test('Hybrid holds the marathon dose while the primaries progress', () => {
  const runs = [1, 2, 3, 4].map((w) => find(HYBRID, w, /^Run$/i)[0]).filter(Boolean);
  assert.ok(runs.length >= 3, 'the long run should appear across the block');
  const km = runs.map((r) => top(r.reps)).filter((n) => n != null);
  assert.ok(Math.max(...km) <= km[0], `the long run is held, not built: ${km.join(' -> ')}`);
});

// --- item 5: Hybrid primary hierarchy ---------------------------------------

test('Hybrid opens the primary day with primary work, not with support', () => {
  for (let week = 1; week <= 4; week += 1) {
    const monday = rows(HYBRID, week).filter((r) => /^mon/i.test(r.day));
    if (!monday.length) continue;
    assert.equal(goalTierFor(monday[0].name, HYBRID_INTAKE), 'primary',
      `week ${week} Monday opens with ${monday[0].name}`);
    const tiers = monday.map((r) => goalTierFor(r.name, HYBRID_INTAKE));
    const last = tiers.lastIndexOf('primary');
    const firstSupport = tiers.findIndex((t) => t === 'support');
    if (firstSupport >= 0) {
      assert.ok(firstSupport > last,
        `week ${week}: support work sits between primaries (${monday.map((r) => r.name).join(', ')})`);
    }
  }
});

test('Hybrid keeps the adjacent-day assisted exposure technical', () => {
  for (let week = 1; week <= 4; week += 1) {
    for (const r of find(HYBRID, week, /assisted.*one[- ]arm|one[- ]arm.*assisted/i)) {
      assert.ok(top(r.rpe) <= 6.5,
        `week ${week} assisted exposure at RPE ${r.rpe} must stay technical`);
    }
  }
});

test('nothing heavy sits in front of the Hybrid primary day', () => {
  assert.equal(collectPrePrimaryLoadFlags(HYBRID, HYBRID_INTAKE).length, 0);
});

// --- item 2: the phase label is derived, and does not license faster work ----

test('the Tactical block classifies as pre-specific, ahead of current ability', () => {
  const c = classifyBlockPhase(TACTICAL, TACTICAL_INTAKE);
  assert.ok(c, 'a race goal with quality work must classify');
  assert.equal(c.phase, PHASE.PRE_SPECIFIC);
  assert.ok(c.aheadOfCurrent, 'quality must be faster than the athlete currently races');
  assert.ok(c.fastestPace > c.goalPace,
    'and still short of goal demand: a developmental block may not be forced to event pace');
});
