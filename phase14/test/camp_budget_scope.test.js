// The competition-week budget counts a gym programme, not a race.
//
// These numbers came from a fight-camp review, where a session is strength
// maintenance plus a little quality and anything else is filler. Applied
// unchanged to a multi-component race athlete they say something wrong: run
// #124's Day -6 carries Back Squat, Run, Prowler Push and Ski Erg against a
// budget of three, and three of those four ARE the race.
//
// The gate refused, the trim could cut nothing -- no cut pattern matches "Run"
// or "Ski Erg" -- and the build spent a second model call regenerating a session
// that was correct. That call was roughly half the athlete's total wait.
//
// Teaching surplusInSession that components earn their place does not help: it
// makes all four legitimate and the count still exceeds three. The budget itself
// is the mis-scoped part. It now applies to the work that is NOT the race.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectEconomyFlags, repairCampEconomy } from '../engine/v74_camp_economy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = fs.readFileSync(path.join(here, 'fixtures', 'dual_event_hyrox-program.txt'), 'utf8');

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

// Four general lifts on one competition-week day: still a gym programme.
//
// The injection has to land INSIDE week 4. The first version replaced the first
// matching row anywhere in the file, which put the lifts in week 1 -- a week
// with no budget at all -- so the test failed while asserting nothing about the
// rule. It now rewrites the week 4 block only.
const asGymProgramme = (p) => {
  const start = p.indexOf('START_WEEK4_TSV');
  const end = p.indexOf('END_WEEK4_TSV');
  if (start < 0 || end < 0) throw new Error('fixture has no week 4 block');
  const lifts = [
    'Day -6\tBack Squat\t117.5 kg\t3\t1\t2:30\t6\tCrisp singles.\t',
    'Day -6\tBench Press\tRPE-selected load\t3\t5\t2:00\t7\tPressing.\t',
    'Day -6\tBarbell Row\tRPE-selected load\t3\t8\t2:00\t7\tPulling.\t',
    'Day -6\tBiceps Curl\tRPE-selected load\t3\t12\t1:00\t7\tArms.\t',
  ].join('\n');
  // No extra newline: the week 4 slice already ends with one, and a blank line
  // inside a TSV block truncates it -- which is why the first version of this
  // test reported no flag on a session the gate does refuse.
  return `${p.slice(0, start)}${p.slice(start, end)}${lifts}\n${p.slice(end)}`;
};

test('a race-week session built from race stations is not too busy', () => {
  assert.deepEqual(collectEconomyFlags(PROGRAM, INTAKE), [],
    'the budget is still counting race stations as if they were filler');
});

test('four general lifts in competition week are still refused', () => {
  // The direction that matters. A scoping change that only ever says yes has
  // turned the gate off rather than scoped it.
  const gym = asGymProgramme(PROGRAM);
  assert.ok(collectEconomyFlags(gym, INTAKE).length >= 1,
    'the gate no longer refuses a gym programme in race week');
});

test('and the trim converges on that session', () => {
  const gym = asGymProgramme(PROGRAM);
  const out = repairCampEconomy(gym, INTAKE);
  const program = typeof out === 'string' ? out : out.program;
  assert.deepEqual(collectEconomyFlags(program, INTAKE), [],
    'the repair cannot answer the gate it just raised');
});

test('the component matcher is the shared one', () => {
  // A naive regex built from the component name reads "Barbell Row" as the
  // rowing erg, which excused four general lifts from a budget of three and
  // silently turned this gate off. That is the fourth time a locally written
  // matcher has made that mistake.
  const src = fs.readFileSync(path.join(here, '..', 'engine', 'v74_camp_economy.js'), 'utf8');
  assert.match(src, /import \{ matcherFor \} from '\.\/event_component_rules\.js'/);
  assert.ok(!/new RegExp\(String\(c\)/.test(src), 'a local component matcher has come back');
});
