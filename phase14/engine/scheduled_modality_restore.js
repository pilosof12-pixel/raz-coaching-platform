// A week that drops below the athlete's current practice of a goal modality is
// refilled from their own schedule.
//
// TARGET_MODALITY_EXPOSURE_REDUCED had no repair that could answer it, so it
// went back to the model. Run #163's sprint triathlete spent two regenerations
// on it -- about 370 of the build's 565 seconds -- for a Week 4 that ran twice
// when she runs three times a week. The gate is right: a named goal modality is
// not silently cut. But the answer does not need the model. The athlete's
// sport_schedule says which day that session lives on, and the block itself
// already says what a tolerable dose of it is.
//
// So: for each week the gate flags, put the missing scheduled session back on
// its scheduled day, copied from the same session in another week of the
// block, taking the lightest of those doses. Nothing is invented and nothing
// progresses; the athlete gets the session they already do, at a dose the block
// has already given them. The gate is the oracle before and after, so a week
// it does not flag is never touched, and a restore that does not satisfy it is
// not kept.

import { endurancePerformanceIntegrityFlags, modalityExposurePattern } from './phase15_elite_guardrails.js';
import { weekdayKey } from './weekday.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SCHEDULE_TYPE = {
  running: /\brun(?:ning)?\b/i,
  cycling: /\b(?:bike|ride|cycl\w*)\b/i,
  swimming: /\bswim(?:ming)?\b/i,
  rowing: /\b(?:row(?:ing)?|erg)\b/i,
};
const RESTORED_NOTE = 'Your scheduled session, kept at the lightest dose this block already uses for it.';

function dayIdx(label) { return WEEKDAYS.indexOf(weekdayKey(String(label || '').trim())); }

function weekTable(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const m = String(program || '').match(re);
  if (!m) return null;
  const lines = m[2].split('\n');
  const header = lines[0].split('\t').map((h) => h.trim().toLowerCase());
  const col = (...names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const idx = {
    day: col('day'), exercise: col('exercise'), weight: col('weight', 'load / target', 'load/target'),
    sets: col('sets'), reps: col('reps', 'reps / duration', 'reps/duration'), notes: col('notes', 'coaching note'),
  };
  if ([idx.day, idx.exercise, idx.sets, idx.reps].some((i) => i < 0)) return null;
  return { re, m, lines, idx };
}

function flagsFor(program, intake, week) {
  const t = weekTable(program, week);
  if (!t) return [];
  const parsed = { idx: t.idx, rows: t.lines.slice(1).filter((l) => l.trim()).map((l) => ({ cells: l.split('\t') })) };
  return endurancePerformanceIntegrityFlags(program, intake, parsed)
    .filter((f) => f.code === 'TARGET_MODALITY_EXPOSURE_REDUCED' && f.key);
}

function isWork(cells, idx) { return !/^\s*\[WARMUP\]/i.test(cells[idx.exercise] || ''); }

// Total work in comparable units: km, then metres, then minutes.
function doseOf(cells, idx) {
  const sets = Math.max(1, Number(String(cells[idx.sets] || '').match(/\d+/)?.[0] || 1));
  const reps = String(cells[idx.reps] || '');
  const km = reps.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  if (km) return Number(km[1]) * sets;
  const m = reps.match(/(\d+(?:\.\d+)?)\s*m\b/i);
  if (m) return (Number(m[1]) / 1000) * sets;
  const min = reps.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (min) return Number(min[1]) * sets / 6; // ~6 min/km, only to order rows within one session type
  return Infinity;
}

export function restoreScheduledModalityExposure(program, intake = {}) {
  const original = String(program || '');
  const unchanged = { program: original, repaired: false, repairs: [] };
  const schedule = Array.isArray(intake.sport_schedule) ? intake.sport_schedule : [];
  if (!schedule.length) return unchanged;

  let current = original;
  const repairs = [];
  for (let week = 1; week <= 4; week += 1) {
    for (const flag of flagsFor(current, intake, week)) {
      const typeRe = SCHEDULE_TYPE[flag.key];
      const exposure = modalityExposurePattern(flag.key);
      if (!typeRe || !exposure) continue;
      const days = schedule
        .filter((e) => typeRe.test(`${e?.type || ''} ${e?.session || ''} ${e?.activity || ''}`))
        .map((e) => dayIdx(e?.day)).filter((d) => d >= 0);

      for (const day of days) {
        if (!flagsFor(current, intake, week).some((f) => f.key === flag.key)) break;
        const t = weekTable(current, week);
        if (!t) break;
        const rows = t.lines.slice(1).map((l) => l.split('\t'));
        const has = rows.some((c) => dayIdx(c[t.idx.day]) === day && isWork(c, t.idx) && exposure.test(c[t.idx.exercise] || ''));
        if (has) continue;

        // The same session elsewhere in the block, lightest first.
        const sources = [];
        for (let w = 1; w <= 4; w += 1) {
          if (w === week) continue;
          const o = weekTable(current, w);
          if (!o) continue;
          for (const l of o.lines.slice(1)) {
            const c = l.split('\t');
            if (dayIdx(c[o.idx.day]) === day && isWork(c, o.idx) && exposure.test(c[o.idx.exercise] || '')) {
              sources.push({ cells: c, dose: doseOf(c, o.idx), week: w });
            }
          }
        }
        if (!sources.length) continue;
        sources.sort((a, b) => (a.dose - b.dose) || (Math.abs(a.week - week) - Math.abs(b.week - week)));
        const copy = sources[0].cells.slice();
        if (copy.length !== t.lines[0].split('\t').length) continue;
        if (t.idx.notes >= 0) copy[t.idx.notes] = RESTORED_NOTE;

        // After the last row on or before that day, so the table stays in week order.
        let at = 0;
        rows.forEach((c, i) => { const d = dayIdx(c[t.idx.day]); if (d >= 0 && d <= day) at = i + 1; });
        const lines = t.lines.slice();
        lines.splice(at + 1, 0, copy.join('\t'));
        const next = current.replace(t.re, `${t.m[1]}${lines.join('\n')}${t.m[3]}`);

        // Kept only if the gate now counts it.
        const before = flagsFor(current, intake, week).find((f) => f.key === flag.key)?.actual_days ?? 0;
        const after = flagsFor(next, intake, week).find((f) => f.key === flag.key)?.actual_days;
        if (after !== undefined && after <= before) continue;
        current = next;
        repairs.push({ week, modality: flag.key, day: WEEKDAYS[day], from_week: sources[0].week });
      }
    }
  }
  return { program: current, repaired: current !== original, repairs };
}
