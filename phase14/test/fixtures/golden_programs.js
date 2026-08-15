const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function weekBlock(week, rows) {
  return `START_WEEK${week}_TSV\n${HEADER}\n${rows.map((r) => r.join('\t')).join('\n')}\nEND_WEEK${week}_TSV`;
}

export const TACTICAL_3K_INTAKE = {
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
  pain: {
    active: false,
    description: '',
    severity: '',
    character: '',
    next_day_baseline: 'normal',
    tolerated_movements: 'Current 18-20 km/week running and one 8-10 km ruck with 20 kg are tolerated without symptoms.',
  },
  mobility: { active: false, limitation: '' },
  sport: '',
  sport_schedule: [],
  sleep_hours: '7-8',
  recovery_rating: 'good',
};

function tacticalWeek(week) {
  const rows = [
    ['Mon', 'Run', '5:30-6:00 / km', '1', '25 min', 'N/A', '3-4', 'Easy conversational run; preserve current run frequency and keep impact low.', ''],
    ['Mon', 'Back Squat', 'RPE-selected load', '3', '5', '3 min', '7', 'Strength maintenance; clean reps with reserve.', ''],
    ['Tue', 'Run', '1:42-1:45 / 400 m', '6', '400 m', '2 min', '7-8', '3K target pace interval session anchored to current repeatable 400 m performance.', ''],
    ['Wed', 'Weighted Pull-up', '+25 kg', '3', '5', '3 min', '7-8', 'Pulling-strength support below the demonstrated +30 kg x 5 benchmark.', ''],
    ['Wed', 'Pull-up', 'Bodyweight', '3', '8', '2 min', '7', 'Direct strict pull-up volume; stop before rep speed or position deteriorates.', ''],
    ['Fri', 'Run', '5:20-5:50 / km', '1', '40 min', 'N/A', '4-5', 'Long aerobic run at controlled effort; no extra conditioning afterward.', ''],
    ['Fri', 'Deadlift', 'RPE-selected load', '2', '3', '3 min', '7', 'Low-cost strength maintenance behind the 3K priority.', ''],
    ['Sat', 'Backpack Carry', '20 kg', '1', '70 min', 'N/A', '5', 'Direct ruck / loaded march at controlled walking pace; target pace 9:25-9:35 / km. Keep pack load stable and progress only one main ruck variable at a time.', ''],
  ];
  return weekBlock(week, rows);
}

export function tactical3KGoldenProgram() {
  return [
    'Tactical 3K block. Primary priority is the 3K; ruck and pull-up work remain direct, while barbell strength stays supportive.',
    'Weeks 2-4 preserve the same hierarchy and only progress a variable when recovery and shin response remain normal.',
    tacticalWeek(1), tacticalWeek(2), tacticalWeek(3), tacticalWeek(4),
  ].join('\n\n');
}

export const YOUTH_GYMNASTICS_INTAKE = {
  age: 13,
  primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
  secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
  days_per_week: 2,
  gym_availability_mode: 'flexible',
  available_gym_days: [],
  session_length: '60 min',
  training_location: 'home_gym',
  equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
  current_numbers: 'Pistol squat established; previously around +5 kg. Current program has no external weights.',
  clarification_answers: {
    benchmark_bar_muscle_up: 'Cannot perform a bar muscle-up yet. Can perform a ring muscle-up. About 12 strict pull-ups and 6 good ring dips.',
    benchmark_handstand: 'Wall-facing handstand about 15 seconds; back-to-wall about 20 seconds. Controlled kick-ups are improving, but there is no reliable unsupported balance time yet.',
  },
  injuries: 'None reported',
  pain: { active: false },
  notes: 'Athlete is 13 years old. Two structured sessions per week. Rings, pull-up bar, bands and bench only. No external weights.',
};

function youthWeek(week) {
  const rows = [
    ['Mon', '[WARMUP] Scapular Pull-up', 'BW', '2', '5', '45s', 'N/A', 'Short non-fatiguing shoulder/scapular preparation.', ''],
    ['Mon', 'Controlled Handstand Kick-up', 'BW', '4', '2 attempts', '60s', 'N/A', 'Primary handstand balance practice while fresh. Finish each attempt before alignment deteriorates.', ''],
    ['Mon', 'Band-Assisted Bar Muscle-up Transition Drill', 'BW + band', '4', '2', '90s', 'N/A', 'Direct bar muscle-up turnover practice. Use only enough assistance for clean symmetrical reps.', ''],
    ['Mon', 'Strict Chest-to-Bar Pull-up', 'BW', '4', '3', '2 min', '7', 'High-pull support for the bar muscle-up. Full recovery and chest-to-bar intent.', ''],
    ['Mon', 'Strict Ring Dip', 'BW', '3', '5', '2 min', '7', 'Push-strength support with clean ring control.', ''],
    ['Mon', 'Pistol Squat', 'BW', '3', '5 / side', '90s', '7', 'Established unilateral lower-body strength. Controlled reps; no grinders.', ''],
    ['Thu', '[WARMUP] Wrist Prep', 'BW', '2', '30 sec', '30s', 'N/A', 'Short wrist and shoulder preparation.', ''],
    ['Thu', 'Controlled Handstand Kick-up', 'BW', '5', '1-2 attempts', '60s', 'N/A', 'Direct independent-balance practice. Accumulate successful kick-ups, not fatigue.', ''],
    ['Thu', 'Band-Assisted Bar Muscle-up Transition Drill', 'BW + band', '4', '2', '90s', 'N/A', 'Second direct bar muscle-up exposure. Reduce assistance only when mechanics remain clean.', ''],
    ['Thu', 'Explosive Hip-to-Bar Pull-up', 'BW', '4', '2', '2 min', '7', 'Explosive vertical pulling support with full recovery.', ''],
    ['Thu', 'Strict Pull-up', 'BW', '3', '6', '2 min', '7', 'General pull strength support below fatigue failure.', ''],
    ['Thu', 'Strict Ring Dip', 'BW', '3', '5', '2 min', '7', 'General push strength support.', ''],
    ['Thu', 'Pistol Squat', 'BW', '3', '5 / side', '90s', '7', 'Lower-body athletic strength with repeatable technique.', ''],
  ];
  return weekBlock(week, rows);
}

export function youthGymnasticsGoldenProgram() {
  return [
    'Youth gymnastics block. Both primary skills are trained directly in both weekly sessions while fresh, with high-pull support, ring push/pull strength and controlled unilateral leg work.',
    'Weeks 2-4 progress execution quality and assistance only after clean successful reps; no grinders or repeated failed attempts.',
    youthWeek(1), youthWeek(2), youthWeek(3), youthWeek(4),
  ].join('\n\n');
}
