import test from 'node:test';
import assert from 'node:assert/strict';

import { weekdayKey, weekdayIndex } from '../engine/weekday.js';
import { collectTimelineIntegrityFlags, repairTimelineIntegrity, workingDaysOf } from '../engine/v91_timeline_integrity.js';
import { buildTimelineIntegrityBrief } from '../engine/v91_timeline_integrity.js';
import { renderCampSchedule, workingDaysByWeek } from '../engine/v78_sport_taper.js';

test('a day cell is read for the weekday it names, however it is dressed', () => {
  assert.equal(weekdayKey('Tue'), 'tue');
  assert.equal(weekdayKey('tuesday'), 'tue');
  assert.equal(weekdayKey('Thurs'), 'thu');
  assert.equal(weekdayKey('Sat.'), 'sat');
  // The countdown labels the timeline brief asks the model to write.
  assert.equal(weekdayKey('Day -4 (Tue)'), 'tue');
  assert.equal(weekdayKey('Day -1 (Fri)'), 'fri');
  assert.equal(weekdayKey('D-2 Thu'), 'thu');
  // And the annotations it has always written.
  assert.equal(weekdayKey('Fri (sport only)'), 'fri');
  assert.equal(weekdayKey('Sun - recovery'), 'sun');
});

test('a cell that names no day answers none', () => {
  for (const s of ['Day -4', 'Week 4', 'FIGHT DAY', '', null, undefined, 'Rest']) {
    assert.equal(weekdayKey(s), null, JSON.stringify(s));
  }
  assert.equal(weekdayIndex('Week 4'), -1);
  assert.equal(weekdayIndex('Day -1 (Fri)'), 4);
});

// The defect this exists to prevent: the engine asked for a label it could not
// read, so a program whose two views agreed perfectly was failed for
// disagreeing, and the repair found nothing to move.
const weeksOnSaturday = (n) => {
  const d = new Date(Date.now() + n * 7 * 86400000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 6 + 7) % 7));
  return d.toISOString().slice(0, 10);
};

const CAMP = {
  competition_date: weeksOnSaturday(4), event_type: 'combat', event_priority: 'A',
  days_per_week: 2, available_gym_days: ['Tue', 'Fri'], training_location: 'commercial_gym',
  equipment: 'Full commercial gym, plus sled, kettlebells and a trap bar.',
  sport: 'MMA', sport_sessions_per_week: 7,
  sport_schedule: [{ day: 'Mon', intensity: 'hard' }, { day: 'Tue', intensity: 'moderate' },
    { day: 'Wed', intensity: 'hard' }, { day: 'Thu', intensity: 'moderate' },
    { day: 'Fri', intensity: 'hard' }, { day: 'Sat', intensity: 'moderate' }, { day: 'Sun', intensity: 'light' }],
  current_numbers: 'Back Squat: 150 kg x 1\nTrap Bar Deadlift: 190 kg x 3',
};

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const row = (d, n, s, r, note = '') => [d, n, 'RPE-selected', String(s), String(r), '2 min', '7', note, ''].join('\t');
const wk = (n, rows) => `START_WEEK${n}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${n}_TSV`;

function campProgram(week4Rows) {
  const base = [
    wk(1, [row('Tue', 'Trap Bar Deadlift', 3, 3), row('Fri', 'Bench Press', 3, 3)]),
    wk(2, [row('Tue', 'Trap Bar Deadlift', 3, 3), row('Fri', 'Bench Press', 3, 3)]),
    wk(3, [row('Tue', 'Trap Bar Deadlift', 2, 3), row('Fri', 'Bench Press', 2, 3)]),
    wk(4, week4Rows),
  ].join('\n\n');
  return `${renderCampSchedule(CAMP, Date.now(), { workingDays: workingDaysByWeek(base) })}\n\n${base}`;
}

test('the week table is read when it is labelled the way the brief asks', () => {
  const program = campProgram([
    row('Day -4 (Tue)', 'Trap Bar Deadlift', 2, 2, 'Stop the session early if bar speed drops.'),
    row('Day -1 (Fri)', 'Bench Press', 2, 2, 'This session is optional: skip it entirely if you are already sharp.'),
  ]);
  assert.deepEqual([...workingDaysOf(program, 4)].sort(), ['fri', 'tue']);
  assert.deepEqual(collectTimelineIntegrityFlags(program, CAMP).map((f) => f.code), []);
  assert.equal(repairTimelineIntegrity(program, CAMP), program, 'nothing to repair');
});

test('the brief still asks for the labels the reader now understands', () => {
  const brief = buildTimelineIntegrityBrief(CAMP);
  assert.match(brief, /Tue = Day -4/);
  assert.match(brief, /Fri = Day -1/);
  assert.match(brief, /THIS DOES NOT ADD SESSIONS/);
});

test('a countdown-labelled session on the event is still caught and removed', () => {
  const program = campProgram([
    row('Day -4 (Tue)', 'Trap Bar Deadlift', 2, 2),
    row('Day 0 (Sat)', 'Bench Press', 2, 2),
  ]);
  const flags = collectTimelineIntegrityFlags(program, CAMP);
  assert.ok(flags.some((f) => f.code === 'V91_SESSION_ON_OR_AFTER_DAY_ZERO'), flags.map((f) => f.code).join(','));
  const fixed = repairTimelineIntegrity(program, CAMP);
  assert.equal(collectTimelineIntegrityFlags(fixed, CAMP).length, 0, 'the repair must answer its own flag');
  assert.ok(!/Day 0 \(Sat\)/.test(fixed.slice(fixed.indexOf('START_WEEK4_TSV'))));
});
