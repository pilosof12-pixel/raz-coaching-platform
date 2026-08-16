export const ADVANCED_HYBRID_LAUNCH_INTAKE = Object.freeze({
  age: 30,
  language: 'en',
  primary_goals: ['220kg back squat', '4 One arm pullups'],
  secondary_goals: ['100kg overhead press', 'Marathon'],
  maintenance_goals: ['Maintain muscle mass'],
  goal_priority_model: 'tiered_equal_primary',
  experience: 'advanced',
  days_per_week: 4,
  gym_availability_mode: 'limited',
  available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'],
  sport: 'MMA',
  sport_sessions_per_week: 5,
  sport_schedule: [
    { day: 'Tue', intensity: 'moderate' },
    { day: 'Wed', intensity: 'hard' },
    { day: 'Thu', intensity: 'moderate' },
    { day: 'Fri', intensity: 'hard' },
    { day: 'Sat', intensity: 'moderate' },
  ],
  sleep_hours: '7-8 hours',
  recovery_rating: 'Good',
  current_numbers: [
    'Back Squat: 205 kg 1RM',
    'One-Arm Pull-up: 2 strict reps each arm',
    'Overhead Press: 80 kg x 4',
    'Weighted Chin-up: +80 kg 1RM',
    'Running: 1 session a week, about 20 km total, longest recent run about 20 km',
  ].join('\n'),
  injuries: 'None reported',
  notes: 'Advanced hybrid athlete. Primary strength and calisthenics goals outrank the marathon side quest. Preserve MMA quality and recovery.',
});

const HEADER = 'Day\tExercise\tWeight\tSets\tReps\tRest\tTarget RPE\tNotes\tResults';

function rowsForWeek(week) {
  const squatHeavy = [180, 182.5, 185, 180][week - 1];
  const squatVolume = [160, 162.5, 165, 160][week - 1];
  const ohp = [70, 72.5, 75, 70][week - 1];
  const strictOapSets = [4, 5, 5, 4][week - 1];
  const assistedReps = ['2 / arm', '3 / arm', '2 / arm', '2 / arm'][week - 1];
  const runKm = [20, 20, 21, 18][week - 1];
  const runNote = week === 4
    ? 'Easy conversational long run. Consolidate durability; marathon remains secondary to strength and MMA quality.'
    : 'Easy conversational long run. Build marathon durability without adding hard intervals around five MMA sessions.';

  return [
    ['Mon', 'Back Squat', `${squatHeavy} kg`, week === 4 ? '2' : '3', '3', '4 min', '7.5-8', 'Primary squat strength. Stop before grinding.', ''],
    ['Mon', 'One-Arm Pull-up', 'BW', `${strictOapSets}`, '1 / arm', '2-3 min', '8', 'Primary OAP skill-strength. Clean full-ROM singles with one rep in reserve.', ''],
    ['Mon', 'Pallof Press', 'RPE-selected load', '2', '8 / side', '60s', '6-7', 'Low-cost trunk support; remove first if MMA fatigue is high.', ''],

    ['Tue', 'Overhead Press', `${ohp} kg`, week === 4 ? '2' : '3', week === 3 ? '4' : '5', '3 min', '7.5-8', 'Secondary strict OHP progression. Keep reps crisp before MMA.', ''],
    ['Tue', 'Bulgarian Split Squat', 'RPE-selected load', '2', '6 / side', '2 min', '7', 'Minimum useful unilateral hypertrophy/strength support.', ''],

    ['Wed', 'Run', 'Easy conversational pace', '1', `${runKm} km`, 'N/A', '4-5', runNote, ''],

    ['Fri', 'Back Squat', `${squatVolume} kg`, week === 4 ? '2' : '3', '5', '3 min', '7-8', 'Primary squat volume exposure. Technique and bar speed stay repeatable.', ''],
    ['Fri', 'Assisted One-Arm Pull-up', week === 3 ? 'Minimum clean assistance' : 'Light assistance', '3', assistedReps, '2 min', '7-8', 'Second direct OAP exposure. Reduce assistance only when both arms stay symmetrical.', ''],
    ['Fri', 'Dip', 'BW', '2', '6-8', '90s', '7', 'Small pressing/hypertrophy floor; first accessory to trim when MMA recovery is poor.', ''],

    ['Sun', 'Push Press', 'RPE-selected load', '3', '3', '3 min', '7', 'Low-volume second vertical-press exposure for strength reserve without another hard strict-OHP day.', ''],
    ['Sun', 'Weighted Chin-up', '+45 to +55 kg', '2', '4-5', '3 min', '7-8', 'Bilateral pulling reserve for OAP. Keep elbow/forearm fatigue low.', ''],
    ['Sun', 'Leg Curl', 'RPE-selected load', '2', '8-10', '90s', '7', 'Small posterior-chain hypertrophy dose; optional when recovery is limited.', ''],
  ];
}

export function advancedHybridLaunchProgram() {
  return [1, 2, 3, 4].map((week) => [
    `START_WEEK${week}_TSV`,
    HEADER,
    ...rowsForWeek(week).map((row) => row.join('\t')),
    `END_WEEK${week}_TSV`,
  ].join('\n')).join('\n\n');
}
