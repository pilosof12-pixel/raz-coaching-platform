// A race rehearsal gathered from components the block already trains.
//
// Unlike the compromised-running finding -- a run and a station sitting on the
// same day in the wrong order -- this one is not latent. On run #122 the best
// day in week 1 carries three of the four components a rehearsal needs, and no
// reordering produces a fourth. So this repair moves component rows onto the day
// closest to being a rehearsal, within the same week, which leaves the week's
// coverage identical while giving one day the density the rule asks for.
//
// It is the most invasive repair in the chain: it changes what two sessions
// contain. Every move is checked against the structural audit and abandoned if
// any code gets worse.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairRaceRehearsal } from '../engine/race_rehearsal_repair.js';
import { repairEventComponentCoverage } from '../engine/event_component_repair.js';
import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { raceRehearsalMissing, matcherFor } from '../engine/event_component_rules.js';
import { namedComponentsFor } from '../engine/coach_standard.js';

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
const names = (p) => rowsOf(p).map((l) => l.split('\t')[1]).sort();

test('the fixture starts without a rehearsal, so this cannot pass vacuously', () => {
  assert.ok(raceRehearsalMissing(PROGRAM, INTAKE).some((f) => f.rule === 'RACE_REHEARSAL_MISSING'));
});

test('the rehearsal is gathered and the finding clears', () => {
  // Coverage first, because that is the chain order and the dependency is real:
  // this repair can only gather components the program already contains, and on
  // the raw fixture four of the eight stations are still missing. Asserting it
  // standalone was asserting that it can gather what is not there.
  const exposed = repairEventComponentCoverage(PROGRAM, INTAKE).program;
  const { program, changed } = repairRaceRehearsal(exposed, INTAKE);
  assert.ok(changed, 'repair did not fire');
  assert.ok(!raceRehearsalMissing(program, INTAKE).some((f) => f.rule === 'RACE_REHEARSAL_MISSING'),
    'the rehearsal finding survived');
});

test('it relocates work and never invents it', () => {
  const exposed = repairEventComponentCoverage(PROGRAM, INTAKE).program;
  const { program } = repairRaceRehearsal(exposed, INTAKE);
  assert.equal(rowsOf(program).length, rowsOf(exposed).length, 'row count changed');
  assert.deepEqual(names(program), names(exposed), 'the set of exercises changed');
});

test('it borrows the rule\'s matcher instead of writing its own', () => {
  // The first version used a loose name regex, counted "Chest-Supported Row" as
  // a rowing erg, reported four components on a day that had three and declared
  // success while the finding stayed. That is the third time this exact trap has
  // been walked into, so the matcher is shared rather than reimplemented.
  assert.equal(typeof matcherFor, 'function');
  assert.equal(matcherFor('Row').test('Chest-Supported Row'), false,
    'the shared matcher should not read a chest-supported row as the erg');
});

test('the whole chain leaves no event-component finding on this program', () => {
  const { program } = repairDeterministicContradictions(PROGRAM, INTAKE);
  assert.deepEqual(raceRehearsalMissing(program, INTAKE).map((f) => f.rule), []);
  assert.ok(namedComponentsFor(INTAKE).length >= 6);
});

test('the guard watches the gate this repair can actually trip', () => {
  // brokeSomething originally consulted auditProgramStructure alone, which does
  // not raise the camp-economy codes. This repair moves rows ONTO a day, so
  // V74_CAMP_SESSION_TOO_BUSY is the obvious way for it to do harm -- and it is
  // the single QA rejection in run #123's trace. The repair passed anyway, by
  // luck rather than by design, because the count happened not to rise.
  const src = fs.readFileSync(path.join(here, '..', 'engine', 'race_rehearsal_repair.js'), 'utf8');
  assert.match(src, /collectEconomyFlags/, 'guard cannot see camp-economy codes');
  assert.match(src, /collectNoveltyFlags/, 'guard cannot see novelty codes');
});
