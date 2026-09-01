import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectClusterFlags, repairClusterNotation, clusterStructure, describesCluster, buildClusterBrief,
} from '../engine/v81_cluster_notation.js';
import { collectAllV34ConsistencyFlags } from '../engine/v34_prescription_consistency.js';

const COMP = JSON.parse(fs.readFileSync(new URL('./fixtures/competition_avatars.json', import.meta.url), 'utf8'));
const CORE = JSON.parse(fs.readFileSync(new URL('./fixtures/acceptance_intakes.json', import.meta.url), 'utf8'));
// The block rated 8.8, which prescribed 3 reps and called them "3 crisp triples
// with 15-20 sec reset" -- a cluster written as a straight set, with the wrong
// unit, describing nine reps in a three-rep row.
const DELIVERED = fs.readFileSync(new URL('./fixtures/run96_weightlifter_intensification.txt', import.meta.url), 'utf8');
const HYBRID = fs.readFileSync(new URL('./fixtures/run81_advanced_hybrid.txt', import.meta.url), 'utf8');

test('a set broken up by rest is recognised as a cluster', () => {
  assert.deepEqual(describesCluster('Treat each 3-rep set as 3 crisp triples with 15-20 sec reset.', 3), { pieces: 3, word: 'triples' });
  // A straight set with rest BETWEEN sets is not a cluster.
  assert.equal(describesCluster('Three crisp triples, 3 min rest between sets.', 3), null);
  // A claim about some other set size is not about this row.
  assert.equal(describesCluster('Treat each 5-rep set as 5 crisp singles with reset.', 3), null);
});

test('the delivered block is flagged for writing clusters as straight sets', () => {
  const flags = collectClusterFlags(DELIVERED, {});
  assert.ok(flags.length > 0);
  assert.equal(flags[0].code, 'V81_CLUSTER_LABELLED_AS_STRAIGHT_SET');
  assert.match(flags[0].detail, /cluster rather than a straight set/);
});

test('the repair records the structure and names the unit correctly', () => {
  const repaired = repairClusterNotation(DELIVERED, {});
  assert.equal(collectClusterFlags(repaired, {}).length, 0);
  assert.match(repaired, /3 \(1\+1\+1\)/);
  assert.match(repaired, /3 crisp singles/);
  assert.doesNotMatch(repaired, /3 crisp triples/);
  assert.equal(repairClusterNotation(repaired, {}), repaired, 'repair is not idempotent');
});

test('the recorded structure keeps the set total unchanged', () => {
  // This records how the set is performed, not how much of it there is, so
  // every rule that counts reps still reads the same number.
  const repaired = repairClusterNotation(DELIVERED, {});
  assert.deepEqual(clusterStructure('3 (1+1+1)'), [1, 1, 1]);
  assert.equal(clusterStructure('3'), null);
  const reps = (t) => (t.match(/^\w+\tClean and Jerk\t[^\t]*\t\d+\t([^\t]+)/m) || [])[1];
  assert.match(String(reps(repaired)), /^3 \(1\+1\+1\)$/);
});

test('the prescription and the prose agree afterwards', () => {
  // The rep word names the piece in a cluster, so v34 must read it that way
  // rather than against the set total.
  const repaired = repairClusterNotation(DELIVERED, {});
  assert.equal(collectAllV34ConsistencyFlags(repaired, {}).length, 0);
});

test('a cluster still mislabelled as triples is caught', () => {
  const repaired = repairClusterNotation(DELIVERED, {});
  const broken = repaired.replace(/crisp singles/g, 'crisp triples');
  assert.ok(collectAllV34ConsistencyFlags(broken, {}).length > 0, 'the wrong unit must not pass');
});

test('later references to the old unit move with it', () => {
  // "...only if the doubles stay fast" refers back to the same set.
  const repaired = repairClusterNotation(DELIVERED, {});
  const clusterRows = repaired.split('\n').filter((l) => /\(1\+1\)/.test(l));
  for (const row of clusterRows) {
    assert.doesNotMatch(row, /\bdoubles\b/i, `a cluster row still calls its pieces doubles: ${row.slice(0, 80)}`);
  }
});

test('programs with no clusters are untouched', () => {
  assert.equal(collectClusterFlags(HYBRID, {}).length, 0);
  assert.equal(repairClusterNotation(HYBRID, {}), HYBRID);
});

test('the brief is written for lifters only', () => {
  assert.match(buildClusterBrief(COMP.weightlifter_peak), /WRITE A CLUSTER AS A CLUSTER/);
  for (const [id, intake] of Object.entries(CORE)) {
    assert.equal(buildClusterBrief(intake), '', id);
  }
});
