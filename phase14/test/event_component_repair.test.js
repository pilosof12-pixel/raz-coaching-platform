// Putting the race back into a race block.
//
// The brief named all eight stations with their race doses and run #117 trained
// three. That is an instruction delivered in full and not obeyed, which is what
// a deterministic repair is for.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairEventComponentCoverage } from '../engine/event_component_repair.js';
import { componentExposures, eventComponentCoverage } from '../engine/event_component_rules.js';
import { matchDictionary } from '../engine/exercise_dictionary.js';
import { parseWeek } from '../engine/v34_workload_accounting.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => fs.readFileSync(path.join(root, 'fixtures', f), 'utf8');
const json = (f) => JSON.parse(fx(f));
const HYROX = {
  age: 33, experience: 'Advanced (3+ years)',
  primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
  maintenance_goals: ['Hold my squat and pulling strength through both'],
  days_per_week: 4, gym_availability_mode: 'flexible', available_gym_days: [],
  sport: 'Hyrox', sport_schedule: [],
  current_numbers: 'Back Squat: 150 kg x 1\n1 km ski erg: 3:38',
  pain: { active: false }, event_type: 'hybrid_race', event_priority: 'A',
};
const covered = (program, week) => {
  const m = componentExposures(program, HYROX);
  return m.components.filter((c) => m.trainedIn(week, c)).length;
};

test('every station is trained in weeks 1 and 2', () => {
  const program = fx('run117_dual_event_hyrox.txt');
  assert.equal(covered(program, 1), 3, 'fixture premise: the delivered block trained three');
  const r = repairEventComponentCoverage(program, HYROX);
  assert.equal(covered(r.program, 1), 8);
  assert.equal(covered(r.program, 2), 8);
});

test('it spends the slots the coach said to spend', () => {
  // "Those exercises are not inherently bad. Their opportunity cost is the
  // problem this close to the race." Trunk and isolation go before compounds,
  // and the squat is never traded for a station.
  const r = repairEventComponentCoverage(fx('run117_dual_event_hyrox.txt'), HYROX);
  assert.ok(r.swaps.length > 0);
  for (const s of r.swaps) assert.doesNotMatch(s.from, /squat|deadlift/i, `traded away ${s.from}`);
});

test('running is never spent, because it is the race\'s connective tissue', () => {
  const r = repairEventComponentCoverage(fx('run117_dual_event_hyrox.txt'), HYROX);
  for (const s of r.swaps) assert.doesNotMatch(s.from, /^run$|running/i);
});

test('it adds no rows: a spent slot is a changed slot', () => {
  const program = fx('run117_dual_event_hyrox.txt');
  const r = repairEventComponentCoverage(program, HYROX);
  for (const w of [1, 2, 3, 4]) {
    assert.equal(parseWeek(r.program, w)?.rows.length, parseWeek(program, w)?.rows.length, `week ${w} changed size`);
  }
});

test('only names the dictionary accepts are written', () => {
  // Five of the eight stations were dictionary misses until they were added.
  // Writing one anyway is how a fixable finding becomes a regeneration.
  const r = repairEventComponentCoverage(fx('run117_dual_event_hyrox.txt'), HYROX);
  for (const s of r.swaps) {
    assert.ok(['hit', 'alias'].includes(matchDictionary(s.to)?.status), `${s.to} is not in the dictionary`);
  }
});

test('the coverage findings clear', () => {
  const r = repairEventComponentCoverage(fx('run117_dual_event_hyrox.txt'), HYROX);
  const codes = eventComponentCoverage(r.program, HYROX).map((f) => f.rule);
  assert.ok(!codes.includes('EVENT_COMPONENT_NEVER_TRAINED'), codes.join(','));
  assert.ok(!codes.includes('EVENT_COMPONENT_COVERAGE_WEEK1'), codes.join(','));
});

test('it converges', () => {
  const once = repairEventComponentCoverage(fx('run117_dual_event_hyrox.txt'), HYROX);
  assert.equal(repairEventComponentCoverage(once.program, HYROX).changed, false);
});

test('an athlete with no named event is untouched', () => {
  const C = json('competition_avatars.json');
  const program = fx('run114_weightlifter_peak.txt');
  const r = repairEventComponentCoverage(program, C.weightlifter_peak);
  assert.equal(r.changed, false);
  assert.equal(r.program, program);
});
