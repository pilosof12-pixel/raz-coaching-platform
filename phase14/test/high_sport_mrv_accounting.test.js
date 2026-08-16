import test from 'node:test';
import assert from 'node:assert/strict';

import { validateWeeklyVolumeBudgetSemantic } from '../engine/semantic_program_qa.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function fourWeeks(rows) {
  return [1,2,3,4].map((week) => [
    `START_WEEK${week}_TSV`,
    HEADER,
    ...rows.map((row) => row.join('\t')),
    `END_WEEK${week}_TSV`,
  ].join('\n')).join('\n\n');
}

const mma5 = {
  days_per_week: 1,
  sport: 'MMA',
  sport_schedule: [
    { day: 'Mon', intensity: 'moderate' },
    { day: 'Tue', intensity: 'hard' },
    { day: 'Wed', intensity: 'moderate' },
    { day: 'Thu', intensity: 'hard' },
    { day: 'Fri', intensity: 'moderate' },
  ],
  sleep_hours: '7-8 hours',
  recovery_rating: 'Good',
};

test('five tolerated MMA sessions do not hard-fail MRV before meaningful program volume is added', () => {
  const program = fourWeeks([
    ['Sun','Back Squat','100 kg','2','5','3 min','7','Low program dose',''],
  ]);
  const result = validateWeeklyVolumeBudgetSemantic(program, mma5);
  assert.equal(result.ok, true);
  for (const week of result.weeks) {
    assert.equal(week.over.length, 0);
    assert.equal(week.raw_sport.push, 30);
    assert.equal(week.raw_sport.core, 40);
    assert.equal(week.raw_sport.aerobic, 75);
    assert.ok(week.sport.push < week.raw_sport.push);
    assert.ok(week.sport.core < week.raw_sport.core);
    assert.ok(week.sport.aerobic < week.raw_sport.aerobic);
  }
});

test('high sport baseline still leaves a hard ceiling for excessive added gym push volume', () => {
  const program = fourWeeks([
    ['Sun','Overhead Press','60 kg','10','5','2 min','8','Excessive push block',''],
    ['Sun','Bench Press','80 kg','10','5','2 min','8','Excessive push block',''],
  ]);
  assert.throws(
    () => validateWeeklyVolumeBudgetSemantic(program, { ...mma5, days_per_week: 1 }),
    (err) => err?.code === 'WEEKLY_MRV_EXCEEDED' && Array.isArray(err?.details?.over) && err.details.over.some((x) => x.pattern === 'push'),
  );
});

test('high sport accounting remains per-week and never sums the four-week block', () => {
  const program = fourWeeks([
    ['Sun','Overhead Press','60 kg','3','5','2 min','7','Sane repeatable exposure',''],
  ]);
  const result = validateWeeklyVolumeBudgetSemantic(program, mma5);
  assert.equal(result.accounting_scope, 'per_week');
  assert.equal(result.weeks.length, 4);
  assert.ok(result.weeks.every((w) => w.over.length === 0));
});
