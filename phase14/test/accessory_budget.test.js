// Work that serves no named goal has to earn its place.
//
// Run #139 gave a calisthenics athlete with two primary upper-body goals and an
// irritable elbow six lower-body exposures across five training days, and a
// Tuesday carrying nine work exercises where every other day carried five or
// six. Nothing in his intake names a lower-body goal, and nothing about a skill
// session improves when it becomes the longest day of the week.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairAccessoryBudget } from '../engine/accessory_budget.js';
import { CATEGORY, ROLE, classifyExercise } from '../engine/v38_movement_taxonomy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INTAKE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/run138_advanced_calisthenics_intake.json'), 'utf8'));
const RUN139 = fs.readFileSync(path.join(here, 'fixtures/run139_advanced_calisthenics.txt'), 'utf8');

const LOWER = [CATEGORY.KNEE_DOMINANT, CATEGORY.HIP_DOMINANT, CATEGORY.UNILATERAL_LOWER];
const week1 = (p) => p.match(/START_WEEK1_TSV([\s\S]*?)END_WEEK1_TSV/)[1];
const work = (p) => week1(p).split('\n').map((l) => l.split('\t'))
  .filter((c) => c.length === 9 && c[0] !== 'Day' && !/^\s*\[WARMUP\]/.test(c[1]));
const perDay = (p) => work(p).reduce((m, c) => m.set(c[0], (m.get(c[0]) || 0) + 1), new Map());
const lowerRows = (p) => work(p).filter((c) => LOWER.includes(classifyExercise(c[1]).category));

test('a pattern no goal names gets a weekly budget, not a daily slot', () => {
  assert.equal(lowerRows(RUN139).length, 6, 'fixture must start with six');
  const { program, changed } = repairAccessoryBudget(RUN139, INTAKE);
  assert.equal(changed, true);
  assert.ok(lowerRows(program).length <= 3, `still ${lowerRows(program).length} lower-body exposures`);
});

test('the week keeps its variety rather than three of the same movement', () => {
  const { program } = repairAccessoryBudget(RUN139, INTAKE);
  const kept = lowerRows(program).map((c) => c[1].toLowerCase());
  assert.equal(new Set(kept).size, kept.length, `kept a duplicate: ${kept.join(', ')}`);
});

test('a skill session is trimmed to what is actually his', () => {
  // Tuesday came in at nine against five and six elsewhere. It lands at seven,
  // not at the ceiling, because everything still on it is either skill practice
  // or a movement the athlete named -- and the answer to a dense skill day is
  // never to delete a goal. What the budget removes is the work with no reason
  // to be there, and afterwards there is none of that left on the day.
  assert.equal(perDay(RUN139).get('Tue'), 9, 'fixture must start with nine on Tuesday');
  const { program } = repairAccessoryBudget(RUN139, INTAKE);
  assert.ok(perDay(program).get('Tue') < 9, 'Tuesday must come down');

  const goalText = [...INTAKE.primary_goals, ...INTAKE.secondary_goals, ...INTAKE.maintenance_goals].join(' | ');
  const stillThere = work(program).filter((c) => c[0] === 'Tue')
    .filter((c) => classifyExercise(c[1]).role !== ROLE.SKILL_PRACTICE)
    .filter((c) => !new RegExp(c[1].replace(/[\s-]+/g, '[\\s-]?'), 'i').test(goalText));
  assert.deepEqual(stillThere.map((c) => c[1]), [],
    'nothing unexplained should be left on the skill day');
});

test('a movement the athlete named is never cut', () => {
  // The front lever is a stated maintenance goal. Density is a reason to move
  // it, not to delete something he asked to keep.
  const { program } = repairAccessoryBudget(RUN139, INTAKE);
  assert.ok(/Advanced Tuck Front Lever/.test(program), 'cut a named maintenance goal');
  assert.ok(/Muscle-up/.test(program) && /Weighted Pull-up/.test(program));
});

test('a named lower-body goal exempts the pattern entirely', () => {
  const squatter = { ...INTAKE, primary_goals: [...INTAKE.primary_goals, 'Pistol squat 10 clean reps each leg'] };
  const { program } = repairAccessoryBudget(RUN139, squatter);
  const pistols = lowerRows(program).filter((c) => /pistol/i.test(c[1]));
  assert.ok(pistols.length >= 2, 'a named goal is not an unexplained accessory');
});

test('a goal names a pattern, not a catalogue entry', () => {
  // "Hold my squat and pulling strength" is a lower-body goal. Matching the
  // movement name "Back Squat" against that sentence finds nothing, and the
  // first version of this rule stripped squats out of a Hyrox racer's block --
  // an athlete whose event is sled pushes and lunges. The stress suite caught it
  // where the unit tests did not.
  const spoken = { ...INTAKE, maintenance_goals: ['Hold my squat and pulling strength'] };
  const { moves } = repairAccessoryBudget(RUN139, spoken);
  assert.deepEqual(moves.filter((m) => /lower-body/.test(m.why)), [],
    'a pattern the athlete asked to keep is not an unexplained accessory');
});

test('an athlete with a race in the block keeps his lower body', () => {
  const racing = {
    ...INTAKE,
    competition_date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
    event_type: 'hybrid_race',
    primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
    maintenance_goals: [],
    secondary_goals: [],
  };
  const { moves } = repairAccessoryBudget(RUN139, racing);
  assert.deepEqual(moves.filter((m) => /lower-body/.test(m.why)), [],
    'the event is built out of the pattern the budget would have cut');
});

test('it is idempotent', () => {
  const once = repairAccessoryBudget(RUN139, INTAKE).program;
  assert.equal(repairAccessoryBudget(once, INTAKE).changed, false);
});
