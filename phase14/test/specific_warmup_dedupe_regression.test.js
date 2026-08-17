import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichSpecificWarmups } from '../engine/specific_warmup_enrichment.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function program() {
  const rows = [
    ['Mon', '[WARMUP]', 'Bodyweight', '1', '8 min', 'N/A', '3', 'General preparation.', ''],
    ['Mon', 'Back Squat', '180 kg', '1', '3', '4 min', '8', 'Top set.', ''],
    ['Mon', 'Back Squat', '155 kg', '3', '5', '3 min', '7', 'Back-off work.', ''],
    ['Tue', '[WARMUP]', 'Bodyweight', '1', '8 min', 'N/A', '3', 'General preparation.', ''],
    ['Tue', 'Overhead Press', '77.5 kg', '1', '3', '3 min', '8', 'Top set.', ''],
    ['Tue', 'Overhead Press', '67.5 kg', '3', '5', '2 min', '7', 'Back-off work.', ''],
  ];
  return [
    'START_WEEK1_TSV', HEADER, ...rows.map((row) => row.join('\t')), 'END_WEEK1_TSV',
  ].join('\n');
}

test('top set plus back-off rows produce one ramp to the heaviest target per movement', () => {
  const out = enrichSpecificWarmups(program());
  const squatRamps = out.match(/Ramp Back Squat:/g) || [];
  const pressRamps = out.match(/Ramp Overhead Press:/g) || [];
  assert.equal(squatRamps.length, 1, out);
  assert.equal(pressRamps.length, 1, out);
  assert.match(out, /before 180 kg work sets/);
  assert.doesNotMatch(out, /before 155 kg work sets/);
  assert.match(out, /before 77\.5 kg work sets/);
  assert.doesNotMatch(out, /before 67\.5 kg work sets/);
});

test('authored running warm-up remains untouched', () => {
  const candidate = [
    'START_WEEK1_TSV', HEADER,
    ['Tue', '[WARMUP]', 'Bodyweight', '1', '10 min', 'N/A', '3', 'Easy jog 6 min; running drills; 4 x 15 sec strides.', ''].join('\t'),
    ['Tue', 'Run', '3K pace', '6', '400 m', '2 min', '8', '3K-specific intervals.', ''].join('\t'),
    'END_WEEK1_TSV',
  ].join('\n');
  const out = enrichSpecificWarmups(candidate);
  assert.match(out, /Easy jog 6 min; running drills; 4 x 15 sec strides\./);
  assert.doesNotMatch(out, /Ramp Run:/);
});
