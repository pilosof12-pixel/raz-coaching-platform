// An isometric hold is prescribed in seconds, not in reps.
//
// Run #142 wrote Freestanding Handstand Hold as 6 sets of 1 rep, with "aim for
// 5-8s with a clean line" in the note. The athlete reads the prescription
// columns; "1 rep" tells him nothing about what the set is, and the work is only
// discoverable by reading prose. The coach charged it, and asked for the duration
// to live in the field that carries the prescription.
//
// Every other hold in that block already did this -- Plank 40s, Advanced Tuck
// Planche 6s, Front Lever 10s -- so this is a row the model wrote in the wrong
// shape rather than a convention the engine lacks.
//
// The duration is moved, never invented. A hold whose note names no duration is
// left alone: there is nothing to move, and choosing a hold time for an athlete
// is composing training rather than repairing it.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));

// Movements held rather than repeated. A handstand push-up, a negative and a row
// all contain words that appear in hold names, so the exclusions carry weight.
const HELD = /\b(?:hold|lever|planche|plank|hang|l[- ]?sit|bridge|flag|iron cross)\b/i;
const REPEATED = /\b(?:push[- ]?up|press|negative|pull[- ]?up|chin[- ]?up|row|dip|curl|squat|lunge|raise|muscle[- ]?up|kick[- ]?up|jump|carry|walk)\b/i;
const HAS_TIME = /\d\s*(?:s\b|sec|second|min|minute|:\d{2})/i;

// A duration the note already states, longest form first so "5-8 s" is not read
// as "5".
const NOTED_DURATION = /\b(\d+(?:\.\d+)?\s*(?:[-–]\s*\d+(?:\.\d+)?)?)\s*(?:s\b|secs?\b|seconds?\b)/i;

export function isHeldMovement(name) {
  const n = String(name || '');
  return HELD.test(n) && !REPEATED.test(n);
}

export function collectIsometricDurationFlags(program, intake = {}) {
  void intake;
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(String(program || ''), week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    for (const row of parsed.rows) {
      const name = String(row[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !isHeldMovement(name)) continue;
      const reps = String(row[parsed.reps] || '');
      if (HAS_TIME.test(reps)) continue;
      // Only where the duration exists to be moved, so the rule always has an
      // answer. A hold with no stated time anywhere is a gate with no repair.
      const noted = String(row[parsed.notes] || '').match(NOTED_DURATION);
      if (!noted) continue;
      flags.push({
        code: 'ISOMETRIC_DURATION_MUST_BE_IN_PRESCRIPTION',
        severity: 'hard',
        week,
        exercise: name,
        reps,
        duration: noted[1],
        message: `Week ${week} prescribes ${name} as ${reps} rep(s) and states the hold time only in the note. A hold is prescribed in seconds; the athlete reads the Reps column, so the duration belongs there.`,
      });
    }
  }
  return flags;
}

export function repairIsometricDuration(program, intake = {}) {
  void intake;
  let out = String(program || '');
  const moves = [];

  // A consolidation week often names no time because it points at one: "keep the
  // best clean balance standard you owned in Week 3". That standard is a number
  // the program already establishes, so carrying it forward is restating rather
  // than choosing a hold time for the athlete. Without it, week 4 keeps reading
  // "1 rep" for a movement that is held.
  const established = new Map();
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    for (const row of parsed.rows) {
      const name = String(row[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !isHeldMovement(name)) continue;
      const reps = String(row[parsed.reps] || '');
      if (HAS_TIME.test(reps)) established.set(name.toLowerCase(), reps.trim());
    }
  }

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let changed = false;

    for (const row of cells) {
      const name = String(row[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !isHeldMovement(name)) continue;
      const reps = String(row[parsed.reps] || '');
      if (HAS_TIME.test(reps)) continue;
      const noted = String(row[parsed.notes] || '').match(NOTED_DURATION);
      const carried = established.get(name.toLowerCase());
      if (!noted && !carried) continue;

      const duration = noted
        ? `${noted[1].replace(/\s*[-\u2013]\s*/, '-')}s`
        : carried;
      row[parsed.reps] = duration;
      // Weeks run in order, so a duration set here is available to carry into the
      // weeks after it. Without this the map only ever saw the original text and
      // a second pass was needed to reach week 4, which made the repair
      // non-idempotent.
      established.set(name.toLowerCase(), duration);
      moves.push({ week, exercise: name, from: reps, to: duration });
      changed = true;
    }
    if (changed) out = rebuild(out, parsed, cells);
  }

  return { program: out, changed: moves.length > 0, moves };
}
