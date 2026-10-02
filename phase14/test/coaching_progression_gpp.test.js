import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProgressionGppBrief,
  progressionAnalysis,
  tacticalGppAnalysis,
  validateTacticalGppCoverageSemantic,
} from '../engine/coaching_progression_gpp.js';
import {
  TACTICAL_3K_INTAKE,
  YOUTH_GYMNASTICS_INTAKE,
  tactical3KGoldenProgram,
  youthGymnasticsGoldenProgram,
} from './fixtures/golden_programs.js';

test('Youth brief selects quality/assistance/bodyweight progression rather than mandatory fatigue', () => {
  const brief = buildProgressionGppBrief(YOUTH_GYMNASTICS_INTAKE);
  assert.match(brief, /YOUTH PROGRESSION/);
  assert.match(brief, /assistance, balance time, ROM/i);
  assert.match(brief, /without requiring failure/i);
});

test('Tactical brief makes GPP a small floor subordinate to named priorities', () => {
  const brief = buildProgressionGppBrief(TACTICAL_3K_INTAKE);
  assert.match(brief, /TACTICAL \/ HYBRID GPP PRIORITY BUDGET/);
  assert.match(brief, /receive most of the recoverable volume/i);
  assert.match(brief, /first volume trimmed/i);
  assert.match(brief, /pushing exposure and one low-cost trunk exposure/i);
  assert.match(brief, /not random conditioning/i);
});

test('approved Youth golden exposes progression in both primary skill families', () => {
  const result = progressionAnalysis(youthGymnasticsGoldenProgram(), YOUTH_GYMNASTICS_INTAKE);
  assert.deepEqual(result.violations, []);
  assert.ok(result.targets.some((x) => x.family === 'bar_muscle_up' && x.progressed));
  assert.ok(result.targets.some((x) => x.family === 'handstand' && x.progressed));
});

test('approved Tactical golden keeps low-cost push/core GPP within the priority budget', () => {
  const result = tacticalGppAnalysis(tactical3KGoldenProgram(), TACTICAL_3K_INTAKE);
  assert.equal(result.applicable, true);
  assert.deepEqual(result.violations, []);
  for (const week of result.weeks) {
    // Two Push-up sets on Monday + two low-cost OHP sets on Friday.
    assert.equal(week.totals.push, 4);
    assert.equal(week.totals.core, 2);
    assert.equal(week.low_cost_support_sets, 6);
  }
});

test('Tactical GPP cannot expand until it competes with the named priority budget', () => {
  const bloated = tactical3KGoldenProgram().split('\n').map((line) => {
    if (!line.includes('\t')) return line;
    const cells = line.split('\t');
    if (cells[1] === 'Push-up') cells[3] = '10';
    if (cells[1] === 'Pallof Press') cells[3] = '4';
    return cells.join('\t');
  }).join('\n');
  assert.throws(
    () => validateTacticalGppCoverageSemantic(bloated, TACTICAL_3K_INTAKE),
    (error) => error?.code === 'TACTICAL_GPP_COVERAGE_MISSING',
  );
});

test('a changed signature is not a progression when the load never moved', async () => {
  const fsm = await import('node:fs');
  const A = JSON.parse(fsm.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));

  // Run #156 delivered two strict presses: Monday 62.5 for 2x6 and Sunday 67.5
  // for 4x4 in Week 1, then both 67.5 for 3x4 in Weeks 2 and 3. The heaviest row
  // is chosen per week, so the Week 2 tie flipped the lead from Sunday to Monday,
  // the signature changed with it, and a press that never left 67.5 read as
  // progressing -- the coach's complaint, passing the detector meant to catch it.
  const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const mon = [['62.5', '2', '6'], ['67.5', '3', '4'], ['67.5', '3', '4'], ['62.5', '2', '5']];
  const sun = [['67.5', '4'], ['67.5', '3'], ['67.5', '3'], ['70', '3']];
  const flatPress = [1, 2, 3, 4].map((w) => [
    `START_WEEK${w}_TSV`, H,
    `Mon\tOverhead Press\t${mon[w - 1][0]} kg\t${mon[w - 1][1]}\t${mon[w - 1][2]}\t2-3 min\t7\tSecondary press volume.\t`,
    `Sun\tOverhead Press\t${sun[w - 1][0]} kg\t${sun[w - 1][1]}\t4\t2-3 min\t7\tDirect strict work.\t`,
    `END_WEEK${w}_TSV`,
  ].join('\n')).join('\n\n');

  const press = progressionAnalysis(flatPress, A.advanced_hybrid).targets
    .find((t) => /press/i.test(t.family));
  assert.ok(press, 'the press family must be a progression target');
  assert.equal(press.progressed, false, 'a press held at 67.5 through every build week has not progressed');
});

test('a load that genuinely rises still reads as progression', async () => {
  const fsm = await import('node:fs');
  const A = JSON.parse(fsm.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
  const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const load = ['67.5', '70', '72.5', '70'];
  const stepped = [1, 2, 3, 4].map((w) => [
    `START_WEEK${w}_TSV`, H,
    `Sun\tOverhead Press\t${load[w - 1]} kg\t3\t4\t2-3 min\t7\tTake the step only if the last week was crisp.\t`,
    `END_WEEK${w}_TSV`,
  ].join('\n')).join('\n\n');
  const press = progressionAnalysis(stepped, A.advanced_hybrid).targets.find((t) => /press/i.test(t.family));
  assert.equal(press.progressed, true, 'the coach\'s own 67.5 -> 70 -> 72.5 must count');
});

test('more work at the same load is progression; less work is not', async () => {
  const fsm = await import('node:fs');
  const A = JSON.parse(fsm.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
  const H = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const build = (sets) => [1, 2, 3, 4].map((w) => [
    `START_WEEK${w}_TSV`, H,
    `Sun\tOverhead Press\t67.5 kg\t${sets[w - 1]}\t4\t2-3 min\t7\tSame load, the work moves.\t`,
    `END_WEEK${w}_TSV`,
  ].join('\n')).join('\n\n');
  const famOf = (p) => progressionAnalysis(p, A.advanced_hybrid).targets.find((t) => /press/i.test(t.family));
  // Volume rising at a held load is a real way to progress a lift.
  assert.equal(famOf(build(['3', '4', '5', '3'])).progressed, true);
  // Volume falling at a held load is a reduction, whatever the signature says.
  assert.equal(famOf(build(['5', '4', '3', '2'])).progressed, false);
});
