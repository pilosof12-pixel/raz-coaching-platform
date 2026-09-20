// The repair that fills race coverage must not manufacture a novel exercise.
//
// Live run #122 spent five model calls and then delivered through the salvage
// path with V74_NOVEL_EXERCISE_NEAR_EVENT unresolved and four of eight stations
// missing. The cause was this repair: it spends accessory slots in weeks 1 and 2
// to make room for race components, and when it took the last early copy of an
// accessory that also appeared in week 3, that week-3 copy became a movement the
// athlete had never done in the block. V74 then refused the build, correctly.
//
// A repair creating the defect that blocks the build is the worst shape of this
// bug: it does not merely leave a finding, it costs model calls and then loses
// the coverage it was trying to add.
//
// Declining those slots was tried and is the wrong trade -- it keeps V74 quiet
// by abandoning coverage, which the coach charges 0.60 for. The repair now
// converts any stranded later copy to the same station, which answers both rules
// at once and supplies the second exposure weeks 1 to 3 require anyway.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairEventComponentCoverage } from '../engine/event_component_repair.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { collectNoveltyFlags } from '../engine/v74_camp_economy.js';
import { EVENT_COMPONENT_RULES } from '../engine/event_component_rules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = fs.readFileSync(path.join(here, 'fixtures', 'run122_hyrox_salvaged-program.txt'), 'utf8');

const INTAKE = {
  age: 33, language: 'en', experience: 'Advanced (3+ years)', bodyweight: '76 kg',
  competition_date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
  event_type: 'hybrid_race', event_priority: 'A',
  primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
  secondary_goals: ['Run a half marathon two weeks after Hyrox without wrecking myself for it'],
  maintenance_goals: ['Hold my squat and pulling strength through both'],
  goal_priority_model: 'tiered', days_per_week: 4, session_duration_minutes: 75,
  gym_availability_mode: 'flexible', available_gym_days: [], training_location: 'commercial_gym',
  equipment: 'Full gym: sled, ski erg, rower, wall ball, sandbags, barbells, dumbbells, kettlebells.',
  sport: 'Hyrox', sport_sessions_per_week: 2, sport_schedule: [],
  current_numbers: 'Back Squat: 150 kg x 1\nDeadlift: 190 kg x 1\n5 km run: 19:40\n1 km ski erg: 3:38',
  performance_markers: ['5 km: 19:40', 'Half marathon: 1:28'],
  injuries: 'Left achilles grumbles after back-to-back running days; settles with a day off.',
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const coverageRules = (p) => EVENT_COMPONENT_RULES
  .flatMap((fn) => { try { return fn(p, INTAKE) || []; } catch { return []; } })
  .map((f) => f.rule);

test('the fixture starts with the coverage gaps that drove the retries', () => {
  // Without this, a fixture the repair no longer touches would pass vacuously.
  const before = coverageRules(PROGRAM);
  assert.ok(before.includes('EVENT_COMPONENT_NEVER_TRAINED'), 'fixture no longer has untrained stations');
  assert.ok(before.includes('EVENT_COMPONENT_COVERAGE_WEEK1'), 'fixture no longer short on week 1 coverage');
});

test('filling coverage introduces no novel exercise near the event', () => {
  assert.equal((collectNoveltyFlags(PROGRAM, INTAKE) || []).length, 0, 'fixture should start clean of V74');
  const { program } = repairEventComponentCoverage(PROGRAM, INTAKE);
  assert.deepEqual(collectNoveltyFlags(program, INTAKE) || [], [],
    'the coverage repair stranded a later copy and made it novel');
});

test('and the coverage it was added for actually clears', () => {
  // The whole point. A version of this repair that kept V74 quiet by spending
  // nothing would pass the test above and fail this one.
  const { program } = repairDeterministicContradictions(PROGRAM, INTAKE);
  const after = coverageRules(program);
  for (const rule of ['EVENT_COMPONENT_NEVER_TRAINED', 'EVENT_COMPONENT_COVERAGE_WEEK1', 'BENCHMARKED_COMPONENT_NEGLECTED']) {
    assert.ok(!after.includes(rule), `${rule} survived the chain`);
  }
  assert.equal((collectNoveltyFlags(program, INTAKE) || []).length, 0, 'the full chain left a novel exercise');
});
