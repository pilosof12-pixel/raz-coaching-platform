// The generator may not rewrite the athlete's goal hierarchy. Run #166's
// calisthenics block declared the PRIMARY +40 kg weighted pull-up a maintenance
// goal and named a secondary as what the block develops; two progression gates
// then exempted the primary because it was "declared". Coach: P0.

import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUndeclaredGoalStatusFlags } from '../engine/goal_status_declaration.js';

test('only a secondary goal is offered a maintenance declaration', () => {
  const analysis = { targets: [
    { tier: 'primary', family: 'pull_up', progressed: false, raw: 'Weighted pull-up +40 kg' },
    { tier: 'secondary', family: 'overhead_press', progressed: false, raw: '100 kg OHP' },
  ] };
  const flags = collectUndeclaredGoalStatusFlags(analysis, 'Intro.\n\nSTART_WEEK1_TSV\n');
  assert.deepEqual(flags.map((f) => f.tier), ['secondary']);
});
