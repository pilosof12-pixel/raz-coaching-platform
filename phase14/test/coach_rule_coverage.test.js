import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { gradeWithCoverage, RULE_INPUTS, RULES } from '../engine/coach_rules.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const A = JSON.parse(read('acceptance_intakes.json'));
const C = JSON.parse(read('competition_avatars.json'));
const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows, pre = 'A four-week block.') => [pre, '',
  ...[1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, HEAD, ...rows, `END_WEEK${w}_TSV`, ''].join('\n'))].join('\n');
const blindRules = (p, i) => gradeWithCoverage(p, i).blind.map((b) => b.rule);

// An empty result has two meanings. A rule that governs, found its inputs and
// found nothing wrong is a pass; a rule that governs and could not find its
// inputs is a hole. Four rules spent a live run in the second state reporting
// the first, and nothing but reading the programs by hand caught it.
test('a rule that governs but finds nothing to judge is reported, not counted as clean', () => {
  // A 3 km goal with quality work that carries no pace at all.
  const noPace = block(['Tue\tRun\tIntervals\t6\t400 m\t2:00\t8\tHard reps, no pace given.\t']);
  const blind = blindRules(noPace, A.tactical_3k);
  assert.ok(blind.includes('goalSpeedProgression'), 'the goal-speed rule cannot judge this and must say so');
});

test('a weightlifting block with neither kilos nor percentages is a hole, not a pass', () => {
  const lifter = { ...C.weightlifter_peak, event_type: 'strength_meet' };
  const vague = block(['Mon\tSnatch\tRPE-selected load\t5\t2\t3 min\t8\tCrisp doubles.\t']);
  const blind = blindRules(vague, lifter);
  assert.ok(blind.includes('intensificationBand'), 'no load to measure against the benchmark');
});

test('a ruck goal with no tolerated distance in the intake is a hole', () => {
  const noTolerance = { ...A.tactical_3k, pain: {}, notes: '' };
  const p = block(['Sat\tBackpack Carry\t20 kg\t1\t60 min\tN/A\t5\tBrisk walk.\t']);
  assert.ok(blindRules(p, noTolerance).includes('ruckDistanceBelowTolerance'));
});

// A rule that does not govern this athlete is silent for a good reason, and
// must not be reported as a hole -- otherwise every report is noise.
test('a rule that does not govern the athlete is not a hole', () => {
  const p = read('run81_tactical_3k.txt');
  const blind = blindRules(p, A.tactical_3k);
  assert.ok(!blind.includes('intensificationBand'), 'no olympic goals here');
  assert.ok(!blind.includes('inSeasonCaps'), 'no fixture here');
  assert.ok(!blind.includes('eccentricHamstringTiming'), 'no hamstring history here');
});

// The programs the coach scored must be fully covered: every rule that governs
// them found something to judge. If one goes blind on these, a finding of his
// is being missed rather than passed.
test('every rule that governs a scored program can see it', () => {
  const sat = (w) => { const d = new Date(Date.now() + w * 7 * 86400000); d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7)); return d.toISOString().slice(0, 10); };
  const H = JSON.parse(read('hard_avatars.json'));
  const cases = [
    ['run101_weightlifter_peak.txt', { ...C.weightlifter_peak, competition_date: sat(8), event_type: 'strength_meet' }],
    ['run81_tactical_3k.txt', A.tactical_3k],
    ['run113_mma_camp_delivered.txt', { ...C.mma_fight_camp, competition_date: sat(3) }],
    ['inseason_footballer-program.txt', H.inseason_footballer],
    ['run100_inseason_footballer.txt', H.inseason_footballer],
    ['run101_inseason_footballer.txt', H.inseason_footballer],
  ];
  for (const [f, intake] of cases) {
    assert.deepEqual(blindRules(read(f), intake), [], f);
  }
});

// A probe that does not exist is itself a hole, and silently so.
test('every rule has a coverage probe or is exempt by name', () => {
  const p = read('run81_tactical_3k.txt');
  const { blind } = gradeWithCoverage(p, A.tactical_3k);
  assert.ok(!blind.some((b) => /no coverage probe defined/.test(b.why)), JSON.stringify(blind));
  // And the exemption list cannot grow silently either.
  const probed = new Set(Object.keys(RULE_INPUTS));
  const unprobed = RULES.map((f) => f.name).filter((n) => !probed.has(n));
  assert.deepEqual(unprobed.sort(), ['contingencyCreatesAdjacentDuplicate', 'dayMinusOneStacked',
    'promisedMovementAbsent', 'sportScheduleChangedSilently', 'unsupportedAthleteFact'].sort(),
  'these read prose rather than the table and cannot go blind the same way');
});
