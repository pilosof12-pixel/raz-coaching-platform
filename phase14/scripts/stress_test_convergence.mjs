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
  // Both of these produced for the first time in run #110, so until now neither
  // had a program to stress. The Hebrew client is the only non-English avatar
  // the suite covers, and the postpartum return is the only athlete whose
  // progression is measured in time on feet rather than pace.
  hebrew_lifter: workflowIntake('hebrewLifter'),
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
    id: 'english-drills-in-hebrew-notes', seen: 'coach review of the Hebrew lifter',
    applies: ['hebrew_lifter'],
    // The state the Hebrew program actually shipped in: Hebrew coaching notes
    // with English drill lists inside them.
    apply: (p) => p.replace(/\u05de\u05ea\u05d7 \u05e1\u05e7\u05e4\u05d5\u05dc\u05e8\u05d9/g, 'Scapular pull-up')
      .replace(/\u05e4\u05ea\u05d9\u05d7\u05ea \u05d2\u05d5\u05de\u05d9\u05d9\u05d4/g, 'Band pull-apart'),
  },
  {
    id: 'warmup-boilerplate-restored', seen: 'coach review: output reads as templated',
    applies: ['hebrew_lifter', 'postpartum_runner'],
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
    return { ok: Boolean(r.ok), codes: (r.flags || []).map((f) => f.code).filter(Boolean) };
  } catch (e) {
    return { ok: false, codes: [e?.code || 'THROWN'] };
  }
}

const results = [];
for (const [id, intake] of Object.entries(INTAKES)) {
  const base = fixture(id);
  const cases = [{ id: 'undamaged', apply: (p) => p, seen: 'control' },
    ...PERTURBATIONS.filter((x) => !x.applies || x.applies.includes(id))];

  for (const perturbation of cases) {
    const damaged = perturbation.apply(base);
    const changed = damaged !== base;
    // What the damage actually raises, before anything repairs it. This is the
    // evidence the ledger's "stressed" column needs: until now it asked whether
    // this file's source text happened to contain the code's name, which no
    // perturbation had ever written down, so the column was false for all 186
    // codes while still counting toward "proven".
    const repaired = repairDeterministicContradictions(damaged, intake);
    const verdict = releasable(repaired.program, intake);
    // Every collector still runs on every perturbed program, which is why this
    // call stays: a collector that throws on damaged input is worth catching
    // here. What used to follow it was scoreProgram(findings), whose number was
    // printed as the verdict for each row. That number is 9.8 for every program
    // it has ever been shown, so the row now reports the finding count and the
    // coach severity instead -- two numbers that actually move.
    const findings = allFindings(repaired.program, intake, id);
    const severity = coachSeverity(repaired.program, intake);
    results.push({
      avatar: id,
      perturbation: perturbation.id,
      seen: perturbation.seen,
      applied: changed || perturbation.id === 'undamaged',
      converged: verdict.ok,
      severity,
      residual: verdict.codes,
      findingCount: findings.length,
      declares: perturbation.code || null,
      repairsFired: repaired.repairs.map((x) => x.type),
    });
  }
}

// --- report ------------------------------------------------------------------

if (!quiet) {
  for (const avatar of Object.keys(INTAKES)) {
    const rows = results.filter((r) => r.avatar === avatar);
    console.log(`\n${avatar.toUpperCase()}`);
    for (const r of rows) {
      const state = !r.applied ? 'n/a  ' : r.converged ? 'PASS ' : 'ASKS ';
      const detail = r.converged ? `severity ${r.severity.toFixed(2)}  findings ${r.findingCount}` : r.residual.slice(0, 2).join(', ');
      console.log(`  ${state} ${r.perturbation.padEnd(34)} ${detail}`);
    }
  }
}

// Which codes this suite actually exercises, written from the run rather than
// guessed from source text. The ledger's "stressed" column used to ask whether
// this file contained the code's name; no perturbation had ever written one
// down, so it was false for all 186 codes while still counting toward "proven".
//
// Two kinds of entry, and they are not equally strong:
//   residual  -- the code survived the repair chain on a damaged program. Hard
//                evidence, and a standing dead-build risk.
//   declared  -- the perturbation names the code it reproduces, and the run
//                confirms the perturbation changed the program and converged.
//                That is a verified claim about a real run, not a proof that
//                this particular code was the one raised.
const coverage = {};
const note = (code, kind, r) => {
  const e = (coverage[code] ||= { evidence: [], perturbations: [], avatars: [] });
  if (!e.evidence.includes(kind)) e.evidence.push(kind);
  if (!e.perturbations.includes(r.perturbation)) e.perturbations.push(r.perturbation);
  if (!e.avatars.includes(r.avatar)) e.avatars.push(r.avatar);
};
for (const r of results) {
  if (!r.applied || r.perturbation === 'undamaged') continue;
  for (const code of r.residual || []) note(code, 'residual', r);
  if (r.declares) note(r.declares, 'declared', r);
}
fs.writeFileSync(new URL('../docs/qa/stress_coverage.json', import.meta.url),
  `${JSON.stringify({
    _why: 'Written by scripts/stress_test_convergence.mjs on every run. "residual" means the code survived the repair chain on a damaged program; "declared" means a perturbation names this code and the run confirms that perturbation changed the program. The gate/repair ledger reads this file for its "stressed" column instead of scanning the suite for code names, which never once matched.',
    codes: Object.fromEntries(Object.entries(coverage).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 2)}\n`);

const applied = results.filter((r) => r.applied);
const per = (a) => {
  const rows = applied.filter((r) => r.avatar === a);
  const converged = rows.filter((r) => r.converged);
  return {
    total: rows.length,
    converged: converged.length,
    rate: rows.length ? Math.round((converged.length / rows.length) * 100) : 0,
    worstSeverity: converged.length ? Math.max(...converged.map((r) => r.severity ?? 0)) : 0,
  };
};

const youth = per('youth_gymnastics');
const tactical = per('tactical_3k');
const hybrid = per('advanced_hybrid');

console.log('\n--- convergence: defects repaired without asking the model again ---');
for (const name of Object.keys(INTAKES)) {
  const st = per(name);
  console.log(`  ${name.padEnd(24)} ${st.converged}/${st.total} (${st.rate}%)   worst coach severity: ${st.worstSeverity.toFixed(2)}`);
}

// Acceptance criteria, stated so the verdict is not a matter of opinion.
//   Youth and Tactical: every defect repaired, and no regression against the
//     coach's deduction table. These two are expected to hold a standard.
//   Hybrid: must reach a releasable program. Its rating is the coach's to give;
//     the bar here is that it stops failing to produce anything at all.
const checks = [
  ['Youth converges on every defect', youth.converged === youth.total],
  // Replaced the two "holds 9+ on the engine's own rubric" checks. That rubric
  // answers 9.8 for every program it has ever been shown -- including the one
  // the coach scored 7.6, and including that same program with every load and
  // pace stripped out -- so both checks passed unconditionally and measured
  // nothing. These ceilings are what each avatar's worst converged program
  // actually costs on the coach's deduction table today. They are a ratchet:
  // the suite fails if any avatar gets worse, which is the job the old checks
  // were supposed to be doing.
  ['no avatar regresses against the coach\'s standard', (() => {
    const CEILING = {
      // Re-baselined once, when the footballer's sprint findings were given the
      // costs the coach actually charges for them (0.45, 0.35, 0.30, 0.25 across
      // three reviews). They had no cost mapped at all, so that athlete measured
      // 0.00 while carrying his single most expensive finding, and the ceiling
      // of 0.48 was set against a measurement that could not see it. The
      // programs did not get worse; the instrument started counting.
      // Tightened to what each avatar actually costs today. Three carried slack
      // -- mma_fight_camp 1.44 against 1.59, masters_return 0.80 against 1.25,
      // postpartum_runner 0.80 against 0.90 -- because repairs landed after the
      // ceilings were last set. A ratchet with slack in it does not ratchet: it
      // would have let all three drift back to where they were and passed.
      // The highest worst case of any avatar. It comes from the perturbation
      // that drops a trailing cell: the structure is repaired and the program
      // converges, but the row it rebuilds costs more against the coach's table
      // here than the same damage costs anywhere else. Recorded at what it
      // measures rather than smoothed, so the number stays visible.
      dual_event_hyrox: 4.08,
      advanced_hybrid: 1.44, youth_gymnastics: 0.15, tactical_3k: 1.92,
      weightlifter_peak: 2.40, weightlifter_meet_week: 2.40, mma_fight_camp: 1.44,
      inseason_footballer: 0.78, masters_return: 0.80, hebrew_lifter: 0.00,
      postpartum_runner: 0.80,
    };
    let ok = true;
    for (const [avatar, ceiling] of Object.entries(CEILING)) {
      const worst = per(avatar).worstSeverity;
      if (worst > ceiling + 1e-9) {
        console.log(`  REGRESSION  ${avatar}: ${worst.toFixed(2)} against a ceiling of ${ceiling.toFixed(2)}`);
        ok = false;
      }
    }
    return ok;
  })()],
  ['Tactical converges on every defect', tactical.converged === tactical.total],
  ['Hybrid produces a releasable program', hybrid.converged > 0],
  ...Object.keys(INTAKES).map((name) => {
    const st = per(name);
    // Every avatar must repair every defect without a regeneration, and must
    // actually have been damaged: a perturbation that changes nothing tests
    // nothing, and a green line built from those is worse than no line.
    return [`${name} converges on every defect (${st.converged}/${st.total})`,
      st.total > 0 && st.converged === st.total];
  }),
  ['Hybrid converges on every defect', hybrid.converged === hybrid.total],
];

console.log('\n--- acceptance ---');
let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
}
const required = checks.slice(0, checks.length - 1); // the last is aspirational, reported not enforced
const requiredFailed = required.filter(([, ok]) => !ok).length;
console.log(`\nVERDICT: ${requiredFailed === 0 ? 'PASS' : 'FAIL'} (${required.length - requiredFailed}/${required.length} required checks)`);
process.exitCode = requiredFailed === 0 ? 0 : 1;
