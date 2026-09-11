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
import { matchDictionary } from '../engine/exercise_dictionary.js';

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
