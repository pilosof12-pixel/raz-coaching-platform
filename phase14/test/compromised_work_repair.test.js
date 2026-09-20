// The compromised-running finding was never a composition problem.
//
// The coach charges 0.45 for a race block that trains running and stations but
// never together. It survived the entire repair chain on every Hyrox program we
// have delivered, on the reasoning that answering it meant writing a session --
// which is composing training rather than repairing it, and is the line this
// engine does not cross.
//
// Run #122's Monday reads Run, Prowler Push, Farmer Carry. The run and the
// stations are both present, on the same day, in the wrong order. Moving the
// existing run behind the last station creates the pair without adding a set,
// changing a load, or inventing a session. Where a day has no run or no station
// the repair does nothing, because that case really would be composition.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairCompromisedRunning } from '../engine/compromised_work_repair.js';
import { compromisedWorkMissing } from '../engine/event_component_rules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = fs.readFileSync(path.join(here, 'fixtures', 'run122_hyrox_salvaged-program.txt'), 'utf8');

const INTAKE = {
  age: 33, language: 'en', experience: 'Advanced (3+ years)',
  competition_date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
  event_type: 'hybrid_race', event_priority: 'A',
  primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
  goal_priority_model: 'tiered', days_per_week: 4,
  gym_availability_mode: 'flexible', available_gym_days: [], training_location: 'commercial_gym',
  equipment: 'Full gym: sled, ski erg, rower, wall ball, sandbags, barbells, dumbbells, kettlebells.',
  sport: 'Hyrox', sport_sessions_per_week: 2, sport_schedule: [],
  current_numbers: '5 km run: 19:40\n1 km ski erg: 3:38',
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const rowsOf = (p) => p.split('\n').filter((l) => /\t/.test(l) && !/^Day\t/.test(l));

test('the fixture starts with the finding, so this is not a vacuous pass', () => {
  assert.ok(compromisedWorkMissing(PROGRAM, INTAKE).length > 0);
});

test('the pairing clears without adding or removing a single row', () => {
  const before = rowsOf(PROGRAM);
  const { program, changed, moves } = repairCompromisedRunning(PROGRAM, INTAKE);
  assert.ok(changed, 'repair did not fire');
  assert.deepEqual(compromisedWorkMissing(program, INTAKE), [], 'the finding survived');

  const after = rowsOf(program);
  assert.equal(after.length, before.length, 'row count changed; this repair only reorders');
  // Same multiset of exercise names: nothing invented, nothing dropped.
  const names = (rs) => rs.map((l) => l.split('\t')[1]).sort();
  assert.deepEqual(names(after), names(before), 'the set of exercises changed');
  assert.ok(moves.length > 0 && moves.every((m) => m.after), 'moves should name what the run now follows');
});

test('it is idempotent', () => {
  const once = repairCompromisedRunning(PROGRAM, INTAKE).program;
  const twice = repairCompromisedRunning(once, INTAKE);
  assert.equal(twice.changed, false, 'the repair fires again on its own output');
});

test('a day with no station is left alone', () => {
  // Composition, not repair. If this ever starts changing such a day, the repair
  // has begun writing sessions.
  // The goal text has to lose the race too: components are derived from the
  // whole intake, so leaving "Hyrox" in primary_goals keeps the stations and
  // the first version of this test was asserting nothing.
  const noStations = {
    ...INTAKE, sport: 'Running', event_type: 'road_race',
    primary_goals: ['Run a half marathon in four weeks'],
  };
  const { changed } = repairCompromisedRunning(PROGRAM, noStations);
  assert.equal(changed, false, 'repair acted on an event with no named stations');
});
