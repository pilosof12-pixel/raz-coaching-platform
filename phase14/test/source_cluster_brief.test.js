import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildEnduranceSourceBrief, buildTaperSourceBrief } from '../engine/source_cluster_brief.js';
import { buildDeterministicBrief } from '../engine/phase15_planner.js';

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

// The cluster's own numbers, not a paraphrase of them.
test('the endurance brief carries the repeated-sprint definition', () => {
  const b = buildEnduranceSourceBrief(A.tactical_3k);
  assert.match(b, /More than two efforts, each about 10 seconds or less/);
  assert.match(b, /under 60 seconds between them/);
  assert.match(b, /recovery is what separates them/i);
});

test('the endurance brief gives the block-building order, not a list of sessions', () => {
  const b = buildEnduranceSourceBrief(H.inseason_footballer);
  assert.match(b, /Count what is already there/);
  assert.match(b, /hard-session budget before you add any easy volume/);
  assert.match(b, /progress one variable at a time/);
});

test('the taper brief carries Mujika volume, intensity and frequency', () => {
  const b = buildTaperSourceBrief({}, true);
  assert.match(b, /41 to 60% of pre-taper volume/);
  assert.match(b, /Frequency is held more than volume/);
  assert.match(b, /take the repetitions off instead/);
  assert.match(b, /come off first/, 'volume is removed selectively');
});

// These are emitted per athlete rather than appended to the instruction file.
// The file is already about 360K tokens on every request, and the clusters
// would add roughly 47K more for athletes who never run.
test('each brief reaches only the athletes it governs', () => {
  assert.ok(buildEnduranceSourceBrief(A.tactical_3k));
  assert.ok(buildEnduranceSourceBrief(H.inseason_footballer));
  assert.equal(buildEnduranceSourceBrief(C.weightlifter_peak), '');
  assert.equal(buildEnduranceSourceBrief(C.mma_fight_camp), '');
  assert.equal(buildTaperSourceBrief({}, false), '', 'nothing to taper into');
});

test('both reach the prompt for the right avatars and no others', () => {
  const tactical = buildDeterministicBrief(A.tactical_3k);
  assert.match(tactical, /BUILD THE CONDITIONING IN THIS ORDER/);
  assert.doesNotMatch(tactical, /WHAT A TAPER ACTUALLY CHANGES/, 'no event in this block');

  const camp = buildDeterministicBrief({ ...C.mma_fight_camp, competition_date: saturday(3), event_type: 'combat', event_priority: 'A' });
  assert.match(camp, /WHAT A TAPER ACTUALLY CHANGES/);

  // A build block eight weeks out must not be told to taper.
  const build = buildDeterministicBrief({ ...C.weightlifter_peak, competition_date: saturday(8), event_type: 'strength_meet', event_priority: 'A' });
  assert.doesNotMatch(build, /WHAT A TAPER ACTUALLY CHANGES/);
});

// The cluster states its own evidence boundary: the numbers are population-level
// findings from swimming, running and cycling. The brief must read as a starting
// point rather than a target, or the model will hit it exactly.
test('the taper numbers are given as a starting point, not a target', () => {
  const b = buildTaperSourceBrief({}, true);
  assert.match(b, /strongest general starting point/);
  assert.doesNotMatch(b, /must reduce|exactly|required reduction/i);
});
