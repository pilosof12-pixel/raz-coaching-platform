import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { STATE, weeksOut, hasEvent, stateForWeek, competitionProfile, eventType, eventPriority } from '../engine/v68_competition_state.js';
import { buildCompetitionBrief } from '../engine/v69_competition_brief.js';
import { collectCompetitionFlags, repairCompetitionBlock } from '../engine/v70_competition_rules.js';
import { intakeClarificationResult } from '../intake_clarification.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));

// --- the athletes who do not compete must be untouched ----------------------

test('an athlete with no event gets no competition state, brief or rule', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(hasEvent(intake), false, `${id} should have no event`);
    assert.equal(stateForWeek(intake, 4), STATE.NORMAL, id);
    assert.equal(buildCompetitionBrief(intake), '', `${id} brief must be empty`);
    assert.equal(collectCompetitionFlags('', intake).length, 0, id);
  }
});

// --- weeks out ---------------------------------------------------------------

test('weeks out is read from a date, a phrase, or not at all', () => {
  const now = Date.parse('2026-09-01T00:00:00Z');
  assert.equal(weeksOut({ competition_date: '2026-09-29' }, now), 4);
  assert.equal(weeksOut({ notes: 'Fight is in 6 weeks' }, now), 6);
  assert.equal(weeksOut({ notes: 'meet in 10 days' }, now), 10 / 7);
  assert.equal(weeksOut({ notes: 'no date here' }, now), null);
});

test('a date already past is not treated as a plan', () => {
  const now = Date.parse('2026-09-01T00:00:00Z');
  assert.equal(weeksOut({ competition_date: '2020-01-01' }, now), null);
});

// --- the phase model ---------------------------------------------------------

// Four weeks out with a four-week block means Week 4 IS the event week. That is
// the case the engine previously labelled Consolidate / Express like any other.
test('a block that runs into the event ends in competition week', () => {
  const fighter = COMP.mma_fight_camp;
  const states = [1, 2, 3, 4].map((w) => stateForWeek(fighter, w));
  assert.deepEqual(states, [STATE.REALIZATION, STATE.REALIZATION, STATE.TAPER, STATE.COMPETITION_WEEK]);
  assert.equal(competitionProfile(fighter).blockEndsAtEvent, true);
});

// Eight weeks out is weeks 1-4 of the runway: still building, not peaking.
test('a distant event does not trigger a taper', () => {
  const lifter = COMP.weightlifter_peak;
  const states = [1, 2, 3, 4].map((w) => stateForWeek(lifter, w));
  assert.ok(states.every((s) => s === STATE.SPECIFICITY), states.join(','));
  assert.equal(competitionProfile(lifter).blockEndsAtEvent, false);
});

// Priority decides how much training is given up. A C-priority event is a
// training day, not a peak.
// Priority governs how much training is given up ahead of the event, not
// whether the event happens: the event week is the event week for everyone.
// Two weeks out, an A-priority athlete tapers in week 1 and a C-priority
// athlete keeps training normally.
test('a low-priority event does not cost a training block', () => {
  const base = { primary_goals: ['Fight'], competition_date: '2026-09-15', sport: 'MMA' };
  const now = Date.parse('2026-09-01T00:00:00Z');
  assert.equal(stateForWeek({ ...base, event_priority: 'A' }, 1, now), STATE.TAPER);
  assert.equal(stateForWeek({ ...base, event_priority: 'C' }, 1, now), STATE.NORMAL);
  // But both still treat the event week as the event week.
  assert.equal(stateForWeek({ ...base, event_priority: 'C' }, 3, now), STATE.COMPETITION_WEEK);
});

test('event type and priority are inferred when not declared', () => {
  assert.equal(eventType({ sport: 'MMA', primary_goals: ['Win the fight'] }), 'combat');
  assert.equal(eventType({ primary_goals: ['Snatch 120 kg at the meet'] }), 'strength_meet');
  assert.equal(eventPriority({ primary_goals: ['Technical mock meet'] }), 'C');
});

// --- the brief ----------------------------------------------------------------

test('the brief carries only the states this block reaches', () => {
  const brief = buildCompetitionBrief(COMP.mma_fight_camp);
  assert.match(brief, /competition week/i);
  assert.match(brief, /Count the mat, ring and cage/);
  assert.equal(/still a building block/.test(brief), false, 'specificity guidance is not reached by this block');

  const lifter = buildCompetitionBrief(COMP.weightlifter_peak);
  assert.match(lifter, /still a building block/);
  assert.equal(/competition week/i.test(lifter), false, 'the lifter never reaches competition week');
});

// The cluster is ~73k characters against a 20k prompt guard, so the brief has
// to stay small or it cannot ship at all.
test('the brief stays inside the prompt budget', () => {
  for (const intake of Object.values(COMP)) {
    assert.ok(buildCompetitionBrief(intake).length < 6000, 'brief too large for the prompt budget');
  }
});

test('the strength brief refuses to invent a last heavy day', () => {
  assert.match(buildCompetitionBrief(COMP.weightlifter_peak), /no universal last-heavy-day rule/);
});

// --- the rules ----------------------------------------------------------------

const week = (n, rows) => [`START_WEEK${n}_TSV`,
  'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults', ...rows, `END_WEEK${n}_TSV`].join('\n');

const FIGHT_BLOCK = [
  week(1, ['Tue\tTrap Bar Deadlift\t150 kg\t4\t3\t3 min\t7\tPower.\t']),
  week(2, ['Tue\tTrap Bar Deadlift\t150 kg\t4\t3\t3 min\t7\tPower.\t']),
  week(3, ['Tue\tTrap Bar Deadlift\t150 kg\t4\t3\t3 min\t7\tPower.\t']),
  week(4, [
    'Tue\tTrap Bar Deadlift\t170 kg\t5\t3\t3 min\t9\tTest yourself.\t',
    'Fri\tRomanian Deadlift\t100 kg\t3\t10\t2 min\t8\tHamstrings.\t',
  ]),
].join('\n');

test('competition week rejects near-failure work', () => {
  const flags = collectCompetitionFlags(FIGHT_BLOCK, COMP.mma_fight_camp);
  assert.ok(flags.some((f) => f.code === 'V70_COMPETITION_WEEK_NEAR_FAILURE'));
});

test('competition week rejects high-damage eccentric work', () => {
  const flags = collectCompetitionFlags(FIGHT_BLOCK, COMP.mma_fight_camp);
  assert.ok(flags.some((f) => f.code === 'V70_COMPETITION_WEEK_HIGH_DAMAGE' && /Romanian/i.test(f.exercise)));
});

test('volume must fall into the competition week', () => {
  const flags = collectCompetitionFlags(FIGHT_BLOCK, COMP.mma_fight_camp);
  assert.ok(flags.some((f) => f.code === 'V70_TAPER_VOLUME_NOT_REDUCED'));
});

test('the repair caps effort and brings volume down, and converges', () => {
  const fixed = repairCompetitionBlock(FIGHT_BLOCK, COMP.mma_fight_camp);
  const remaining = collectCompetitionFlags(fixed, COMP.mma_fight_camp)
    .filter((f) => f.code !== 'V70_COMPETITION_WEEK_HIGH_DAMAGE');
  assert.equal(remaining.length, 0, remaining.map((f) => f.code).join(','));
  assert.match(fixed, /competition week creates readiness/i);
  assert.equal(repairCompetitionBlock(fixed, COMP.mma_fight_camp), fixed, 'idempotent');
});

// Exercise selection is a coaching decision, so the repair caps and trims but
// never silently deletes a movement the coach chose.
test('the repair never removes an exercise', () => {
  const before = (FIGHT_BLOCK.match(/Romanian Deadlift/g) || []).length;
  const after = (repairCompetitionBlock(FIGHT_BLOCK, COMP.mma_fight_camp).match(/Romanian Deadlift/g) || []).length;
  assert.equal(after, before);
});

// --- the intake ---------------------------------------------------------------

test('an event with no date blocks the build', () => {
  const r = intakeClarificationResult({ primary_goals: ['Win my next fight'], experience: 'advanced' });
  const q = r.questions.find((x) => x.id === 'competition_date');
  assert.ok(q, 'the date must be asked for');
  assert.notEqual(q.required, false, 'and it must block');
});

test('a date already supplied is not asked for again', () => {
  for (const intake of [
    { primary_goals: ['Win my next fight'], competition_date: '2026-10-01' },
    { primary_goals: ['Win my next fight'], notes: 'Fight is in 6 weeks' },
  ]) {
    assert.equal(intakeClarificationResult(intake).questions.some((q) => q.id === 'competition_date'), false);
  }
});

test('both competition avatars are generate-ready', () => {
  for (const [id, intake] of Object.entries(COMP)) {
    assert.equal(intakeClarificationResult(intake).ready, true, `${id} should not be blocked`);
  }
});
