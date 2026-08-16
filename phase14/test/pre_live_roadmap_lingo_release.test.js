import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOAL_PROGRESSION_GRAPHS,
  roadmapFamilyForGoal,
} from '../engine/goal_progression_graph.js';
import {
  parseSkillBenchmarks,
  selectRungForSkill,
} from '../engine/skill_progressions.js';

const LINGO_CASES = [
  ['4 one arm pullups', 'one_arm_pull_up'],
  ['OAP x 4', 'one_arm_pull_up'],
  ['90° HSPU', 'hspu_90'],
  ['90 degree handstand push-up', 'hspu_90'],
  ['press to handstand', 'press_to_handstand'],
  ['handstand press', 'press_to_handstand'],
  ['freestanding handstand', 'handstand'],
  ['full planche', 'planche'],
  ['full front lever', 'front_lever'],
  ['human flag', 'human_flag'],
  ['iron cross', 'iron_cross'],
  ['120 kg weighted dips', 'weighted_dip'],
  ['weighted chin-up +80kg', 'weighted_pull'],
  ['full marathon', 'marathon'],
  ['42.195 km marathon', 'marathon'],
  ['9 minute 3km', 'running_3k'],
  ['MMA fight conditioning', 'combat_conditioning'],
];

test('pre-live roadmap understands normal coaching lingo without misrouting goal families', () => {
  for (const [phrase, expected] of LINGO_CASES) {
    assert.equal(roadmapFamilyForGoal(phrase), expected, `${phrase} should route to ${expected}`);
  }
});

test('all launch roadmap families have a real zero-to-advanced structure, not name-only aliases', () => {
  const required = [
    'handstand', 'hspu', 'hspu_90', 'press_to_handstand', 'bar_muscle_up',
    'planche', 'front_lever', 'human_flag', 'one_arm_pull_up', 'iron_cross',
    'weighted_pull', 'weighted_dip', 'powerlifting', 'running_3k', 'marathon',
    'combat_conditioning',
  ];
  for (const family of required) {
    const graph = GOAL_PROGRESSION_GRAPHS[family];
    assert.ok(graph, `missing graph ${family}`);
    assert.ok(Array.isArray(graph.stages) && graph.stages.length >= 3, `${family} needs staged progression`);
    assert.ok(Array.isArray(graph.components) && graph.components.length >= 2, `${family} needs mandatory components`);
    assert.ok(String(graph.advance || '').length > 20, `${family} needs advancement criteria`);
    assert.ok(String(graph.regress || '').length > 20, `${family} needs regression criteria`);
  }
});

test('demonstrated strict OAP phrasing routes an advanced athlete from achieved state, not prerequisites', () => {
  const intake = {
    experience: 'advanced',
    training_location: 'commercial_gym',
    equipment: 'Full commercial gym — all standard barbells, dumbbells, racks, machines, cables and bodyweight stations available.',
    current_numbers: 'One-Arm Pull-up: 2 strict reps each arm\nWeighted Chin-up: +80 kg 1RM',
  };
  const benchmarks = parseSkillBenchmarks(intake);
  assert.equal(benchmarks.one_arm_pull_up.one_arm_pull_up, 2);
  const selected = selectRungForSkill('one_arm_pull_up', benchmarks, intake);
  assert.equal(selected.gated, false);
  assert.equal(selected.rung.name, 'One-Arm Pull-Up');
});
