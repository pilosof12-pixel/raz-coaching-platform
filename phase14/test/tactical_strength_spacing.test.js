// TACTICAL_SCHEDULE_ARCHITECTURE_VIOLATION is a blocking gate the ledger carries
// with repairs: [], and run #158 paid for that. The tactical block came back
// with strength on three consecutive days in all four weeks, the gate aborted
// it, the model rewrote the entire program, and the second attempt put the same
// three sessions on Mon, Thu and Sat: two billed calls and 1026 seconds for a
// block whose exercises, doses and frequencies were never the problem.
//
// These tests assert the behaviour rather than naming the code, because a test
// that merely names a gate marks its ledger debt answered without paying it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectTacticalStrengthSpacingFlags,
  normalizeTacticalStrengthSpacing,
} from '../engine/tactical_strength_spacing.js';
import {
  tacticalScheduleAnalysis,
  validateTacticalScheduleArchitectureSemantic,
} from '../engine/coaching_progression_gpp.js';

const INTAKE = {
  age: 27,
  language: 'en',
  experience: 'advanced',
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: ['Improve strict pull-ups from 14 toward 18-20'],
  maintenance_goals: ['Maintain useful squat and deadlift strength'],
  goal_priority_model: 'tiered',
  days_per_week: 3,
  session_duration_minutes: 60,
  gym_availability_mode: 'flexible',
  available_gym_days: [],
  training_location: 'commercial_gym',
  equipment: 'Full gym, track access, pull-up bar, 20 kg ruck.',
  current_numbers: ['3 km: 13:30', 'Back Squat: 140 kg x 5', 'Deadlift: 180 kg x 3', 'Strict Pull-ups: 14 reps'].join('\n'),
  sleep_hours: '7-8',
  recovery_rating: 'Good',
  notes: 'Wants combat-ready / special-operations-style fitness. Can train across five calendar days.',
};

const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, exercise, sets = '3', reps = '5') =>
  [day, exercise, '100 kg', sets, reps, '2 min', '7', 'Controlled.', ''].join('\t');
const runRow = (day, label) => [day, label, '', '1', '1', '', '6', 'Easy.', ''].join('\t');

// Strength on Mon, Tue and Wed: the run #158 shape.
const CLUSTERED_ROWS = [
  row('Mon', 'Back Squat'),
  row('Mon', 'Pull-up', '3', '6'),
  row('Tue', 'Deadlift'),
  row('Tue', 'Overhead Press'),
  row('Wed', 'Bench Press'),
  row('Wed', 'Chest-Supported Row'),
  runRow('Fri', 'Run'),
  runRow('Sat', 'Run'),
];

const program = (rows, prose = '') =>
  `${prose}\n` +
  [1, 2, 3, 4]
    .map((w) => [`START_WEEK${w}_TSV`, H, ...rows, `END_WEEK${w}_TSV`].join('\n'))
    .join('\n\n');

test('three consecutive strength days are detected on a flexible-schedule tactical block', () => {
  const flags = collectTacticalStrengthSpacingFlags(program(CLUSTERED_ROWS), INTAKE);
  assert.equal(flags.length, 4, 'one per week');
  assert.ok(flags.every((f) => f.week >= 1 && f.week <= 4));
});

test('the blocking gate throws before the repair and accepts after it', () => {
  const clustered = program(CLUSTERED_ROWS);
  assert.throws(() => validateTacticalScheduleArchitectureSemantic(clustered, INTAKE));

  const repaired = normalizeTacticalStrengthSpacing(clustered, INTAKE);
  assert.equal(repaired.repaired, true);
  assert.equal(
    validateTacticalScheduleArchitectureSemantic(repaired.program, INTAKE).ok,
    true,
    'the gate that aborted run #158 now passes without the model being asked again',
  );
});

// The reason this repair is safe to run on a paid program: it moves no work.
test('the repair changes which day, and nothing else', () => {
  const clustered = program(CLUSTERED_ROWS);
  const repaired = normalizeTacticalStrengthSpacing(clustered, INTAKE).program;

  const rowsOf = (p) => {
    const out = [];
    for (const m of p.matchAll(/START_WEEK(\d)_TSV\s*\n([\s\S]*?)\nEND_WEEK\1_TSV/g)) {
      for (const line of m[2].split('\n').slice(1)) {
        if (!line.trim()) continue;
        const cells = line.split('\t');
        out.push(`${m[1]}|${cells.slice(1).join('\t')}`);
      }
    }
    return out.sort();
  };
  assert.deepEqual(rowsOf(repaired), rowsOf(clustered), 'every row keeps its exercise, load, dose and notes');

  const trainingDays = (p) => {
    const per = {};
    for (const m of p.matchAll(/START_WEEK(\d)_TSV\s*\n([\s\S]*?)\nEND_WEEK\1_TSV/g)) {
      per[m[1]] = new Set(m[2].split('\n').slice(1).filter((l) => l.trim()).map((l) => l.split('\t')[0])).size;
    }
    return per;
  };
  assert.deepEqual(
    trainingDays(repaired),
    trainingDays(clustered),
    'the number of training days per week is identical, so an explicit calendar-day budget cannot start failing',
  );
});

test('the repaired week reads in calendar order', () => {
  const repaired = normalizeTacticalStrengthSpacing(program(CLUSTERED_ROWS), INTAKE).program;
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const m of repaired.matchAll(/START_WEEK(\d)_TSV\s*\n([\s\S]*?)\nEND_WEEK\1_TSV/g)) {
    const days = m[2].split('\n').slice(1).filter((l) => l.trim()).map((l) => l.split('\t')[0]);
    const seen = [...new Set(days)].map((d) => order.indexOf(d));
    assert.deepEqual(seen, [...seen].sort((a, b) => a - b), `week ${m[1]} lists its days in order`);
  }
});

// A day name left behind in the prose is the same defect as a note left over a
// changed dose: the text contradicts the table.
test('a weekday named in the narrative moves with the work', () => {
  const prose = 'Week 4 keeps a shorter Monday easy run on purpose to spread impact.';
  const clustered = program(CLUSTERED_ROWS, prose);
  const out = normalizeTacticalStrengthSpacing(clustered, INTAKE);

  const narrative = out.program.replace(/START_WEEK\d_TSV[\s\S]*?END_WEEK\d_TSV/g, '');
  const moved = out.repairs.find((r) => r.from === 'Mon' || r.to === 'Mon');
  if (moved) {
    const to = moved.from === 'Mon' ? moved.to : moved.from;
    const LONG = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
    assert.ok(narrative.includes(`shorter ${LONG[to]} easy run`), `narrative follows the work to ${to}`);
    assert.ok(!narrative.includes('shorter Monday easy run'), 'the stale day name is gone');
  } else {
    assert.ok(narrative.includes('shorter Monday easy run'), 'Monday did not move, so the narrative must not change');
  }
});

test('a program the gate already accepts is left untouched', () => {
  const spaced = program([
    row('Mon', 'Back Squat'),
    row('Mon', 'Pull-up', '3', '6'),
    row('Thu', 'Deadlift'),
    row('Thu', 'Overhead Press'),
    row('Sat', 'Bench Press'),
    row('Sat', 'Chest-Supported Row'),
    runRow('Tue', 'Run'),
  ]);
  assert.equal(collectTacticalStrengthSpacingFlags(spaced, INTAKE).length, 0);
  const out = normalizeTacticalStrengthSpacing(spaced, INTAKE);
  assert.equal(out.repaired, false);
  assert.equal(out.program, spaced);
});

test('a non-tactical intake is out of scope', () => {
  const other = { ...INTAKE, notes: 'General fitness.', primary_goals: ['Lose weight'], secondary_goals: [], maintenance_goals: [] };
  assert.equal(tacticalScheduleAnalysis(program(CLUSTERED_ROWS), other).applicable, false);
  assert.equal(collectTacticalStrengthSpacingFlags(program(CLUSTERED_ROWS), other).length, 0);
  assert.equal(normalizeTacticalStrengthSpacing(program(CLUSTERED_ROWS), other).repaired, false);
});

test('the repair is idempotent', () => {
  const once = normalizeTacticalStrengthSpacing(program(CLUSTERED_ROWS), INTAKE);
  const twice = normalizeTacticalStrengthSpacing(once.program, INTAKE);
  assert.equal(twice.repaired, false);
  assert.equal(twice.program, once.program);
});
