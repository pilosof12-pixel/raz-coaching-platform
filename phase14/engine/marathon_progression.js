// engine/marathon_progression.js
//
// Four marathon rules that could refuse a program and had no way to answer it.
//
// MARATHON_WEEK1_VOLUME_ABOVE_CURRENT, MARATHON_QUALITY_DOUBLE_PROGRESSION,
// MARATHON_STACKED_VOLUME_PROGRESSION and MARATHON_STRENGTH_MAINTENANCE_OVERLOAD
// all live in final QA, where the only response to a flag was a throw. None of
// them had a repair, so a marathon intake that tripped one spent four
// generations arguing with the model and then failed.
//
// Each of the four messages already states its own fix, in the engine's own
// words: keep week 1 at or below the supplied distance; copy the prior week's
// pace unchanged; copy the non-selected category from the prior week; keep the
// maintenance dose stable. Those are instructions, not judgements, and they
// belong in code rather than in a paragraph addressed to a model.
//
// Where the rule leaves a choice the engine now makes one and makes it the same
// way every time:
//   - a stacked transition keeps the long run progressing, because that is the
//     lever a marathon block is actually built on, and holds the others;
//   - a quality run that got both longer and faster keeps its distance and
//     gives back the pace, because volume is the safer of the two to carry.

import { parseWeek } from './v34_workload_accounting.js';

const RUN = /\brun(?:ning)?\b/i;
const LONG = /\blong(?:[- ]run)?\b|long aerobic|endurance run/i;
const QUALITY = /\binterval|quality|threshold|tempo|race pace|target pace|marathon pace\b/i;
const EASY = /\beasy|zone\s*[- ]?2|conversational|recovery/i;

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function goalText(intake, key) {
  const v = intake?.[key];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' | ');
}
function marathonGoal(intake = {}) {
  return /\bmarathon\b/i.test([goalText(intake, 'primary_goals'), goalText(intake, 'secondary_goals')].join(' | '));
}

// The weekly distance the intake says the athlete is actually running now.
function currentWeeklyKm(intake = {}) {
  const source = [intake.notes, intake.current_numbers, intake.performance_markers, intake.current_endurance]
    .map((x) => (typeof x === 'string' ? x : JSON.stringify(x || ''))).join(' ');
  const m = source.match(/\b(?:about|around|roughly|approximately|~)?\s*(\d+(?:\.\d+)?)\s*km\s*(?:\/|per)\s*week\b/i);
  const km = m ? Number(m[1]) : NaN;
  return Number.isFinite(km) && km > 0 ? km : null;
}

const maxKm = (t) => {
  const a = [...String(t || '').matchAll(/\b(\d+(?:\.\d+)?)\s*km\b/ig)].map((m) => Number(m[1]));
  return a.length ? Math.max(...a) : 0;
};
const setsOf = (v) => Math.max(1, Number(String(v || '1').match(/\d+/)?.[0] || 1));

function runRows(parsed) {
  const out = [];
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '');
    if (!RUN.test(name) || isWarmup(name)) return;
    const note = Number.isInteger(parsed.notes) ? String(cells[parsed.notes] || '') : '';
    const category = LONG.test(note) ? 'long' : QUALITY.test(note) ? 'quality' : EASY.test(note) ? 'easy' : 'other';
    out.push({ index, name, note, category });
  });
  return out;
}

// --- 1. Week 1 starts from what the athlete already does ---------------------

function capWeekOneVolume(program, intake) {
  const cap = currentWeeklyKm(intake);
  if (!cap) return program;
  const parsed = parseWeek(program, 1);
  if (!parsed) return program;
  const rows = runRows(parsed);
  if (!rows.length) return program;

  const km = rows.map((r) => maxKm(parsed.rows[r.index][parsed.reps]));
  if (km.some((k) => !k)) return program; // a run with no distance is not ours to scale
  const total = km.reduce((n, k, i) => n + k * setsOf(parsed.rows[rows[i].index][parsed.sets]), 0);
  if (total <= cap) return program;

  // Scale every run by the same factor so the shape of the week survives, then
  // round down to the half kilometre so the total cannot creep back over.
  const factor = cap / total;
  const cells = parsed.rows.map((c) => c.slice());
  rows.forEach((r, i) => {
    const scaled = Math.max(1, Math.floor(km[i] * factor * 2) / 2);
    const raw = String(cells[r.index][parsed.reps] || '');
    cells[r.index][parsed.reps] = raw.replace(/\b\d+(?:\.\d+)?\s*km\b/i, `${scaled} km`);
  });
  const rebuilt = [parsed.header.join('\t'), ...cells.map((c) => c.join('\t'))].join('\n');
  return program.replace(parsed.re, `$1${rebuilt}$3`);
}

// --- 2 & 3. One lever per transition -----------------------------------------

function paceSeconds(text) {
  const m = String(text || '').match(/\b(\d{1,2}):([0-5]\d)\s*\/\s*km\b/i);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function doseText(parsed, cells) {
  return [
    String(cells[parsed.reps] || ''),
    Number.isInteger(parsed.load) ? String(cells[parsed.load] || '') : '',
    Number.isInteger(parsed.notes) ? String(cells[parsed.notes] || '') : '',
  ].join(' ');
}
function categoryVolume(parsed, rows, category) {
  return rows.filter((r) => r.category === category).reduce((n, r) => {
    const cells = parsed.rows[r.index];
    const dose = doseText(parsed, cells);
    const km = maxKm(dose);
    const mins = [...dose.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/ig)].map((m) => Number(m[1]));
    const unit = km > 0 ? km : (mins.length ? Math.max(...mins) : 0);
    return n + unit * setsOf(cells[parsed.sets]);
  }, 0);
}
function bestPace(parsed, rows, category) {
  let best = null;
  rows.filter((r) => r.category === category).forEach((r) => {
    const p = paceSeconds(doseText(parsed, parsed.rows[r.index]));
    if (p != null) best = best == null ? p : Math.min(best, p);
  });
  return best;
}

// Rewrite every pace the cells state to one value. A pace lives wherever the
// model put it -- the dose cell, the load cell or the note -- and copying only
// the structured columns left a held category still getting faster, which is
// the same stacked progression under a different column.
function setPace(cells, parsed, index, seconds) {
  if (seconds == null) return false;
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}/km`;
  let changed = false;
  for (const col of [parsed.reps, parsed.load, parsed.notes]) {
    if (!Number.isInteger(col)) continue;
    const before = String(cells[index][col] || '');
    const after = before.replace(/\b\d{1,2}:[0-5]\d\s*\/\s*km\b/ig, mmss);
    if (after !== before) { cells[index][col] = after; changed = true; }
  }
  return changed;
}

// Put a category's prescriptions back to the previous week's, row for row, pace
// included. The note keeps its words: it carries the category, and the
// note-coherence repair downstream restates any claim the numbers no longer
// support.
function copyCategory(prevParsed, prevRows, cells, parsed, rows, category) {
  const from = prevRows.filter((r) => r.category === category);
  const to = rows.filter((r) => r.category === category);
  let changed = false;
  for (let i = 0; i < Math.min(from.length, to.length); i += 1) {
    const src = prevParsed.rows[from[i].index];
    const dst = cells[to[i].index];
    for (const col of [parsed.reps, parsed.sets, parsed.load]) {
      if (!Number.isInteger(col)) continue;
      const srcCol = col === parsed.reps ? prevParsed.reps : col === parsed.sets ? prevParsed.sets : prevParsed.load;
      if (!Number.isInteger(srcCol)) continue;
      if (dst[col] === src[srcCol]) continue;
      dst[col] = src[srcCol];
      changed = true;
    }
  }
  const heldPace = bestPace(prevParsed, prevRows, category);
  for (const r of to) if (setPace(cells, parsed, r.index, heldPace)) changed = true;
  return changed;
}

function oneLeverPerTransition(program, intake) {
  let out = program;
  for (let week = 2; week <= 4; week += 1) {
    const prev = parseWeek(out, week - 1);
    const cur = parseWeek(out, week);
    if (!prev || !cur) continue;
    const prevRows = runRows(prev);
    const curRows = runRows(cur);
    if (!prevRows.length || !curRows.length) continue;

    const up = (c) => categoryVolume(cur, curRows, c) > categoryVolume(prev, prevRows, c);
    const prevPace = bestPace(prev, prevRows, 'quality');
    const curPace = bestPace(cur, curRows, 'quality');
    const paceUp = prevPace != null && curPace != null && curPace < prevPace;
    const qualityUp = up('quality') || paceUp;
    const longUp = up('long');
    const easyUp = up('easy');
    if ([qualityUp, easyUp, longUp].filter(Boolean).length <= 1 && !(up('quality') && paceUp)) continue;

    const lever = longUp ? 'long' : qualityUp ? 'quality' : 'easy';
    const cells = cur.rows.map((c) => c.slice());
    let changed = false;
    for (const category of ['long', 'quality', 'easy']) {
      if (category === lever) continue;
      if (copyCategory(prev, prevRows, cells, cur, curRows, category)) changed = true;
    }

    // A quality run that got both longer and faster keeps the distance and
    // gives the pace back, so exactly one variable moved.
    if (lever === 'quality' && up('quality') && paceUp && prevPace != null) {
      curRows.filter((r) => r.category === 'quality')
        .forEach((r) => { if (setPace(cells, cur, r.index, prevPace)) changed = true; });
    }
    if (!changed) continue;
    const rebuilt = [cur.header.join('\t'), ...cells.map((c) => c.join('\t'))].join('\n');
    out = out.replace(cur.re, `$1${rebuilt}$3`);
  }
  return out;
}

// --- 4. Maintenance strength stays maintenance -------------------------------

const LOWER = /\b(?:back squat|front squat|box squat|deadlift|romanian deadlift|rdl|lunge|split squat|hip thrust|leg press|step-up)\b/i;
const topNumber = (x) => {
  const a = [...String(x || '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return a.length ? Math.max(...a) : null;
};

function maintenanceIsMaintenance(program, intake) {
  const primary = goalText(intake, 'primary_goals');
  const secondary = goalText(intake, 'secondary_goals');
  if (!/\bmarathon\b/i.test(primary)) return program;
  if (!/(?:maintain|maintenance)[^|]{0,40}strength|stay durable|durability/i.test(secondary)) return program;

  const first = parseWeek(program, 1);
  if (!first) return program;
  const rpeCol = (p) => p.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
  const baseline = new Map();
  first.rows.forEach((cells) => {
    const ex = String(cells[first.exercise] || '').trim();
    if (!LOWER.test(ex)) return;
    baseline.set(ex.toLowerCase(), { reps: cells[first.reps], rpe: rpeCol(first) >= 0 ? cells[rpeCol(first)] : null });
  });
  if (!baseline.size) return program;

  let out = program;
  // Only the last week is compared against the first, so that is where the
  // maintenance dose is put back.
  const last = parseWeek(out, 4);
  if (!last) return out;
  const lastRpe = rpeCol(last);
  const cells = last.rows.map((c) => c.slice());
  let changed = false;
  last.rows.forEach((row, i) => {
    const ex = String(row[last.exercise] || '').trim();
    const base = baseline.get(ex.toLowerCase());
    if (!base) return;
    const repsUp = topNumber(row[last.reps]) != null && topNumber(base.reps) != null
      && topNumber(row[last.reps]) > topNumber(base.reps);
    const rpeUp = lastRpe >= 0 && base.rpe != null && topNumber(row[lastRpe]) != null && topNumber(base.rpe) != null
      && topNumber(row[lastRpe]) > topNumber(base.rpe);
    if (!repsUp || !rpeUp) return;
    // Give back the effort, keep the reps: the rule objects to both moving at
    // once on a movement the athlete is only meant to be holding on to.
    cells[i][lastRpe] = base.rpe;
    changed = true;
  });
  if (!changed) return out;
  const rebuilt = [last.header.join('\t'), ...cells.map((c) => c.join('\t'))].join('\n');
  return out.replace(last.re, `$1${rebuilt}$3`);
}

export function repairMarathonProgression(program, intake = {}) {
  if (!marathonGoal(intake)) return String(program || '');
  let out = String(program || '');
  out = capWeekOneVolume(out, intake);
  out = oneLeverPerTransition(out, intake);
  out = maintenanceIsMaintenance(out, intake);
  return out;
}
