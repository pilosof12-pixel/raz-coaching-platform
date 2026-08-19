import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicBrief } from '../phase14/engine/phase15_planner.js';

test('restriction text about conditioning does not create a fake Zone-2 goal',()=>{
  const intake={
    primary_goals:['Back squat 200 kg','Weighted chin-up +70 kg for 3 reps'],
    secondary_goals:['Improve 5 km from 25:00 to 22:30'],
    days_per_week:4,
    sport:'MMA / BJJ',
    sport_schedule:[{day:'Mon',intensity:'hard'},{day:'Wed',intensity:'moderate'},{day:'Fri',intensity:'hard'},{day:'Sat',intensity:'moderate'}],
    notes:'Currently running 2 sessions per week, about 10 km/week. Avoid hard conditioning within 24 hours before hard MMA.',
  };
  const brief=buildDeterministicBrief(intake);
  assert.doesNotMatch(brief,/Two meaningful low-fatigue Zone 2 exposures/i);
  assert.doesNotMatch(brief,/ZONE2_A|ZONE2_B/);
});

test('explicit aerobic-base goal routes dose to curated sources rather than hard-coded two sessions',()=>{
  const brief=buildDeterministicBrief({secondary_goals:['Improve aerobic base with Zone 2'],days_per_week:3});
  assert.match(brief,/Explicit aerobic-base \/ Zone 2 goal/i);
  assert.match(brief,/curated endurance sources/i);
  assert.doesNotMatch(brief,/20-35 minutes each|Two meaningful low-fatigue/i);
});
