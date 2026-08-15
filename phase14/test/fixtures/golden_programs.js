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
  equipment: 'Full gym, track/road access, hills, pull-up bar, cable stack, 20 kg ruck/backpack, 30 kg sandbag and sled.',
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
  const easyMinutes = [25, 28, 30, 25][week - 1];
  const longMinutes = [40, 42, 45, 35][week - 1];
  const intervalSets = ['6', '7', '5', '6'][week - 1];
  const intervalReps = ['400 m', '400 m', '600 m', '400 m'][week - 1];
  const intervalLoad = ['1:42-1:45 / 400 m', '1:40-1:43 / 400 m', '2:32-2:36 / 600 m', '1:38-1:40 / 400 m'][week - 1];
  const weightedLoad = ['+25 kg', '+27.5 kg', '+30 kg', '+25 kg'][week - 1];
  const weightedReps = ['5', '4', '3', '5'][week - 1];
  const pullReps = ['8', '9', '10', '8'][week - 1];
  const ruckMinutes = ['70 min', '75 min', '75 min', '70 min'][week - 1];
  const ruckEffort = ['5', '5', '5', '5-6'][week - 1];
  const squatSets = ['3', '3', '3', '2'][week - 1];
  const squatReps = ['5', '5', '4', '3'][week - 1];
  const pushReps = ['15', '17', '20', '15'][week - 1];

  const rows = [
    ['Mon', 'Run', '5:30-6:00 / km', '1', `${easyMinutes} min`, 'N/A', week === 4 ? '3' : '3-4', 'Easy conversational run; preserve direct run frequency and keep impact comfortable.', ''],
    ['Mon', 'Back Squat', 'RPE-selected load', squatSets, squatReps, '3 min', week === 4 ? '6-7' : '7', 'Strength maintenance behind the 3K priority; no grinding.', ''],
    ['Mon', 'Push-up', 'Bodyweight', '3', pushReps, '60-90s', '6-7', 'Low-cost pushing GPP. Leave clear reserve so it does not compete with running or pulling priorities.', ''],
    ['Tue', 'Run', intervalLoad, intervalSets, intervalReps, week === 3 || week === 4 ? '2.5-3 min' : '2 min', week === 4 ? '8' : '7-8', '3K-specific interval session. Keep every rep repeatable and add easy running before and after.', ''],
    ['Wed', 'Weighted Pull-up', weightedLoad, week === 4 ? '2' : '3', weightedReps, '3 min', week === 3 ? '8' : '7-8', 'Primary pulling-strength progression anchored to the demonstrated +30 kg x 5 benchmark.', ''],
    ['Wed', 'Pull-up', 'Bodyweight', '2', pullReps, '2 min', week === 3 ? '7-8' : '7', 'Direct strict pull-up capacity work; stop before rep speed or position deteriorates.', ''],
    ['Wed', 'Pallof Press', 'RPE-selected load', '2', '10 / side', '60s', '6', 'Small trunk GPP dose for anti-rotation capacity. Keep it crisp and low fatigue.', ''],
    ['Fri', 'Run', '5:20-5:50 / km', '1', `${longMinutes} min`, 'N/A', week === 4 ? '3-4' : '4-5', 'Long aerobic run at controlled effort; no extra hard conditioning afterward.', ''],
    ['Fri', 'Deadlift', 'RPE-selected load', '2', '3', '3 min', week === 4 ? '6-7' : '7', 'Low-cost posterior-chain strength maintenance.', ''],
    ['Sat', 'Backpack Carry', '20 kg', '1', ruckMinutes, 'N/A', ruckEffort, week === 4
      ? 'Direct ruck / loaded march. With running volume reduced, allow a modest pace progression toward 9:10-9:25 / km only if shin response remains normal.'
      : 'Direct ruck / loaded march at controlled walking pace around 9:25-9:35 / km. Keep pack load stable and progress only one main ruck variable at a time.', ''],
  ];
  return weekBlock(week, rows);
}

export function tactical3KGoldenProgram() {
  return [
    'Tactical 3K block. The 3K remains primary; ruck and pull-up goals progress directly, barbell strength stays supportive, and a small pushing/trunk GPP floor preserves general preparedness.',
    'The GPP dose is deliberately smaller than the priority work and is the first volume trimmed if running, rucking, pulling quality or recovery deteriorates.',
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
  const kickA = ['4', '5', '6', '4'][week - 1];
  const kickB = ['5', '5', '6', '4'][week - 1];
  const ctbSets = ['4', '4', '4', '3'][week - 1];
  const ctb = ['3', '4', '4', '4'][week - 1];
  const ringSets = ['3', '3', '3', '2'][week - 1];
  const ring = ['5', '6', '7', '6-7'][week - 1];
  const pullSets = ['3', '3', '3', '2'][week - 1];
  const pull = ['6', '7', '8', '7-8'][week - 1];
  const pistolSets = ['3', '3', '3', '2'][week - 1];
  const pistol = ['5 / side', '6 / side', '7 / side', '6-7 / side'][week - 1];
  const transitionSets = ['4', '4', '4', '3'][week - 1];
  const explosiveSets = ['4', '4', '4', '3'][week - 1];
  const band = [
    'BW + moderate band',
    'BW + slightly lighter band if all Week 1 reps were clean',
    'BW + lightest band that preserves a fast symmetrical turnover',
    'BW + retain the Week 3 lightest clean band; test one lighter-band single only if crisp',
  ][week - 1];

  const rows = [
    ['Mon', '[WARMUP] Scapular Pull-up', 'BW', '2', '5', '45s', 'N/A', 'Short non-fatiguing shoulder/scapular preparation.', ''],
    ['Mon', 'Controlled Handstand Kick-up', 'BW', kickA, '2 attempts', '60s', 'N/A', week === 4
      ? 'Use the best Week 3 entry pattern. Match or improve the best clean unsupported balance quality/time with fewer total attempts; stop before misses accumulate.'
      : 'Primary handstand balance practice while fresh. Progress successful entries and independent balance quality, not fatigue.', ''],
    ['Mon', 'Band-Assisted Bar Muscle-up Transition Drill', band, transitionSets, '2', '90s', 'N/A', week === 4
      ? 'Keep the reduced assistance earned in Weeks 2-3. Lower total volume, but do not return to the Week 1 band unless technique requires it.'
      : 'Direct bar muscle-up turnover practice. Reduce assistance only after clean symmetrical reps.', ''],
    ['Mon', 'Strict Chest-to-Bar Pull-up', 'BW', ctbSets, ctb, '2 min', '7', week === 4
      ? 'Keep the Week 3 rep standard with one fewer set. Every rep should reach the same height and control.'
      : 'High-pull support for the bar muscle-up. Full recovery and chest-to-bar intent.', ''],
    ['Mon', 'Strict Ring Dip', 'BW', ringSets, ring, '2 min', '7', week === 4
      ? 'Maintain the higher rep standard from Weeks 2-3 while reducing total sets. Leave clear reserve.'
      : 'Push-strength support with clean ring control. Progress reps before making the variation harder.', ''],
    ['Mon', 'Pistol Squat', 'BW', pistolSets, pistol, '90s', '7', week === 4
      ? 'Maintain the progressed Week 2-3 rep standard with lower total volume. Clean depth and control; no grinders.'
      : 'Established unilateral lower-body strength. Progress clean reps conservatively; no grinders.', ''],
    ['Thu', '[WARMUP] Wrist Prep', 'BW', '2', '30 sec', '30s', 'N/A', 'Short wrist and shoulder preparation.', ''],
    ['Thu', 'Controlled Handstand Kick-up', 'BW', kickB, '1-2 attempts', '60s', 'N/A', week === 4
      ? 'Express the best Week 3 balance skill. Prioritize successful independent entries and best clean balance rather than adding attempts.'
      : 'Second direct independent-balance exposure. Accumulate successful kick-ups and better balance, not fatigue.', ''],
    ['Thu', 'Band-Assisted Bar Muscle-up Transition Drill', band, transitionSets, '2', '90s', 'N/A', week === 4
      ? 'Preserve the lighter assistance achieved in Week 3. This is a quality consolidation exposure, not a return to baseline assistance.'
      : 'Second direct bar muscle-up exposure. Preserve bar path and turnover mechanics before reducing assistance.', ''],
    ['Thu', 'Explosive Hip-to-Bar Pull-up', 'BW', explosiveSets, week === 3 ? '3' : '2', '2 min', '7', week === 4
      ? 'Lower the volume but match or exceed Week 3 pull height and speed. Stop immediately if explosiveness drops.'
      : 'Explosive vertical pulling support with full recovery. Stop if height or speed drops.', ''],
    ['Thu', 'Strict Pull-up', 'BW', pullSets, pull, '2 min', '7', week === 4
      ? 'Retain the improved rep standard from Weeks 2-3 with fewer sets. Finish with 2-3 clean reps still in reserve.'
      : 'General pull strength support below fatigue failure. Use conservative rep progression.', ''],
    ['Thu', 'Strict Ring Dip', 'BW', ringSets, ring, '2 min', '7', week === 4
      ? 'Maintain the higher-quality Week 2-3 rep level while reducing total fatigue.'
      : 'General push strength support. Progress clean reps before difficulty.', ''],
    ['Thu', 'Pistol Squat', 'BW', pistolSets, pistol, '90s', '7', week === 4
      ? 'Maintain the progressed Week 2-3 rep standard with fewer sets and excellent control.'
      : 'Lower-body athletic strength with repeatable technique and no grinders.', ''],
  ];
  return weekBlock(week, rows);
}

export function youthGymnasticsGoldenProgram() {
  return [
    'Youth gymnastics block. Both primary skills are trained directly in both weekly sessions while fresh, with high-pull support, ring push/pull strength and controlled unilateral leg work.',
    'Progression is explicit but conditional: improve successful handstand balance, reduce muscle-up assistance, and build clean foundation reps before increasing difficulty. Week 4 reduces fatigue while preserving the higher clean performance standard earned in Weeks 2-3.',
    youthWeek(1), youthWeek(2), youthWeek(3), youthWeek(4),
  ].join('\n\n');
}
