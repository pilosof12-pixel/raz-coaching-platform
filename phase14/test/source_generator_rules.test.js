import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  neckAxialLockout, tendonPainOverride, headImpactLockout, recoveryDayLock,
  pullingVolumeCap, overheadPressCutoff, painSeverity, matHours,
  competitionWeekIntensityCap,
} from '../engine/source_generator_rules.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const A = JSON.parse(read('acceptance_intakes.json'));
const C = JSON.parse(read('competition_avatars.json'));
const H = JSON.parse(read('hard_avatars.json'));
const saturday = (w) => {
  const d = new Date(Date.now() + w * 7 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows) => ['A block.', '',
  ...[1, 2, 3, 4].map((w) => ['START_WEEK' + w + '_TSV', HEAD, ...rows, 'END_WEEK' + w + '_TSV', ''].join('\n'))].join('\n');
const SQUAT = ['Mon\tBack Squat\t140 kg\t3\t5\t3 min\t8\tnote\t'];

test('pain severity is read from the forms an intake uses', () => {
  assert.equal(painSeverity('3/10, next-day stiffness'), 3);
  assert.equal(painSeverity('pain 4 out of 10 on loading'), 4);
  assert.equal(painSeverity('severity 5'), 5);
  assert.equal(painSeverity('sore but fine'), null);
});

// "Any neck pain report of >= 3/10 locks out all axial loading exercises."
test('neck pain at or above 3/10 locks out axial loading', () => {
  const flags = neckAxialLockout(block(SQUAT), { pain: { active: true, description: 'Neck pain on bridging', severity: '4/10' } });
  assert.equal(flags.length, 1);
  assert.equal(flags[0].severity, 4);
  assert.match(flags[0].detail, /Back Squat/);
  // Below the threshold, and a different joint, are both silent.
  assert.deepEqual(neckAxialLockout(block(SQUAT), { pain: { description: 'Neck ache', severity: '2/10' } }), []);
  assert.deepEqual(neckAxialLockout(block(SQUAT), { pain: { description: 'Knee ache', severity: '5/10' } }), []);
});

// "Any tendon pain >= 3/10 removes all eccentric and plyometric work."
test('tendon pain at or above 3/10 removes eccentric and plyometric work', () => {
  const nordic = ['Tue\tNordic Hamstring Curl\tBodyweight\t3\t5\t2 min\t8\tEccentric focus.\t'];
  const flags = tendonPainOverride(block(nordic), { injuries: 'Achilles tendon pain 3/10 on loading' });
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /Nordic Hamstring Curl/);
  // Tendon pain with nothing eccentric or plyometric in the block is fine.
  assert.deepEqual(tendonPainOverride(block(SQUAT), { injuries: 'Achilles tendon pain 3/10 on loading' }), []);
});

test('a flagged head impact means no gym work at all that week', () => {
  assert.equal(headImpactLockout(block(SQUAT), { injuries: 'Concussion two weeks ago, still symptomatic' }).length, 1);
  // A historic, cleared concussion is not a live flag.
  assert.deepEqual(headImpactLockout(block(SQUAT), { injuries: 'Concussion in 2019, fully recovered and cleared' }), []);
});

// The rule is about days the PROGRAM spends. A fighter training seven days a
// week on his own sport schedule has no recovery days the gym can give back,
// and flagging him every week says nothing anyone can act on.
test('missing recovery days are charged to the gym only where the gym took them', () => {
  const fighter = { ...C.mma_fight_camp, competition_date: saturday(3) };
  assert.deepEqual(recoveryDayLock(read('run113_mma_camp_delivered.txt'), fighter), [],
    'seven sport days: the gym cannot create a rest day');
  const hybrid = recoveryDayLock(read('run81_advanced_hybrid.txt'), A.advanced_hybrid);
  assert.ok(hybrid.length, 'sport leaves two free days and the gym takes both');
  assert.match(hybrid[0].detail, /the gym is what removes them/);
});

// "When mat hours >= 10, total weekly pulling sets are hard-capped at 6."
test('pulling volume is capped once the mat is supplying it', () => {
  const pulls = ['Mon\tPull-up\tBW\t4\t8\t2 min\t8\tnote\t', 'Thu\tChest-Supported Row\t40 kg\t4\t10\t90 s\t7\tnote\t'];
  assert.equal(matHours({ notes: 'Trains 12 mat hours per week' }), 12);
  const flags = pullingVolumeCap(block(pulls), { notes: 'Trains 12 mat hours per week' });
  assert.equal(flags.length, 4, 'one per week');
  assert.equal(flags[0].sets, 8);
  assert.deepEqual(pullingVolumeCap(block(pulls), { notes: 'Trains 6 mat hours per week' }), []);
  // Grip fatigue at 7 applies the same protocol whatever the mat hours say.
  assert.ok(pullingVolumeCap(block(pulls), { notes: 'grip fatigue 8 out of 10' }).length);
});

// "Pressing overhead is eliminated entirely from T-3 weeks to fight week."
test('overhead pressing is out inside three weeks of a fight', () => {
  const ohp = ['Tue\tOverhead Press\t60 kg\t3\t5\t2 min\t8\tnote\t'];
  const near = { event_type: 'combat', competition_date: saturday(2), event_priority: 'A' };
  const far = { event_type: 'combat', competition_date: saturday(10), event_priority: 'A' };
  assert.ok(overheadPressCutoff(block(ohp), near).length);
  assert.deepEqual(overheadPressCutoff(block(ohp), far), []);
  // A strength meet is not a fight; this cutoff is the combat one.
  assert.deepEqual(overheadPressCutoff(block(ohp), { event_type: 'strength_meet', competition_date: saturday(2) }), []);
});

// "In competition weeks (T-0), generate movement quality and activation only.
// No strength work above 70% 1RM." Article 85's rule, so it is scoped to
// combat: a weightlifter's competition week is the opposite case, with openers
// near max by design.
test('a combat competition week is capped at 70% of 1RM', () => {
  const fighter = { ...C.mma_fight_camp, competition_date: saturday(3), event_type: 'combat', event_priority: 'A' };
  const week = (kg) => block([`Tue\tBack Squat\t${kg} kg\t3\t3\t3 min\t8\tnote\t`]);
  const flags = competitionWeekIntensityCap(week(130), fighter);
  assert.ok(flags.length);
  assert.match(flags[0].detail, /87% of the athlete's 150 kg benchmark/);
  assert.deepEqual(competitionWeekIntensityCap(week(95), fighter), [], '63% is inside the cap');
  // A strength meet must not inherit the grappling cap.
  const lifter = { ...C.weightlifter_meet_week, competition_date: saturday(3), event_type: 'strength_meet' };
  assert.deepEqual(competitionWeekIntensityCap(week(130), lifter), []);
});

// None of these should be firing on programs the coach reviewed without raising
// them -- these are injury and dose rules, not taste.
test('the delivered programs the coach scored trip none of these', () => {
  const cases = [
    ['run101_weightlifter_peak.txt', { ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet' }],
    ['run81_tactical_3k.txt', A.tactical_3k],
    ['run113_mma_camp_delivered.txt', { ...C.mma_fight_camp, competition_date: saturday(3), event_type: 'combat' }],
    ['run115_inseason_footballer.txt', H.inseason_footballer],
  ];
  for (const [f, intake] of cases) {
    const p = read(f);
    for (const fn of [neckAxialLockout, tendonPainOverride, headImpactLockout, recoveryDayLock,
      pullingVolumeCap, overheadPressCutoff, competitionWeekIntensityCap]) {
      assert.deepEqual(fn(p, intake), [], `${f} / ${fn.name}`);
    }
  }
});
