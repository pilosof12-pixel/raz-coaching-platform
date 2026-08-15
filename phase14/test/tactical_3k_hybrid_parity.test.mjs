import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentTargetModalityExposure,
  elitePromptRules,
  endurancePerformanceIntegrityFlags,
  goalDoseFlags,
  strengthSessionAccountingFlags,
} from '../engine/phase15_elite_guardrails.js';
import { buildSpecialistRules } from '../engine/phase15_specialist_rules.js';
import { validatePhase15FinalProgram } from '../engine/phase15_final_qa.js';

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
  gym_availability_mode: 'flexible',
  available_gym_days: [],
  session_length: '60-75 min',
  training_location: 'commercial_gym',
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
  pain: { active: false, description: '', severity: '', character: '', next_day_baseline: 'normal', tolerated_movements: 'Current 18-20 km/week running and one 8-10 km ruck with 20 kg are tolerated without symptoms.' },
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

function goldenWeek(week) {
  const header = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';
  const rows = [
    ['Mon','Run','5:30-6:00 / km','1','25 min','N/A','3-4','Easy conversational run; preserve current run frequency and keep impact low.',''],
    ['Mon','Back Squat','RPE-selected load','3','5','3 min','7','Strength maintenance; clean reps with reserve.',''],
    ['Tue','Run','1:42-1:45 / 400 m','6','400 m','2 min','7-8','3K target pace interval session anchored to current repeatable 400 m performance.',''],
    ['Wed','Weighted Pull-up','+25 kg','3','5','3 min','7-8','Pulling-strength support below the demonstrated +30 kg x 5 benchmark.',''],
    ['Wed','Pull-up','Bodyweight','3','8','2 min','7','Direct strict pull-up volume; stop before rep speed or position deteriorates.',''],
    ['Fri','Run','5:20-5:50 / km','1','40 min','N/A','4-5','Long aerobic run at controlled effort; no extra conditioning afterward.',''],
    ['Fri','Deadlift','RPE-selected load','2','3','3 min','7','Low-cost strength maintenance behind the 3K priority.',''],
    ['Sat','Backpack Carry','20 kg','1','70 min','N/A','5','Direct ruck / loaded march at controlled walking pace; target pace 9:25-9:35 / km. Keep pack load stable and progress only one main ruck variable at a time.',''],
  ];
  return `START_WEEK${week}_TSV\n${header}\n${rows.map(r=>r.join('\t')).join('\n')}\nEND_WEEK${week}_TSV`;
}

function goldenProgram() {
  return [
    'Tactical 3K block. Primary priority is the 3K; ruck and pull-up work remain direct, while barbell strength stays supportive.',
    'Weeks 2-4 preserve the same hierarchy and only progress a variable when recovery and shin response remain normal.',
    goldenWeek(1), goldenWeek(2), goldenWeek(3), goldenWeek(4),
  ].join('\n\n');
}

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

test('three requested strength sessions can coexist with additional endurance-only calendar days', () => {
  const p = parsed([
    row('Mon', 'Back Squat', 'RPE-selected load', '3', '5', 'Strength day 1.'),
    row('Tue', 'Run', '5:40-6:00/km', '1', '30 min', 'Endurance-only day.'),
    row('Wed', 'Weighted Pull-up', '+25 kg', '3', '5', 'Strength day 2.'),
    row('Fri', 'Deadlift', 'RPE-selected load', '2', '3', 'Strength day 3.'),
    row('Sat', 'Backpack Carry', '20 kg', '1', '60 min', 'Endurance-only ruck day.'),
  ]);
  assert.deepEqual(strengthSessionAccountingFlags('', intake, p), []);
});

test('the hand-built Tactical 3K target is feasible under the complete final QA contract', () => {
  assert.doesNotThrow(() => validatePhase15FinalProgram(goldenProgram(), intake));
});
