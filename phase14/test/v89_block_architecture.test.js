import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  hasDayZero, collectDayZeroFlags, repairDayZeroClaims,
  matchOffsets, collectMatchDayFlags, repairMatchDayPlacement,
  sportShareByWeek, collectAllocationFlags, buildBlockArchitectureBrief,
} from '../engine/v89_block_architecture.js';

const T = new URL('./fixtures/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, T), 'utf8');
const CORE = JSON.parse(read('acceptance_intakes.json'));
const COMP = JSON.parse(read('competition_avatars.json'));
const HARD = JSON.parse(read('hard_avatars.json'));
const iso = (w) => new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10);
const LIFT8 = { ...COMP.weightlifter_peak, competition_date: iso(8), event_type: 'strength_meet', event_priority: 'A' };
const LIFT4 = { ...COMP.weightlifter_meet_week, competition_date: iso(4), event_type: 'strength_meet', event_priority: 'A' };
const TAIL = '\n\nSTART_WEEK1_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults\n'
  + 'Mon\tSquat\t100 kg\t3\t5\t3 min\t7\tnote\t\nEND_WEEK1_TSV';

// --- 1. no peak or taper without a Day 0 -----------------------------------

test('a block only has Day 0 when it reaches the event', () => {
  assert.equal(hasDayZero(LIFT8), false, 'eight weeks out, the block ends on the runway');
  assert.equal(hasDayZero(LIFT4), true, 'four weeks out, the block runs into the meet');
});

test('peaking language without Day 0 is refused, and rewritten plainly', () => {
  const claims = `Week 4 is peak week and we taper into it.${TAIL}`;
  assert.equal(collectDayZeroFlags(claims, LIFT8).length, 1);
  const fixed = repairDayZeroClaims(claims, LIFT8);
  assert.equal(collectDayZeroFlags(fixed, LIFT8).length, 0);
  // Verb forms must survive the rewrite: "we easing into it" is not English.
  assert.match(fixed, /we ease into it/);
  assert.doesNotMatch(fixed, /easing into it/);
  assert.equal(repairDayZeroClaims(fixed, LIFT8), fixed, 'repair is not idempotent');
});

test('the same language is allowed when the block earns it', () => {
  const claims = `Week 4 is peak week and we taper into it.${TAIL}`;
  assert.equal(collectDayZeroFlags(claims, LIFT4).length, 0, 'this block does reach the meet');
});

test('an in-season taper into match day is not a peaking claim', () => {
  const p = `We taper the gym load into match day so he is fresh on Saturday.${TAIL}`;
  assert.equal(collectDayZeroFlags(p, HARD.inseason_footballer).length, 0);
});

test('the week tables are untouched by the rewrite', () => {
  const claims = `Week 4 is peak week.${TAIL}`;
  const fixed = repairDayZeroClaims(claims, LIFT8);
  const tail = (t) => t.slice(t.search(/START_WEEK1_TSV/i));
  assert.equal(tail(fixed), tail(claims));
});

// --- 2. built around match day ---------------------------------------------

test('gym days are positioned relative to the match', () => {
  // Match is Saturday; gym is Tuesday and Thursday.
  const offsets = matchOffsets(HARD.inseason_footballer);
  assert.equal(offsets.get('tue'), -4);
  assert.equal(offsets.get('thu'), -2);
});

test('sessions presented as bare weekdays are flagged and labelled', () => {
  const program = read('run101_inseason_footballer.txt');
  assert.equal(collectMatchDayFlags(program, HARD.inseason_footballer).length, 1);
  const placed = repairMatchDayPlacement(program, HARD.inseason_footballer);
  assert.equal(collectMatchDayFlags(placed, HARD.inseason_footballer).length, 0);
  assert.match(placed, /MD-4/);
  assert.match(placed, /MD-2/);
  assert.equal(repairMatchDayPlacement(placed, HARD.inseason_footballer), placed, 'repair is not idempotent');
  assert.equal((placed.match(/START_WEEK\d_TSV/g) || []).length, 4, 'week tables damaged');
});

test('the label is written once per session, not on every row', () => {
  const program = read('run101_inseason_footballer.txt');
  const placed = repairMatchDayPlacement(program, HARD.inseason_footballer);
  const start = placed.indexOf('START_WEEK1_TSV');
  const week1 = placed.slice(start, placed.indexOf('END_WEEK1_TSV'));
  assert.equal((week1.match(/MD-4:/g) || []).length, 1);
  assert.equal((week1.match(/MD-2:/g) || []).length, 1);
});

test('an athlete with no fixture is left alone', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(collectMatchDayFlags(read('run81_advanced_hybrid.txt'), intake).length, 0, id);
    assert.equal(repairMatchDayPlacement(read('run81_advanced_hybrid.txt'), intake), read('run81_advanced_hybrid.txt'), id);
  }
});

// --- 3. a return shifts allocation toward the sport ------------------------

test('a flat sport share across a return block is flagged', () => {
  // The delivered block was 31% rowing in all four weeks, to the row, while the
  // individual exercises progressed underneath it.
  const program = read('run101_masters_return.txt');
  const shares = sportShareByWeek(program, HARD.masters_return);
  assert.equal(shares.length, 4);
  assert.ok(shares.every((w) => Math.abs(w.share - shares[0].share) < 0.01), 'fixture should be flat');
  const flags = collectAllocationFlags(program, HARD.masters_return);
  assert.equal(flags.length, 1);
  assert.match(flags[0].detail, /A return is not finished when the gym exercises progress/);
});

test('a block that does shift is not flagged', () => {
  const wk = (n, rows) => `START_WEEK${n}_TSV\nDay\tExercise\tWeight\tSets\tReps\tRest\tRPE\tNotes\tResults\n${rows}\nEND_WEEK${n}_TSV`;
  const erg = 'Mon\tRowing Ergometer\t2:15\t4\t3 min\t2 min\t7\tn\t';
  const gym = 'Tue\tGoblet Squat\t24 kg\t3\t8\t2 min\t7\tn\t';
  const shifting = [wk(1, [erg, gym, gym, gym].join('\n')), wk(2, [erg, erg, gym, gym].join('\n')),
    wk(3, [erg, erg, erg, gym].join('\n')), wk(4, [erg, erg, erg, gym].join('\n'))].join('\n');
  assert.equal(collectAllocationFlags(shifting, HARD.masters_return).length, 0);
});

test('athletes not returning from injury are not judged on allocation', () => {
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(collectAllocationFlags(read('run81_advanced_hybrid.txt'), intake).length, 0, id);
  }
  assert.equal(collectAllocationFlags(read('run81_advanced_hybrid.txt'), LIFT4).length, 0);
});

// --- briefs -----------------------------------------------------------------

test('each athlete gets the architecture brief their clock calls for', () => {
  assert.match(buildBlockArchitectureBrief(LIFT8), /BUILD THIS BLOCK BACKWARD FROM DAY 0/);
  assert.match(buildBlockArchitectureBrief(LIFT8), /may not call anything a peak/);
  assert.match(buildBlockArchitectureBrief(LIFT4), /may peak and taper/);
  assert.match(buildBlockArchitectureBrief(HARD.inseason_footballer), /BUILD THE WEEK AROUND MATCH DAY/);
  assert.match(buildBlockArchitectureBrief(HARD.masters_return), /SHIFTS THE ALLOCATION/);
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(buildBlockArchitectureBrief(intake), '', id);
  }
});
