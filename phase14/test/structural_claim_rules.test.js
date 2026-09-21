// Prose that describes the rows underneath it, checked against those rows.
//
// Two of the coach's five findings on run #124 were claims the program made
// about its own structure that the structure did not support, and neither was
// caused by a repair -- the model wrote both and the engine had nothing that
// reads a claim about sequence. Claim integrity already covers numbers a note
// states about its own row; this covers claims about what comes next.
//
// Both are decidable from the table alone, which is what makes them rules
// rather than judgement: either the row below is the one named, or it is not.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nextRowClaimUnsupported, competitionOrderClaimUnsupported, repairNextRowClaim,
} from '../engine/structural_claim_rules.js';

const INTAKE = {
  age: 33, sport: 'Hyrox', event_type: 'hybrid_race', event_priority: 'A',
  competition_date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
  primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
  days_per_week: 4, gym_availability_mode: 'flexible',
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const week = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;
const program = (rows) => [week(1, rows), week(2, ['Mon\tBack Squat\t100 kg\t3\t5\t2:00\t7\tx\t']),
  week(3, ['Mon\tBack Squat\t100 kg\t3\t5\t2:00\t7\tx\t']),
  week(4, ['Day -3\tBack Squat\t100 kg\t1\t3\t2:00\t6\tx\t'])].join('\n\n');

test('a claimed next row that is not the next row is a finding', () => {
  const p = program([
    'Mon\tRun\t4:10/km\t2\t1000 m\t2:30\t7.5\tEach rep flows straight into the sled pull row below.\t',
    'Mon\tRower\t1:50/500 m\t2\t250 m\t1:30\t7\tSteady.\t',
  ]);
  const found = nextRowClaimUnsupported(p, INTAKE);
  assert.equal(found.length, 1, 'the false transition claim was not caught');
  assert.match(found[0].detail, /row below is Rower/);
});

test('and it is not a finding when the row below is what was claimed', () => {
  const p = program([
    'Mon\tRun\t4:10/km\t2\t1000 m\t2:30\t7.5\tEach rep flows straight into the sled pull row below.\t',
    'Mon\tSled Pull\tCompetition load\t2\t25 m\t0:00\t7\tStraight off the run.\t',
  ]);
  assert.deepEqual(nextRowClaimUnsupported(p, INTAKE), []);
});

test('the claim is restated to name the row that is actually there', () => {
  // The table is authoritative and a note is derived text, so the note moves.
  // Moving rows to satisfy a sentence would let prose drive programming.
  const p = program([
    'Mon\tRun\t4:10/km\t2\t1000 m\t2:30\t7.5\tEach rep flows straight into the sled pull row below.\t',
    'Mon\tRower\t1:50/500 m\t2\t250 m\t1:30\t7\tSteady.\t',
  ]);
  const { program: fixed, changed } = repairNextRowClaim(p, INTAKE);
  assert.ok(changed);
  assert.deepEqual(nextRowClaimUnsupported(fixed, INTAKE), []);
  assert.match(fixed, /into the Rower row below/);
  assert.equal(repairNextRowClaim(fixed, INTAKE).changed, false, 'not idempotent');
});

test('a note naming no known movement is left alone', () => {
  // "the next row" and "the easy row" name nothing the dictionary knows, and
  // the dictionary check is what keeps this rule from firing on ordinary prose.
  const p = program([
    'Mon\tRun\t4:10/km\t2\t1000 m\t2:30\t7.5\tThis flows into the next row below.\t',
    'Mon\tRower\t1:50/500 m\t2\t250 m\t1:30\t7\tSteady.\t',
  ]);
  assert.deepEqual(nextRowClaimUnsupported(p, INTAKE), []);
});

test('a session claiming competition order has to keep it', () => {
  const out = competitionOrderClaimUnsupported(program([
    'Mon\tWall Ball\tRace load\t1\t25\t2:00\t7\tone continuous 50% rehearsal in competition order.\t',
    'Mon\tSki Erg\tRace pace\t1\t250 m\t2:00\t7\tx\t',
    'Mon\tSled Pull\tRace load\t1\t25 m\t2:00\t7\tx\t',
  ]), INTAKE);
  assert.equal(out.length, 1, 'wall ball before ski erg is not competition order');
});

test('and a session that keeps it raises nothing', () => {
  const out = competitionOrderClaimUnsupported(program([
    'Mon\tSki Erg\tRace pace\t1\t250 m\t2:00\t7\tone continuous 50% rehearsal in competition order.\t',
    'Mon\tSled Pull\tRace load\t1\t25 m\t2:00\t7\tx\t',
    'Mon\tWall Ball\tRace load\t1\t25\t2:00\t7\tx\t',
  ]), INTAKE);
  assert.deepEqual(out, []);
});
