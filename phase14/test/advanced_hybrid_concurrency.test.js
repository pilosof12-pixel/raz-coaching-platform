import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdvancedHybridConcurrencyBrief,
  currentRunBaseline,
  externalSportSessions,
  isHighConcurrencyHybrid,
  marathonGoalTier,
} from '../engine/advanced_hybrid_concurrency.js';
import { ADVANCED_HYBRID_LAUNCH_INTAKE } from './advanced_hybrid_launch_acceptance.test.js';

test('advanced launch intake is recognized as a high-concurrency hybrid case', () => {
  assert.equal(marathonGoalTier(ADVANCED_HYBRID_LAUNCH_INTAKE), 'secondary');
  assert.equal(externalSportSessions(ADVANCED_HYBRID_LAUNCH_INTAKE), 5);
  assert.equal(isHighConcurrencyHybrid(ADVANCED_HYBRID_LAUNCH_INTAKE), true);
});

test('current one-run 20 km baseline is parsed instead of treating marathon distance as current capacity', () => {
  const baseline = currentRunBaseline(ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.equal(baseline.sessions, 1);
  assert.equal(baseline.weekly_km, 20);
  assert.equal(baseline.longest_km, 20);
});

test('high-concurrency brief protects primary work and constrains marathon side quest to recoverable starting dose', () => {
  const brief = buildAdvancedHybridConcurrencyBrief(ADVANCED_HYBRID_LAUNCH_INTAKE);
  assert.match(brief, /HIGH-CONCURRENCY HYBRID LOAD CONTRACT/);
  assert.match(brief, /4 requested strength sessions/);
  assert.match(brief, /5 external sport sessions/);
  assert.match(brief, /Primary strength\/skill goals own the freshness budget/);
  assert.match(brief, /one substantive easy long-run exposure in Week 1 is a valid marathon-side-quest pathway/);
  assert.match(brief, /Week 1 direct running must stay at or below/i);
  assert.match(brief, /Mon, Tue, Fri, Sun/);
  assert.match(brief, /Weighted bilateral pulling is support and is reduced before direct OAP work/);
  assert.match(brief, /secondary strict OHP goal/i);
  assert.doesNotMatch(brief, /add hard intervals/i);
});

test('ordinary non-marathon strength client does not receive the hybrid concurrency contract', () => {
  const intake = {
    primary_goals: ['Improve squat'],
    secondary_goals: ['Maintain pull-ups'],
    days_per_week: 4,
    sport: 'MMA',
    sport_sessions_per_week: 5,
  };
  assert.equal(isHighConcurrencyHybrid(intake), false);
  assert.equal(buildAdvancedHybridConcurrencyBrief(intake), '');
});
