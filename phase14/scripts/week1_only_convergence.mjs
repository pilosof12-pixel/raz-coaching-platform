// One-shot QA / stress test: can the engine repeatedly turn a damaged program
// into a releasable one, without asking the model to try again?
//
// Every live failure this project has had took the same shape. A defect reached
// the QA chain, no deterministic repair existed for it, and the only remedy was
// regeneration -- which costs an attempt, three minutes and a paid API call, and
// frequently produced the same defect again until the attempt budget ran out.
//
// So the question that predicts live behaviour is not "is this program good?"
// but "when this defect appears, does the engine fix it or does it ask again?".
// That question can be answered offline, for free, and repeatably.
//
// Each coach-reviewed program is damaged in the exact ways live runs have failed,
// then put through the real repair and validation bundle. A perturbation that
// converges would have cost nothing live; one that does not would have cost an
// attempt.
//
//   node scripts/stress_test_convergence.mjs          full report
//   node scripts/stress_test_convergence.mjs --quiet  verdict only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repairDeterministicContradictions } from '../engine/v35_deterministic_repair.js';
import { collectRepairableValidationFailures } from '../engine/repairable_validation_bundle.js';
import { auditProgramStructure } from '../engine/v38_structural_audit.js';
import { collectRecoveryBudgetFlags } from '../engine/v42_recovery_budget.js';
import { collectProgressionDisciplineFlags } from '../engine/v42_progression_discipline.js';
import { collectGovernanceFlags } from '../engine/v43_coaching_governance.js';
import { collectAllV34ConsistencyFlags } from '../engine/v34_prescription_consistency.js';
import { collectCoachingStandardFlags } from '../engine/v35_coaching_standards.js';
import { collectLanguageAccuracyFlags } from '../engine/v46_language_accuracy.js';
import { collectSpecGapFlags } from '../engine/v49_spec_gap_rules.js';
import { gradeProgram } from '../engine/coach_rules.js';
import { RACE_BLOCK_RULES } from '../engine/coach_race_block_rules.js';
import { EVENT_COMPONENT_RULES } from '../engine/event_component_rules.js';
import { DEDUCTIONS } from '../engine/coach_standard.js';

// What the coach would charge, rather than what the engine thinks of itself.
//
// The rubric this suite reported as its quality gate answers 9.8 for every
// program it has ever been shown, including the one the coach scored 7.6 and
// including a copy of that program with every load and pace stripped out. A
// gate that cannot fail is not a gate, and "holds 9+" passing on all four
// avatars was the reason nobody looked.
//
// Severity is his own deduction table summed over what the graders find. It is
// not a score -- turning findings into a score needs dimension judgement, which
// is the step this deliberately does not fake -- but it moves when a program
// gets worse, which is the entire job of a regression gate.
const COACH_COST = {
  BENCHMARK_UNEXPOSED: 'BENCHMARKED_MOVEMENT_UNEXPOSED',
  INTENSIFICATION_BAND_NOT_REACHED: 'PROGRESSION_SHORT_OF_REQUIRED_INTENSITY',
  GOAL_SPEED_NOT_APPROACHED: 'PROGRESSION_SHORT_OF_REQUIRED_INTENSITY',
  STATED_PROGRESSION_ABSENT: 'TOLERATED_BASELINE_NOT_REBUILT',
  GOAL_DISTANCE_BELOW_TOLERANCE: 'GOAL_DISTANCE_REDUCED_DESPITE_TOLERANCE',
  CONSECUTIVE_TRAINING_DAYS: 'AVOIDABLE_CONSECUTIVE_DAY_CLUSTERING',
  CONSECUTIVE_LOWER_LEG_DAYS: 'AVOIDABLE_CONSECUTIVE_DAY_CLUSTERING',
  CONTINGENCY_CREATES_ADJACENT_DUPLICATE: 'CONTINGENCY_CREATES_DUPLICATE',
  SPORT_STATE_MISDESCRIBED: 'TEXT_CONTRADICTS_TABLE',
  UNSUPPORTED_ATHLETE_FACT: 'UNSUPPORTED_ATHLETE_FACT',
  IMPROVEMENT_GOAL_FLAT: 'IMPROVEMENT_GOAL_UNCHANGED_ALL_BLOCK',
  PRIMARY_LOAD_UNANCHORED: 'LOADING_PRESCRIPTION_UNANCHORED',
  // His own deduction for this, which had no rule pointing at it. The finding
  // fired seventeen times across the corpus -- the single most common defect we
  // record -- and cost nothing, so a program could carry all seventeen and still
  // measure clean. Same failure as the footballer's sprint findings: the defect
  // was detected, reported and charged at zero.
  ACCESSORY_REDUNDANCY: 'ACCESSORY_LOW_MARGINAL_RETURN',
  // The event-component form of the unanchored load already mapped just above.
  COMPONENT_LOAD_UNANCHORED: 'LOADING_PRESCRIPTION_UNANCHORED',
  TRAINING_DAYS_VS_INTAKE: 'INTAKE_INTERPRETATION_UNSTATED',
  DAY_MINUS_ONE_STACKED: 'REDUNDANT_COMPETITION_WEEK_EXPOSURE',
  SPORT_SCHEDULE_CHANGED_SILENTLY: 'SPORT_SCHEDULE_SILENTLY_CHANGED',
  TAPER_INTRODUCES_POWER_VOLUME: 'TAPER_INTRODUCES_NEW_EMPHASIS',
  BORROWED_SPORT_LANGUAGE: 'COACHING_LANGUAGE_FROM_ANOTHER_SPORT',
  MODALITY_SUBSTITUTION_KEEPS_THE_NUMBER: 'PRESCRIPTION_SURVIVES_MODALITY_CHANGE',
  EVENT_COMPONENT_COVERAGE_WEEK1: 'EVENT_COMPONENT_COVERAGE_INCOMPLETE',
  EVENT_COMPONENT_NEVER_TRAINED: 'EVENT_COMPONENT_COVERAGE_INCOMPLETE',
  BENCHMARKED_COMPONENT_NEGLECTED: 'EVENT_COMPONENT_COVERAGE_INCOMPLETE',
  COMPROMISED_RUNNING_MISSING: 'COMPROMISED_WORK_MISSING',
  RACE_REHEARSAL_MISSING: 'COMPROMISED_WORK_MISSING',
  ACCESSORY_REDUNDANCY: 'ACCESSORY_REDUNDANCY',
  REPEATED_SPRINT_EXPOSURE_MISSING: 'REPEATED_SPRINT_DEFINITION_UNMET',
  SPRINT_SPEED_EXPOSURE_MISSING: 'SPRINT_GOAL_UNTRAINED',
  SPRINT_DISTANCE_BELOW_BENCHMARK: 'SPRINT_GOAL_UNTRAINED',
  REPEATED_SPRINT_PROGRESSION_ABSENT: 'REPEATED_SPRINT_DEFINITION_UNMET',
};
function coachSeverity(program, intake) {
  const found = [...gradeProgram(program, intake)];
  for (const fn of [...RACE_BLOCK_RULES, ...EVENT_COMPONENT_RULES]) {
    try { found.push(...(fn(program, intake) || [])); } catch { /* a rule that throws is not a verdict */ }
  }
  return found.reduce((n, f) => n + (DEDUCTIONS[COACH_COST[f.rule || f.code]]?.typical ?? 0), 0);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = (n) => fs.readFileSync(path.join(root, '..', 'test', 'fixtures', `${n}-program.txt`), 'utf8');
const quiet = process.argv.includes('--quiet');

export const INTAKES = {
  // The two newest avatars had no stress coverage at all, and every dead gate
  // found on 2026-10-02 belonged to them or to the youth gymnast: race
  // components counted as gym days, an interval's warm-up read as Zone 2, a
  // consolidated interval session dropping below the exposure floor. Each was
  // found by a paid live run that delivered DIRTY or nothing, after four
  // identical refusals. This suite exists to find exactly that for free, and it
  // had never been asked about these two athletes.
  //
  // The fixtures are the delivered programs from runs #161 and #160, both clean
  // through the production bundle, so the undamaged control starts clean. The
  // race is 56 days out: outside the four-week block in every direction, so no
  // week-boundary arithmetic can make the control drift with the calendar.
  sprint_triathlete: {
    competition_date: new Date(Date.now() + 56 * 86400000).toISOString().slice(0, 10),
    "event_type": "triathlon",
    "event_priority": "A",
    "age": 38,
    "language": "en",
    "experience": "Intermediate (1-3 years)",
    "bodyweight": "61 kg",
    "primary_goals": [
      "Go sub-1:15 at the sprint triathlon in 8 weeks, from a current 1:22"
    ],
    "secondary_goals": [
      "Stop losing time in the swim: 750 m from 16:10 toward 14:30",
      "Hold squat and single-leg strength through the build"
    ],
    "maintenance_goals": [
      "Keep the trunk and hip work that has kept the achilles quiet"
    ],
    "goal_priority_model": "tiered",
    "days_per_week": 2,
    "session_duration_minutes": 75,
    "gym_availability_mode": "limited",
    "available_gym_days": [
      "Tue",
      "Fri"
    ],
    "training_location": "commercial_gym",
    "equipment": "25 m pool with pull buoy and paddles, road bike plus indoor trainer with power, full gym, treadmill and road access.",
    "sport": "Triathlon (sprint distance)",
    "sport_sessions_per_week": 7,
    "sport_schedule": [
      {
        "day": "Mon",
        "type": "Run intervals",
        "intensity": "hard"
      },
      {
        "day": "Tue",
        "type": "Swim",
        "intensity": "moderate"
      },
      {
        "day": "Wed",
        "type": "Run easy",
        "intensity": "light"
      },
      {
        "day": "Thu",
        "type": "Bike",
        "intensity": "moderate"
      },
      {
        "day": "Fri",
        "type": "Swim technique",
        "intensity": "light"
      },
      {
        "day": "Sat",
        "type": "Bike long",
        "intensity": "hard"
      },
      {
        "day": "Sun",
        "type": "Run long",
        "intensity": "moderate"
      }
    ],
    "sleep_hours": "6-7, broken about twice a week",
    "recovery_rating": "Moderate",
    "current_numbers": "Sprint triathlon: 1:22 (750 m swim 16:10, 20 km bike 38:40, 5 km run 24:30)\n5 km standalone: 23:05\n20 km bike time trial: 38:40 at about 185 W\n750 m swim: 16:10\nBack Squat: 75 kg x 5\nSingle-leg calf raise: 18 reps right, 24 left\nCurrently 2 swims, 2 rides and 3 runs a week, about 22-25 km of running",
    "performance_markers": [
      "Sprint triathlon: 1:22",
      "750 m swim: 16:10",
      "5 km run: 24:30"
    ],
    "injuries": "Right achilles tendinopathy 14 months ago after adding two running days in one week. Currently symptom-free at the present running volume, but it stiffens the morning after hill running or any sudden jump in volume.",
    "pain": {
      "active": false,
      "description": "No pain at present; occasional right achilles stiffness the morning after hills",
      "severity": "",
      "character": "",
      "next_day_baseline": "normal",
      "tolerated_movements": "Current 22-25 km per week of running across three runs is tolerated. Hill repeats and consecutive running days are not. Bike and swim volume cause no symptoms. Heavy slow calf loading is tolerated and has helped."
    },
    "mobility": {
      "active": false,
      "limitation": ""
    },
    "notes": "The race is 8 weeks out, so this four-week block is the middle of the build and is NOT the taper. The swim is the weakest leg by a distance and the one she loses most time in, and it is also the cheapest leg to recover from. The run is the leg the achilles limits. If something has to give, hold the bike rather than developing it. Works full time with two young children. She trains seven times a week but only TWO of those are gym sessions, fixed on Tuesday and Friday, and both land on a running day. The swim, bike and run sessions are the sport week and are listed in sport_schedule; do not convert a gym day into a cardio day or count a swim as a strength session. No two running days are consecutive, which is deliberate: the achilles tolerates the current three runs and does not tolerate back-to-back ones. The two gym days carry the swims rather than the hard run or the long ride, because easy low-intensity work sits closer to lifting at a lower acute cost than hard intervals do. Do not prescribe rehabilitation: the achilles is asymptomatic and she wants to race."
  },
  inseason_basketball: {
    "age": 24,
    "language": "en",
    "experience": "Advanced (3+ years)",
    "bodyweight": "88 kg",
    "primary_goals": [
      "Stay available for every fixture through the second half of the season"
    ],
    "secondary_goals": [
      "Hold repeated jump height late in games rather than fading in the fourth quarter",
      "Maintain lower-body strength through the season"
    ],
    "maintenance_goals": [
      "Maintain upper-body pressing and pulling"
    ],
    "goal_priority_model": "tiered",
    "days_per_week": 2,
    "session_duration_minutes": 45,
    "gym_availability_mode": "limited",
    "available_gym_days": [
      "Mon",
      "Thu"
    ],
    "training_location": "commercial_gym",
    "equipment": "Team gym: barbell, rack, dumbbells, trap bar, plyo boxes, bands, sled.",
    "sport": "Basketball, semi-professional",
    "sport_sessions_per_week": 6,
    "sport_schedule": [
      {
        "day": "Mon",
        "intensity": "moderate"
      },
      {
        "day": "Tue",
        "intensity": "hard"
      },
      {
        "day": "Wed",
        "intensity": "match"
      },
      {
        "day": "Thu",
        "intensity": "moderate"
      },
      {
        "day": "Fri",
        "intensity": "light"
      },
      {
        "day": "Sat",
        "intensity": "match"
      }
    ],
    "sleep_hours": "7-8",
    "recovery_rating": "Moderate in a two-game week",
    "current_numbers": "Back Squat: 150 kg x 3\nTrap Bar Deadlift: 180 kg x 3\nCountermovement jump: 61 cm fresh, 52 cm in the fourth quarter\nBench Press: 100 kg x 5\nChin-up: bodyweight x 12\nCurrently 4 team practices and 2 games most weeks",
    "performance_markers": [
      "Countermovement jump: 61 cm fresh, 52 cm late in games"
    ],
    "season_phase": "in-season",
    "injuries": "Right patellar tendinopathy, managed for two seasons. It flares with heavy slow squatting the day before a game and in back-to-back game weeks, never with jumping itself.",
    "pain": {
      "active": true,
      "description": "Right patellar tendon, 2-3/10 on stairs the morning after a game week",
      "severity": "2-3/10, activity-related",
      "character": "localised, warms up within ten minutes",
      "next_day_baseline": "returns to baseline by the second day",
      "tolerated_movements": "Jumping, sprinting, split squats and trap bar pulling are all tolerated. Heavy slow back squat within 48 hours of a game is not. Isometric holds have reliably reduced symptoms."
    },
    "mobility": {
      "active": false,
      "limitation": ""
    },
    "clarification_answers": {
      "running_current_exposure": "No separate running programme at all. Court volume only: 4 team practices and 2 games a week, roughly 25 km of running across the week, all of it on court in short accelerations rather than steady running."
    },
    "notes": "In-season block with no event to peak for: there is a game every Wednesday and Saturday and the season runs past this block, so he has to be ready every week. Matchday minus one is Tuesday and Friday. Two 45-minute gym slots, Monday and Thursday, both the day after a game. The fourth-quarter jump drop-off is the thing the coaching staff actually want fixed. Do not add conditioning: he gets plenty from practice."
  },
  // The avatar that has caused every latency problem and killed four live
  // builds was the one avatar this suite did not cover. Ten athletes were
  // perturbed and checked for convergence; the Hyrox racer was not among them,
  // so the question this suite exists to answer -- does a defect get repaired,
  // or does it cost a regeneration -- had never been asked of the athlete that
  // regenerates. The fixture is run #119's delivered program, which passes the
  // bundle with zero flags, so the undamaged control starts clean.
  dual_event_hyrox: {
    age: 33, language: 'en', experience: 'Advanced (3+ years)', bodyweight: '76 kg',
    // Twenty-five days: the middle of the measured plateau that keeps the race
    // inside week 4 whatever day the suite runs on.
    competition_date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
    event_type: 'hybrid_race', event_priority: 'A',
    primary_goals: ['Podium in my age group at the Hyrox race in 4 weeks'],
    secondary_goals: ['Run a half marathon two weeks after Hyrox without wrecking myself for it'],
    maintenance_goals: ['Hold my squat and pulling strength through both'],
    goal_priority_model: 'tiered', days_per_week: 4, session_duration_minutes: 75,
    gym_availability_mode: 'flexible', available_gym_days: [], training_location: 'commercial_gym',
    equipment: 'Full gym: sled, ski erg, rower, wall ball, sandbags, barbells, dumbbells, kettlebells.',
    sport: 'Hyrox', sport_sessions_per_week: 2, sport_schedule: [],
    sleep_hours: '7', recovery_rating: 'Good',
    current_numbers: 'Back Squat: 150 kg x 1\nDeadlift: 190 kg x 1\n5 km run: 19:40\nHalf marathon PB: 1:28 (two years ago)\n1 km ski erg: 3:38\nCurrently 4 sessions a week plus 2 runs',
    performance_markers: ['5 km: 19:40', 'Half marathon: 1:28'],
    injuries: 'Left achilles grumbles after back-to-back running days; settles with a day off.',
    pain: { active: false }, mobility: { active: false, limitation: '' },
  },
  advanced_hybrid: {
    age: 30, language: 'en',
    primary_goals: ['220kg back squat', '4 One arm pullups'],
    secondary_goals: ['100kg overhead press', 'Marathon'],
    maintenance_goals: ['Maintain muscle mass'],
    goal_priority_model: 'tiered_equal_primary', experience: 'advanced',
    days_per_week: 4, gym_availability_mode: 'limited',
    available_gym_days: ['Mon', 'Tue', 'Fri', 'Sun'], training_location: 'commercial_gym',
    sport: 'MMA', sport_sessions_per_week: 5,
    sport_schedule: [
      { day: 'Tue', intensity: 'moderate' }, { day: 'Wed', intensity: 'hard' },
      { day: 'Thu', intensity: 'moderate' }, { day: 'Fri', intensity: 'hard' },
      { day: 'Sat', intensity: 'moderate' },
    ],
    current_numbers: ['Back Squat: 205 kg 1RM', 'One-Arm Pull-up: 2 strict reps each arm',
      'Overhead Press: 80 kg x 4', 'Weighted Chin-up: +80 kg 1RM'].join('\n'),
    notes: 'Running: 1 session a week, about 20 km total.',
    injuries: 'None reported', recovery_rating: 'Good',
  },
  youth_gymnastics: {
    age: 13, language: 'en', experience: 'intermediate',
    primary_goals: ['Achieve first bar muscle-up', 'Achieve a freestanding handstand'],
    secondary_goals: ['Build a strong general push and pull foundation while maintaining lower-body athleticism'],
    days_per_week: 2, session_length: '60 min', gym_availability_mode: 'flexible',
    available_gym_days: [], training_location: 'home_gym',
    equipment: 'Home setup: rings, pull-up bar, resistance bands and bench. No external weights.',
    injuries: 'None reported', sport_schedule: [], recovery_rating: 'Good',
  },
  tactical_3k: {
    age: 27, language: 'en', experience: 'advanced',
    primary_goals: ['Improve 3 km from 13:30 to sub-12:00'],
    secondary_goals: ['Improve 10 km ruck with 20 kg from 95 min toward 82 min', 'Improve strict pull-ups from 14 toward 18-20'],
    maintenance_goals: ['Maintain useful squat and deadlift strength while staying athletic'],
    days_per_week: 3, session_duration_minutes: 60, gym_availability_mode: 'flexible',
    available_gym_days: [], training_location: 'commercial_gym',
    current_numbers: ['3 km: 13:30', '10 km ruck with 20 kg: 95 min', 'Back Squat: 140 kg x 5',
      'Deadlift: 180 kg x 3', 'Overhead Press: 65 kg x 5', 'Weighted Pull-up: +30 kg x 5',
      'Strict Pull-ups: 14 reps'].join('\n'),
    notes: 'Currently runs 3 sessions per week, about 18-20 km/week. Recent 400 m repeats are around 1:42-1:45.',
    injuries: 'Previous shin-splint irritation with abrupt running-volume increases; currently asymptomatic.',
    sport_schedule: [], recovery_rating: 'Good',
  },
};

// The competition, in-season and return avatars were built after this harness
// was written, and were never stress-tested: the three above are the only ones
// it has ever covered. Their intakes are read out of the live acceptance
// workflow rather than copied, so an avatar cannot pass here against a
// definition of the athlete that differs from the one it is run with.
const WORKFLOW = path.join(root, '..', '..', '.github', 'workflows', 'live-three-avatar-acceptance.yml');
function workflowIntake(constName) {
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  const seg = src.slice(src.indexOf(`const ${constName}=`));
  const literal = seg.match(/\{"age"[\s\S]*?"qa_diagnostics": true\}/);
  if (!literal) throw new Error(`stress: cannot read intake ${constName} from the acceptance workflow`);
  return JSON.parse(literal[0]);
}
const inWeeks = (w) => new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10);
// The event has to sit clear of a week boundary, not merely on a Saturday.
//
// Which block week an event falls in is computed from the HOURS to the event,
// so a date 22 days out is in week 4 at midnight and in week 3 by late
// afternoon. This suite pinned the fight to "the Saturday four weeks out",
// landed on day 22, and began failing every fight-camp perturbation at 15:30
// with no source change behind it.
//
// The repair chain reads Date.now() itself and takes no clock, so the date has
// to stay relative to real time. The fix is margin: take the first Saturday at
// least 23 days out, which is inside week 4 at every hour of the day.
const WEEK4_SAFE_DAYS = 23;
const onSaturday = () => {
  const d = new Date(Date.now() + WEEK4_SAFE_DAYS * 86400000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const dayBefore = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const FIGHT_DAY = onSaturday();

Object.assign(INTAKES, {
  weightlifter_peak: {
    ...workflowIntake('weightlifter'),
    competition_date: inWeeks(8), event_type: 'strength_meet', event_priority: 'A',
  },
  weightlifter_meet_week: {
    ...workflowIntake('lifterMeet'),
    competition_date: inWeeks(4), event_type: 'strength_meet', event_priority: 'A',
  },
  mma_fight_camp: {
    ...workflowIntake('mmacamp'),
    competition_date: FIGHT_DAY, weigh_in_date: dayBefore(FIGHT_DAY),
    event_type: 'combat', event_priority: 'A',
    weight_class_status: 'difficult', weight_vs_class: '81 kg now, 77 kg class',
  },
  inseason_footballer: workflowIntake('footballer'),
  masters_return: workflowIntake('masters'),
  // The postpartum return is the only athlete whose progression is measured in
  // time on feet rather than pace. The Hebrew lifter that used to sit beside it
  // went with Hebrew.
  postpartum_runner: workflowIntake('postpartum'),
});

// Each perturbation reproduces a defect that has actually failed a live run.
// `applies` keeps a perturbation off avatars where it is meaningless.
const PERTURBATIONS = [
  {
    id: 'false-reduction-claim', seen: 'run #63 Youth, four attempts',
    apply: (p) => p.replace(/\t([^\t]*?)\t\n/, '\tHold the same dose with slightly less total work.\t\n'),
  },
  {
    id: 'unverifiable-load-reference', seen: 'runs #66 and #69 Hybrid, attempt 1',
    apply: (p) => p.replace(/(\n[A-Za-z][^\t]*\t[^\t]+\t[^\t]*\t\d+\t[^\t]*\t[^\t]*\t[^\t]*\t)([^\t]+)/,
      (m, head, note) => `${head}${note} Build toward your +99 kg standard from the last block.`),
  },
  {
    id: 'heavy-ramp-stripped', seen: 'run #67 Hybrid, four attempts',
    apply: (p) => p.replace(/Ramp [^;\t]*?work sets\./g, 'General prep.'),
  },
  {
    id: 'narrative-overclaims-build', seen: 'run #65 Hybrid, four attempts',
    apply: (p) => `The long run builds steadily across the block.\n\n${p}`,
  },
  {
    id: 'miscounted-session-claim', seen: 'coach review, language QA',
    apply: (p) => `You have nine structured sessions each week.\n\n${p}`,
  },
  {
    id: 'skill-ceiling-stripped', seen: 'coach review, item 11',
    applies: ['youth_gymnastics'],
    apply: (p) => p.replace(/ceiling, not a quota[^\t]*/g, 'Complete all prescribed attempts.')
                   .replace(/stop earlier if[^\t.]*\./gi, ''),
  },
  {
    id: 'strict-exposure-removed', seen: 'run #84 Hybrid, three attempts',
    applies: ['advanced_hybrid'],
    apply: (p) => p.split('\n').filter((l) => !/^\w+\tOne-Arm Pull-up\t/.test(l)).join('\n'),
  },
  {
    id: 'secondary-volume-creep', seen: 'run #87 Hybrid, four attempts',
    applies: ['advanced_hybrid'],
    apply: (p) => {
      const lines = p.split('\n');
      const end = lines.findIndex((l) => /END_WEEK1_TSV/.test(l));
      return lines.map((l, i) => {
        if (i <= end) return l;
        const c = l.split('\t');
        if (c.length > 6 && /^(Cable Row|Chest-Supported Row|Face Pull)$/i.test((c[1] || '').trim())) {
          const n = Number(String(c[3]).match(/\d+/)?.[0]);
          if (Number.isFinite(n)) c[3] = String(n + 3);
        }
        return c.join('\t');
      }).join('\n');
    },
  },
  {
    id: 'week4-not-consolidating', seen: 'run #87 Hybrid, attempt 3',
    apply: (p) => {
      const m = p.match(/(START_WEEK4_TSV\s*\n)([\s\S]*?)(\nEND_WEEK4_TSV)/i);
      if (!m) return p;
      const rows = m[2].split('\n').map((l) => {
        const c = l.split('\t');
        if (c.length > 6) {
          const n = Number(String(c[3]).match(/\d+/)?.[0]);
          if (Number.isFinite(n)) c[3] = String(n + 2);
        }
        return c.join('\t');
      }).join('\n');
      return p.replace(m[0], `${m[1]}${rows}${m[3]}`);
    },
  },
  {
    id: 'assisted-exposure-removed', seen: 'runs #66 and #69 Hybrid, four attempts each',
    applies: ['advanced_hybrid'],
    apply: (p) => p.split('\n').filter((l) => !/\tAssisted One-Arm Pull-up\t/.test(l)).join('\n'),
  },
  {
    id: 'optional-finisher-added', seen: 'AH extra-conditioning gate',
    applies: ['advanced_hybrid'],
    apply: (p) => p.replace('END_WEEK1_TSV', 'Sun\tSprint Intervals\tBodyweight\t6\t100 m\t2 min\t9\tFinisher.\t\nEND_WEEK1_TSV'),
  },
  {
    id: 'run-above-demonstrated-baseline', seen: 'AH run-baseline gate',
    applies: ['advanced_hybrid'],
    apply: (p) => p.replace(/\tRun\tN\/A\t1\t\d+(\.\d+)? km\t/, '\tRun\tN/A\t1\t34 km\t'),
  },
  {
    id: 'pull-stacked-on-adjacent-day', seen: 'run #74 Hybrid, four attempts',
    applies: ['advanced_hybrid'],
    apply: (p) => p.replace(/(Tue\tCable Row\t[^\n]*\n)/,
      '$1Tue\tLat Pulldown\tRPE-selected load\t3\t10\t90 sec\t7\tUpper-back volume.\t\n'),
  },
  {
    id: 'maintenance-lift-drifts-up', seen: 'coach review, item 13',
    applies: ['tactical_3k'],
    apply: (p) => p.replace(/(START_WEEK2_TSV[\s\S]*?)(\t)(\d+)( kg\t)/, (m, a, t, kg, u) => `${a}${t}${Number(kg) + 25}${u}`),
  },

  // --- defects the competition, in-season and return blocks actually failed on
  // this session. Each one cost a live attempt, a coach rating, or both.

  {
    id: 'repeated-doubles-in-comp-week', seen: 'run #104 meet week, coach 9.0',
    applies: ['weightlifter_meet_week'],
    // The ballistic swap promoted the competition lift as a "familiar primer"
    // and carried its mid-block dose into the meet week: Snatch 5 x 2 at RPE 7.
    apply: (p) => p.replace(/(START_WEEK4_TSV[\s\S]*?)\n(Day -4\t)([^\t]+)(\t[^\t]*\t)\d+(\t)\d+/,
      (m, head, day, name, load, tab) => `${head}\n${day}Snatch${load}5${tab}2`),
  },
  {
    id: 'one-exposure-every-day', seen: 'run #106 meet week, push-up on all five days',
    applies: ['weightlifter_meet_week'],
    apply: (p) => p.replace(/(START_WEEK4_TSV\s*\n[^\n]*\n)/,
      '$1Day -5\tExplosive Push-up\tBodyweight\t3\t3\t90 sec\t7\tBallistic primer.\t\n'
      + 'Day -4\tExplosive Push-up\tBodyweight\t3\t3\t90 sec\t7\tBallistic primer.\t\n'
      + 'Day -3\tExplosive Push-up\tBodyweight\t3\t3\t90 sec\t7\tBallistic primer.\t\n'),
  },
  {
    id: 'final-primer-mandatory', seen: 'coach review: "Day -1 primer is conditional, not mandatory"',
    applies: ['weightlifter_meet_week'],
    // Only inside the notes column, so the block structure survives: a
    // perturbation has to produce a plausible program with a defect, not a
    // corrupted file that fails the schema for reasons no live run would.
    apply: (p) => p.replace(/(START_WEEK4_TSV[\s\S]*?END_WEEK4_TSV)/, (block) => block.split('\n').map((l) => {
      const c = l.split('\t');
      if (c.length > 8) c[7] = String(c[7] || '').replace(/\b(?:optional|skip it entirely|skip if[^.;]*|nothing at all)\b/gi, 'complete as written');
      return c.join('\t');
    }).join('\n')),
  },
  {
    id: 'scheduled-run-dropped', seen: 'run #163 triathlete, Week 4 ran twice against three runs a week',
    applies: ['sprint_triathlete'],
    code: 'TARGET_MODALITY_EXPOSURE_REDUCED',
    apply: (p) => p.replace(/(START_WEEK4_TSV[\s\S]*?)\nWed\tRun\t[^\n]*/, '$1'),
  },
  {
    id: 'session-grows-into-day-zero', seen: 'run #104 meet week, Day -4 heavier than Day -5',
    applies: ['weightlifter_meet_week'],
    apply: (p) => p.replace(/(START_WEEK4_TSV\s*\n[^\n]*\n)/,
      '$1Day -1\tChest-Supported Row\tRPE-selected load\t5\t8\t2 min\t8\tBack volume.\t\n'),
  },
  {
    id: 'sport-allocation-flat', seen: 'run #101 masters, 31% in all four weeks',
    applies: ['masters_return'],
    // Put the general work back so the sport's share stops moving.
    apply: (p) => p.replace(/(START_WEEK[34]_TSV[\s\S]*?END_WEEK[34]_TSV)/g, (block) => block.split('\n').map((l) => {
      const c = l.split('\t');
      if (c.length > 6 && !/erg|ergometer/i.test(c[1] || '')) {
        const n = Number(String(c[3]).match(/\d+/)?.[0]);
        if (Number.isFinite(n)) c[3] = String(n + 2);
      }
      return c.join('\t');
    }).join('\n')),
  },
  {
    id: 'sport-frequency-static', seen: 'coach review: shift frequency, not only accessory sets',
    applies: ['masters_return'],
    // Take the extra erg day back out of the later weeks.
    apply: (p) => p.replace(/(START_WEEK[34]_TSV[\s\S]*?END_WEEK[34]_TSV)/g, (block) => {
      const lines = block.split('\n');
      let seen = 0;
      return lines.filter((l) => {
        const c = l.split('\t');
        if (c.length > 6 && /^\s*Rowing Ergometer\s*$/i.test(c[1] || '')) { seen += 1; return seen <= 2; }
        return true;
      }).join('\n');
    }),
  },
  {
    id: 'taper-session-reads-as-rest', seen: 'MMA gym_day_count_mismatch, every week',
    applies: ['mma_fight_camp', 'weightlifter_meet_week'],
    // Drop every working row to RPE 5, which is what a well-built taper looks
    // like -- and what made the whole session classify as a rest day. Header and
    // marker lines are left alone so only the prescription changes.
    apply: (p) => p.replace(/(START_WEEK4_TSV[\s\S]*?END_WEEK4_TSV)/, (block) => block.split('\n').map((l) => {
      if (/^(?:START|END)_WEEK/.test(l) || /^Day\t/i.test(l)) return l;
      const c = l.split('\t');
      if (c.length > 8 && c[1] && !/^\s*\[WARMUP\]/i.test(c[1])) c[6] = '5';
      return c.join('\t');
    }).join('\n')),
  },
  {
    id: 'sport-state-misdescribed', seen: 'run #113 MMA camp, coach review finding 5',
    code: 'V78_SPORT_STATE_MISDESCRIBED',
    applies: ['mma_fight_camp'],
    // Every gym row claims it follows hard mat work. The camp schedule in the
    // same document demotes those days to technical to hit its hard-contact
    // target, so the note describes a session the athlete is not being sent to.
    apply: (p) => p.replace(/(START_WEEK\d_TSV[\s\S]*?END_WEEK\d_TSV)/g, (block) => block.split('\n').map((l) => {
      if (/^(?:START|END)_WEEK/.test(l) || /^Day\t/i.test(l)) return l;
      const c = l.split('\t');
      if (c.length > 8 && c[1]) c[7] = `Deliberately low-cost after hard MMA. ${c[7] || ''}`.trim();
      return c.join('\t');
    }).join('\n')),
  },
  {
    id: 'match-day-labels-stripped', seen: 'coach instruction 2, in-season microcycle',
    applies: ['inseason_footballer'],
    apply: (p) => p.replace(/MD[-+]\d/g, 'Session'),
  },

  {
    id: 'warmup-boilerplate-restored', seen: 'coach review: output reads as templated',
    applies: ['postpartum_runner'],
    apply: (p) => p.replace(/(\[WARMUP\][^\n]*?)\t([^\t]*)\t\t?$/gm,
      (m, head, note) => `${head}\t${note} Keep the warm-up specific and non-fatiguing.\t`),
  },
  {
    id: 'paced-target-forced-on-a-return', seen: 'run #109: the postpartum build died on this',
    applies: ['postpartum_runner'],
    // Strip the duration-based progression that makes a return-to-running
    // legible, which is what the guardrail used to demand a pace target for.
    apply: (p) => p.replace(/\b\d+\s*min(?:ute)?s?\s+(?:run|jog)[^;\t]*/gi, 'easy running')
      .replace(/\brun-?walk\b/gi, 'easy running'),
  },
  {
    id: 'event-week-labelled-by-countdown', seen: 'run #112: the fight camp died on this',
    // The timeline brief asks the model to name the event week by distance from
    // the event. Every day reader in the engine took the first three characters
    // of the cell, so "Day -4 (Tue)" read as "day" and the week table looked
    // empty -- which failed the rule that checks the two views agree, on a
    // program in which they did.
    apply: (p) => p.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\t/gm, (m, d) => `Day -4 (${d})\t`),
  },
  {
    id: 'rows-one-cell-short', seen: 'run #112: forty-six column-count flags in one attempt',
    // A missing trailing cell is a typing accident with one correct answer, and
    // final QA used to end the build over it.
    apply: (p) => p.replace(/^([^\t\n]*\t[^\n]*)\t$/gm, '$1'),
  },
];

function allFindings(program, intake, id) {
  return [
    ...auditProgramStructure(program, intake),
    ...collectRecoveryBudgetFlags(program, intake),
    ...collectProgressionDisciplineFlags(program, intake),
    ...collectGovernanceFlags(program, intake),
    ...collectAllV34ConsistencyFlags(program, intake),
    ...collectCoachingStandardFlags(program, intake),
    ...collectLanguageAccuracyFlags(program, intake),
    ...collectSpecGapFlags(program, intake),
  ];
}

function releasable(program, intake) {
  try {
    const r = collectRepairableValidationFailures(program, intake, { skipSkillCalibration: true });
    // The program the bundle hands back is the one production would ship, so it
    // is the one quality has to be measured on.
    return { ok: Boolean(r.ok), codes: (r.flags || []).map((f) => f.code).filter(Boolean), program: r.program || program };
  } catch (e) {
    return { ok: false, codes: [e?.code || 'THROWN'], program };
  }
}


import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { buildWeeksFromWeekOne, week1OnlyApplies } from '../engine/week_progression.js';
import { validatePhase15FinalProgram } from '../engine/phase15_final_qa.js';
// Week-1-only convergence: the model writes Week 1, the engine builds Weeks 2-4,
// and the result must clear the production bundle and the save boundary.
if (process.env.RECUT) {
  // Rebuild Weeks 2-4 from the Week 1 of the latest live program, and judge it.
  const id = process.env.RECUT;
  const prog = fs.readFileSync(path.join(root, '..', '..', 'docs', 'qa', 'live-three-avatar', 'latest', `${id}-program.txt`), 'utf8');
  const intake = INTAKES[id];
  const w1only = prog.slice(0, prog.indexOf('START_WEEK2_TSV')).replace(/\s+$/, '') + '\n';
  const built = buildWeeksFromWeekOne(w1only, intake);
  const r = collectRepairableValidationFailures(built.program, intake, { skipSkillCalibration: true });
  console.log(id, 'built', built.built, 'ok', r.ok);
  for (const f of r.flags || []) console.log('  ', f.code, String(f.amendment || f.message || '').slice(0, 500));
  process.exit(0);
}
if (process.env.LATEST) {
  for (const id of ['advanced_hybrid', 'youth_gymnastics', 'masters_return', 'sprint_triathlete']) {
    const prog = fs.readFileSync(path.join(root, '..', '..', 'docs', 'qa', 'live-three-avatar', 'latest', `${id}-program.txt`), 'utf8');
    const intake = INTAKES[id];
    const f = [...gradeProgram(prog, intake)];
    for (const fn of [...RACE_BLOCK_RULES, ...EVENT_COMPONENT_RULES]) { try { f.push(...(fn(prog, intake) || [])); } catch {} }
    const costed = f.filter((x) => DEDUCTIONS[COACH_COST[x.rule || x.code]]);
    console.log(id.padEnd(22), 'severity', coachSeverity(prog, intake).toFixed(2), '|', costed.map((x) => `${x.rule || x.code}: ${String(x.detail || x.message || '').slice(0, 160)}`).join(' || '));
  }
  process.exit(0);
}
const out = [];
for (const [id, intake] of Object.entries(INTAKES)) {
  const base = fixture(id);
  if (!week1OnlyApplies(intake)) { out.push([id, 'full-block (competition in block)', 'n/a', '', '']); continue; }
  const cut = base.indexOf('START_WEEK2_TSV');
  if (cut < 0) { out.push([id, 'no-week2-in-fixture']); continue; }
  const week1Only = base.slice(0, cut).replace(/\s+$/, '') + '\n';
  const built = buildWeeksFromWeekOne(week1Only, intake);
  const verdict = releasable(built.program, intake);
  let finalOk = true, finalCode = '';
  if (verdict.ok) { try { validatePhase15FinalProgram(verdict.program, intake); } catch (e) { finalOk = false; finalCode = e.code; } }
  const sev = coachSeverity(verdict.program, intake);
  if (process.env.COACH) {
    const list = (prog) => { const f = [...gradeProgram(prog, intake)]; for (const fn of [...RACE_BLOCK_RULES, ...EVENT_COMPONENT_RULES]) { try { f.push(...(fn(prog, intake) || [])); } catch {} } return f.filter((x) => DEDUCTIONS[COACH_COST[x.rule || x.code]]); };
    const mine = list(verdict.program).map((x) => x.rule || x.code);
    const theirs = list(releasable(base, intake).program).map((x) => x.rule || x.code);
    const added = list(verdict.program).filter((x) => !theirs.includes(x.rule || x.code));
    for (const x of added) console.log('   ', id, 'NEW', x.rule || x.code, String(x.message || x.detail || x.evidence || '').slice(0, 300));
  }
  if (process.env.DUMP === id) require('fs').writeFileSync('/tmp/claude-0/-home-user-raz-coaching-platform/ed07dd05-8d73-563c-9e2d-a0843a7724a7/scratchpad/w1only_' + id + '.txt', verdict.program);
  if (process.env.DETAIL && !verdict.ok) { try { const r = collectRepairableValidationFailures(built.program, intake, { skipSkillCalibration: true }); for (const f of r.flags || []) console.log('   ', id, f.code, String(f.amendment || f.message || JSON.stringify(f.details || '')).slice(0, 420)); } catch (e) { console.log('   ', id, 'threw', e.code); } }
  if (process.env.DETAIL && verdict.ok && process.env.FINDINGS) { const f = allFindings(verdict.program, intake, id); console.log('   ', id, 'findings:', f.map((x) => x.code || x.rule || x.id).join(', ')); }
  const baseSev = coachSeverity(releasable(base, intake).program, intake);
  out.push([id, built.built ? 'built' : 'NOT BUILT', verdict.ok && finalOk ? 'PASS' : 'FAIL', [...new Set(verdict.codes)].join(',') + (finalCode ? ' final:' + finalCode : ''), `severity ${Number(sev).toFixed(2)} (model-written ${Number(baseSev).toFixed(2)})`]);
}
for (const r of out) console.log(r[0].padEnd(24), r.slice(1).join('  '));
console.log(`\nWEEK-1-ONLY: ${out.filter((r) => r[2] === 'PASS').length}/${out.filter((r) => r[2] !== 'n/a').length} pass the production gates (${out.filter((r) => r[2] === 'n/a').length} competition-in-block avatar(s) keep the full model-written block)`);
