import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentTargetModalityExposure,
  elitePromptRules,
  endurancePerformanceIntegrityFlags,
  goalDoseFlags,
} from '../engine/phase15_elite_guardrails.js';
import { buildSpecialistRules } from '../engine/phase15_specialist_rules.js';

const intake = {
  age: 27,
  primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
  secondary_goals: [
    'Improve 10 km ruck with 20 kg from 95 min toward 82 min',
    'Improve strict pull-ups from 14 toward 18-20',
  ],
  maintenance_goals: ['Maintain useful squat and deadlift strength while staying athletic and relatively weight-stable'],
  goal_priority_model: 'tiered',
  experience: 'advanced',
  days_per_week: 3,
  session_length: '60-75 min',
  training_location: 'full_gym',
  equipment: 'Full gym, track/road access, hills, pull-up bar, 20 kg ruck/backpack, 30 kg sandbag and sled.',
  current_numbers: [
    '3 km: 13:30',
    '10 km ruck with 20 kg: 95 min',
    'Back Squat: 140 kg x 5',
    'Deadlift: 180 kg x 3',
    'Overhead Press: 65 kg x 5',
    'Weighted Pull-up: +30 kg x 5',
    'Strict Pull-ups: 14 reps',
    'Push-ups: 55 clean reps in 2 min',
  ].join('\n'),
  performance_markers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min'],
  notes: [
    'Currently runs 3 sessions per week, about 18-20 km/week: one interval session, one easy run and one longer aerobic run.',
    'Currently does 1 ruck per week, usually 8-10 km with 20 kg.',
    'Recent 400 m repeats are around 1:42-1:45 with adequate recovery for repeatability.',
    'Previous shin-splint irritation happened when running volume increased abruptly; currently asymptomatic at present running and ruck volume.',
    'Can train across five calendar days and is comfortable combining compatible easy running or rucking with a strength day when sensible.',
    'Wants combat-ready / special-operations-style fitness without random punishment circuits or unnecessary mass gain.',
  ].join(' '),
  injuries: 'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
  pain: { active: false, description: '', severity: '', character: '', next_day_baseline: '', tolerated_movements: '' },
  mobility: { active: false, limitation: '' },
  sport: '',
  sport_schedule: [],
  sleep_hours: '7-8',
  recovery_rating: 'good',
};

function parsed(rows) {
  const idx = { day:0, exercise:1, weight:2, sets:3, reps:4, rest:5, 'target rpe':6, notes:7, results:8 };
  return { idx, rows: rows.map(cells => ({ cells })) };
}
const row = (day, exercise, weight='N/A', sets='1', reps='30 min', notes='') =>
  [day, exercise, weight, sets, reps, 'N/A', 'N/A', notes, ''];

test('Tactical 3K preserves the established three-run baseline and anchors current 3K pace', () => {
  assert.equal(currentTargetModalityExposure(intake, 'running'), 3);
  const rules = elitePromptRules(intake).join('\n');
  assert.match(rules, /CURRENT-RACE PERFORMANCE ANCHOR/);
  assert.match(rules, /4:30\/km/);
  assert.match(rules, /progress the smallest useful variable/i);
});

test('named ruck target is recognized as a direct current modality rather than generic GPP', () => {
  assert.equal(currentTargetModalityExposure(intake, 'rucking'), 1);
});

test('ruck target receives specific load-management rules', () => {
  const rules = `${elitePromptRules(intake).join('\n')}\n${buildSpecialistRules(intake)}`;
  assert.match(rules, /RUCK(?:ING)? (?:DIRECT|SPECIFICITY|PROGRESSION|LOAD)/i);
  assert.match(rules, /(?:load|pack).*(?:distance).*(?:pace)|(?:pace).*(?:distance).*(?:load|pack)/i);
  assert.match(rules, /loaded running|run under load|heavy loaded run/i);
  assert.match(rules, /RUN \+ RUCK IMPACT HISTORY/);
});

test('tactical framing does not authorize random punishment conditioning', () => {
  const rules = elitePromptRules(intake).join('\n');
  assert.match(rules, /TACTICAL PRIORITY RULE/);
  assert.match(rules, /punishment conditioning/i);
  assert.match(rules, /Burpee EMOM/);
  assert.match(rules, /extra HIIT/i);
});

test('strict pull-up goal cannot silently become rows or pulldowns', () => {
  const p = parsed([
    row('Mon', 'Run', '4:25/km', '6', '2 min', '3K-specific intervals with recovery.'),
    row('Mon', 'Back Squat', 'RPE-selected load', '3', '4', 'Strength retention.'),
    row('Mon', 'Lat Pulldown', 'RPE-selected load', '3', '8', 'Vertical pulling support.'),
    row('Wed', 'Run', '5:40-6:00/km', '1', '35 min', 'Easy conversational run.'),
    row('Fri', 'Run', '5:30-5:50/km', '1', '45 min', 'Aerobic run.'),
    row('Sun', 'Backpack Carry', '20 kg', '1', '8 km', 'Direct ruck / loaded march at controlled walking pace.'),
  ]);
  const flags = goalDoseFlags('', intake, p);
  assert.equal(flags.some(f => f.code === 'NAMED_GOAL_DIRECT_EXPOSURE_MISSING' && /pull-up/i.test(f.message)), true);
});

test('dropping the existing weekly ruck is a QA failure even when carries and sleds are present', () => {
  const p = parsed([
    row('Mon', 'Run', '4:25/km', '6', '2 min', '3K-specific intervals with recovery.'),
    row('Mon', 'Back Squat', 'RPE-selected load', '3', '4', 'Strength retention.'),
    row('Wed', 'Run', '5:40-6:00/km', '1', '35 min', 'Easy conversational run.'),
    row('Wed', 'Weighted Pull-up', '+25 kg', '3', '5', 'Direct pulling strength.'),
    row('Fri', 'Run', '5:30-5:50/km', '1', '45 min', 'Aerobic run.'),
    row('Sun', 'Farmer Carry', 'heavy', '4', '30 m', 'Tactical GPP support.'),
    row('Sun', 'Sled Push', 'moderate', '4', '20 m', 'Tactical GPP support.'),
  ]);
  const flags = endurancePerformanceIntegrityFlags('', intake, p);
  assert.equal(flags.some(f => f.code === 'TARGET_MODALITY_EXPOSURE_REDUCED' && /ruck/i.test(f.message)), true);
});

test('a direct weekly ruck satisfies the modality floor; support carries do not need to be removed', () => {
  const p = parsed([
    row('Mon', 'Run', '4:25/km', '6', '2 min', '3K-specific intervals with recovery.'),
    row('Wed', 'Run', '5:40-6:00/km', '1', '35 min', 'Easy conversational run.'),
    row('Fri', 'Run', '5:30-5:50/km', '1', '45 min', 'Aerobic run.'),
    row('Sun', 'Backpack Carry', '20 kg', '1', '8 km', 'Direct ruck / loaded march at controlled walking pace.'),
    row('Sun', 'Farmer Carry', 'heavy', '3', '30 m', 'Optional support work after the direct ruck if recovery/time allow.'),
  ]);
  const flags = endurancePerformanceIntegrityFlags('', intake, p);
  assert.equal(flags.some(f => f.code === 'TARGET_MODALITY_EXPOSURE_REDUCED' && /ruck/i.test(f.message)), false);
});
