// The race starts with a run, so the rehearsal does.
//
// He priced this at 0.35 on run #136, the largest finding on that program:
// "HYROX competition structure is effectively Run -> station -> Run -> station,
// so the program contains the correct movements and largely the correct station
// ordering, but the rehearsal is shifted by one element and therefore does not
// reproduce the transition sequence exactly." His INSTEAD opens with Run 1000 m.
//
// The sequencer used to lead with the station whenever runs were scarce, to
// protect the compromised-work floor -- that floor counts station-then-run
// pairs, and a run in front of every station spends them before any station can
// be followed by one. Leading with the run took run #124 from clean to two
// findings, which is why the trade existed. He has now priced the other side of
// it higher, and a rehearsal that is right about everything except where it
// starts is not the race's sequence.

import test from 'node:test';
import assert from 'node:assert/strict';

import { orderIntoCompetitionSequence } from '../engine/race_rehearsal_repair.js';

const INTAKE = {
  age: 33, experience: 'Advanced (3+ years)', bodyweight: '76 kg',
  primary_goals: ['Podium in my age group at the Hyrox race'],
  days_per_week: 4, gym_availability_mode: 'flexible', available_gym_days: [],
  training_location: 'commercial_gym', sport: 'Hyrox', sport_schedule: [],
  equipment: 'Full gym: sled, ski erg, rower, wall ball, sandbags, barbells, dumbbells, kettlebells.',
  event_type: 'hybrid_race', event_priority: 'A',
  pain: { active: false }, mobility: { active: false, limitation: '' },
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (name, reps) => `Mon\t${name}\t90-95% race load\t1\t${reps}\t0:45\t7.5\tRace work.\t`;
const week = (rows) => `START_WEEK1_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK1_TSV`;

const sequenceOf = (program) => program.split('\n')
  .filter((l) => /^Mon\t/.test(l))
  .map((l) => l.split('\t')[1])
  .filter((n) => !/^\[WARMUP\]/.test(n));

test('the rehearsal opens with a run when runs and stations are matched', () => {
  const program = week([
    row('Ski Erg', '500 m'), row('Run', '1000 m'),
    row('Prowler Push', '50 m'), row('Run', '1000 m'),
    row('Sled Pull', '50 m'), row('Run', '1000 m'),
    row('Burpee Broad Jump', '40 m'), row('Run', '1000 m'),
  ]);
  const out = sequenceOf(orderIntoCompetitionSequence(program, INTAKE, 1, 'Mon'));
  assert.equal(out[0], 'Run', `rehearsal opens with ${out[0]}, not a run: ${out.join(' -> ')}`);
});

test('it still opens with a run when runs are scarce', () => {
  // This is the case the old trade was built for: two runs, four stations. It
  // led with the station to keep station-then-run pairs, and that is the shift
  // he charged.
  const program = week([
    row('Ski Erg', '500 m'), row('Run', '1000 m'),
    row('Prowler Push', '50 m'), row('Run', '1000 m'),
    row('Sled Pull', '50 m'), row('Burpee Broad Jump', '40 m'),
  ]);
  const out = sequenceOf(orderIntoCompetitionSequence(program, INTAKE, 1, 'Mon'));
  assert.equal(out[0], 'Run', `rehearsal opens with ${out[0]}: ${out.join(' -> ')}`);
});

test('runs and stations alternate from the front', () => {
  const program = week([
    row('Ski Erg', '500 m'), row('Run', '1000 m'),
    row('Prowler Push', '50 m'), row('Run', '1000 m'),
    row('Sled Pull', '50 m'), row('Run', '1000 m'),
    row('Burpee Broad Jump', '40 m'), row('Run', '1000 m'),
  ]);
  const out = sequenceOf(orderIntoCompetitionSequence(program, INTAKE, 1, 'Mon'));
  for (let i = 0; i < out.length; i += 2) {
    assert.equal(out[i], 'Run', `position ${i} is ${out[i]}: ${out.join(' -> ')}`);
  }
});

test('the stations keep catalogue order behind the runs', () => {
  const program = week([
    row('Sled Pull', '50 m'), row('Run', '1000 m'),
    row('Ski Erg', '500 m'), row('Run', '1000 m'),
    row('Prowler Push', '50 m'), row('Run', '1000 m'),
  ]);
  const out = sequenceOf(orderIntoCompetitionSequence(program, INTAKE, 1, 'Mon'))
    .filter((n) => n !== 'Run');
  assert.deepEqual(out, ['Ski Erg', 'Prowler Push', 'Sled Pull'],
    'race order among the stations must survive the reordering');
});
