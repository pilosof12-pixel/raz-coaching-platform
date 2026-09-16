import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  campPlanByWeek, renderCampSchedule, collectSportStateFlags, repairSportStateLanguage,
} from '../engine/v78_sport_taper.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');

const saturday = (weeks) => {
  const d = new Date(Date.now() + weeks * 7 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const FIGHTER = {
  event_type: 'combat',
  competition_date: saturday(3),
  available_gym_days: ['Tue', 'Fri'],
  sport_schedule: [
    { day: 'Mon', intensity: 'hard' }, { day: 'Tue', intensity: 'moderate' },
    { day: 'Wed', intensity: 'hard' }, { day: 'Thu', intensity: 'moderate' },
    { day: 'Fri', intensity: 'hard' }, { day: 'Sat', intensity: 'moderate' },
    { day: 'Sun', intensity: 'light' },
  ],
};
const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (note) => [1, 2, 3, 4].map((w) => [
  `START_WEEK${w}_TSV`, HEAD,
  `Fri\tMedicine Ball Scoop Throw\t5 kg\t3\t3\t2:00\t6\t${note}\t`,
  `END_WEEK${w}_TSV`, '',
].join('\n')).join('\n');

// The camp schedule demotes Friday to hit its hard-contact target. Anything
// that wants to know Friday's state has to read that, not the intake.
test('the calendar and the plan behind it cannot disagree', () => {
  const byWeek = campPlanByWeek(FIGHTER);
  const rendered = renderCampSchedule(FIGHTER);
  for (const [week, plan] of byWeek) {
    const row = rendered.split('\n').find((l) => l.startsWith(`W${week} |`));
    assert.ok(row, `W${week} row`);
    for (const [day, cell] of plan.days) {
      if (!cell.sport) continue;
      assert.ok(row.includes(`MMA ${cell.sport}`), `W${week} ${day} ${cell.sport} in "${row}"`);
    }
  }
  assert.equal(byWeek.get(1).days.get('fri').sport, 'technical');
  assert.equal(byWeek.get(1).days.get('mon').sport, 'hard');
});

test('a note that calls a demoted session hard is flagged in every week it appears', () => {
  const flags = collectSportStateFlags(block('Deliberately low-cost after hard MMA.'), FIGHTER);
  assert.equal(flags.length, 4);
  assert.deepEqual([...new Set(flags.map((f) => f.code))], ['V78_SPORT_STATE_MISDESCRIBED']);
  assert.match(flags[0].detail, /camp schedule for that day says MMA technical/);
});

test('a note that describes the session correctly is left alone', () => {
  assert.deepEqual(collectSportStateFlags(block('Deliberately low-cost after technical MMA.'), FIGHTER), []);
});

// "if the mat session ran hard" is a contingency, not a claim about the day.
test('a contingency is not a description', () => {
  assert.deepEqual(collectSportStateFlags(block('Keep it short; if the mat session ran hard, do one set and leave.'), FIGHTER), []);
});

test('the repair rewrites the adjective and converges on the first pass', () => {
  const wrong = block('Deliberately low-cost after hard MMA.');
  const once = repairSportStateLanguage(wrong, FIGHTER);
  assert.equal(once.changed, true);
  assert.match(once.program, /after technical MMA/);
  assert.equal(collectSportStateFlags(once.program, FIGHTER).length, 0);
  assert.equal(repairSportStateLanguage(once.program, FIGHTER).changed, false);
});

// The bug the single-day fixtures could not see: the same wrong phrase on two
// days with two different right answers. A document-wide replacement fixed
// Tuesday and broke Friday.
test('two days carrying the same wrong phrase each get their own answer', () => {
  const both = [1, 2, 3, 4].map((w) => [
    `START_WEEK${w}_TSV`, HEAD,
    `Tue\tWeighted Pull-up\t+20 kg\t2\t2\t3:00\t7\tLow-cost after hard MMA.\t`,
    `Fri\tMedicine Ball Scoop Throw\t5 kg\t3\t3\t2:00\t6\tLow-cost after hard MMA.\t`,
    `END_WEEK${w}_TSV`, '',
  ].join('\n')).join('\n');
  assert.equal(collectSportStateFlags(both, FIGHTER).length, 8);
  const fixed = repairSportStateLanguage(both, FIGHTER);
  assert.match(fixed.program, /Tue\t[^\n]*after moderate MMA/);
  assert.match(fixed.program, /Fri\t[^\n]*after technical MMA/);
  assert.equal(collectSportStateFlags(fixed.program, FIGHTER).length, 0);
  assert.equal(repairSportStateLanguage(fixed.program, FIGHTER).changed, false);
});

test('nothing fires for an athlete with no camp', () => {
  assert.deepEqual(collectSportStateFlags(block('Deliberately low-cost after hard MMA.'), {}), []);
  assert.equal(repairSportStateLanguage(block('after hard MMA'), {}).changed, false);
});

// Delivered output: every Friday said "after hard MMA" while the schedule this
// engine printed above it said technical, in all four weeks.
test('it catches the fight camp that misdescribed its own Fridays', () => {
  const delivered = read('run113_mma_camp_delivered.txt');
  const flags = collectSportStateFlags(delivered, FIGHTER);
  // Weeks 1, 2 and 3 each carry a Friday note reading "after hard MMA" against
  // a calendar printed in the same document saying MMA technical. The coach
  // reviewing this program charged for one of them; all three are wrong.
  assert.deepEqual(flags.map((f) => [f.week, f.day]), [[1, 'fri'], [2, 'fri'], [3, 'fri']]);
  const fixed = repairSportStateLanguage(delivered, FIGHTER);
  assert.equal(fixed.changed, true);
  assert.equal(collectSportStateFlags(fixed.program, FIGHTER).length, 0);
  assert.equal(repairSportStateLanguage(fixed.program, FIGHTER).changed, false);
});
