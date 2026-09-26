// A negative that never gets harder is not a progression.
//
// Run #143 prescribed Freestanding Handstand Push-up Negative as 3x1, 3x1, 3x1,
// 2x1 across the block, with RPE moving 7, 7, 7.5, 7. "Freestanding handstand
// push-up" is one of this athlete's stated secondary goals and this row is its
// only direct exposure, so for three weeks the goal's own exposure asked for
// exactly the same thing. The coach charged it: "the freestanding negative itself
// doesn't meaningfully progress", and asked for a skill-relevant dimension --
// descent duration, range, control -- to advance instead.
//
// A negative has no rep count to add to without stopping being one clean attempt,
// and no load to add. What it has is time under control on the way down, which is
// precisely the quality that earns the press later.
//
// The duration goes in the note, not the Reps cell, which is where
// isometric_duration puts a hold's time. That is not an inconsistency: a hold's
// duration IS its dose, so it belongs in the column carrying the dose, whereas
// this row's dose is genuinely one rep and the tempo qualifies how that rep is
// performed. Writing "1 (4s lower)" into Reps also flips the measured-row
// detection in v35 for no gain.
//
// Nothing is invented where the model already chose a tempo: an existing stated
// descent becomes week 1's baseline and the block grows from it.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// An eccentric-only exposure. "Negative" and "eccentric" are the words the model
// uses; a tempo prescription on a normal set is a different thing and is not here.
const ECCENTRIC = /\b(?:negatives?|eccentrics?)\b/i;
export const isEccentricExposure = (name) => ECCENTRIC.test(String(name || ''));

// The movement without its eccentric suffix, so a row can be matched against the
// goal it serves: the row is "Freestanding Handstand Push-up Negative" and the
// goal is "Freestanding handstand push-up", so the goal text is the shorter one
// and a plain name-in-goal test finds nothing.
const stem = (name) => String(name || '')
  .replace(/\b(?:negatives?|eccentrics?)\b/gi, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function servesANamedGoal(name, intake) {
  const body = norm(stem(name));
  if (body.length < 6) return false;
  const goals = [...arr(intake.primary_goals), ...arr(intake.secondary_goals)].map(norm);
  return goals.some((g) => g.includes(body));
}

// A descent already written in the note, in my canonical form or the model's.
const CANONICAL = /\blower under control for about (\d+(?:\.\d+)?)\s*s\b/i;
const LOOSE_BEFORE = /(\d+(?:\.\d+)?)\s*(?:s\b|secs?\b|seconds?\b)[^.;]{0,24}?\b(?:lower|lowering|descent|descend|negative|eccentric)\b/i;
const LOOSE_AFTER = /\b(?:lower|lowering|descent|descend|negative|eccentric)\b[^.;]{0,24}?(\d+(?:\.\d+)?)\s*(?:s\b|secs?\b|seconds?\b)/i;

export function statedDescent(note) {
  const text = String(note || '');
  for (const re of [CANONICAL, LOOSE_BEFORE, LOOSE_AFTER]) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

const BASE_SECONDS = 3; // the coach's own starting point
const STEP = 1;

// What each week should ask for. The block builds for three weeks and week 4
// consolidates at week 3's standard rather than adding to it, which is what every
// other movement in the block does.
export function descentLadder(base) {
  const start = Number.isFinite(base) && base > 0 ? base : BASE_SECONDS;
  const w3 = start + 2 * STEP;
  return { 1: start, 2: start + STEP, 3: w3, 4: w3 };
}

function exposuresByMovement(program, intake) {
  const found = new Map();
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(String(program || ''), week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    parsed.rows.forEach((cells, row) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !isEccentricExposure(name)) return;
      if (!servesANamedGoal(name, intake)) return;
      const key = name.toLowerCase();
      if (!found.has(key)) found.set(key, []);
      found.get(key).push({ week, row, name, seconds: statedDescent(cells[parsed.notes]) });
    });
  }
  return found;
}

export function collectEccentricTempoFlags(program, intake = {}) {
  const flags = [];
  for (const [, weeks] of exposuresByMovement(program, intake)) {
    const build = weeks.filter((w) => w.week <= 3).sort((a, b) => a.week - b.week);
    if (build.length < 3) continue;
    const seconds = build.map((w) => w.seconds);
    const rises = seconds.every((s, i) => i === 0 || (Number.isFinite(s) && Number.isFinite(seconds[i - 1]) && s > seconds[i - 1]));
    if (Number.isFinite(seconds[0]) && rises) continue;
    flags.push({
      code: 'ECCENTRIC_EXPOSURE_DOES_NOT_PROGRESS',
      severity: 'hard',
      week: build[build.length - 1].week,
      exercise: build[0].name,
      stated: seconds,
      message: `${build[0].name} is the only direct exposure for a stated goal and asks for the same work in Weeks 1 to 3`
        + `${seconds.some(Number.isFinite) ? ` (descent ${seconds.map((s) => (Number.isFinite(s) ? `${s}s` : 'unstated')).join(', ')})` : ' (no descent duration stated)'}.`
        + ' A negative has no reps or load to add, so progress it by time under control on the way down.',
    });
  }
  return flags;
}

export function repairEccentricTempo(program, intake = {}) {
  let out = String(program || '');
  const moves = [];
  if (!collectEccentricTempoFlags(out, intake).length) return { program: out, moves };

  for (const [, weeks] of exposuresByMovement(out, intake)) {
    const build = weeks.filter((w) => w.week <= 3);
    if (build.length < 3) continue;
    const ladder = descentLadder(build.find((w) => w.week === 1)?.seconds);

    for (const exposure of weeks) {
      const wanted = ladder[exposure.week];
      if (!Number.isFinite(wanted)) continue;
      const parsed = parseWeek(out, exposure.week);
      if (!parsed || !Number.isInteger(parsed.notes)) continue;
      const rows = parsed.rows.map((cells) => cells.slice());
      const note = String(rows[exposure.row][parsed.notes] || '');
      const next = writeDescent(note, wanted);
      if (next === note) continue;
      rows[exposure.row][parsed.notes] = next;
      out = rebuild(out, parsed, rows);
      moves.push({ type: 'eccentric_descent_prescribed', week: exposure.week, exercise: exposure.name, seconds: wanted });
    }
  }
  return { program: out, moves };
}

// Rewrite the number where one is already stated, so the model's own phrasing
// survives; otherwise add the sentence. Replacing in place is what makes this
// idempotent: a second pass finds the wanted number and changes nothing.
function writeDescent(note, seconds) {
  const text = String(note || '');
  for (const re of [CANONICAL, LOOSE_BEFORE, LOOSE_AFTER]) {
    const m = text.match(re);
    if (!m) continue;
    if (Number(m[1]) === seconds) return text;
    const at = m.index + m[0].indexOf(m[1]);
    return text.slice(0, at) + String(seconds) + text.slice(at + m[1].length);
  }
  const trimmed = text.trim();
  const sentence = `Lower under control for about ${seconds}s.`;
  return trimmed ? `${trimmed.replace(/[\s;]*$/, '').replace(/([^.!?])$/, '$1.')} ${sentence}` : sentence;
}
