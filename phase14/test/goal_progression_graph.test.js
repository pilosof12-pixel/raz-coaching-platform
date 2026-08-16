import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOAL_PROGRESSION_GRAPHS,
  roadmapFamilyForGoal,
  roadmapsForIntake,
  buildRoadmapPromptRules,
  validateGoalComponentCoverageSemantic,
  roadmapCoverageSummary,
} from '../engine/goal_progression_graph.js';

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
function fourWeek(rowsForWeek) {
  return [1,2,3,4].map((week) => `START_WEEK${week}_TSV\n${HEADER}\n${rowsForWeek(week).map((r) => r.join('\t')).join('\n')}\nEND_WEEK${week}_TSV`).join('\n\n');
}

const youthHandstandIntake = {
  age: 13,
  primary_goals: ['Achieve a freestanding handstand'],
  secondary_goals: ['Achieve first bar muscle-up'],
  current_numbers: '12 strict pull-ups. Wall-facing handstand 15 seconds. Back-to-wall handstand 20 seconds. No reliable unsupported balance yet.',
  clarification_answers: { handstand: 'Controlled kick-ups improving; no reliable unsupported balance time yet.' },
  equipment: 'Pull-up bar, rings, bands, bench, floor and wall.',
  days_per_week: 2,
};

test('roadmap classifier covers launch-critical advanced families and endurance side quests', () => {
  assert.equal(roadmapFamilyForGoal('Full planche'), 'planche');
  assert.equal(roadmapFamilyForGoal('4 one-arm pull-ups'), 'one_arm_pull_up');
  assert.equal(roadmapFamilyForGoal('Freestanding handstand'), 'handstand');
  assert.equal(roadmapFamilyForGoal('First bar muscle-up'), 'bar_muscle_up');
  assert.equal(roadmapFamilyForGoal('Weighted chin-up +100 kg 1RM'), 'weighted_pull');
  assert.equal(roadmapFamilyForGoal('Weighted dip +120 kg'), 'weighted_dip');
  assert.equal(roadmapFamilyForGoal('Run a full marathon'), 'marathon');
  assert.equal(roadmapFamilyForGoal('Improve 3 km to 9:00'), 'running_3k');
  assert.equal(roadmapFamilyForGoal('MMA fight conditioning'), 'combat_conditioning');
});

test('roadmaps encode stages, mandatory components, advancement and regression instead of flat aliases', () => {
  const summary = roadmapCoverageSummary();
  const required = ['handstand','bar_muscle_up','planche','front_lever','human_flag','one_arm_pull_up','iron_cross','weighted_pull','weighted_dip','powerlifting','running_3k','marathon','combat_conditioning'];
  for (const family of required) {
    const graph = GOAL_PROGRESSION_GRAPHS[family];
    assert.ok(graph, `missing ${family}`);
    assert.ok(graph.stages.length >= 5, `${family} needs a real progression path`);
    assert.ok(graph.components.length >= 3, `${family} needs complementary component coverage`);
    assert.ok(graph.advance && graph.regress, `${family} needs advance/regress rules`);
    assert.ok(summary.some((x) => x.family === family));
  }
});

test('advanced calisthenics primary plus marathon side quest keeps both roadmaps and preserves priority tiers', () => {
  const intake = {
    primary_goals: ['Full planche', '4 strict one-arm pull-ups'],
    secondary_goals: ['Complete a full marathon'],
  };
  const maps = roadmapsForIntake(intake);
  assert.ok(maps.some((x) => x.graph.family === 'planche' && x.tier === 'primary'));
  assert.ok(maps.some((x) => x.graph.family === 'one_arm_pull_up' && x.tier === 'primary'));
  assert.ok(maps.some((x) => x.graph.family === 'marathon' && x.tier === 'secondary'));
  const prompt = buildRoadmapPromptRules(intake);
  assert.match(prompt, /Concurrent lower-priority goals receive a genuine pathway/i);
  assert.match(prompt, /may not steal the freshness\/recovery budget required by the primary goal/i);
});

test('developing handstand fails when program has kick-ups but no substantive wall-static component', () => {
  const bad = fourWeek(() => [
    ['Mon','Controlled Handstand Kick-up','BW','5','2 attempts','60s','N/A','Independent balance practice',''],
    ['Thu','Controlled Handstand Kick-up','BW','5','2 attempts','60s','N/A','Independent balance practice',''],
  ]);
  assert.throws(
    () => validateGoalComponentCoverageSemantic(bad, youthHandstandIntake),
    (err) => err?.code === 'GOAL_COMPONENT_COVERAGE_MISSING' && /wall-supported static handstand/i.test(err.amendment || err.message),
  );
});

test('developing handstand passes when wall-static capacity and independent balance are both trained', () => {
  const good = fourWeek((week) => [
    ['Mon','[WARMUP] Wrist Prep','BW','1','2 min','N/A','N/A','Low fatigue prep',''],
    ['Mon','Wall-Facing Handstand Hold','BW','3',week === 4 ? '20-30 sec' : '15-25 sec','60-90s','7','Line, confidence and shoulder endurance',''],
    ['Mon','Controlled Handstand Kick-up','BW',week === 4 ? '4' : '5','2 attempts','60s','N/A','Independent balance practice while fresh',''],
  ]);
  const result = validateGoalComponentCoverageSemantic(good, youthHandstandIntake);
  assert.equal(result.ok, true);
  assert.equal(result.handstand.weeks.filter((w) => w.wall_static > 0).length, 4);
  assert.equal(result.handstand.weeks.filter((w) => w.entry_balance > 0).length, 4);
});

test('warm-up-only wall mention does not satisfy handstand capacity component', () => {
  const bad = fourWeek(() => [
    ['Mon','[WARMUP] Wall Handstand Hold','BW','1','10 sec','N/A','N/A','Brief prep only',''],
    ['Mon','Controlled Handstand Kick-up','BW','5','2 attempts','60s','N/A','Independent balance practice',''],
  ]);
  assert.throws(() => validateGoalComponentCoverageSemantic(bad, youthHandstandIntake), /GOAL_COMPONENT_COVERAGE_MISSING|goal-component/i);
});

test('athlete with established repeatable freestanding handstand is not forced back to wall-static acquisition work', () => {
  const advanced = {
    ...youthHandstandIntake,
    current_numbers: 'Freestanding handstand hold 35 seconds. Controlled entries are reliable.',
  };
  const program = fourWeek(() => [
    ['Mon','Freestanding Handstand Hold','BW','4','20-30 sec','2 min','7','Quality balance work',''],
  ]);
  const result = validateGoalComponentCoverageSemantic(program, advanced);
  assert.equal(result.ok, true);
  assert.equal(result.applicable, false);
});
