// The two shapes that cost real money.
//
// Run #110 spent four attempts each on the fight camp and the dual-event block
// and saved no program for either. Both were blocking gates whose repair could
// not answer them, which is the one failure mode that charges a customer and
// delivers nothing. Neither shape was in the stress suite, so neither was
// caught before a paid run found it.
//
// These reconstruct both from the QA traces the failed builds returned, and
// assert that the FULL bundle -- not one module in isolation -- reaches a
// releasable program without asking the model again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { parseProgramModel, strengthDaysForWeek } from '../engine/program_model.js';
import { matchDictionary, swapSportDayContent } from '../engine/exercise_dictionary.js';

const T = new URL('./fixtures/', import.meta.url);
const COMP = JSON.parse(fs.readFileSync(new URL('competition_avatars.json', T), 'utf8'));

const DAY = 86400000;
const onSaturday = (w) => {
  const d = new Date(Date.now() + w * 7 * DAY);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 6 + 7) % 7));
  return d.toISOString().slice(0, 10);
};

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (day, name, load, sets, reps, note) =>
  [day, name, load, String(sets), String(reps), '2 min', '7', note, ''].join('\t');
const week = (n, rows) => `START_WEEK${n}_TSV\n${HEAD}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

const releasable = (program, intake) => {
  try {
    const r = collectRepairableValidationFailures(program, intake, { skipSkillCalibration: true });
    return { ok: Boolean(r.ok), codes: (r.flags || []).map((f) => f.code) };
  } catch (e) {
    return { ok: false, codes: [e?.code || 'THROWN'] };
  }
};

test('a fight camp with work on days the athlete cannot attend still ships', () => {
  // QA trace: "Week 4: strength/skill-strength work is scheduled on unavailable
  // day(s) day 4 ... day 1", four attempts, no program saved. Both of his
  // training days were already in use, so the repair had no free slot to move
  // the work into and returned the program untouched every time.
  const FIGHT = onSaturday(4);
  const fighter = {
    ...COMP.mma_fight_camp,
    competition_date: FIGHT,
    weigh_in_date: new Date(Date.parse(FIGHT) - DAY).toISOString().slice(0, 10),
    event_type: 'combat',
    event_priority: 'A',
  };
  const stop = 'Stop the session if bar speed drops.';
  // Full sessions, so the only defect under test is the day placement. A
  // two-row day trips the session-completeness rule and would mask it.
  const session = (day, w, note) => [
    row(day, 'Trap Bar Jump', 'Light', 3, 3, `Week ${w} power. ${stop}`),
    row(day, 'Pull-up', 'Bodyweight', 3, 5, `Week ${w} pulling. ${stop}`),
    row(day, 'Barbell Hip Thrust', '100 kg', 3, 5, `Week ${w} hinge. ${stop}`),
    row(day, 'Pallof Press', 'Light', 2, '6/side', `Week ${w} trunk. ${note} ${stop}`),
  ];
  const onPlan = (w) => [...session('Tue', w, 'On plan.'), ...session('Fri', w, 'On plan.')];
  const program = [
    week(1, onPlan(1)), week(2, onPlan(2)), week(3, onPlan(3)),
    week(4, [
      ...onPlan(4),
      // The defect: two extra sessions on days he does not train, with both of
      // his training days already used, so there is no free slot to move into.
      ...session('Mon', 4, 'Day he does not train.'),
      ...session('Thu', 4, 'Day he does not train.'),
    ]),
  ].join('\n');

  const verdict = releasable(program, fighter);
  assert.ok(verdict.ok, `the build must reach a program rather than exhaust its attempts: ${verdict.codes.join(', ')}`);
});

test('an annotated day label no longer inflates the strength-session count', () => {
  // QA trace: "expected 4 strength/skill-strength days, found 6 (monday,
  // tuesday, wednesday, thursday, fri sport only, sun sport only)", four
  // attempts, no program saved.
  //
  // This asserts the defect, not a whole invented program. The failing build
  // saved nothing, so the exact program cannot be replayed, and a bundle-level
  // pass on a program I wrote myself would prove little about the one that
  // failed. What is provable: the two annotated days counted as strength
  // sessions and no longer do, and the label still resolves to its weekday.
  const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const r = (d, n, l, sets, reps) => [d, n, l, String(sets), String(reps), '2 min', '7', 'note', ''].join('\t');
  const rows = [
    r('Mon', 'Back Squat', '120 kg', 3, 5),
    r('Wed', 'Pull-up', 'Bodyweight', 3, 6),
    r('Thu', 'Trap Bar Deadlift', '150 kg', 3, 5),
    r('Fri sport only', 'Run', 'Easy', 1, '40 min'),
    r('Sun sport only', 'Run', 'Easy', 1, '60 min'),
  ];
  const program = `START_WEEK1_TSV\n${H}\n${rows.join('\n')}\nEND_WEEK1_TSV`;

  const model = parseProgramModel(program, { days_per_week: 4, sport: 'Hyrox', available_gym_days: [] });
  const counted = strengthDaysForWeek(model, 1).map((d) => d.day);
  assert.deepEqual(counted, ['monday', 'wednesday', 'thursday'],
    `sport-only days must not count as strength sessions, got: ${counted.join(', ')}`);
  // And the annotation must not have created a day of its own.
  const names = model.weeks[0].days.map((d) => d.day);
  assert.ok(names.includes('friday') && names.includes('sunday'),
    `annotated labels must resolve to their weekday, got: ${names.join(', ')}`);
  assert.ok(!names.some((n) => n.includes('only')), `a phantom day survived: ${names.join(', ')}`);
});

test('the trap bar deadlift is a real exercise', () => {
  // It is in the fight camp's own current_numbers and was not in the
  // dictionary, so a program prescribing it failed EXERCISE_HALLUCINATION.
  assert.equal(matchDictionary('Trap Bar Deadlift').status, 'hit');
  assert.notEqual(matchDictionary('Hex Bar Deadlift').status, 'miss');
});

// --- run #112 --------------------------------------------------------------

test('a fight week labelled by the countdown the brief asks for still ships', () => {
  // QA trace: "A1:SPORT_DAY_COUPLING_VIOLATION+V91_TIMELINE_VIEWS_DISAGREE ->
  // ... -> A4:V82_POWER_EXPOSURE_DUPLICATED ... the calendar shows a gym
  // session on Tue, Fri that the week table does not contain".
  //
  // It did contain them. The timeline brief asks the model to label the event
  // week by distance from the event, and every reader in the engine took the
  // first three characters of the day cell -- so "Day -4 (Tue)" read as "day",
  // the week table appeared to hold no training days at all, and the rule that
  // exists to catch two views disagreeing fired on a program where they
  // agreed. No repair could answer it, because there was nothing wrong.
  const FIGHT = onSaturday(4);
  const fighter = {
    ...COMP.mma_fight_camp,
    competition_date: FIGHT,
    weigh_in_date: new Date(Date.parse(FIGHT) - DAY).toISOString().slice(0, 10),
    event_type: 'combat',
    event_priority: 'A',
  };
  const stop = 'Stop the session if bar speed drops.';
  const session = (day, w, note) => [
    row(day, 'Trap Bar Jump', 'Light', 3, 3, `Week ${w} power. ${stop}`),
    row(day, 'Pull-up', 'Bodyweight', 3, 5, `Week ${w} pulling. ${stop}`),
    row(day, 'Barbell Hip Thrust', '100 kg', 3, 5, `Week ${w} hinge. ${stop}`),
    row(day, 'Pallof Press', 'Light', 2, '6/side', `Week ${w} trunk. ${note} ${stop}`),
  ];
  const onPlan = (w) => [...session('Tue', w, 'On plan.'), ...session('Fri', w, 'On plan.')];
  const program = [
    week(1, onPlan(1)), week(2, onPlan(2)), week(3, onPlan(3)),
    // Same two days, named the way the engine itself asked for them.
    week(4, [...session('Day -4 (Tue)', 4, 'Four days out.'),
      ...session('Day -1 (Fri)', 4, 'This session is optional: skip it entirely if you are already sharp.')]),
  ].join('\n');

  const verdict = releasable(program, fighter);
  assert.ok(verdict.ok, `a countdown-labelled week must not read as an empty one: ${verdict.codes.join(', ')}`);
});

test('rows one cell short do not end the build', () => {
  // QA trace: forty-six TSV_ROW_COLUMN_COUNT_MISMATCH in a single attempt.
  // Final QA threw on them and nothing repaired them, so a missing trailing
  // cell -- a typing accident with one correct answer -- cost a paid attempt.
  const FIGHT = onSaturday(4);
  const fighter = {
    ...COMP.mma_fight_camp,
    competition_date: FIGHT,
    weigh_in_date: new Date(Date.parse(FIGHT) - DAY).toISOString().slice(0, 10),
    event_type: 'combat',
    event_priority: 'A',
  };
  const stop = 'Stop the session if bar speed drops.';
  // Every row missing its Results cell.
  const short = (day, name, load, sets, reps, note) =>
    [day, name, load, String(sets), String(reps), '2 min', '7', note].join('\t');
  const session = (day, w, note) => [
    short(day, 'Trap Bar Jump', 'Light', 3, 3, `Week ${w} power. ${stop}`),
    short(day, 'Pull-up', 'Bodyweight', 3, 5, `Week ${w} pulling. ${stop}`),
    short(day, 'Barbell Hip Thrust', '100 kg', 3, 5, `Week ${w} hinge. ${stop}`),
    short(day, 'Pallof Press', 'Light', 2, '6/side', `Week ${w} trunk. ${note} ${stop}`),
  ];
  const onPlan = (w) => [...session('Tue', w, 'On plan.'), ...session('Fri', w, 'On plan.')];
  const program = [
    week(1, onPlan(1)), week(2, onPlan(2)), week(3, onPlan(3)),
    week(4, [...session('Day -4 (Tue)', 4, 'Four days out.'),
      ...session('Day -1 (Fri)', 4, 'This session is optional: skip it entirely if you are already sharp.')]),
  ].join('\n');

  const verdict = releasable(program, fighter);
  assert.ok(verdict.ok, `a missing trailing cell must be repaired, not fatal: ${verdict.codes.join(', ')}`);
});

test('an empty model response is answered with a different request, not the same one', () => {
  // The dual-event block returned OPENAI_EMPTY_OUTPUT after seventeen minutes.
  // The transient budget existed, but it would have re-sent byte-for-byte the
  // request that had just spent its whole token budget thinking.
  const runtime = fs.readFileSync(new URL('../server.phase15.js', import.meta.url), 'utf8');
  assert.match(runtime, /async function runEngineRaw\(userContent, engineOptions = \{\}\)/);
  assert.match(runtime, /max_output_tokens: effectiveMaxOutputTokens/);
  assert.match(runtime, /reasoning: \{ effort: effectiveReasoningEffort \}/);
  // The retry raises the ceiling, and a second empty response lowers the effort.
  assert.match(runtime, /engineOptions = \{ \.\.\.engineOptions, maxOutputTokens: Math\.min\(96000/);
  assert.match(runtime, /if \(transientRetries >= 2\) engineOptions\.reasoningEffort = "medium"/);
  // And the failure explains itself in the artefact rather than in logs nobody
  // on the acceptance side can read.
  assert.match(runtime, /incomplete_details\?\.reason/);
  assert.match(runtime, /JOB_BUDGET_SPENT/);
});

test('a run is not moved off a day the athlete has no gym on', () => {
  // available_gym_days is about access to a gym. A run does not need one, and
  // the repair that moves work off unavailable days was treating a day of pure
  // running as a scheduling mistake -- the advanced hybrid had his Thursday run
  // shifted onto Friday in all four weeks, on top of a hard MMA session, to
  // satisfy a rule his run was never subject to.
  //
  // Found by running the chain against a program the service had already
  // delivered, which is the only way a repair that converges and still makes
  // the week worse ever shows up.
  const hybrid = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8')).advanced_hybrid;
  const before = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');
  const runDay = (program) => {
    const m = program.match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i);
    const lines = m[1].split('\n').filter((l) => l.includes('\t'));
    let day = '';
    for (const line of lines.slice(1)) {
      const cells = line.split('\t');
      if (cells[0].trim()) day = cells[0].trim();
      if (/^run$/i.test(String(cells[1] || '').trim())) return day;
    }
    return null;
  };
  assert.equal(runDay(before), 'Thu', 'the delivered program ran on Thursday');
  assert.equal(runDay(swapSportDayContent(before, hybrid)), 'Thu', 'and it still does');
});

test('strength work on a day the athlete cannot attend is still moved', () => {
  // The rule keeps its job: a day that needs a gym is a day that needs a gym.
  const hybrid = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8')).advanced_hybrid;
  const HEAD2 = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const line = (d, n) => [d, n, '100 kg', '3', '5', '3 min', '8', 'Work sets.', ''].join('\t');
  const p = `START_WEEK1_TSV\n${HEAD2}\n${line('Mon', 'Back Squat')}\n${line('Thu', 'Bench Press')}\nEND_WEEK1_TSV`;
  const moved = swapSportDayContent(p, hybrid);
  assert.ok(!/^Thu\t/m.test(moved), `bench press must leave Thursday:\n${moved}`);
});
