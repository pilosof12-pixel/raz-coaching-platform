import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpecialistRules, parseStreetGoal } from '../engine/phase15_specialist_rules.js';
import { buildDeterministicBrief } from '../engine/phase15_planner.js';

function base(overrides={}) {
  return {
    days_per_week:4,
    session_duration_minutes:60,
    split_preference:'full_body',
    training_location:'commercial_gym',
    equipment:'barbell, plates, rack, dumbbells, cable stack, pull-up bar, dip bars, bands, floor, parallelettes',
    current_numbers:'',
    primary_goals:[], secondary_goals:[], maintenance_goals:[], notes:'Advanced trainee.',
    ...overrides
  };
}

test('planche goal activates authored Article N2 and observed-level rule', () => {
  const intake=base({
    primary_goals:['Full Planche'],
    current_numbers:'Advanced Tuck Planche 12s clean; Pseudo Planche Push-up 12 reps; training age 5 years'
  });
  const rules=buildSpecialistRules(intake);
  assert.match(rules,/Advanced Gymnastics/);
  assert.match(rules,/Article N2 Planche rule/);
  assert.match(rules,/Planche Lean -> Tuck Planche -> Advanced Tuck Planche -> Straddle Planche -> Full Planche/);
  assert.match(rules,/do NOT regress an athlete who already demonstrates a harder clean rung/i);
  assert.match(rules,/DETERMINISTIC SKILL-GRAPH SELECTION/);
  assert.match(rules,/two weekly high-quality specific exposures/i);
  const brief=buildDeterministicBrief(intake);
  assert.match(brief,/GOAL-SPECIFIC SPECIALIST RULES/);
  assert.match(brief,/Article N2 Planche rule/);
});

test('weighted chin-up 1RM goal routes to maximal-strength Article N8', () => {
  const goal='Weighted Chin-up: increase 1RM from +80 kg toward +95 kg';
  assert.equal(parseStreetGoal(goal)?.expression,'max_strength');
  const rules=buildSpecialistRules(base({primary_goals:[goal],current_numbers:'Weighted Chin-up +80 kg external load 1RM'}));
  assert.match(rules,/Article N8/);
  assert.match(rules,/movement=Weighted Chin-up, expression=max_strength/);
  assert.match(rules,/Current external-load 1RM anchor parsed for Weighted Chin-up: \+80 kg/);
  assert.match(rules,/goal movement as the anchor lift/);
  assert.match(rules,/low-rep heavy specific work/);
  assert.match(rules,/small load jumps/);
});

test('weighted dip fixed-load rep goal routes to two-track loaded endurance', () => {
  const goal='Weighted Dip: progress toward +40 kg x 15 clean reps';
  assert.equal(parseStreetGoal(goal)?.expression,'loaded_endurance');
  const rules=buildSpecialistRules(base({primary_goals:[goal],current_numbers:'Weighted Dip +40 kg x 8 clean reps'}));
  assert.match(rules,/movement=Weighted Dip, expression=loaded_endurance/);
  assert.match(rules,/NOT a 1RM-only problem/);
  assert.match(rules,/two tracks/i);
  assert.match(rules,/heavier low-rep strength-reserve exposure/i);
  assert.match(rules,/specific clean-volume exposure at or near the goal external load/i);
  assert.match(rules,/Do not prescribe the future target rep count as current working-set reps/i);
});

test('street lifting classifier does not confuse max and endurance expressions', () => {
  assert.equal(parseStreetGoal('Weighted Dip 1RM goal +90 kg')?.expression,'max_strength');
  assert.equal(parseStreetGoal('Weighted Pull-up +30 kg x 20 reps')?.expression,'loaded_endurance');
});
