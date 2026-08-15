// Structured compatibility model for the coaching engine.
//
// Phase A accepts the current client TSV as an I/O compatibility format, but
// parses it exactly once into explicit program semantics. Coaching notes remain
// explanatory metadata. They are intentionally NOT allowed to redefine exercise
// identity, modality, equipment, or direct-goal exposure.

import { applyDirectGoalSemantics } from './program_goal_semantics.js';

export const PROGRAM_MODEL_VERSION = 'program-model-v2';

const DAY_ALIASES = new Map([
  ['mon', 'monday'], ['monday', 'monday'],
  ['tue', 'tuesday'], ['tues', 'tuesday'], ['tuesday', 'tuesday'],
  ['wed', 'wednesday'], ['weds', 'wednesday'], ['wednesday', 'wednesday'],
  ['thu', 'thursday'], ['thur', 'thursday'], ['thurs', 'thursday'], ['thursday', 'thursday'],
  ['fri', 'friday'], ['friday', 'friday'],
  ['sat', 'saturday'], ['saturday', 'saturday'],
  ['sun', 'sunday'], ['sunday', 'sunday'],
]);

export const WEEKDAY_ORDER = Object.freeze([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

const EXECUTION_MODIFIERS = Object.freeze([
  ['strict', /\bstrict\b/i],
  ['paused', /\bpaus(?:e|ed)\b/i],
  ['tempo', /\btempo\b/i],
  ['eccentric', /\beccentric|negative\b/i],
  ['isometric', /\bisometric|\biso\b|\bhold\b/i],
  ['explosive', /\bexplosive|high[ -]?pull|hip[ -]?to[ -]?bar/i],
  ['controlled', /\bcontrolled\b/i],
  ['deficit', /\bdeficit\b/i],
  ['partial', /\bpartial\b/i],
]);

const ASSISTANCE_METHODS = Object.freeze([
  ['band', /\bband(?:ed)?[ -]assisted\b|\bband assisted\b/i],
  ['box', /\bbox[ -]assisted\b/i],
  ['partner', /\bpartner[ -]assisted\b/i],
  ['counterweight', /\bcounterweight|counterbalanced/i],
]);

const LOADING_METHODS = Object.freeze([
  ['weighted', /\bweighted\b|\bbw\s*\+/i],
  ['belt', /\bbelt\b/i],
  ['barbell', /\bbarbell\b/i],
  ['dumbbell', /\bdumbbell|\bdb\b/i],
  ['kettlebell', /\bkettlebell|\bkb\b/i],
  ['sandbag', /\bsandbag\b/i],
  ['ruck', /\bruck\b|\bbackpack\b/i],
]);

// Base movement recognition is compositional identity, not a client display-name
// whitelist. The output is the stable semantic key consumed by validators.
const BASE_MOVEMENTS = Object.freeze([
  ['bar_muscle_up', /\bbar[ -]?muscle[ -]?up\b/i],
  ['ring_muscle_up', /\bring[ -]?muscle[ -]?up\b/i],
  ['muscle_up', /\bmuscle[ -]?up\b/i],
  ['handstand_push_up', /\bhandstand[ -]?push[ -]?up\b|\bhspu\b/i],
  ['handstand', /\bhandstand\b|\bkick[ -]?up\b|\btoe[ -]?pulls?\b/i],
  ['pull_up', /\bpull[ -]?ups?\b|\bchin[ -]?ups?\b/i],
  ['front_lever', /\bfront[ -]?lever\b/i],
  ['planche', /\bplanche\b/i],
  ['human_flag', /\bhuman[ -]?flag\b/i],
  ['iron_cross', /\biron[ -]?cross\b/i],
  ['maltese', /\bmaltese\b/i],
  ['pistol_squat', /\bpistol[ -]?squat\b/i],
  ['split_squat', /\bsplit[ -]?squat\b|\bbulgarian\b/i],
  ['squat', /\bsquat\b/i],
  ['deadlift', /\bdeadlift\b|\brdl\b|romanian[ -]?deadlift/i],
  ['overhead_press', /\boverhead[ -]?press\b|\bohp\b|\bpush[ -]?press\b/i],
  ['bench_press', /\bbench[ -]?press\b/i],
  ['dip', /\bdips?\b/i],
  ['row_strength', /\bbarbell[ -]?row\b|\bdumbbell[ -]?row\b|\bcable[ -]?row\b|\bring[ -]?row\b|\binverted[ -]?row\b|\bpendlay[ -]?row\b/i],
  ['lunge', /\blunge\b/i],
  // Ruck precedes generic carry and running so distance text never changes it.
  ['ruck', /\bruck(?:ing)?\b|\bloaded[ -]?march\b|\bbackpack[ -]?carry\b/i],
  ['run', /\brun(?:ning)?\b|\bjog\b|\bsprints?\b/i],
  ['sled', /\bsled\b|\bprowler\b/i],
  ['carry', /\bcarry\b/i],
  ['bike', /\bbike\b|\bairbike\b/i],
  ['rowing_erg', /\brower\b|\browing[ -]?erg\b|\brow[ -]?erg\b/i],
]);

function text(value) {
  if (Array.isArray(value)) return value.map(String).join(' | ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value || '');
}

// Semantic tokens deliberately collapse every dash form, including the ordinary
// ASCII hyphen. Client display punctuation must not create different meanings.
export function normalizeSemanticText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-–—]+/g, ' ')
    .replace(/[_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}+.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(value) {
  return normalizeSemanticText(value);
}

export function normalizeDay(value) {
  const n = norm(value).replace(/\.$/, '');
  return DAY_ALIASES.get(n) || n || 'unknown';
}

function stripWarmupPrefix(value) {
  return String(value || '').replace(/^\s*\[(?:WARMUP|חימום)\]\s*/iu, '').trim();
}

function isWarmup(value) {
  return /^\s*\[(?:WARMUP|חימום)\]/iu.test(String(value || ''));
}

function readNumber(value) {
  const m = String(value || '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function parseEffort(value) {
  const raw = String(value || '').trim();
  if (!raw || /^(?:n\/?a|none)$/i.test(raw)) return null;
  const nums = [...raw.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const range = nums.length > 1 ? { min: nums[0], max: nums[1] } : null;
  if (/\brir\b/i.test(raw)) return { type: 'rir', value: nums[0] ?? null, range, raw };
  if (/\brpe\b/i.test(raw) || nums.length) return { type: 'rpe', value: nums[0] ?? null, range, raw };
  return { type: 'other', value: null, range: null, raw };
}

function parseDose(cells) {
  const setsRaw = String(cells.sets || '').trim();
  const repsRaw = String(cells.reps || '').trim();
  const restRaw = String(cells.rest || '').trim();
  const duration = /\b(?:sec|secs|second|seconds|min|mins|minute|minutes|km|meter|metre|m)\b/i.test(repsRaw)
    ? repsRaw
    : null;
  return {
    sets: readNumber(setsRaw),
    sets_raw: setsRaw,
    reps: duration ? null : repsRaw || null,
    reps_raw: repsRaw,
    duration,
    rest: restRaw || null,
    effort: parseEffort(cells.effort),
    load: String(cells.weight || '').trim() || null,
  };
}

function deriveBaseMovement(exercise) {
  // Exercise identity is intentionally derived from the exercise cell only.
  // A note saying "bar muscle-up support" must never turn a pull-up into a
  // bar muscle-up in the semantic model.
  const src = String(exercise || '');
  for (const [base, re] of BASE_MOVEMENTS) {
    if (re.test(src)) return base;
  }
  return norm(exercise)
    .replace(/\b(strict|paused?|tempo|controlled|explosive|weighted|banded?|assisted|eccentric|negative|isometric|hold|deficit)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '_') || 'unknown';
}

function deriveComposition(exercise, base, load = '') {
  // Execution/equipment can come from the exercise label or explicit load cell,
  // but never from coaching notes.
  const src = `${exercise} ${load}`;
  const execution = EXECUTION_MODIFIERS.filter(([, re]) => re.test(src)).map(([key]) => key);
  const assistance = ASSISTANCE_METHODS.filter(([, re]) => re.test(src)).map(([key]) => key);
  const loading = LOADING_METHODS.filter(([, re]) => re.test(src)).map(([key]) => key);
  const equipment = new Set();

  if (/\bring\b/i.test(src)) equipment.add('rings');
  if (/\bband\b/i.test(src)) equipment.add('bands');
  if (/\bdumbbell|\bdb\b/i.test(src)) equipment.add('dumbbells');
  if (/\bkettlebell|\bkb\b/i.test(src)) equipment.add('kettlebell');
  if (/\bcable\b/i.test(src)) equipment.add('cable');
  if (/\bsled|prowler/i.test(src)) equipment.add('sled');
  if (/\bsandbag/i.test(src)) equipment.add('sandbag');
  if (/\bruck|backpack/i.test(src) || base === 'ruck') equipment.add('ruck');
  if (/\bbench\b/i.test(src) || base === 'bench_press') equipment.add('bench');
  if (/\bbarbell\b/i.test(src) || ['squat', 'deadlift', 'overhead_press'].includes(base)) equipment.add('barbell');
  if (['pull_up', 'bar_muscle_up'].includes(base)) equipment.add('pull_up_bar');

  return { execution, assistance, loading, equipment: [...equipment] };
}

function goalFamilyFromBase(base) {
  if (base === 'bar_muscle_up') return 'bar_muscle_up';
  if (base === 'ring_muscle_up' || base === 'muscle_up') return 'muscle_up';
  if (base === 'handstand' || base === 'handstand_push_up') return 'handstand';
  if (base === 'pull_up') return 'pull_up';
  if (base === 'ruck') return 'ruck';
  if (base === 'run') return 'running';
  if (typeof base === 'string' && base.includes('squat')) return 'squat';
  if (base === 'deadlift') return 'deadlift';
  if (base === 'overhead_press') return 'overhead_press';
  return base || null;
}

function detectGoalFamilies(value) {
  const s = norm(value);
  const out = [];
  const add = (family) => { if (!out.includes(family)) out.push(family); };

  const barMuscleUp = /\bbar muscle up\b/.test(s);
  if (barMuscleUp) add('bar_muscle_up');
  else if (/\bmuscle up\b/.test(s)) add('muscle_up');

  if (/\bfreestanding handstand\b|\bhandstand balance\b|\bunsupported handstand\b|\bhandstand\b/.test(s)) add('handstand');
  if (/\bstrict pull ups?\b|\bweighted pull ups?\b|\bpull ups?\b/.test(s)) add('pull_up');
  if (/\bruck\b|\brucking\b|\bloaded march\b/.test(s)) add('ruck');

  // 3K race language is explicitly running. Generic kilometre text is not:
  // "10 km ruck" must remain a ruck goal, never become a run goal.
  if (/\b3\s*k(?:m)?\b|\b3\s*km\b|\bthree kilomet|\brunning\b|\brun\b/.test(s)) add('running');

  if (/\bsquat\b/.test(s)) add('squat');
  if (/\bdeadlift\b/.test(s)) add('deadlift');
  if (/\boverhead press\b|\bohp\b/.test(s)) add('overhead_press');
  return out;
}

export function deriveGoalFamilies(intake = {}) {
  const out = [];
  const seen = new Set();
  for (const [key, tier] of [
    ['primary_goals', 'primary'],
    ['secondary_goals', 'secondary'],
    ['maintenance_goals', 'maintenance'],
  ]) {
    const values = Array.isArray(intake[key]) ? intake[key] : (intake[key] ? [intake[key]] : []);
    for (const raw of values) {
      for (const family of detectGoalFamilies(raw)) {
        const target = { family, tier, raw: String(raw) };
        const signature = `${family}\u0000${tier}\u0000${target.raw}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        out.push(target);
      }
    }
  }
  return out;
}

function familyMatches(exerciseFamily, targetFamily) {
  if (!exerciseFamily || !targetFamily) return false;
  if (exerciseFamily === targetFamily) return true;
  if (exerciseFamily === 'bar_muscle_up' && targetFamily === 'muscle_up') return true;
  return false;
}

function inferModality({ exercise, base, warmup }) {
  if (warmup) return 'warm_up';
  const src = norm(exercise);

  // Identity/modality is based on the movement label, never coaching notes.
  if (base === 'ruck') return 'ruck';
  if (base === 'run') return 'running';
  if (/\bbjj\b|jiu jitsu|mma|boxing|kickboxing|wrestling|muay thai/.test(src)) return 'sport';
  if (['bar_muscle_up', 'ring_muscle_up', 'muscle_up', 'handstand', 'handstand_push_up', 'front_lever', 'planche', 'human_flag', 'iron_cross', 'maltese'].includes(base)) return 'skill';
  if (['pull_up', 'pistol_squat', 'split_squat', 'squat', 'deadlift', 'overhead_press', 'bench_press', 'dip', 'row_strength', 'lunge'].includes(base)) return 'strength';
  if (['bike', 'rowing_erg', 'sled', 'carry'].includes(base) || /\bburpee\b|\bemom\b|\bconditioning\b|\bmetcon\b/.test(src)) return 'conditioning';
  if (/mobility|stretch|cooldown|cool down|breath/.test(src)) return 'recovery';

  // Unknown resistance exercises remain strength for compatibility, but retain
  // their explicit unknown base key for downstream dictionary/schema QA.
  return 'strength';
}

function inferRole({ warmup, modality, goalFamily, goalTargets, notes }) {
  if (warmup) return 'warm_up';
  const related = goalTargets.some((g) => familyMatches(goalFamily, g.family));
  if (related) return 'support';
  if (/accessory|optional|finisher/i.test(notes)) return 'accessory';
  if (modality === 'skill' || modality === 'strength') return 'support';
  return 'support';
}

function parseWeekBlock(program, week) {
  const re = new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[1].split('\n').filter((line) => line.trim());
  if (!lines.length) return { week, header: [], rows: [] };
  const header = lines[0].split('\t').map((x) => norm(x));
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  const get = (cells, name) => idx[name] >= 0 ? (cells[idx[name]] ?? '') : '';
  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = line.split('\t');
    return {
      source_row: rowIndex + 1,
      raw: line,
      day: get(cells, 'day'),
      exercise: get(cells, 'exercise'),
      weight: get(cells, 'weight'),
      sets: get(cells, 'sets'),
      reps: get(cells, 'reps'),
      rest: get(cells, 'rest'),
      effort: get(cells, 'target rpe'),
      notes: get(cells, 'notes'),
      results: get(cells, 'results'),
    };
  });
  return { week, header, rows };
}

function addIntakeSportSessions(daysByName, intake = {}) {
  const rawSchedule = Array.isArray(intake.sport_schedule) ? intake.sport_schedule : [];
  for (const entry of rawSchedule) {
    const rawDay = typeof entry === 'string' ? entry : entry?.day;
    const day = normalizeDay(rawDay);
    if (!WEEKDAY_ORDER.includes(day)) continue;
    if (!daysByName.has(day)) daysByName.set(day, { day, day_index: WEEKDAY_ORDER.indexOf(day), sessions: [], exercises: [] });
    daysByName.get(day).sessions.push({
      type: 'sport',
      modality: 'sport',
      source: 'intake',
      purpose: text(intake.sport) || 'sport',
      priority: 'external',
      counts_toward_strength_frequency: false,
      exercises: [],
      metadata: typeof entry === 'object' ? { ...entry } : { day: rawDay },
    });
  }
}

export function parseProgramModel(program, intake = {}) {
  const goalTargets = deriveGoalFamilies(intake);
  const weeks = [];
  const diagnostics = [];

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeekBlock(program, week);
    if (!parsed) continue;
    const daysByName = new Map();

    for (const row of parsed.rows) {
      const day = normalizeDay(row.day);
      if (!daysByName.has(day)) {
        daysByName.set(day, {
          day,
          day_index: WEEKDAY_ORDER.indexOf(day),
          sessions: [],
          exercises: [],
        });
      }

      const rawExercise = String(row.exercise || '').trim();
      const warmup = isWarmup(rawExercise);
      const exercise = stripWarmupPrefix(rawExercise);
      const notes = String(row.notes || '');
      const base = deriveBaseMovement(exercise);
      const goalFamily = goalFamilyFromBase(base);
      const modality = inferModality({ exercise, base, warmup });
      const composition = deriveComposition(exercise, base, row.weight);
      const role = inferRole({ warmup, modality, goalFamily, goalTargets, notes });
      const item = {
        source: 'tsv',
        source_row: row.source_row,
        display_name: exercise,
        raw_display_name: rawExercise,
        base_movement: base,
        modality,
        role,
        goal_family: goalFamily,
        direct_goal_exposure: false,
        direct_goal_families: [],
        direct_goal_targets: [],
        equipment: composition.equipment,
        execution_modifiers: composition.execution,
        assistance_methods: composition.assistance,
        loading_methods: composition.loading,
        dose: parseDose(row),
        notes,
      };

      const dayModel = daysByName.get(day);
      dayModel.exercises.push(item);
      let session = dayModel.sessions.find((s) => s.source === 'tsv' && s.modality === modality);
      if (!session) {
        session = {
          type: modality,
          modality,
          source: 'tsv',
          purpose: goalFamily || modality,
          priority: 'support',
          counts_toward_strength_frequency: modality === 'strength' || modality === 'skill',
          exercises: [],
        };
        dayModel.sessions.push(session);
      }
      session.exercises.push(item);
    }

    addIntakeSportSessions(daysByName, intake);
    const days = [...daysByName.values()].sort((a, b) => {
      const ai = a.day_index < 0 ? 99 : a.day_index;
      const bi = b.day_index < 0 ? 99 : b.day_index;
      return ai - bi;
    });
    weeks.push({ week, days, header: parsed.header });
  }

  if (!weeks.length) diagnostics.push({ code: 'PROGRAM_MODEL_NO_WEEK_BLOCKS' });

  return applyDirectGoalSemantics({
    version: PROGRAM_MODEL_VERSION,
    source: 'tsv_compatibility',
    weeks,
    goals: goalTargets,
    diagnostics,
  });
}

export function strengthDaysForWeek(model, weekNumber = 1) {
  const week = model?.weeks?.find((w) => w.week === weekNumber);
  if (!week) return [];
  return week.days.filter((day) => day.sessions.some((session) => session.counts_toward_strength_frequency));
}

export function modalityDaysForWeek(model, weekNumber, modality) {
  const week = model?.weeks?.find((w) => w.week === weekNumber);
  if (!week) return [];
  return week.days.filter((day) => day.sessions.some((session) => session.modality === modality));
}

export function directGoalExposures(model, family, weekNumber = null) {
  const weeks = weekNumber == null ? model?.weeks || [] : (model?.weeks || []).filter((w) => w.week === weekNumber);
  const exposures = [];
  for (const week of weeks) {
    for (const day of week.days) {
      for (const exercise of day.exercises) {
        if (exercise.direct_goal_exposure && exercise.direct_goal_families.includes(family)) {
          exposures.push({ week: week.week, day: day.day, exercise });
        }
      }
    }
  }
  return exposures;
}
