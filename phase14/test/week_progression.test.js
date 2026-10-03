// Weeks 2-4 built from Week 1 by rule. The model writes Week 1; this module
// progresses it. Each test pins one of the progression rules the owner set.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWeeksFromWeekOne, knownMaxKg, plateauTargets, progressesForGoal, week1OnlyApplies } from '../engine/week_progression.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const w1 = (rows) => `Intro.\n\nSTART_WEEK1_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK1_TSV\n`;
const rowOf = (program, week, name) => {
  const m = program.match(new RegExp(`START_WEEK${week}_TSV\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`));
  const c = m[1].split('\n').map((l) => l.split('\t')).find((x) => x[1] === name);
  return c && { load: c[2], sets: c[3], reps: c[4], rpe: c[6], note: c[7] };
};

test('weeks 2-4 are built only when the model wrote Week 1 alone', () => {
  const one = w1(['Mon\tBack Squat\t100 kg\t3\t5\t3 min\t7\tBrace.\t']);
  const out = buildWeeksFromWeekOne(one, { primary_goals: ['Back squat 140 kg'] });
  assert.equal(out.built, true);
  assert.match(out.program, /^Intro\./);
  for (const w of [2, 3, 4]) assert.match(out.program, new RegExp(`START_WEEK${w}_TSV`));
  assert.equal(buildWeeksFromWeekOne(out.program, {}).built, false, 'a full block is left alone');
});

test('strength with a known load: single progression on load, Week 4 consolidates', () => {
  const out = buildWeeksFromWeekOne(w1(['Mon\tBack Squat\t100 kg\t4\t5\t3 min\t7\tBrace.\t']), { primary_goals: ['Back squat 140 kg'] }).program;
  assert.equal(rowOf(out, 2, 'Back Squat').load, '102.5 kg');
  assert.equal(rowOf(out, 3, 'Back Squat').load, '105 kg');
  assert.equal(rowOf(out, 4, 'Back Squat').load, '102.5 kg');
  assert.equal(rowOf(out, 4, 'Back Squat').sets, '3');
  assert.equal(rowOf(out, 2, 'Back Squat').reps, '5', 'one lever: load, not reps');
});

test('a load never passes what the athlete\'s own max allows for those reps', () => {
  const intake = { primary_goals: ['220kg back squat'], current_numbers: 'Back Squat: 205 kg 1RM' };
  assert.equal(knownMaxKg(intake, 'Back Squat'), 205);
  const out = buildWeeksFromWeekOne(w1(['Mon\tBack Squat\t175 kg\t3\t3\t3 min\t8\tTop set.\t']), intake).program;
  assert.ok(Number(rowOf(out, 3, 'Back Squat').load.match(/\d+(?:\.\d+)?/)[0]) / 205 <= 0.88);
});

test('hypertrophy: double progression, reps first then load', () => {
  const out = buildWeeksFromWeekOne(w1(['Mon\tDumbbell Bench Press\t30 kg\t3\t8\t2 min\t7\tControl.\t']), { primary_goals: ['Build muscle'] }).program;
  assert.equal(rowOf(out, 2, 'Dumbbell Bench Press').reps, '9');
  assert.equal(rowOf(out, 2, 'Dumbbell Bench Press').load, '30 kg');
  assert.equal(rowOf(out, 3, 'Dumbbell Bench Press').load, '32.5 kg');
  assert.match(rowOf(out, 3, 'Dumbbell Bench Press').note, /Double progression/);
});

test('a support lift that is not a goal holds its dose', () => {
  const intake = { primary_goals: ['Snatch 120 kg'] };
  assert.equal(progressesForGoal('Overhead Press', intake), false);
  const out = buildWeeksFromWeekOne(w1(['Fri\tOverhead Press\t50 kg\t3\t5\t2 min\t7\tSupport.\t']), intake).program;
  assert.equal(rowOf(out, 3, 'Overhead Press').load, '50 kg');
  assert.match(rowOf(out, 2, 'Overhead Press').note, /Held at the Week 1 dose/);
});

test('a competition lift is loaded into its intensification band by Week 3', () => {
  const intake = { primary_goals: ['Snatch 120 kg at the qualifier'], current_numbers: 'Snatch: 112 kg best in training' };
  const out = buildWeeksFromWeekOne(w1(['Mon\tSnatch\t90 kg\t5\t2\t2 min\t7\tFast pull.\t']), intake).program;
  const w3 = Number(rowOf(out, 3, 'Snatch').load.match(/\d+/)[0]);
  assert.ok(w3 / 112 >= 0.88 && w3 / 112 <= 0.9, `${w3}`);
});

test('endurance: about 10% a week on one lever; intervals add a repetition at the same pace', () => {
  const out = buildWeeksFromWeekOne(w1([
    'Sat\tRun\tEasy conversational pace\t1\t10 km\tN/A\t4\tEasy long run.\t',
    'Mon\tRun\t4:30/km\t5\t800 m\t2 min\t8\tIntervals.\t',
  ]), { primary_goals: ['Run a sub-45 10 km'] }).program;
  const long = (w) => out.match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?\\nSat\\tRun\\t[^\\t]*\\t1\\t([^\\t]+)`))[1];
  assert.deepEqual([2, 3, 4].map(long), ['11 km', '12 km', '8.5 km']);
  assert.match(out, /START_WEEK4_TSV[\s\S]*Sat\tRun\t[^\t]*\t1\t8\.5 km\tN\/A\t4\tEasy long run\./, 'the long run keeps its identity');
  const interval = (w) => out.match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?\\nMon\\tRun\\t([^\\t]+)\\t(\\d+)\\t800 m`)).slice(1);
  assert.deepEqual(interval(2), ['4:30/km', '6']);
  assert.deepEqual(interval(3), ['4:30/km', '7']);
});

test('a youth skill keeps its Week 3 standard in Week 4', () => {
  const out = buildWeeksFromWeekOne(w1(['Session A\tBar Muscle-up Transition Drill\tModerate band\t3\t2\t90s\tN/A\tClean.\t']), { age: 13, primary_goals: ['Achieve first bar muscle-up'] }).program;
  assert.equal(rowOf(out, 3, 'Bar Muscle-up Transition Drill').reps, '3');
  assert.equal(rowOf(out, 4, 'Bar Muscle-up Transition Drill').reps, '3');
  assert.equal(rowOf(out, 4, 'Bar Muscle-up Transition Drill').sets, '3');
});

test('a reported plateau gets an intensifier: a drop set for calves, a 2+2+1 cluster for chin-ups', () => {
  const intake = { primary_goals: ['Build muscle', 'Weighted chin-up +30 kg'], notes: 'My calves have been stuck for a year. Chin-ups have stalled at +20 kg for 3.' };
  assert.equal(plateauTargets(intake).length, 2);
  const out = buildWeeksFromWeekOne(w1([
    'Mon\tStanding Calf Raise\t60 kg\t3\t12\t60s\t8\tFull range.\t',
    'Mon\tWeighted Chin-up\t+20 kg\t4\t3\t3 min\t8\tDead hang.\t',
  ]), intake).program;
  assert.match(rowOf(out, 2, 'Standing Calf Raise').note, /drop set/);
  assert.equal(rowOf(out, 2, 'Weighted Chin-up').reps, '5 (2+2+1)');
  assert.match(rowOf(out, 2, 'Weighted Chin-up').note, /cluster/);
  assert.doesNotMatch(rowOf(out, 4, 'Weighted Chin-up').reps, /\+/, 'Week 4 consolidates without the intensifier');
});

test('a block that ends in its competition keeps the model-written run-in', () => {
  const soon = new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10);
  const intake = { primary_goals: ['Snatch 120 kg'], competition_date: soon, event_type: 'strength_meet', event_priority: 'A', current_numbers: 'Snatch: 112 kg' };
  assert.equal(week1OnlyApplies(intake), false);
  assert.equal(buildWeeksFromWeekOne(w1(['Mon\tSnatch\t90 kg\t5\t2\t2 min\t7\tFast.\t']), intake).built, false);
  assert.equal(week1OnlyApplies({ primary_goals: ['Back squat 140 kg'] }), true);
});

import fs from 'node:fs';
import { week1OnlySection } from '../engine/week_progression.js';
const runtime = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');

test('the model is asked for Week 1 only, and the runtime builds Weeks 2-4 before any check', () => {
  assert.match(week1OnlySection({ primary_goals: ['Back squat 140 kg'] }), /ONLY the START_WEEK1_TSV/);
  const soon = new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10);
  assert.equal(week1OnlySection({ competition_date: soon, event_type: 'strength_meet', event_priority: 'A', primary_goals: ['Snatch 120 kg'], current_numbers: 'Snatch: 112 kg' }), '');
  assert.match(runtime, /\+ week1OnlySection\(intake\) \+ qaCorrectionsFrom\(src\);/);
  const build = runtime.indexOf('const built = buildWeeksFromWeekOne(raw, intake);');
  const structural = runtime.indexOf('if (!isValidProgram(raw)) {', build);
  const chain = runtime.indexOf('const finished = runQualityChain(program);', build);
  assert.ok(build > 0 && structural > build && chain > structural, 'built weeks are judged like any other candidate');
});

test('a race-pace run is never called easy', () => {
  const out = buildWeeksFromWeekOne(w1([
    'Fri\tRun\t4:48-4:55/km\t1\t6 km\tN/A\t7\tRace-specific brick run.\t',
    'Wed\tRun\t5:15-5:35/km\t1\t8 km\tN/A\t3-4\tEasy aerobic run.\t',
  ]), { primary_goals: ['Sprint triathlon sub-1:15'] }).program;
  const notes = (day) => [2, 3, 4].map((w) => out.match(new RegExp(`START_WEEK${w}_TSV[\\s\\S]*?\\n(${day}\\tRun\\t[^\\n]*)`))[1].split('\t')[7]);
  for (const n of notes('Fri')) assert.doesNotMatch(n, /\beasy\b/i);
  assert.match(notes('Wed')[0], /same easy effort/);
});

import { keepWeekOne } from '../engine/week_progression.js';

test('a defect repeated in every engine-built week is repaired in Week 1 and the block rebuilt', () => {
  const full = buildWeeksFromWeekOne(w1(['Mon\tBack Squat\t100 kg\t4\t5\t3 min\t7\tBrace.\t']) + '\nClosing guidance.', { primary_goals: ['Back squat 140 kg'] }).program;
  const one = keepWeekOne(full);
  assert.match(one, /START_WEEK1_TSV/);
  assert.doesNotMatch(one, /START_WEEK2_TSV|START_WEEK4_TSV/);
  assert.match(one, /Closing guidance\.$/);
  assert.equal(keepWeekOne('no weeks'), null);
  // The runtime: once per build, an unscoped repair of an engine-built block
  // asks for Week 1 and rebuilds Weeks 2-4 from it.
  assert.match(runtime, /if \(repairCandidate && !repairWeeks && engineBuiltWeeks && !weekOneRepairUsed\) \{/);
  assert.match(runtime, /const rebuilt = weekOne \? buildWeeksFromWeekOne\(weekOne, intake\) : null;/);
  const rebuild = runtime.indexOf('qaTrace.push("W:rebuilt-from-week1")');
  assert.ok(rebuild > 0 && runtime.indexOf('if (!isValidProgram(raw)) {', rebuild) > rebuild);
});
