// Coaching-standard gates.
//
// The prescription/note checks compare a note against its own row. These compare
// the PROGRAM'S CLAIMS AND SHAPE against the athlete's stated goal and the
// structured prescriptions across the whole block. Each one encodes a standard
// that a reviewer applied by hand and that otherwise recurs run after run:
//
//   1. a narrative progression claim must match the structured trend
//   2. exactly one symptom-response hierarchy may be stated
//   3. accessory volume may not rise in the same week a primary quality rises
//   4. a block may not be called race-specific if its quality never approaches
//      the demand of the target event
//   5. a stated weekly-volume anchor must match the computed volume
//
// All are arithmetic or presence checks over structured fields and the program's
// own text. None depend on avatar names or fixed weekdays.

import { projectedWeeklyRunningKm, statedRunningBaselineKm } from './v34_workload_accounting.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  if (tier === 'secondary') return arr(intake.secondary_goals).map(String).join(' | ');
  if (tier === 'maintenance') return arr(intake.maintenance_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }

function parseWeek(program, week) {
  const re = new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[1].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  const reps = col('reps', 'reps / duration', 'reps/duration');
  if (![idx.day, idx.exercise, idx.sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((l) => l.split('\t')).filter((c) => c.length === header.length);
  return { rows, day: idx.day, exercise: idx.exercise, load: col('weight', 'load / target'), sets: idx.sets, reps, notes: col('notes', 'coaching note') };
}
function narrative(program) { return String(program || '').split(/START_WEEK1_TSV/i)[0]; }

// --- 1. narrative progression claim vs structured trend ----------------------

// Largest single-row distance for a movement family, per week.
function weeklyMaxKm(program, namePattern) {
  const out = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    let best = null;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !namePattern.test(name)) continue;
      const km = (String(cells[parsed.reps] || '').match(/(\d+(?:\.\d+)?)\s*km\b/i) || [])[1];
      if (km != null) best = Math.max(best ?? 0, Number(km));
    }
    if (best != null) out.push({ week, km: best });
  }
  return out;
}

export function collectNarrativeClaimFlags(program, intake = {}) {
  const flags = [];
  const head = narrative(program);
  if (!head.trim()) return flags;

  // A claim that the long run BUILDS must be visible in the structured distances.
  const longRun = weeklyMaxKm(program, /\brun(?:ning)?\b/i);
  if (longRun.length >= 2) {
    const claimsBuild = /\blong run\b[^.]{0,80}\b(builds?|building|progress(?:es|ively)?|increases?|step(?:s)? up)\b/i.test(head)
      || /\b(builds?|progress(?:es)?|increases?)\b[^.]{0,40}\blong run\b/i.test(head);
    const rises = longRun.some((x, i) => i > 0 && x.km > longRun[i - 1].km);
    if (claimsBuild && !rises) {
      flags.push({
        code: 'V35_NARRATIVE_PROGRESSION_CLAIM_UNSUPPORTED',
        claim: 'long run builds',
        weekly_km: longRun.map((x) => x.km),
        message: `The summary says the long run builds, but the prescribed distances are ${longRun.map((x) => x.km).join(' / ')} km and never increase. Describe it as held or consolidated, or make the structured distances rise.`,
      });
    }
  }
  return flags;
}

// --- 2. exactly one symptom-response hierarchy -------------------------------

export function collectSymptomAlgorithmFlags(program, intake = {}) {
  const text = String(program || '');
  const impactHistory = /shin|tibial|stress fracture|plantar|achilles/i.test(`${txt(intake.injuries)} ${txt(intake.pain)} ${txt(intake.notes)} ${text}`);
  if (!impactHistory) return [];
  const sourceLinked = /reduce the stressor that actually provoked|most recently increased|during or in the 24h after the quality|hold the newest (?:run|running|interval|impact)/i.test(text);
  const blanketEasyRunFirst = /(?:cut|reduce|trim)\s+easy[- ]?run(?:ning)?\s*(?:duration|volume)?\s*first/i.test(text);
  if (sourceLinked && blanketEasyRunFirst) {
    return [{
      code: 'V35_CONFLICTING_SYMPTOM_ALGORITHM',
      message: 'The program states two different symptom-response hierarchies: a source-linked one (reduce the provoking or most recently increased stressor) and a blanket one (cut easy-run volume first). Keep the source-linked hierarchy only, so a single coherent repair order is given.',
    }];
  }
  return [];
}

// --- 3. accessory volume may not rise with a primary progression --------------

function primaryModalityPattern(intake = {}) {
  const primary = goals(intake, 'primary').toLowerCase();
  if (/\b\d+\s*k(?:m)?\b|marathon|run|3\s*k/.test(primary)) return /\brun(?:ning)?\b/i;
  if (/squat/.test(primary)) return /squat/i;
  if (/pull[- ]?up|muscle[- ]?up/.test(primary)) return /pull[- ]?up|muscle[- ]?up/i;
  return null;
}

// Total quality metres of the primary running session, per week.
function primaryQualityLoad(program, pattern) {
  const out = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    let metres = 0;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !pattern.test(name)) continue;
      const sets = firstNum(cells[parsed.sets]) || 0;
      const m = (String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i) || [])[1];
      if (m != null && sets >= 2) metres += Number(m) * sets;
    }
    out.push({ week, metres });
  }
  return out;
}

export function collectSecondaryVolumeCreepFlags(program, intake = {}) {
  const pattern = primaryModalityPattern(intake);
  if (!pattern) return [];
  const quality = primaryQualityLoad(program, pattern);
  if (quality.length < 2) return [];

  // Sets per day+exercise for movements that are NOT the primary modality.
  const perWeek = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) { perWeek.push(null); continue; }
    const map = new Map();
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || pattern.test(name)) continue;
      const sets = firstNum(cells[parsed.sets]);
      if (!Number.isFinite(sets)) continue;
      const key = name.toLowerCase();
      map.set(key, (map.get(key) || 0) + sets);
    }
    perWeek.push({ week, map });
  }

  const flags = [];
  for (let i = 1; i < perWeek.length; i++) {
    const now = perWeek[i], prev = perWeek[i - 1];
    if (!now || !prev) continue;
    const q = quality.find((x) => x.week === now.week);
    const qPrev = quality.find((x) => x.week === prev.week);
    // Only a week in which the primary quality actually advanced.
    const primaryRose = q && qPrev && q.metres > qPrev.metres;
    const longerReps = (() => {
      const repMax = (w) => {
        const parsed = parseWeek(program, w);
        if (!parsed) return 0;
        let best = 0;
        for (const cells of parsed.rows) {
          const name = String(cells[parsed.exercise] || '');
          if (isWarmup(name) || !pattern.test(name)) continue;
          const m = (String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i) || [])[1];
          if (m != null && (firstNum(cells[parsed.sets]) || 0) >= 2) best = Math.max(best, Number(m));
        }
        return best;
      };
      return repMax(now.week) > repMax(prev.week);
    })();
    if (!primaryRose && !longerReps) continue;

    for (const [exercise, sets] of now.map) {
      const before = prev.map.get(exercise);
      if (Number.isFinite(before) && sets > before) {
        flags.push({
          code: 'V35_SECONDARY_VOLUME_CREEP',
          week: now.week,
          exercise,
          previous_sets: before,
          current_sets: sets,
          message: `Week ${now.week} advances the primary quality session, but ${exercise} also rises from ${before} to ${sets} sets. When a primary quality progresses, secondary and accessory volume defaults to hold unless the program states an explicit recovery-backed reason.`,
        });
      }
    }
  }
  return flags;
}

// --- 4. block-specificity honesty -------------------------------------------

// Seconds for "M:SS" style tokens.
function clockSeconds(raw) {
  const m = String(raw || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function collectBlockSpecificityFlags(program, intake = {}) {
  const primary = goals(intake, 'primary');
  // Event distance and both the current and target times, e.g. "3 km from 13:30 to sub-12:00".
  const dist = primary.match(/\b(\d+(?:\.\d+)?)\s*k(?:m)?\b/i);
  if (!dist) return [];
  const km = Number(dist[1]);
  const times = [...primary.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
  if (times.length < 2 || !(km > 0)) return [];
  const goalSec = Math.min(...times);
  const goalPace = goalSec / km;

  // Velocity of each prescribed quality repetition.
  const paces = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !/\brun(?:ning)?\b/i.test(name)) continue;
      const sets = firstNum(cells[parsed.sets]) || 0;
      const metres = (String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i) || [])[1];
      if (sets < 2 || metres == null) continue;
      const sec = clockSeconds(`${cells[parsed.load] || ''}`);
      if (sec == null) continue;
      paces.push(sec / (Number(metres) / 1000));
    }
  }
  if (!paces.length) return [];

  const fastest = Math.min(...paces);
  // A block whose fastest quality is still materially slower than goal demand is
  // a developmental block, and must not be described as event-specific.
  const materiallySlower = fastest > goalPace * 1.03;
  const claimsSpecific = /\brace[- ]specific|event[- ]specific\b/i.test(narrative(program))
    || new RegExp(`sub-?\\s*${Math.floor(goalSec / 60)}`, 'i').test(narrative(program));
  if (materiallySlower && claimsSpecific) {
    return [{
      code: 'V35_BLOCK_SPECIFICITY_OVERSTATED',
      goal_pace_s_per_km: Math.round(goalPace),
      fastest_quality_s_per_km: Math.round(fastest),
      message: `The summary presents this block as race-specific for the target event, but the fastest prescribed quality repetition is about ${Math.round(fastest)} s/km against a goal demand of about ${Math.round(goalPace)} s/km. Describe it as a developmental or transition block toward that standard, or bring some quality closer to event demand where tolerance allows.`,
    }];
  }
  return [];
}

// --- 5. stated weekly volume anchor vs computed volume -----------------------

export function collectVolumeNarrativeFlags(program, intake = {}) {
  const baseline = statedRunningBaselineKm(intake);
  if (!baseline) return [];
  const head = narrative(program);
  const claimsAtBaseline = /at or (?:just |slightly )?(?:below|around) (?:that|the) baseline|sits? (?:at|near) (?:that|the) baseline|maintain(?:s|ing)? (?:the )?established (?:running )?(?:exposure|volume)/i.test(head);
  if (!claimsAtBaseline) return [];
  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const projected = projectedWeeklyRunningKm(program, week);
    if (projected == null || projected <= 0) continue;
    // Materially under the stated baseline while claiming to sit at it.
    if (projected < baseline.low * 0.9) {
      flags.push({
        code: 'V35_VOLUME_NARRATIVE_MISMATCH',
        week,
        projected_km: projected,
        baseline_km: `${baseline.low}-${baseline.high}`,
        message: `The summary presents the block as sitting at the established ${baseline.low}-${baseline.high} km/week baseline, but Week ${week} projects about ${projected} km once easy runs, warm-up, repetitions and cooldown are counted. State the actual figure and why it is lower, or bring the volume closer to the baseline.`,
      });
      break;
    }
  }
  return flags;
}

export function collectCoachingStandardFlags(program, intake = {}) {
  return [
    ...collectNarrativeClaimFlags(program, intake),
    ...collectSymptomAlgorithmFlags(program, intake),
    ...collectSecondaryVolumeCreepFlags(program, intake),
    ...collectBlockSpecificityFlags(program, intake),
    ...collectVolumeNarrativeFlags(program, intake),
  ];
}

export function validateCoachingStandards(program, intake = {}, RetriableValidationError) {
  const flags = collectCoachingStandardFlags(program, intake);
  if (!flags.length) return { ok: true, flags: [] };
  if (typeof RetriableValidationError === 'function') {
    throw new RetriableValidationError(flags[0].code, flags.map((f) => f.message).join(' '), { flags });
  }
  return { ok: false, flags };
}
