// Coach on run #166: the triathlete's schedule rides Thursday and Sunday; the
// block wrote rides on Tuesday and Friday. Extra, or moved? The table could
// not say.

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSportScheduleIdentity } from '../engine/sport_schedule_identity.js';

const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows) => [1, 2, 3, 4].map((w) => `START_WEEK${w}_TSV\n${header}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`).join('\n\n');
const schedule = [{ day: 'Thu', type: 'Bike', intensity: 'moderate' }, { day: 'Sun', type: 'Bike long', intensity: 'hard' }, { day: 'Tue', type: 'Swim', intensity: 'moderate' }];
const days = (program) => program.match(/START_WEEK1_TSV\n([\s\S]*?)\nEND_WEEK1_TSV/)[1].split('\n').slice(1).filter((l) => /\tBike\t/.test(l)).map((l) => l.split('\t')[0]);

test('an off-schedule ride becomes a scheduled ride, matched by intensity', () => {
  const out = normalizeSportScheduleIdentity(block([
    'Tue\tBike\t180 W\t4\t5 min\t2 min\t8\tHard intervals.\t',
    'Tue\tBack Squat\t60 kg\t3\t5\t2 min\t7\tStrength.\t',
    'Fri\tBike\t150 W\t1\t50 min\tN/A\t4\tSteady ride.\t',
  ]), { sport_schedule: schedule }).program;
  assert.deepEqual(days(out).sort(), ['Sun', 'Thu']);
  assert.match(out, /Thu\tBike\t150 W\t1\t50 min[^\n]*Your scheduled Thursday ride/);
  assert.match(out, /Sun\tBike\t180 W\t4\t5 min[^\n]*Your scheduled Sunday ride/);
});

test('when every scheduled day already has its ride, the extra one says it is extra', () => {
  const out = normalizeSportScheduleIdentity(block([
    'Tue\tBike\t180 W\t4\t5 min\t2 min\t8\tHard intervals.\t',
    'Thu\tBike\t150 W\t1\t40 min\tN/A\t4\tSteady.\t',
    'Sun\tBike\t160 W\t1\t90 min\tN/A\t6\tLong.\t',
  ]), { sport_schedule: schedule }).program;
  assert.match(out, /Tue\tBike[^\n]*Extra to your scheduled rides \(Thursday, Sunday\): added work, not a replacement/);
});

test('rides already on scheduled days, or no schedule, are left alone', () => {
  const onDays = block(['Thu\tBike\t150 W\t1\t40 min\tN/A\t4\tSteady.\t']);
  assert.equal(normalizeSportScheduleIdentity(onDays, { sport_schedule: schedule }).repaired, false);
  assert.equal(normalizeSportScheduleIdentity(block(['Tue\tBike\t150 W\t1\t40 min\tN/A\t4\tSteady.\t']), {}).repaired, false);
});

test('running twice does not repeat the scheduled-ride label', () => {
  const once = normalizeSportScheduleIdentity(block(['Fri\tBike\t150 W\t1\t50 min\tN/A\t4\tSteady ride.\t']), { sport_schedule: schedule }).program;
  // A later pass that meets a note already carrying the label (a row copied
  // back, or a second chain) must not prepend it again.
  const again = normalizeSportScheduleIdentity(once.replace(/\nThu\tBike/g, '\nFri\tBike'), { sport_schedule: schedule }).program;
  assert.equal((again.match(/Your scheduled Thursday ride\./g) || []).length, 4, 'once per week');
});
