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

test('planche goal activates Overcoming Gravity and observed-level rule', () => {
  const intake=base({
    primary_goals:['Full Planche'],
    current_numbers:'Advanced Tuck Planche 12s clean; Pseudo Planche Push-up 12 reps; training age 5 years'
  });
  const rules=buildSpecialistRules(intake);
  assert.match(rules,/Overcoming Gravity decision layer/i);
  assert.match(rules,/demonstrated clean ability controls the starting level/i);
  assert.match(rules,/DETERMINISTIC SKILL-GRAPH SELECTION/);
  assert.match(rules,/two weekly specific exposures/i);
  assert.match(rules,/Do not regress a clean Advanced Tuck\/Straddle athlete/i);
  const brief=buildDeterministicBrief(intake);
  assert.match(brief,/GOAL-SPECIFIC SPECIALIST RULES/);
  assert.match(brief,/Overcoming Gravity/i);
});

test('gymnastics framework separates direct skill from support strength', () => {
  const rules=buildSpecialistRules(base({
    primary_goals:['Human Flag: progress from Tuck Human Flag to Straddle Human Flag'],
    current_numbers:'Tuck Human Flag 12 seconds clean per side'
  }));
  assert.match(rules,/Human Flag: direct side-specific flag holds/i);
  assert.match(rules,/Pulling, pressing, carries and trunk work support but do not replace direct flag practice/i);
  assert.match(rules,/skill\/technique while fresh/i);
});

test('session range uses upper end as ceiling and GPP remains optional', () => {
  const brief=buildDeterministicBrief(base({
    session_duration_minutes:undefined,
    session_length:'45-70 min',
    sport:'BJJ',
    maintenance_goals:['Maintain general robustness']
  }));
  assert.match(brief,/Session-time preference: 45-70 min/i);
  assert.match(brief,/70 minutes as the ceiling, not a target to fill/i);
  assert.match(brief,/OPTIONAL GPP HEURISTIC/i);
  assert.match(brief,/Pallof Press/i);
  assert.match(brief,/Neck Isometric/i);
  assert.match(brief,/first to be removed/i);
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
