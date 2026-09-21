// Competition week may lose a day. It may not gain one closer to the event.
//
// The coach charged a HYROX block 0.20 for four straight competition-week days
// and said the same useful exposures fit into three. The engine could not act:
// its own taper rule held competition-week frequency at 70% of baseline, and
// four sessions inside a Day -7 to Day -4 window are necessarily consecutive,
// so no legal layout existed and the finding stood on every build. He resolved
// it by scoping the frequency floor to the taper week, and by ranking what
// gives way: race-specific feel, then strength and skill signal, then volume,
// then low-value exposures, and frequency last.

import test from 'node:test';
import assert from 'node:assert/strict';

import { repairCompetitionWeekConsolidation } from '../engine/competition_week_consolidation.js';
import { consecutiveTrainingDays } from '../engine/coach_rules.js';

const NOW = Date.parse('2026-06-15T12:00:00Z');
const inDays = (n) => new Date(NOW + n * 86400000).toISOString().slice(0, 10);

const HYROX = {
  age: 33, experience: 'Advanced (3+ years)', bodyweight: '76 kg',
  primary_goals: ['Podium in my age group at the Hyrox race'],
  days_per_week: 4, gym_availability_mode: 'flexible', available_gym_days: [],
  training_location: 'commercial_gym', sport: 'Hyrox', sport_schedule: [],
  equipment: 'Full gym: sled, ski erg, rower, wall ball, sandbags, barbells.',
  competition_date: inDays(25), event_type: 'hybrid_race', event_priority: 'A',
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, name) => `${day}\t${name}\tRPE-selected load\t3\t8\t2:00\t7\tWork.\t`;
const week = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

// Four straight competition-week days, which is what he charged.
const COMP = [
  row('Day -7', 'Back Squat'), row('Day -7', 'Pallof Press'),
  row('Day -6', 'Prowler Push'), row('Day -6', 'Rowing Ergometer'),
  row('Day -5', 'Wall Ball'), row('Day -5', 'Chin-up'),
  row('Day -4', 'Run'), row('Day -4', 'Farmer Carry'),
];
const BUILD = ['Mon', 'Tue', 'Thu', 'Fri'].flatMap((d) => [row(d, 'Back Squat'), row(d, 'Run')]);
const PROGRAM = [week(1, BUILD), week(2, BUILD), week(3, BUILD), week(4, COMP)].join('\n\n');

test('four consecutive competition-week days are consolidated to three', () => {
  assert.equal(consecutiveTrainingDays(PROGRAM, HYROX).length > 0, true, 'fixture must reproduce the finding');
  const { changed, program, moves } = repairCompetitionWeekConsolidation(PROGRAM, HYROX, NOW);
  assert.equal(changed, true);
  assert.equal(consecutiveTrainingDays(program, HYROX).length, 0);
  assert.equal(moves[0].week, 4);
});

test('nothing moves closer to the event', () => {
  // His own shape ends at Day -4 and puts nothing after it, so a session may
  // not be spread toward Day 0 to break the run. Consolidation is the only
  // legal direction.
  const { moves } = repairCompetitionWeekConsolidation(PROGRAM, HYROX, NOW);
  const dayOf = (l) => Number(String(l).match(/-(\d+)/)[1]);
  assert.ok(dayOf(moves[0].into) > dayOf(moves[0].from),
    `${moves[0].from} moved to ${moves[0].into}, which is nearer the race`);
});

test('every prescription survives the merge', () => {
  const { program } = repairCompetitionWeekConsolidation(PROGRAM, HYROX, NOW);
  const work = (p) => p.split('\n').filter((l) => /^Day -/.test(l))
    .map((l) => l.split('\t').slice(1).join('\t')).sort();
  assert.deepEqual(work(program), work(PROGRAM), 'consolidation moves rows; it does not drop them');
});

test('it is scoped to the structure it was derived from', () => {
  // "No universal rule: competition week must contain exactly three sessions.
  // That would overlearn one athlete." Applied to a weightlifting meet week it
  // took that avatar's stress convergence from fourteen defects to two --
  // a meet week's sessions are the competition lifts, and merging two of them
  // is a different meet rather than a tidier calendar.
  const lifter = {
    ...HYROX,
    primary_goals: ['Snatch 120 kg at the meet'], sport: '',
    event_type: 'strength_meet',
  };
  const { changed } = repairCompetitionWeekConsolidation(PROGRAM, lifter, NOW);
  assert.equal(changed, false);
});

test('a fixed calendar is never rearranged', () => {
  const fixed = { ...HYROX, gym_availability_mode: 'fixed', available_gym_days: ['Mon', 'Wed', 'Fri'] };
  assert.equal(repairCompetitionWeekConsolidation(PROGRAM, fixed, NOW).changed, false);
});
