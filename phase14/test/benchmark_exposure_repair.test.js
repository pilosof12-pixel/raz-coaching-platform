// What this repair has to get right, and what it got wrong first.
//
// Each of these failed at least once while the repair was being built, so the
// assertions are records of real behaviour rather than a restatement of the
// code.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairBenchmarkExposure, maintenanceDose } from '../engine/benchmark_exposure_repair.js';
import { benchmarkExposure, accessoryRedundancy } from '../engine/coach_rules.js';
import { matchDictionary } from '../engine/exercise_dictionary.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => fs.readFileSync(path.join(root, 'fixtures', f), 'utf8');
const json = (f) => JSON.parse(fx(f));
const C = json('competition_avatars.json');
const day = 86400000;
const saturday = (w) => {
  const d = new Date(Date.now() + w * 7 * day);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const LIFTER = { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet', event_priority: 'A' };
const FIGHTER = { ...C.mma_fight_camp, competition_date: saturday(3) };

const named = (program, re) => {
  const out = [];
  for (let w = 1; w <= 4; w += 1) {
    const p = parseWeek(program, w);
    if (!p) continue;
    for (const c of p.rows) {
      const n = String(c[p.exercise] || '');
      if (re.test(n)) out.push({ week: w, day: String(c[p.day] || '').trim(), load: String(c[p.load] || ''), sets: String(c[p.sets] || ''), reps: String(c[p.reps] || ''), note: String(c[p.notes] || '') });
    }
  }
  return out;
};

test('the coach\'s own prescribed fix: the redundant row becomes the missing pull', () => {
  const program = fx('run101_weightlifter_peak.txt');
  assert.deepEqual(benchmarkExposure(program, LIFTER).map((f) => f.movement), ['Snatch Pull']);

  const r = repairBenchmarkExposure(program, LIFTER);
  assert.equal(r.changed, true);
  assert.equal(benchmarkExposure(r.program, LIFTER).length, 0);
  // He charged 0.55 for the missing pull and named the row to spend for it.
  assert.ok(r.swaps.every((s) => /row/i.test(s.from)), JSON.stringify(r.swaps));
  assert.ok(r.inserts.length === 0, 'a block with redundancy should never need an insert');
});

test('spending a slot does not add work: the row count is unchanged', () => {
  const program = fx('run114_weightlifter_peak.txt');
  const rows = (p) => [1, 2, 3, 4].map((w) => parseWeek(p, w)?.rows.length ?? 0);
  const r = repairBenchmarkExposure(program, LIFTER);
  assert.deepEqual(rows(r.program), rows(program));
});

test('the dose climbs, because a movement the goal wants improved must not sit flat', () => {
  // The first version wrote the same 97.5 kg into all four weeks. It satisfied
  // the exposure rule and immediately tripped IMPROVEMENT_GOAL_FLAT instead.
  const r = repairBenchmarkExposure(fx('run114_weightlifter_peak.txt'), LIFTER);
  const kg = named(r.program, /snatch pull/i).map((x) => Number(String(x.load).replace(/[^\d.]/g, '')));
  assert.ok(kg.length >= 3, `expected the pull in most weeks, got ${kg.length}`);
  for (let i = 1; i < kg.length; i += 1) assert.ok(kg[i] > kg[i - 1], `week ${i + 1} did not climb: ${kg.join(' -> ')}`);
});

test('the dose starts at the standard\'s floor and stays under the benchmark', () => {
  const d = maintenanceDose({ value: '130 kg x 3', kg: 130 }, 0);
  assert.equal(d.load, '97.5 kg'); // 75% of 130
  assert.equal(d.sets, '2');
  assert.equal(d.reps, '3');
  const top = maintenanceDose({ value: '130 kg x 3', kg: 130 }, 9);
  assert.ok(Number(top.load.replace(/[^\d.]/g, '')) <= 130 * 0.875, 'the ramp must stay under the benchmark');
});

test('the note tracks the ramp instead of calling week 4 a maintenance dose', () => {
  const notes = named(repairBenchmarkExposure(fx('run114_weightlifter_peak.txt'), LIFTER).program, /snatch pull/i).map((x) => x.note);
  assert.match(notes[0], /keeps the benchmarked/i);
  for (const n of notes.slice(1)) assert.match(n, /one step heavier/i);
});

test('with nothing redundant to spend, the movement is added instead', () => {
  const program = fx('run113_mma_camp_delivered.txt');
  assert.equal(accessoryRedundancy(program, FIGHTER).length, 0, 'fixture premise: nothing is redundant here');
  assert.deepEqual(benchmarkExposure(program, FIGHTER).map((f) => f.movement), ['Trap Bar Deadlift']);

  const r = repairBenchmarkExposure(program, FIGHTER);
  assert.equal(benchmarkExposure(r.program, FIGHTER).length, 0);
  assert.ok(r.inserts.length > 0);
  assert.equal(r.swaps.length, 0);
});

test('an inserted row carries its day, or the calendar counts it as a new session', () => {
  // A blank day cell became a third "unknown" gym day for an athlete who asked
  // for two, and the frequency gate refused the whole program over it.
  const r = repairBenchmarkExposure(fx('run113_mma_camp_delivered.txt'), FIGHTER);
  for (const row of named(r.program, /trap bar deadlift/i)) {
    assert.notEqual(row.day, '', `an inserted row has no day: ${JSON.stringify(row)}`);
  }
});

test('nothing is added to competition week', () => {
  const r = repairBenchmarkExposure(fx('run113_mma_camp_delivered.txt'), FIGHTER);
  assert.ok(r.inserts.every((i) => i.week !== 4), `fight week was touched: ${JSON.stringify(r.inserts)}`);
});

test('only a name the engine\'s own vocabulary accepts is ever written', () => {
  // Writing "Snatch Pull" while it was absent from the dictionary turned a
  // fixable finding into a build that asked the model to try again.
  for (const [program, intake] of [[fx('run101_weightlifter_peak.txt'), LIFTER], [fx('run113_mma_camp_delivered.txt'), FIGHTER]]) {
    const r = repairBenchmarkExposure(program, intake);
    for (const name of [...r.swaps.map((s) => s.to), ...r.inserts.map((i) => i.movement)]) {
      assert.equal(matchDictionary(name)?.status, 'hit', `${name} is not in the dictionary`);
    }
  }
});

test('the Olympic pulls are in the dictionary at all', () => {
  for (const n of ['Snatch Pull', 'Clean Pull', 'Snatch High Pull', 'Clean High Pull', 'Power Snatch', 'Hang Snatch']) {
    assert.equal(matchDictionary(n)?.status, 'hit', `${n} missing from the dictionary`);
  }
});

test('it converges: running it on its own output changes nothing', () => {
  for (const [program, intake] of [[fx('run101_weightlifter_peak.txt'), LIFTER], [fx('run113_mma_camp_delivered.txt'), FIGHTER]]) {
    const once = repairBenchmarkExposure(program, intake);
    assert.equal(repairBenchmarkExposure(once.program, intake).changed, false);
  }
});

test('a program with nothing missing is left exactly as it was', () => {
  const program = fx('run115_inseason_footballer.txt');
  const intake = json('hard_avatars.json').inseason_footballer;
  assert.equal(benchmarkExposure(program, intake).length, 0);
  const r = repairBenchmarkExposure(program, intake);
  assert.equal(r.changed, false);
  assert.equal(r.program, program);
});
