// engine/session_shape.js
//
// Three rules about what a session costs, none of which could be answered.
//
// SESSION_TIME_BUDGET_EXCEEDED refuses a day that will not fit in the time the
// athlete said they have. UNREQUESTED_CONDITIONING_INTERFERENCE refuses hard
// intervals given to someone who asked for low-fatigue aerobic work only.
// ZONE2_DOSE_TOO_SMALL refuses an aerobic goal served by warm-up-sized doses.
// All three live in a module that raises eleven blocking codes, has no test
// file, and repairs none of them.
//
// Each has one mechanical answer, and none of them is a coaching judgement:
// a session that does not fit gets shorter, work the athlete asked not to be
// given is not given, and a dose too small to do anything is made big enough
// to do something.

import { parseWeek } from './v34_workload_accounting.js';
import { estimateSessionMinutes } from './phase15_quality_rules.js';
import { sessionLimit, asksLowFatigueAerobicOnly } from './phase15_program_qa.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const num = (v) => { const m = String(v || '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };

// The same estimate the rule uses, over the rows of one day.
function minutesFor(parsed, cells, indices) {
  return estimateSessionMinutes(indices.map((i) => ({
    exercise: cells[i][parsed.exercise],
    sets: cells[i][parsed.sets],
    reps: cells[i][parsed.reps],
    rest: Number.isInteger(parsed.rest) ? cells[i][parsed.rest] : '',
  })));
}

function daysOf(parsed) {
  const byDay = new Map();
  let lastDay = '';
  parsed.rows.forEach((row, i) => {
    const raw = String(row[parsed.day] || '').trim();
    if (raw) lastDay = raw;
    if (!byDay.has(lastDay)) byDay.set(lastDay, []);
    byDay.get(lastDay).push(i);
  });
  return byDay;
}

// --- 1. The session fits in the time the athlete has -------------------------

export function repairSessionTimeBudget(program, intake = {}) {
  const limit = sessionLimit(intake);
  if (!limit) return String(program || '');
  const ceiling = Math.ceil(limit * 1.10);

  let out = String(program || '');
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => c.slice());
    let changed = false;

    for (const [, indices] of daysOf(parsed)) {
      const working = indices.filter((i) => {
        const name = String(cells[i][parsed.exercise] || '').trim();
        return name && !isWarmup(name);
      });
      if (working.length < 2) continue; // a single movement is the session
      let guard = 0;
      while (minutesFor(parsed, cells, indices) > ceiling && guard < 300) {
        guard += 1;
        // Take a set off whatever is longest, so the session keeps its shape
        // instead of losing a movement. Nothing goes below a working set.
        const target = working
          .map((i) => ({ i, sets: num(cells[i][parsed.sets]) || 0 }))
          .filter((r) => r.sets > 1)
          .sort((a, b) => b.sets - a.sets)[0];
        if (!target) break;
        cells[target.i][parsed.sets] = String(target.sets - 1);
        changed = true;
      }
    }
    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...cells.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

// --- 2 & 3. The aerobic client gets aerobic work -----------------------------

const HARD_CONDITIONING = /(interval|threshold|vo2|amrap|hard conditioning|anaerobic|sprint)/i;
const ZONE2 = /zone.?2/i;
const ZONE2_MIN_MINUTES = 20;
const ZONE2_EXPOSURES = 2;
const EASY_REWRITE = 'Steady, conversational effort: you asked for aerobic work that does not cost you anything the next day, and that is what this is.';

export function repairLowFatigueAerobic(program, intake = {}) {
  if (!asksLowFatigueAerobicOnly(intake)) return String(program || '');
  let out = String(program || '');

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => c.slice());
    let changed = false;

    // Hard conditioning the athlete did not ask for is removed, unless it is
    // the only work on its day -- an empty session helps nobody.
    const byDay = daysOf(parsed);
    const drop = new Set();
    for (const [, indices] of byDay) {
      const working = indices.filter((i) => String(cells[i][parsed.exercise] || '').trim()
        && !isWarmup(cells[i][parsed.exercise]));
      for (const i of working) {
        const name = String(cells[i][parsed.exercise] || '');
        const note = Number.isInteger(parsed.notes) ? String(cells[i][parsed.notes] || '') : '';
        if (isWarmup(name) || !HARD_CONDITIONING.test(`${name} ${note}`)) continue;
        if (working.filter((x) => !drop.has(x)).length <= 1) continue;
        drop.add(i);
        changed = true;
      }
    }

    // A Zone-2 dose below twenty minutes is a warm-up wearing an aerobic name.
    const zone2 = [];
    parsed.rows.forEach((row, i) => {
      if (drop.has(i)) return;
      const name = String(row[parsed.exercise] || '');
      const note = Number.isInteger(parsed.notes) ? String(row[parsed.notes] || '') : '';
      if (isWarmup(name) || !ZONE2.test(`${name} ${note}`)) return;
      zone2.push(i);
      const mins = num(cells[i][parsed.reps]);
      if (mins != null && mins < ZONE2_MIN_MINUTES) {
        cells[i][parsed.reps] = String(cells[i][parsed.reps]).replace(/\d+(?:\.\d+)?/, String(ZONE2_MIN_MINUTES));
        changed = true;
      }
      if (Number.isInteger(parsed.notes) && !note.includes('conversational')) {
        cells[i][parsed.notes] = note.trim() ? `${note.trim()} ${EASY_REWRITE}` : EASY_REWRITE;
        changed = true;
      }
    });

    // Fewer than two meaningful exposures is a dose, not a plan. Lengthen what
    // is there rather than inventing a session the athlete has no day for.
    if (zone2.length && zone2.length < ZONE2_EXPOSURES) {
      for (const i of zone2) {
        const mins = num(cells[i][parsed.reps]) || 0;
        if (mins >= ZONE2_MIN_MINUTES * ZONE2_EXPOSURES) continue;
        cells[i][parsed.reps] = String(cells[i][parsed.reps])
          .replace(/\d+(?:\.\d+)?/, String(ZONE2_MIN_MINUTES * ZONE2_EXPOSURES));
        changed = true;
      }
    }

    if (!changed) continue;
    const kept = cells.filter((_, i) => !drop.has(i));
    const rebuilt = [parsed.header.join('\t'), ...kept.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}
