import test from 'node:test';
import assert from 'node:assert/strict';

import { raceGap, classifyBlockPhase, fastestQualityPace, PHASE } from '../engine/v62_block_phase.js';

const TACTICAL = {
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  current_numbers: '3 km: 13:30',
};

// The shape that broke the first parser: a named event whose distance is never
// written down, a goal time in hours and minutes, and a weekly-volume figure
// in kilometres sitting nearby to be mistaken for the event.
const MASTERS = {
  primary_goals: ['Deadlift 180 kg', 'Complete a half marathon in under 2:05'],
  current_numbers: 'Half marathon: 2:24 six months ago\nCurrent running: 2 runs per week, about 14 km total, longest recent run 9 km',
};

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

test('an explicit distance and time parse as minutes and seconds', () => {
  const g = raceGap(TACTICAL);
  assert.equal(g.km, 3);
  assert.equal(mmss(g.currentPace), '4:30');
  assert.equal(mmss(g.goalPace), '4:00');
});

// "Half marathon: 2:24" is two hours twenty-four, not two minutes.
test('a named event supplies its own distance and reads the clock as hours', () => {
  const g = raceGap(MASTERS);
  assert.equal(Math.round(g.km * 10) / 10, 21.1, 'a half marathon is 21.1 km, not the 14 km of weekly volume');
  assert.equal(mmss(g.currentPace), '6:50');
  assert.equal(mmss(g.goalPace), '5:55');
});

test('half marathon is matched before marathon', () => {
  const full = raceGap({ primary_goals: ['Run a marathon under 4:00'], current_numbers: 'Marathon: 4:40' });
  assert.equal(Math.round(full.km), 42);
  assert.equal(Math.round(raceGap(MASTERS).km), 21);
});

// A misread should produce silence, not a confident wrong number fed to a brief.
test('an implausible reading is declined rather than guessed', () => {
  assert.equal(raceGap({ primary_goals: ['Get stronger'] }), null);
  assert.equal(raceGap({ primary_goals: ['3 km faster'], current_numbers: '3 km: 13:30' }), null,
    'one time is not a gap');
});

// A beginner running 3 km in thirty minutes is a real athlete, and the
// hours-and-minutes reading is what makes that legible.
test('a slow but human goal is read, not discarded', () => {
  const g = raceGap({ primary_goals: ['3 km from 0:30 to 0:20'], current_numbers: '3 km: 0:30' });
  assert.equal(mmss(g.currentPace), '10:00');
  assert.equal(mmss(g.goalPace), '6:40');
});

const WEEK = (pace) => [
  'START_WEEK1_TSV',
  'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults',
  `Wed\tRun\t${pace} / 400 m\t6\t400 m\t2:00\t8\tIntervals.\t`,
  'END_WEEK1_TSV',
].join('\n');

test('the fastest prescribed quality repetition is found', () => {
  assert.equal(Math.round(fastestQualityPace(WEEK('1:42'))), 255);
});

// The phase is derived from the gap, and being developmental is not a fault.
// The reviewed Tactical block sat at 4:08/km against a 4:00 goal -- 3.3% short,
// pre-specific. A shade slower and it is developmental; the boundary is real
// and both sides of it are legitimate blocks.
test('a block just short of goal demand is pre-specific', () => {
  const c = classifyBlockPhase(WEEK('1:39'), TACTICAL);
  assert.equal(c.phase, PHASE.PRE_SPECIFIC);
  assert.ok(c.aheadOfCurrent, 'faster than the athlete currently races');
  assert.ok(c.fastestPace > c.goalPace, 'and still short of goal demand');
});

test('a block further short of goal demand is developmental', () => {
  assert.equal(classifyBlockPhase(WEEK('1:42'), TACTICAL).phase, PHASE.DEVELOPMENTAL);
});

test('quality at goal demand classifies as race-specific', () => {
  assert.equal(classifyBlockPhase(WEEK('1:36'), TACTICAL).phase, PHASE.RACE_SPECIFIC);
});

test('quality far off goal demand classifies as base work', () => {
  assert.equal(classifyBlockPhase(WEEK('2:10'), TACTICAL).phase, PHASE.BASE);
});
