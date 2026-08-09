import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_PROGRESSIONS, parseSkillBenchmarks } from '../engine/skill_progressions.js';

test('planche uses 20s lean readiness anchor and stronger straddle threshold', () => {
  const p = SKILL_PROGRESSIONS.get('planche');
  assert.equal(p.rungs[0].criterion.min, 20);
  const straddle = p.rungs.find(r => r.name === 'Straddle Planche');
  assert.equal(straddle.criterion.min, 15);
});

test('human flag readiness includes push, pull and lateral trunk base', () => {
  const f = SKILL_PROGRESSIONS.get('human_flag');
  const metrics = new Map(f.prerequisites.map(x => [x.metric, x.min]));
  assert.equal(metrics.get('pull_ups'), 15);
  assert.equal(metrics.get('dips'), 20);
  assert.equal(metrics.get('side_plank_hold_s'), 30);
});

test('HSPU graph contains belly-to-wall and never contains 90-degree wall HSPU', () => {
  const h = SKILL_PROGRESSIONS.get('hspu');
  const names = h.rungs.map(r => r.name);
  assert(names.includes('Belly-to-Wall Handstand Push-Up'));
  assert(!names.some(n => /90.*wall|wall.*90/i.test(n)));
});

test('benchmark parser reads dips and HSPU wall orientations', () => {
  const b = parseSkillBenchmarks({current_numbers: '15 pull-ups, 20 dips, back-to-wall HSPU 10, belly-to-wall HSPU 8'}).general;
  assert.equal(b.pull_ups, 15);
  assert.equal(b.dips, 20);
  assert.equal(b.back_to_wall_hspu, 10);
  assert.equal(b.belly_to_wall_hspu, 8);
});

test('90-degree HSPU alias no longer maps to fabricated wall variation', async () => {
  const { coreExerciseName } = await import('../engine/exercise_dictionary.js');
  const n = coreExerciseName('90-Degree HSPU');
  assert(!/wall/i.test(n));
});
