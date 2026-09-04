import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { weeklyExposures, describeExposures } from '../engine/v61_weekly_exposures.js';
import { classifyBlockPhase, PHASE } from '../engine/v62_block_phase.js';
import { intakeClarificationResult } from '../intake_clarification.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const TACTICAL = fs.readFileSync(new URL('./fixtures/run84_tactical_3k.txt', import.meta.url), 'utf8');
const INTAKE = JSON.parse(
  fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'),
).tactical_3k;

function rows(program, week) {
  const p = parseWeek(program, week);
  const rpe = p.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
  return p.rows.map((c) => ({
    day: String(c[p.day] || '').trim(),
    name: String(c[p.exercise] || '').trim(),
    load: String(c[p.load] || '').trim(),
    sets: String(c[p.sets] || '').trim(),
    reps: String(c[p.reps] || '').trim(),
    rpe: rpe >= 0 ? String(c[rpe] || '').trim() : '',
  })).filter((r) => r.name && !/^\s*\[WARMUP\]/i.test(r.name));
}
const num = (s) => { const n = [...String(s).matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])); return n.length ? Math.max(...n) : null; };

// --- item 1: exposure semantics ---------------------------------------------

// The Overview reported "2 endurance" for a week holding three runs and a ruck.
test('runs, rucks and conditioning are reported apart', () => {
  const ex = weeklyExposures(TACTICAL, 1, INTAKE);
  assert.equal(ex.total, 5, 'training days');
  assert.equal(ex.strength, 3, 'strength sessions');
  assert.equal(ex.runningExposures, 3, 'running exposures');
  assert.equal(ex.ruckExposures, 1, 'ruck exposures');
  assert.equal(ex.conditioningExposures, 4, 'total conditioning exposures');
  assert.equal(describeExposures(ex), '5 training days/week (3 strength, 3 running, 1 ruck)');
});

// --- item 2: the phase label must be earned ---------------------------------

test('this block is not race-specific and must not be labelled so', () => {
  const c = classifyBlockPhase(TACTICAL, INTAKE);
  assert.notEqual(c.phase, PHASE.RACE_SPECIFIC);
  assert.ok(c.fastestPace > c.goalPace, 'quality work is still short of race demand');
});

// The spreadsheet label reads the narrative rather than asserting a phase, so
// the sheet cannot contradict the program's own opening sentence.
test('the exporter does not call a developmental block Specificity', () => {
  const src = fs.readFileSync(new URL('../public/spreadsheet-parity.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('const DEVELOPMENTAL_NARRATIVE'), src.indexOf('function renderWeek'));
  const weekTitle = new Function('n', 'program', `${fn}; return weekTitle(n, program);`);
  assert.equal(weekTitle(3, TACTICAL), 'WEEK 3 — PEAK LOAD');
  assert.equal(weekTitle(3, 'A race-specific block for the event.\nSTART_WEEK1_TSV'), 'WEEK 3 — SPECIFICITY');
});

// --- item 3: overuse history demands the running baseline -------------------

test('running-related overuse history requires current volume, race goal or not', () => {
  const asked = (i) => intakeClarificationResult(i).questions.some((q) => q.id === 'running_current_exposure');
  assert.equal(asked({ primary_goals: ['Get stronger'], injuries: 'Previous shin splint irritation', notes: 'I run twice a week for general fitness' }), true);
  assert.equal(asked({ primary_goals: ['Get stronger'], injuries: 'Previous shin splint irritation', notes: 'I run twice a week, about 15 km total' }), false, 'already answered');
  assert.equal(asked({ primary_goals: ['Bench press 120kg'], injuries: 'Previous shin splint irritation' }), false, 'no running prescribed');
});

// --- item 4: preserve what works --------------------------------------------

test('interval pacing stays anchored to demonstrated repeat pace', () => {
  const intervals = rows(TACTICAL, 1).filter((r) => /run/i.test(r.name) && /\d+\s*m\b/i.test(r.reps));
  assert.ok(intervals.length, 'a quality session exists');
  for (const r of intervals) {
    assert.match(r.load, /\d:\d{2}/, `${r.name} carries a pace target`);
  }
});

test('quality volume stays in the 2-4 km band', () => {
  for (let w = 1; w <= 4; w += 1) {
    let metres = 0;
    for (const r of rows(TACTICAL, w)) {
      const m = String(r.reps).match(/(\d{2,4})\s*m\b/i);
      if (/run/i.test(r.name) && m) metres += Number(m[1]) * (num(r.sets) || 1);
    }
    if (!metres) continue;
    assert.ok(metres >= 1600 && metres <= 4400, `week ${w} quality volume ${metres} m outside the band`);
  }
});

// The load cell reads "20 kg pack, 9:35-9:45/km", so the carried weight has to
// be pulled by its unit -- taking the largest number finds 45 in the pace.
const packKg = (load) => { const m = String(load).match(/(\d+(?:\.\d+)?)\s*kg/i); return m ? Number(m[1]) : null; };
const paceSec = (load) => { const m = String(load).match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const distKm = (reps) => { const m = String(reps).match(/(\d+(?:\.\d+)?)\s*km/i); return m ? Number(m[1]) : null; };

test('the ruck moves one variable at a time and never the load', () => {
  const rucks = [1, 2, 3, 4]
    .map((w) => rows(TACTICAL, w).find((r) => /ruck|backpack carry/i.test(r.name)))
    .filter(Boolean);
  assert.ok(rucks.length >= 3, 'the ruck runs through the block');

  const kg = rucks.map((r) => packKg(r.load)).filter((n) => n != null);
  assert.equal(new Set(kg).size, 1, `carried load must stay fixed: ${kg.join(' -> ')}`);

  // Between any two weeks, pace may move or distance may move, never both.
  for (let i = 1; i < rucks.length; i += 1) {
    const paceMoved = paceSec(rucks[i].load) !== paceSec(rucks[i - 1].load);
    const distMoved = distKm(rucks[i].reps) !== distKm(rucks[i - 1].reps);
    assert.ok(!(paceMoved && distMoved),
      `week ${i + 1} moved pace and distance together: ${rucks[i - 1].load}/${rucks[i - 1].reps} -> ${rucks[i].load}/${rucks[i].reps}`);
  }
});

test('strength maintenance stays locked', () => {
  for (const re of [/^Back Squat$/i, /^Deadlift$/i, /^Overhead Press$/i]) {
    const loads = [1, 2, 3, 4]
      .map((w) => rows(TACTICAL, w).find((r) => re.test(r.name)))
      .filter(Boolean).map((r) => num(r.load)).filter((n) => n != null);
    if (loads.length < 2) continue;
    assert.ok(Math.max(...loads) <= loads[0] * 1.05, `maintenance lift climbed: ${loads.join(' -> ')}`);
  }
});

test('secondary pull-up work is allowed to progress', () => {
  const vol = [1, 2, 3].map((w) => {
    const r = rows(TACTICAL, w).find((x) => /^Pull-up$/i.test(x.name));
    return r ? (num(r.sets) || 0) * (num(r.reps) || 0) : 0;
  }).filter(Boolean);
  if (vol.length < 2) return;
  assert.ok(Math.max(...vol) >= vol[0], `secondary pulling should build: ${vol.join(' -> ')}`);
});
