import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectIntensificationFlags, repairIntensification, currentMaxes, isIntensification,
} from '../engine/v71_intensification.js';
import { buildCompetitionBrief } from '../engine/v69_competition_brief.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
const LIFTER = COMP.weightlifter_peak;

// The reviewed block: 73 sets every week, 39% classic every week, +1 kg a week.
const BLOCK = fs.readFileSync(
  new URL('../../docs/qa/live-three-avatar/latest/weightlifter_peak-program.txt', import.meta.url), 'utf8',
);

function weekStats(program, w) {
  const p = parseWeek(program, w);
  let sets = 0; let classic = 0;
  for (const cells of p.rows) {
    const n = String(cells[p.exercise] || '').trim();
    if (!n || /^\s*\[WARMUP\]/i.test(n)) continue;
    const k = Number(String(cells[p.sets]).match(/\d+/)?.[0]) || 0;
    sets += k;
    if (/snatch|clean|jerk/i.test(n)) classic += k;
  }
  return { sets, share: sets ? classic / sets : 0 };
}

test('only an intensification block is governed', () => {
  assert.equal(isIntensification(LIFTER), true);
  assert.equal(isIntensification(COMP.mma_fight_camp), false, 'a block running into the fight is not intensification');
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(isIntensification(intake), false, id);
    assert.equal(collectIntensificationFlags('', intake).length, 0, id);
  }
});

test('current maxes are read from what the athlete stated', () => {
  assert.deepEqual(currentMaxes(LIFTER), { snatch: 112, cleanJerk: 141 });
});

// Each defect the review named.
test('flat volume across an intensification block is rejected', () => {
  const flags = collectIntensificationFlags(BLOCK, LIFTER);
  assert.ok(flags.some((f) => f.code === 'V71_INTENSIFICATION_VOLUME_FLAT'));
});

test('a competition-lift share that never rises is rejected', () => {
  const flags = collectIntensificationFlags(BLOCK, LIFTER);
  assert.ok(flags.some((f) => f.code === 'V71_CLASSIC_SHARE_NOT_RISING'));
});

test('a classic-lift load with no percentage of max is rejected', () => {
  const flags = collectIntensificationFlags(BLOCK, LIFTER);
  assert.ok(flags.some((f) => f.code === 'V71_MISSING_PERCENT_OF_MAX'));
});

test('the repair drops volume and raises classic share together', () => {
  const fixed = repairIntensification(BLOCK, LIFTER);
  const before = [1, 2, 3, 4].map((w) => weekStats(BLOCK, w));
  const after = [1, 2, 3, 4].map((w) => weekStats(fixed, w));
  assert.ok(before.every((b) => b.sets === before[0].sets), 'fixture should start flat');
  assert.ok(after[3].sets < after[0].sets, `volume must fall: ${after.map((a) => a.sets).join(',')}`);
  assert.ok(after[3].share > after[0].share, 'classic share must rise');
  assert.equal(collectIntensificationFlags(fixed, LIFTER).length, 0);
  assert.equal(repairIntensification(fixed, LIFTER), fixed, 'idempotent');
});

// Support work gives way; competition-lift frequency does not.
test('the repair never cuts a competition lift', () => {
  const fixed = repairIntensification(BLOCK, LIFTER);
  for (const w of [1, 2, 3, 4]) {
    const p1 = parseWeek(BLOCK, w);
    const p2 = parseWeek(fixed, w);
    const classicSets = (p) => p.rows
      .filter((c) => /snatch|clean|jerk/i.test(String(c[p.exercise] || '')))
      .reduce((n, c) => n + (Number(String(c[p.sets]).match(/\d+/)?.[0]) || 0), 0);
    assert.equal(classicSets(p2), classicSets(p1), `week ${w} lost competition-lift volume`);
  }
});

test('classic-lift loads read as kilograms and percentage of max', () => {
  const fixed = repairIntensification(BLOCK, LIFTER);
  const row = fixed.split('\n').find((l) => /^\w+\tSnatch\t/.test(l));
  assert.match(row.split('\t')[2], /kg \(\d+% of current max\)/);
});

// The block has to say where it sits, or the athlete reads it as the peak.
test('the brief states the runway window and what kind of block this is', () => {
  const brief = buildCompetitionBrief(LIFTER);
  assert.match(brief, /Weeks -8 to -5/);
  assert.match(brief, /intensification block, not the final taper/);
  assert.match(brief, /taper is a separate block/);
});

test('a block running into the event says so instead', () => {
  const brief = buildCompetitionBrief(COMP.mma_fight_camp);
  assert.match(brief, /runs into the event/);
  assert.equal(/not the final taper/.test(brief), false);
});

// A phase name is a claim about the prescription underneath it.
test('Week 4 is only called Consolidate / Express when volume actually falls', () => {
  const src = fs.readFileSync(new URL('../public/spreadsheet-parity.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('const DEVELOPMENTAL_NARRATIVE'), src.indexOf('function applyTrackingValidation'));
  const weekTitle = new Function('n', 'program', `${fn}; return weekTitle(n, program);`);
  assert.equal(weekTitle(4, BLOCK), 'WEEK 4 — PEAK LOAD', 'flat volume must not claim consolidation');
  assert.equal(weekTitle(4, repairIntensification(BLOCK, LIFTER)), 'WEEK 4 — CONSOLIDATE / EXPRESS');
});
