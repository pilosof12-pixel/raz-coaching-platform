// Structural coaching audit.
//
// The previous validators asked "does this row contradict itself?". These ask
// "is this a complete, well-distributed training week?" -- the questions a coach
// asks first and the engine never did. Every rule here is structural: it reads
// the prescription, not the prose.
//
// Rules implemented, matching the coaching architecture brief:
//   2.1 session completeness (two-exercise sessions need a declared reason)
//   2.2 weekly movement coverage
//   2.3 circular weekly scheduling (Sunday -> Monday is an adjacency)
//   2.4 foundational strength cannot be replaced by skill drills
//   5.3 a distance/duration goal cannot be progressed by pace alone
//
// Findings are returned with a severity so the caller can decide what blocks a
// release and what is advisory. Nothing here rewrites a program.

import {
  CATEGORY, ROLE, classifyExercise, isFoundationalStrength,
  stressSignature, dayKey, dayGap,
} from './v38_movement_taxonomy.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmupName(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }

export function parseWeek(program, week) {
  const re = new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`, 'i');
  const m = String(program || '').match(re);
  if (!m) return null;
  const lines = m[1].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  const reps = col('reps', 'reps / duration', 'reps/duration');
  if (![idx.day, idx.exercise, idx.sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((l) => l.split('\t')).filter((c) => c.length === header.length);
  return { rows, day: idx.day, exercise: idx.exercise, load: col('weight', 'load / target'), sets: idx.sets, reps, notes: col('notes', 'coaching note') };
}

// Sessions keyed by their own day label, preserving "Session A"/"Session B" for
// programs that do not use weekdays.
function sessionsOf(parsed) {
  const out = new Map();
  for (const cells of parsed.rows) {
    const label = String(cells[parsed.day] || '').trim();
    if (!label) continue;
    if (!out.has(label)) out.set(label, []);
    out.get(label).push(cells);
  }
  return out;
}

// A row counts as real training content: not a warm-up, not an empty row.
function workRows(rows, parsed) {
  return rows.filter((c) => {
    const n = String(c[parsed.exercise] || '').trim();
    return n && !isWarmupName(n);
  });
}

// Language that declares a deliberately short session, per rule 2.1.
const DECLARED_SHORT_SESSION = /\b(?:microdose|micro-dose|taper|deload|recovery session|competition prep|time[- ]constrained|severe time|low[- ]cost (?:support )?session|support session only)\b/i;

export function auditSessionCompleteness(program, intake = {}) {
  const findings = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const [label, rows] of sessionsOf(parsed)) {
      const work = workRows(rows, parsed);
      // Endurance-only and carry-only days are legitimately single-purpose.
      const cats = work.map((c) => classifyExercise(c[parsed.exercise]).category);
      const onlyConditioning = cats.length > 0 && cats.every((c) => c === CATEGORY.ENDURANCE || c === CATEGORY.LOADED_CARRY);
      if (onlyConditioning) continue;
      if (work.length === 0 || work.length > 2) continue;

      const declared = work.some((c) => DECLARED_SHORT_SESSION.test(`${c[parsed.notes] || ''} ${c[parsed.load] || ''}`))
        || DECLARED_SHORT_SESSION.test(String(program).split(/START_WEEK1_TSV/i)[0]);
      if (declared) continue;

      findings.push({
        code: 'V38_INCOMPLETE_SESSION',
        severity: 'hard',
        week,
        session: label,
        exercise_count: work.length,
        exercises: work.map((c) => String(c[parsed.exercise]).trim()),
        message: `Week ${week} ${label} contains only ${work.length} exercise(s) (${work.map((c) => String(c[parsed.exercise]).trim()).join(', ')}) and is not declared a microdose, taper, recovery or time-constrained session. A normal strength session needs a primary movement, supporting work, and at least one accessory, tissue-capacity or GPP category.`,
      });
    }
  }
  return findings;
}

// Which categories this athlete's goals make genuinely required.
function requiredCategories(intake = {}) {
  const all = goals(intake).toLowerCase();
  const req = new Set([CATEGORY.HORIZONTAL_PULL, CATEGORY.TRUNK]);
  const upperGoal = /pull[- ]?up|muscle[- ]?up|press|handstand|chin[- ]?up|dip/.test(all);
  const lowerGoal = /squat|deadlift|lunge|leg/.test(all);
  const runGoal = /\b\d+\s*k(?:m)?\b|marathon|run|ruck/.test(all);
  if (upperGoal) { req.add(CATEGORY.VERTICAL_PULL); req.add(CATEGORY.HORIZONTAL_PUSH); }
  if (lowerGoal) { req.add(CATEGORY.KNEE_DOMINANT); req.add(CATEGORY.HIP_DOMINANT); }
  if (runGoal) req.add(CATEGORY.TISSUE_CAPACITY);
  return req;
}

export function auditWeeklyCoverage(program, intake = {}) {
  const findings = [];
  const required = requiredCategories(intake);
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const present = new Set();
    for (const cells of workRows(parsed.rows, parsed)) {
      present.add(classifyExercise(cells[parsed.exercise]).category);
    }
    const missing = [...required].filter((c) => !present.has(c));
    if (missing.length) {
      findings.push({
        code: 'V38_MISSING_MOVEMENT_CATEGORY',
        // Advisory by design: "not every athlete requires equal volume in every
        // category". This caps the quality score and appears in the coverage
        // report, but a three-day endurance week legitimately cannot carry
        // everything, so it does not by itself block a release.
        severity: 'advisory',
        week,
        missing,
        present: [...present],
        message: `Week ${week} has no ${missing.join(', ')} work, and the athlete's goals make ${missing.length === 1 ? 'that category' : 'those categories'} relevant. A category may be omitted only as a deliberate consequence of goal priority, schedule or a stated limitation.`,
      });
    }
  }
  return findings;
}

// Rule 2.4: a session may not carry advanced upper-body skill work while
// containing no foundational pulling or pushing at all.
export function auditFoundationalStrength(program, intake = {}) {
  const findings = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const [label, rows] of sessionsOf(parsed)) {
      const work = workRows(rows, parsed);
      if (!work.length) continue;
      const names = work.map((c) => String(c[parsed.exercise]).trim());
      const hasUpperSkill = names.some((n) => {
        const { category, role } = classifyExercise(n);
        return role === ROLE.SKILL_PRACTICE && category === CATEGORY.SKILL;
      });
      if (!hasUpperSkill) continue;
      const hasPull = names.some((n) => isFoundationalStrength(n) && /pull|row|chin/i.test(n));
      const hasPush = names.some((n) => {
        const { category } = classifyExercise(n);
        return isFoundationalStrength(n) && (category === CATEGORY.HORIZONTAL_PUSH || category === CATEGORY.VERTICAL_PUSH);
      });
      const missing = [!hasPull && 'foundational pulling', !hasPush && 'foundational pushing'].filter(Boolean);
      if (missing.length) {
        findings.push({
          code: 'V38_SKILL_WITHOUT_FOUNDATION',
          severity: 'hard',
          week,
          session: label,
          missing,
          message: `Week ${week} ${label} programs advanced upper-body skill work but contains no ${missing.join(' and no ')}. A transition drill or banded muscle-up trains the skill; it does not build the pulling or pressing strength underneath it. Both must coexist in the session.`,
        });
      }
    }
  }
  return findings;
}

// Rule 2.3: circular adjacency. A heavy exposure of the same tissue on
// consecutive days is a conflict regardless of where the week's array starts.
const HEAVY_RPE = 7.5;
function isHeavy(cells, parsed) {
  const effortIdx = parsed.notes; // effort column varies; fall back to load text
  const rpe = firstNum(String(cells[6] || '')) ?? null; // Target RPE column position
  const sets = firstNum(cells[parsed.sets]) || 0;
  const loadText = String(cells[parsed.load] || '');
  const hasExternalLoad = /\d+\s*kg|\bRM\b|%/.test(loadText);
  if (Number.isFinite(rpe) && rpe >= HEAVY_RPE && sets >= 2) return true;
  return hasExternalLoad && sets >= 3;
}

export function auditCircularScheduling(program, intake = {}) {
  const findings = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    // Aggregate stress per weekday.
    const byDay = new Map();
    for (const cells of workRows(parsed.rows, parsed)) {
      const d = dayKey(cells[parsed.day]);
      if (!d) continue;
      const name = String(cells[parsed.exercise]).trim();
      const sig = stressSignature(name);
      const heavy = isHeavy(cells, parsed);
      if (!byDay.has(d)) byDay.set(d, { axial: 0, lower: 0, upperPull: 0, upperPush: 0, neural: 0, items: [] });
      const acc = byDay.get(d);
      const weight = heavy ? 1 : 0.5;
      acc.axial += sig.axial * weight;
      acc.lower += sig.lower * weight;
      acc.upperPull += sig.upperPull * weight;
      acc.upperPush += sig.upperPush * weight;
      acc.neural += sig.neural * weight;
      if (heavy && (sig.lower >= 3 || sig.upperPull >= 3 || sig.upperPush >= 3)) acc.items.push(name);
    }
    // Check every ordered adjacent pair around the circle.
    for (const [d, acc] of byDay) {
      for (const [d2, acc2] of byDay) {
        if (d === d2 || dayGap(d, d2) !== 1) continue;
        const axialClash = acc.axial >= 3 && acc2.axial >= 3 && acc.lower >= 3 && acc2.lower >= 3;
        const pullClash = acc.upperPull >= 3 && acc2.upperPull >= 3;
        if (axialClash || pullClash) {
          findings.push({
            code: 'V38_CONSECUTIVE_CONFLICTING_EXPOSURE',
            severity: 'hard',
            week,
            from: d,
            to: d2,
            tissue: axialClash ? 'axial/lower-body' : 'vertical pulling',
            from_items: acc.items,
            to_items: acc2.items,
            message: `Week ${week} places substantial ${axialClash ? 'axial/lower-body' : 'vertical pulling'} work on ${d} (${acc.items.join(', ') || 'loaded work'}) immediately before ${d2} (${acc2.items.join(', ') || 'loaded work'}). The week is a continuous cycle, so ${d}->${d2} must be evaluated like any other adjacency. Separate the primary exposure from the secondary one.`,
          });
        }
      }
    }
  }
  return findings;
}

// Rule 5.3: a goal expressed as distance or duration cannot be progressed by
// pace alone while the distance/duration shrinks.
function ruckRows(parsed) {
  return workRows(parsed.rows, parsed).filter((c) => classifyExercise(c[parsed.exercise]).category === CATEGORY.LOADED_CARRY);
}
function magnitudeOf(cells, parsed) {
  const text = `${cells[parsed.reps] || ''} ${cells[parsed.load] || ''}`;
  const km = text.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  if (km) return { value: Number(km[1]), unit: 'km' };
  const min = text.match(/(\d+(?:\.\d+)?)\s*min\b/i);
  if (min) return { value: Number(min[1]), unit: 'min' };
  return null;
}
function paceSecOf(cells, parsed) {
  const m = String(cells[parsed.load] || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function auditLoadedCarryProgression(program, intake = {}) {
  const all = goals(intake).toLowerCase();
  if (!/ruck|loaded march|pack march/.test(all)) return [];
  // A distance target in the goal, e.g. "10 km ruck".
  const target = all.match(/(\d+(?:\.\d+)?)\s*km[^.|]{0,30}ruck|ruck[^.|]{0,30}?(\d+(?:\.\d+)?)\s*km/);
  const targetKm = target ? Number(target[1] || target[2]) : null;

  const series = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const rows = ruckRows(parsed);
    if (!rows.length) continue;
    const mag = magnitudeOf(rows[0], parsed);
    series.push({ week, magnitude: mag, pace: paceSecOf(rows[0], parsed) });
  }
  if (series.length < 3) return [];

  const mags = series.filter((s) => s.magnitude).map((s) => s.magnitude);
  const units = new Set(mags.map((m) => m.unit));
  const paces = series.map((s) => s.pace).filter(Number.isFinite);
  if (mags.length < 3 || units.size !== 1 || paces.length < 3) return [];

  const first = mags[0].value;
  const last = mags[mags.length - 1].value;
  const paceImproved = paces[paces.length - 1] < paces[0];
  const magnitudeFell = last < first * 0.98;

  if (paceImproved && magnitudeFell) {
    return [{
      code: 'V38_CARRY_PACE_ONLY_PROGRESSION',
      severity: 'hard',
      target_km: targetKm,
      series: series.map((s) => ({ week: s.week, magnitude: s.magnitude, pace_s_per_km: s.pace })),
      message: `The loaded-carry progression accelerates pace (${paces[0]}s -> ${paces[paces.length - 1]}s per km) while ${mags[0].unit === 'km' ? 'distance' : 'duration'} falls from ${first} to ${last} ${mags[0].unit}${targetKm ? `, against a ${targetKm} km goal` : ''}. A distance goal needs distance or duration tolerance developed too, not pace alone.`,
    }];
  }
  return [];
}

export function auditProgramStructure(program, intake = {}) {
  return [
    ...auditSessionCompleteness(program, intake),
    ...auditWeeklyCoverage(program, intake),
    ...auditFoundationalStrength(program, intake),
    ...auditCircularScheduling(program, intake),
    ...auditLoadedCarryProgression(program, intake),
  ];
}

// A human-readable structural coverage report, per release standard 8.2/8.3.
export function structuralCoverageReport(program, intake = {}) {
  const lines = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    lines.push(`Week ${week}`);
    const present = new Set();
    for (const [label, rows] of sessionsOf(parsed)) {
      const work = workRows(rows, parsed);
      const cats = work.map((c) => classifyExercise(c[parsed.exercise]).category);
      cats.forEach((c) => present.add(c));
      lines.push(`  ${label}: ${work.length} exercise(s) [${[...new Set(cats)].join(', ') || 'none'}]`);
    }
    const required = requiredCategories(intake);
    const missing = [...required].filter((c) => !present.has(c));
    lines.push(`  weekly coverage: ${[...present].sort().join(', ')}`);
    lines.push(`  missing required: ${missing.length ? missing.join(', ') : 'none'}`);
  }
  return lines.join('\n');
}
