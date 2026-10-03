// Run #163: the sprint triathlete's Week 4 ran twice against three runs a week,
// TARGET_MODALITY_EXPOSURE_REDUCED went back to the model twice, and the build
// took 565 seconds. Her schedule says the missing run is Wednesday's.

import test from 'node:test';
import assert from 'node:assert/strict';

import { restoreScheduledModalityExposure } from '../engine/scheduled_modality_restore.js';
import { endurancePerformanceIntegrityFlags } from '../engine/phase15_elite_guardrails.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const INTAKE = {
  primary_goals: ['Go sub-1:15 at the sprint triathlon, run 5 km faster'],
  notes: 'Currently 3 runs a week.',
  sport: 'Triathlon (sprint distance)',
  sport_schedule: [
    { day: 'Mon', type: 'Run intervals' }, { day: 'Tue', type: 'Swim' }, { day: 'Wed', type: 'Run easy' },
    { day: 'Thu', type: 'Bike' }, { day: 'Sat', type: 'Run long' }, { day: 'Sun', type: 'Bike long' },
  ],
};
const week = (n, rows) => `START_WEEK${n}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const mon = 'Mon\tRun\t2:20/500 m\t5\t500 m\t90 s\t7.5\tIntervals.\t';
const tue = 'Tue\tBack Squat\t65 kg\t3\t5\t3 min\t7\tStrength.\t';
const wed = (km) => `Wed\tRun\t5:30/km\t1\t${km} km\tN/A\t4\tEasy.\t`;
const sat = (km) => `Sat\tRun\t5:20/km\t1\t${km} km\tN/A\t5\tLong run.\t`;
const block = (w4) => [
  week(1, [mon, tue, wed(6), sat(9)]), week(2, [mon, tue, wed(7), sat(10)]),
  week(3, [mon, tue, wed(8), sat(11)]), week(4, w4),
].join('\n\n');

const runDays = (program, n) => new Set(program.match(new RegExp(`START_WEEK${n}_TSV[\\s\\S]*?END_WEEK${n}_TSV`))[0]
  .split('\n').filter((l) => /\tRun\t/.test(l)).map((l) => l.split('\t')[0])).size;

test('the missing scheduled run goes back on its day at the lightest dose the block uses', () => {
  const out = restoreScheduledModalityExposure(block([mon, tue, sat(8)]), INTAKE);
  assert.equal(out.repaired, true);
  assert.equal(runDays(out.program, 4), 3);
  const w4 = out.program.match(/START_WEEK4_TSV[\s\S]*?END_WEEK4_TSV/)[0].split('\n');
  const restored = w4.find((l) => l.startsWith('Wed\tRun\t'));
  assert.match(restored, /\t6 km\t/, 'the lightest Wednesday in the block, never a progression');
  assert.ok(w4.indexOf(restored) > w4.findIndex((l) => l.startsWith('Tue\t')), 'kept in week order');
  assert.ok(w4.indexOf(restored) < w4.findIndex((l) => l.startsWith('Sat\t')));
});

test('a week the gate does not flag is never touched', () => {
  const program = block([mon, tue, wed(5), sat(8)]);
  assert.equal(restoreScheduledModalityExposure(program, INTAKE).repaired, false);
});

test('without a schedule nothing is restored', () => {
  assert.equal(restoreScheduledModalityExposure(block([mon, tue, sat(8)]), { ...INTAKE, sport_schedule: [] }).repaired, false);
});

test('an easy scheduled session missing from every week gets the endurance default, a hard one does not', () => {
  const noWednesday = [1, 2, 3, 4].map((n) => week(n, [mon, tue, sat(9)])).join('\n\n');
  const out = restoreScheduledModalityExposure(noWednesday, INTAKE);
  assert.equal(out.repaired, true);
  const wedRows = out.program.split('\n').filter((l) => l.startsWith('Wed\tRun\t'));
  assert.equal(wedRows.length, 4);
  assert.match(wedRows[0], /\tEasy conversational pace\t1\t30 min\tN\/A\t4\t/);
  // Monday is "Run intervals": a hard session has no default dose.
  const noMonday = [1, 2, 3, 4].map((n) => week(n, [tue, wed(6), sat(9)])).join('\n\n');
  assert.equal(restoreScheduledModalityExposure(noMonday, INTAKE).repaired, false);
});
