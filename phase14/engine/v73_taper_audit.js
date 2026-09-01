// engine/v73_taper_audit.js
//
// Show the block moving, or show that it does not.
//
// Every competition program now carries an audit: what the week costs, how much
// of it is the competition movement, how hard it is, and how all of that
// changes from the start of the block to Day 0. The weightlifter block that was
// rated 6.8 would have failed its own audit on sight -- 73 sets and 39% classic
// work in all four weeks -- and nobody could see that without counting by hand.
//
// The audit is computed, never written by the model, so it cannot flatter the
// program it describes.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise } from './v38_movement_taxonomy.js';
import { competitionProfile, STATE, sportSessionsPerWeek } from './v68_competition_state.js';
import { currentMaxes, maxFor } from './v71_intensification.js';

const CLASSIC = /\b(?:snatch|clean and jerk|clean & jerk|power clean|power snatch|hang (?:snatch|clean)|jerk|clean)\b/i;
const SQUAT = /\bsquat\b/i;

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function firstInt(v) { const m = String(v || '').match(/\d+/); return m ? Number(m[0]) : null; }
function topOf(v) {
  const n = [...String(v || '').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return n.length ? Math.max(...n) : null;
}

// One week, counted.
export function auditWeek(program, week, intake = {}) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
  const maxes = currentMaxes(intake);

  let sets = 0; let classic = 0; let squat = 0; let accessory = 0; let power = 0;
  let peakRpe = 0; const rpes = []; const intensities = [];
  const exercises = new Set();

  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) continue;
    exercises.add(name.toLowerCase());
    const n = firstInt(cells[parsed.sets]) || 0;
    sets += n;

    const { category, role } = classifyExercise(name);
    if (CLASSIC.test(name)) classic += n;
    if (SQUAT.test(name)) squat += n;
    if (category === 'power') power += n;
    if (role === 'accessory' || category === 'trunk') accessory += n;

    if (rpeCol >= 0) {
      const r = topOf(cells[rpeCol]);
      if (r != null) { rpes.push(r); peakRpe = Math.max(peakRpe, r); }
    }
    const max = maxFor(name, maxes);
    if (max) {
      const load = topOf(cells[parsed.load]);
      if (load) intensities.push(Math.round((load / max) * 100));
    }
  }

  return {
    week,
    sets,
    exercises: exercises.size,
    classicSets: classic,
    classicShare: sets ? Math.round((classic / sets) * 100) : 0,
    powerSets: power,
    squatSets: squat,
    accessorySets: accessory,
    peakRpe: peakRpe || null,
    avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    peakIntensityPct: intensities.length ? Math.max(...intensities) : null,
    avgIntensityPct: intensities.length ? Math.round(intensities.reduce((a, b) => a + b, 0) / intensities.length) : null,
  };
}

export function auditBlock(program, intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  if (!profile) return null;
  const weeks = [1, 2, 3, 4].map((w) => auditWeek(program, w, intake)).filter(Boolean);
  if (weeks.length < 2) return null;
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const delta = (a, b) => (a == null || b == null ? null : b - a);
  return {
    profile,
    weeks,
    change: {
      sets: delta(first.sets, last.sets),
      exercises: delta(first.exercises, last.exercises),
      classicShare: delta(first.classicShare, last.classicShare),
      peakRpe: delta(first.peakRpe, last.peakRpe),
      peakIntensityPct: delta(first.peakIntensityPct, last.peakIntensityPct),
      accessorySets: delta(first.accessorySets, last.accessorySets),
    },
    sportSessions: sportSessionsPerWeek(intake),
  };
}

const pad = (s, n) => String(s == null ? '-' : s).padEnd(n);

// A plain-text block appended to the program. Deliberately readable by the
// athlete as well as the coach: the point is that the shape is inspectable.
export function renderTaperAudit(program, intake = {}, now = Date.now()) {
  const audit = auditBlock(program, intake, now);
  if (!audit) return '';
  const { profile, weeks, change } = audit;

  const rows = weeks.map((w) => [
    `W${w.week}`,
    profile.weeks[w.week - 1] ? profile.weeks[w.week - 1].state.replace(/_/g, ' ') : '',
    w.sets,
    w.exercises,
    w.classicShare ? `${w.classicShare}%` : '-',
    w.powerSets || '-',
    w.peakRpe ?? '-',
    w.peakIntensityPct ? `${w.peakIntensityPct}%` : '-',
  ]);

  const head = ['', 'phase', 'sets', 'exercises', 'competition lift', 'power sets', 'peak RPE', 'peak % max'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)) + 2);
  const line = (cells) => cells.map((c, i) => pad(c, widths[i])).join('').trimEnd();

  const direction = (v, unit = '') => {
    if (v == null) return 'not stated';
    if (v === 0) return 'unchanged';
    return `${v > 0 ? '+' : ''}${v}${unit}`;
  };

  return [
    'TAPER AUDIT',
    `Event: ${profile.eventType.replace(/_/g, ' ')}, priority ${profile.priority}, about ${profile.weeksOut} weeks out.`,
    profile.blockEndsAtEvent
      ? 'This block runs into the event: the final week is competition week.'
      : 'This block does not reach the event: it is a build block, and the taper comes later.',
    audit.sportSessions ? `Sport sessions counted as load: ${audit.sportSessions} per week.` : '',
    // Stated once, in machine-readable form, so the spreadsheet can name each
    // week for what it is instead of re-deriving a phase from the prose. A
    // phase name is a claim about the prescription, and two places deriving it
    // separately is how a fight week ends up labelled "Consolidate / Express".
    `WEEK PHASES: ${profile.weeks.map((w, i) => `${i + 1}=${w.state}`).join(' ')} EVENT=${profile.eventType}`,
    '',
    line(head),
    ...rows.map(line),
    '',
    `Across the block: volume ${direction(change.sets, ' sets')}, exercises ${direction(change.exercises)}, `
      + `competition-lift share ${direction(change.classicShare, ' points')}, `
      + `peak effort ${direction(change.peakRpe, ' RPE')}, accessory volume ${direction(change.accessorySets, ' sets')}.`,
  ].filter((l) => l !== null).join('\n');
}

// A block that ends where it started is not a competition block, whatever it
// is called. This is the audit refusing to sign off on its own program.
export function collectAuditFlags(program, intake = {}, now = Date.now()) {
  const audit = auditBlock(program, intake, now);
  if (!audit) return [];
  const { change, weeks } = audit;
  const flags = [];

  const nothingMoved = change.sets === 0
    && (change.classicShare === 0 || change.classicShare == null)
    && (change.peakRpe === 0 || change.peakRpe == null);
  if (nothingMoved) {
    flags.push({
      code: 'V73_BLOCK_DOES_NOT_MOVE',
      detail: `Week ${weeks[weeks.length - 1].week} is the same as Week 1 on every axis the audit measures: `
        + `${weeks.map((w) => w.sets).join('/')} sets, ${weeks.map((w) => w.classicShare + '%').join('/')} competition-lift share, `
        + `peak RPE ${weeks.map((w) => w.peakRpe ?? '-').join('/')}. A competition block has to go somewhere.`,
    });
  }
  return flags;
}

// The audit and the camp schedule are deliverables, not diagnostics. Built and
// never wired, they existed only as functions nobody called -- the delivered
// program carried no audit at all. Appended at the end of the program so the
// week tables are untouched and the blocks survive every parser that reads
// them.
export function appendCompetitionBlocks(program, intake = {}, now = Date.now()) {
  const source = String(program || '');
  const audit = renderTaperAudit(source, intake, now);
  if (!audit) return source;

  let out = source;
  if (!out.includes('TAPER AUDIT')) out = `${out.replace(/\s*$/, '')}\n\n${audit}\n`;
  return out;
}
