import test from 'node:test';
import assert from 'node:assert/strict';

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import {
  collectProgressionLanguageFlags,
  PROGRESSION_CLAIMS,
  reductionMetric,
} from '../engine/v34_prescription_consistency.js';

// Live run #63 lost the Youth avatar to four consecutive attempts on one code:
//   A1 -> A2 -> A3 -> A4 : V34_PROGRESSION_LANGUAGE_MISMATCH
// The detector accepted eleven phrasings of a false reduction claim; the repair
// layer rewrote exactly one of them. Every other phrasing was flagged forever
// and no regeneration could clear it, because the two layers kept separate
// phrase lists and keyed on different metrics -- the detector on the metric the
// note named, the repair on total volume.
//
// These tests pin the invariant that makes the loop terminate: anything the
// detector can flag, the repair can restate, in one pass.

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
const block = (w, rows) => `START_WEEK${w}_TSV\n${HEADER}\n${rows.join('\n')}\nEND_WEEK${w}_TSV`;
const twoWeeks = ({ note, prev, next, prevLoad = 'Bodyweight', load = 'Bodyweight', reps = null, prevReps = null }) => [
  'Overview.',
  block(3, [`Session A\tExplosive Hip-to-Bar Pull-up\t${prevLoad}\t${prev[0]}\t${prevReps ?? prev[1]}\t2 min\t6\tPull fast and high.\t`]),
  block(4, [`Session A\tExplosive Hip-to-Bar Pull-up\t${load}\t${next[0]}\t${reps ?? next[1]}\t2 min\t6\t${note}\t`]),
].join('\n\n');

const progressionFlags = (p) => collectProgressionLanguageFlags(p, {});

// Every phrasing the detector accepts, paired with a week pair in which the
// named metric did not fall. Sourced from the claim table itself so a new claim
// added to the detector shows up here as an untested phrasing.
const PHRASINGS = [
  { note: 'Reduce total volume slightly this week.', prev: [4, 3], next: [4, 3] },
  { note: 'Cut back the volume here.', prev: [4, 3], next: [4, 3] },
  { note: 'Lower the total reps this week.', prev: [4, 3], next: [4, 3] },
  { note: 'Trim the set count.', prev: [3, 3], next: [3, 2] },
  { note: 'Drop one set from Week 3.', prev: [3, 3], next: [3, 2] },
  { note: 'Fewer sets than Week 3.', prev: [3, 3], next: [3, 2] },
  { note: 'Less volume than last week.', prev: [4, 3], next: [4, 3] },
  { note: 'Quality over quantity; fewer reps than Week 3.', prev: [4, 3], next: [4, 3] },
  { note: 'Slightly less total work than Week 3.', prev: [4, 3], next: [4, 3] },
  { note: 'Fewer total reps than Week 3.', prev: [4, 3], next: [4, 3] },
  { note: 'Cut the distance back.', prev: [1, 0], next: [1, 0], prevReps: '8 km', reps: '8 km' },
  { note: 'Hold roughly the same load as Week 3.', prev: [3, 3], next: [3, 3], prevLoad: '20 kg', load: '25 kg' },
  { note: 'Keep this week at the same dose you used before.', prev: [3, 3], next: [3, 3], prevLoad: '20 kg', load: '25 kg' },
  { note: 'Repeat this load.', prev: [3, 3], next: [3, 3], prevLoad: '20 kg', load: '17.5 kg' },
];

test('[C1] every phrasing the detector flags is cleared by a single repair pass', () => {
  const unrepairable = [];
  for (const shape of PHRASINGS) {
    const p = twoWeeks(shape);
    assert.ok(progressionFlags(p).length > 0, `fixture must actually be flagged: ${shape.note}`);
    const repaired = repairDeterministicContradictions(p, {});
    if (progressionFlags(repaired.program).length > 0) unrepairable.push(shape.note);
  }
  assert.deepEqual(unrepairable, [], 'a flagged phrasing with no repair exhausts the generation loop');
});

test('[C2] the repair is driven by the detector claim table, not a private copy', () => {
  // If a claim is added to the detector, the repair sees it immediately. This
  // pins the shared table so the two layers cannot silently diverge again.
  assert.ok(PROGRESSION_CLAIMS.length >= 6);
  const covered = new Set(PHRASINGS.flatMap((s) => PROGRESSION_CLAIMS
    .filter((c) => c.re.test(s.note))
    .map((c) => c.re.source)));
  const uncovered = PROGRESSION_CLAIMS.map((c) => c.re.source).filter((src) => !covered.has(src));
  assert.deepEqual(uncovered, [], 'each detector claim needs at least one convergence fixture');
});

test('[C3] the repair keys on the metric the claim names, not on total volume', () => {
  // Week 3 3x3 -> Week 4 3x2: total volume fell, the set count did not. A repair
  // keyed on volume sees "reduced" and leaves the false set-count claim standing.
  const p = twoWeeks({ note: 'Trim the set count.', prev: [3, 3], next: [3, 2] });
  const flags = progressionFlags(p);
  assert.equal(flags[0].claim, 'reduction:sets');
  const repaired = repairDeterministicContradictions(p, {});
  assert.deepEqual(progressionFlags(repaired.program), []);
  assert.match(repaired.program, /Hold the set count/);
});

test('[C4] reductionMetric reads the metric out of the matched noun', () => {
  assert.equal(reductionMetric('set count'), 'sets');
  assert.equal(reductionMetric('sets'), 'sets');
  assert.equal(reductionMetric('distance'), 'distance');
  assert.equal(reductionMetric('reps'), 'total reps');
  assert.equal(reductionMetric('total work'), 'volume');
  assert.equal(reductionMetric('volume'), 'volume');
});

test('[C5] restating a claim never discards a condition or a neighbouring instruction', () => {
  const conditional = twoWeeks({
    note: 'Repeat this load only if Week 3 stayed inside the cap.',
    prev: [4, 4], next: [4, 4], prevLoad: '67.5 kg', load: '70 kg',
  });
  const out = repairDeterministicContradictions(conditional, {}).program;
  assert.match(out, /Take 70 kg only if Week 3 stayed inside the cap/);

  const neighbour = twoWeeks({
    note: 'Same band if attempts stay crisp; otherwise trim the set count.',
    prev: [3, 3], next: [3, 2],
  });
  const out2 = repairDeterministicContradictions(neighbour, {}).program;
  assert.match(out2, /Same band if attempts stay crisp; hold the set count\./);

  const leadingCondition = twoWeeks({
    note: 'If Week 3 felt easy, reduce the volume.', prev: [4, 3], next: [4, 3],
  });
  const out3 = repairDeterministicContradictions(leadingCondition, {}).program;
  assert.match(out3, /If Week 3 felt easy, hold the total work\./);
});

test('[C6] a genuine reduction is never rewritten', () => {
  const honest = twoWeeks({ note: 'Trim the set count into the deload.', prev: [4, 3], next: [2, 3] });
  assert.deepEqual(progressionFlags(honest), []);
  const out = repairDeterministicContradictions(honest, {});
  assert.match(out.program, /Trim the set count into the deload\./);
});

test('[C7] the prescription is authoritative and is never altered by a restatement', () => {
  const p = twoWeeks({ note: 'Fewer sets than Week 3.', prev: [3, 3], next: [3, 2] });
  const out = repairDeterministicContradictions(p, {}).program;
  assert.match(out, /Explosive Hip-to-Bar Pull-up\tBodyweight\t3\t2\t2 min\t6\t/);
});

test('[C8] repair is idempotent: a second pass changes nothing', () => {
  for (const shape of PHRASINGS) {
    const first = repairDeterministicContradictions(twoWeeks(shape), {});
    const second = repairDeterministicContradictions(first.program, {});
    assert.equal(second.program, first.program, `not idempotent: ${shape.note}`);
    assert.equal(second.repaired, false, `second pass still reports repairs: ${shape.note}`);
  }
});
