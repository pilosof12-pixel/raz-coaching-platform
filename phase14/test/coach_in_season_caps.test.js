import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { inSeasonCaps, matchDay, gradeProgram } from '../engine/coach_rules.js';
import { selectProgramType, PROGRAM_TYPE, DIMENSIONS, CAPS, overallScore } from '../engine/coach_standard.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const H = JSON.parse(read('hard_avatars.json'));
const FOOTBALLER = H.inseason_footballer;

const HEAD = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (rows, pre = 'A four-week in-season block around the Saturday match.') => [pre, '',
  ...[1, 2, 3, 4].map((w) => [`START_WEEK${w}_TSV`, HEAD, ...rows, `END_WEEK${w}_TSV`, ''].join('\n'))].join('\n');

test('an in-season footballer selects the fourth program type', () => {
  assert.equal(selectProgramType(FOOTBALLER), PROGRAM_TYPE.IN_SEASON_TEAM_SPORT);
  const dims = DIMENSIONS[PROGRAM_TYPE.IN_SEASON_TEAM_SPORT];
  assert.ok(Math.abs(dims.reduce((n, [, w]) => n + w, 0) - 1) < 1e-9);
  assert.equal(dims[0][0], 'match_week_integration');
  assert.equal(dims[0][1], 0.30, 'the heaviest dimension in the set');
});

test('match day is read from the sport schedule', () => {
  assert.equal(matchDay(FOOTBALLER), 'sat');
  assert.equal(matchDay({ sport_schedule: [{ day: 'Sun', intensity: 'match' }] }), 'sun');
  assert.equal(matchDay({}), null);
});

// His operational definition: a squat, deadlift, split squat or comparable lift
// at RPE 7 or above for two or more work sets, on the day before a match.
test('heavy lower body the day before a match caps the program at 6.5', () => {
  const flags = inSeasonCaps(block(['Fri\tBack Squat\t140 kg\t3\t3\t3:00\tRPE 8\tHeavy.\t']), FOOTBALLER);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].rule, 'HEAVY_LOWER_BODY_ON_MD_MINUS_ONE');
  assert.equal(flags[0].cap, CAPS.HEAVY_LOWER_BODY_ON_MD_MINUS_ONE);
  assert.match(flags[0].detail, /FRI, the day before the SAT match/);
});

test('a light primer the day before a match is not the same thing', () => {
  assert.deepEqual(inSeasonCaps(block(['Fri\tBack Squat\t60 kg\t1\t3\t3:00\tRPE 5\tPrimer.\t']), FOOTBALLER), []);
  // Two sets but light, and heavy but one set, both stay under the definition.
  assert.deepEqual(inSeasonCaps(block(['Fri\tBack Squat\t140 kg\t1\t3\t3:00\tRPE 8\tOne set.\t']), FOOTBALLER), []);
});

test('a season block with no strength or power anywhere caps at 7.0', () => {
  const flags = inSeasonCaps(block(['Tue\tSide Plank\tBodyweight\t2\t30 sec\t60 sec\tRPE 6\tCore.\t']), FOOTBALLER);
  assert.deepEqual(flags.map((f) => [f.rule, f.cap]), [['NO_STRENGTH_EXPOSURE_IN_SEASON', CAPS.NO_STRENGTH_EXPOSURE_IN_SEASON]]);
});

test('training on match day without ever mentioning the match caps at 6.0', () => {
  const flags = inSeasonCaps(block(['Sat\tBack Squat\t140 kg\t3\t3\t3:00\tRPE 8\tHeavy.\t'], 'A four-week block.'), FOOTBALLER);
  assert.ok(flags.some((f) => f.rule === 'FIXTURE_IGNORED' && f.cap === CAPS.FIXTURE_IGNORED));
  // Saying the match exists is the difference.
  const owned = inSeasonCaps(block(['Sat\tBack Squat\t140 kg\t3\t3\t3:00\tRPE 8\tHeavy.\t'],
    'A four-week block. Saturday is match day and this session is done after the match.'), FOOTBALLER);
  assert.ok(!owned.some((f) => f.rule === 'FIXTURE_IGNORED'));
});

test('a cap applies after the weighted score and overrides it', () => {
  const dims = Object.fromEntries(DIMENSIONS[PROGRAM_TYPE.IN_SEASON_TEAM_SPORT].map(([n]) => [n, 9]));
  assert.equal(overallScore(PROGRAM_TYPE.IN_SEASON_TEAM_SPORT, dims).overall, 9);
  const capped = overallScore(PROGRAM_TYPE.IN_SEASON_TEAM_SPORT, dims, ['HEAVY_LOWER_BODY_ON_MD_MINUS_ONE']);
  assert.equal(capped.overall, 6.5);
  assert.equal(capped.capped, true);
});

// The three delivered footballer programs pass all three caps. That is only
// worth stating because the caps above are shown to fire on constructed cases:
// a rule that never fires is indistinguishable from a broken one.
//
// They do not pass everything. When this test was first written the grader had
// no in-season rules at all and returned nothing on all three, which is what
// the coach was asked about; his answers produced the sprint rules, and those
// findings are the reason A, B and C scored 8.2, 8.7 and 9.0.
test('the three delivered footballer programs trip none of the caps', () => {
  const expected = {
    'inseason_footballer-program.txt': ['SPRINT_SPEED_EXPOSURE_MISSING', 'REPEATED_SPRINT_EXPOSURE_MISSING', 'PROMISED_MOVEMENT_ABSENT'],
    'run100_inseason_footballer.txt': ['SPRINT_DISTANCE_BELOW_BENCHMARK', 'REPEATED_SPRINT_EXPOSURE_MISSING'],
    'run101_inseason_footballer.txt': ['REPEATED_SPRINT_EXPOSURE_MISSING'],
  };
  for (const [f, rules] of Object.entries(expected)) {
    assert.deepEqual(inSeasonCaps(read(f), FOOTBALLER), [], `${f}: no cap`);
    assert.deepEqual(gradeProgram(read(f), FOOTBALLER).map((x) => x.rule).sort(), [...rules].sort(), f);
  }
});

// Nothing in-season should touch an athlete with no fixture.
test('nothing in-season fires for an athlete without a match', () => {
  const A = JSON.parse(read('acceptance_intakes.json'));
  assert.deepEqual(inSeasonCaps(read('run81_tactical_3k.txt'), A.tactical_3k), []);
});
