import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CLOCK, STAGE, governingClock, rehabStage, monthsSinceInjury,
  collectClockFlags, repairClockStatement, buildClockBrief,
} from '../engine/v86_training_clock.js';
import {
  collectPhaseLabelFlags, collectPriorityFlags, collectRepetitionFlags, collectEarnedClaimFlags,
} from '../engine/v87_earned_claims.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const CORE = JSON.parse(read('acceptance_intakes.json'));
const COMP = JSON.parse(read('competition_avatars.json'));
const HARD = JSON.parse(read('hard_avatars.json'));
const iso = (w) => new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10);
const LIFTER = { ...COMP.weightlifter_peak, competition_date: iso(8), event_type: 'strength_meet', event_priority: 'A' };
const BARE = 'A four week block.\n\nSTART_WEEK1_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\nMon\tSquat\t100 kg\t3\t5\t3 min\t7\tnote\t\nEND_WEEK1_TSV';

test('exactly one clock governs, and the right one', () => {
  assert.equal(governingClock(LIFTER), CLOCK.EVENT);
  assert.equal(governingClock(HARD.inseason_footballer), CLOCK.MICROCYCLE);
  assert.equal(governingClock(HARD.masters_return), CLOCK.REHAB);
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(governingClock(intake), CLOCK.NONE, id);
    assert.equal(buildClockBrief(intake), '', id);
  }
});

test('a competition date outranks a fixture pattern', () => {
  const dated = { ...HARD.inseason_footballer, competition_date: iso(6), event_type: 'combat' };
  assert.equal(governingClock(dated), CLOCK.EVENT, 'a real date is the stronger signal');
});

test('the stage of a return is read from how far past it the athlete is', () => {
  // "nine months ago" in words, which a digits-only reader missed entirely --
  // and that put this athlete a whole stage earlier than she is.
  assert.equal(monthsSinceInjury(HARD.masters_return), 9);
  assert.equal(rehabStage(HARD.masters_return), STAGE.PERFORMANCE);
  assert.equal(rehabStage({ injuries: 'ACL repair 6 weeks ago, still in physio' }), STAGE.PROTECTED);
  assert.equal(rehabStage({ injuries: 'Ankle sprain two months ago, cleared to train' }), STAGE.REBUILD);
  assert.equal(rehabStage({ injuries: 'Shoulder, ongoing', pain: { active: true, severity: '6/10' } }), STAGE.PROTECTED);
});

test('every clock repair satisfies the rule that asked for it', () => {
  // A remedy that leaves its own flag standing spends the attempt budget, which
  // is how three builds died. Checked for each clock, not just the easy one.
  for (const intake of [LIFTER, HARD.inseason_footballer, HARD.masters_return]) {
    assert.equal(collectClockFlags(BARE, intake).length, 1, `${governingClock(intake)} not flagged`);
    const fixed = repairClockStatement(BARE, intake);
    assert.equal(collectClockFlags(fixed, intake).length, 0, `${governingClock(intake)} repair does not clear its flag`);
    assert.equal(repairClockStatement(fixed, intake), fixed, 'repair is not idempotent');
  }
});

test('an athlete on no clock is left alone', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(collectClockFlags(BARE, intake).length, 0, id);
    assert.equal(repairClockStatement(BARE, intake), BARE, id);
  }
});

test('the clock repair never disturbs the week tables', () => {
  const fixed = repairClockStatement(BARE, LIFTER);
  const tail = (t) => t.slice(t.search(/START_WEEK1_TSV/i));
  assert.equal(tail(fixed), tail(BARE));
});

test('a phase label is judged only where it is used as a label', () => {
  // "Consolidate the technique before adding load" is a coaching verb. Reading
  // it as a phase claim flagged a tactical block the coach rated 8.7.
  const verb = 'START_WEEK1_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tRPE\tNotes\tResults\nMon\tSquat\t100\t3\t5\t3\t7\tConsolidate the technique.\t\nEND_WEEK1_TSV\n'
    + 'START_WEEK2_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tRPE\tNotes\tResults\nMon\tSquat\t100\t3\t5\t3\t7\tConsolidate the technique.\t\nEND_WEEK2_TSV';
  assert.equal(collectPhaseLabelFlags(verb, {}).length, 0);
});

test('a week that calls itself a taper must actually taper', () => {
  const mk = (w, sets, note) => `START_WEEK${w}_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tRPE\tNotes\tResults\nMon\tSquat\t100\t${sets}\t5\t3\t7\t${note}\t\nEND_WEEK${w}_TSV`;
  const flat = `${mk(1, 6, 'build')}\n${mk(2, 6, 'This is a taper week.')}`;
  assert.equal(collectPhaseLabelFlags(flat, {}).length, 1, 'a taper that does not taper must be caught');
  const real = `${mk(1, 6, 'build')}\n${mk(2, 2, 'This is a taper week.')}`;
  assert.equal(collectPhaseLabelFlags(real, {}).length, 0, 'a genuine taper must pass');
});

test('an accessory trained more often than the primary goal is flagged', () => {
  const program = read('run100_masters_return.txt');
  const flags = collectPriorityFlags(program, HARD.masters_return);
  assert.ok(flags.length > 0, 'rowing twice a week against side plank three times is an inversion');
  assert.match(flags[0].detail, /primary/i);
});

test('programs the coach rated well stay clean', () => {
  // A false positive here becomes a dead build, so this is the guard that matters.
  for (const [fixture, intake] of [
    ['run81_advanced_hybrid.txt', CORE.advanced_hybrid],
    ['run84_tactical_3k.txt', CORE.tactical_3k],
  ]) {
    assert.equal(collectEarnedClaimFlags(read(fixture), intake).length, 0, fixture);
  }
});

test('an unexplained identical week is flagged; a stated one is not', () => {
  const wk = (n, note) => `START_WEEK${n}_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tRPE\tNotes\tResults\nMon\tSquat\t100 kg\t3\t5\t3 min\t7\t${note}\t\nEND_WEEK${n}_TSV`;
  const silent = `A block.\n${wk(1, 'work')}\n${wk(2, 'work')}`;
  assert.equal(collectRepetitionFlags(silent, {}).length, 1);
  const stated = `Volume is held deliberately unchanged while the sport takes the load.\n${wk(1, 'work')}\n${wk(2, 'work')}`;
  assert.equal(collectRepetitionFlags(stated, {}).length, 0, 'a stated maintenance repeat is good coaching');
});
