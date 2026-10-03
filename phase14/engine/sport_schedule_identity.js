// A sport session keeps the day the athlete's schedule gives it.
//
// Coach on run #166's sprint triathlete: her schedule rides Thursday and
// Sunday, and the block wrote a hard bike on Tuesday and a steady ride on
// Friday, next to the gym work, with a note that still talked about "Sunday
// bike quality". Were those two rides extra, or her Thursday and Sunday rides
// moved? The table could not say, and either answer changes her week.
//
// So a ride, run, swim or row written on a day her schedule does not give that
// modality becomes the content of one of her scheduled sessions of it, on a
// scheduled day that does not already hold one -- hard work to the day she
// marked hard, steady work to the other. Only when every scheduled day already
// has its session does the row stay, and then its note says plainly that it
// is extra work, not a replacement.

import { weekdayKey } from './weekday.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MODALITIES = [
  { key: 'bike', row: /^\s*(?:bike|cycling|ride|stationary bike|zone-2 bike|road bike)\b/i, type: /\b(?:bike|ride|cycl\w*)\b/i, noun: 'ride' },
  { key: 'run', row: /^\s*(?:run|running|treadmill run|zone-2 run|easy run|tempo run)\b/i, type: /\brun(?:ning)?\b/i, noun: 'run' },
  { key: 'swim', row: /^\s*swim/i, type: /\bswim/i, noun: 'swim' },
];
const EXTRA_NOTE = (noun, days) => `Extra to your scheduled ${noun}s (${days}): added work, not a replacement for them.`;

const dayIdx = (s) => DAYS.indexOf(weekdayKey(String(s || '').trim()));
const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));

function hard(cells, h) {
  const rpe = String(cells[h.rpe] || '').match(/\d+(?:\.\d+)?/g);
  const top = rpe ? Math.max(...rpe.map(Number)) : 0;
  return top >= 7 || /\b(?:hard|interval|threshold|tt\b|time trial|race pace|vo2)\b/i.test(`${cells[h.exercise]} ${cells[h.notes] || ''}`);
}

function weekTable(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const m = String(program).match(re);
  if (!m) return null;
  const lines = m[2].split('\n');
  const header = lines[0].split('\t').map((x) => x.trim().toLowerCase());
  const h = { day: header.indexOf('day'), exercise: header.indexOf('exercise'), rpe: header.findIndex((x) => /rpe|effort/.test(x)), notes: header.findIndex((x) => /notes|coaching note/.test(x)) };
  if (h.day < 0 || h.exercise < 0) return null;
  return { re, m, header: lines[0], rows: lines.slice(1).map((l) => l.split('\t')), h };
}

export function normalizeSportScheduleIdentity(program, intake = {}) {
  const original = String(program || '');
  const schedule = Array.isArray(intake.sport_schedule) ? intake.sport_schedule : [];
  const unchanged = { program: original, repaired: false, repairs: [] };
  if (!schedule.length) return unchanged;
  // A block labelled by countdown to its event ("Day -5") has no reliable
  // weekday-to-session mapping to move rows by, and the gym-day rules treat it
  // the same way. Left as written.
  if (/^\s*Day\s*-?\d+\b/im.test(original)) return unchanged;

  let out = original;
  const repairs = [];
  for (let week = 1; week <= 4; week += 1) {
    const t = weekTable(out, week);
    if (!t) continue;
    let rows = t.rows;
    let changed = false;
    for (const mod of MODALITIES) {
      const entries = schedule.filter((e) => mod.type.test(`${e?.type || ''} ${e?.session || ''}`)).map((e) => ({ day: dayIdx(e.day), hard: /hard/i.test(String(e.intensity || '')) })).filter((e) => e.day >= 0);
      if (!entries.length) continue;
      const scheduled = new Set(entries.map((e) => e.day));
      const holds = (d) => rows.some((c) => dayIdx(c[t.h.day]) === d && !isWarmup(c[t.h.exercise]) && mod.row.test(c[t.h.exercise] || ''));
      const offDay = rows.map((c, i) => ({ c, i })).filter(({ c }) => !isWarmup(c[t.h.exercise]) && mod.row.test(c[t.h.exercise] || '') && dayIdx(c[t.h.day]) >= 0 && !scheduled.has(dayIdx(c[t.h.day])));
      for (const { c } of offDay) {
        const free = entries.filter((e) => !holds(e.day));
        const wantHard = hard(c, t.h);
        const target = free.find((e) => e.hard === wantHard) || free[0];
        if (!target) {
          if (t.h.notes >= 0 && !/Extra to your scheduled/.test(c[t.h.notes] || '')) {
            const days = [...scheduled].sort().map((d) => LONG[d]).join(', ');
            c[t.h.notes] = `${String(c[t.h.notes] || '').trim()} ${EXTRA_NOTE(mod.noun, days)}`.trim();
            changed = true;
            repairs.push({ week, modality: mod.key, row: c[t.h.exercise], action: 'declared_extra' });
          }
          continue;
        }
        const from = dayIdx(c[t.h.day]);
        rows = rows.filter((r) => r !== c);
        const moved = c.slice();
        moved[t.h.day] = LABEL[target.day];
        const label = `Your scheduled ${LONG[target.day]} ${mod.noun}.`;
        const existing = String(c[t.h.notes] || '').split(label).join('').replace(/^\s+/, '');
        if (t.h.notes >= 0) moved[t.h.notes] = `${label} ${existing.replace(/\b(?:so )?(?:sunday|saturday|friday|thursday|wednesday|tuesday|monday) [a-z ]*?(?:quality|session)[^.;]*/gi, '').replace(/\s{2,}/g, ' ').replace(/\s+([.;,])/g, '$1').trim()}`.trim();
        // Into the target day, keeping the table in weekday order.
        let at = rows.length;
        for (let i = 0; i < rows.length; i += 1) { const d = dayIdx(rows[i][t.h.day]); if (d > target.day) { at = i; break; } }
        rows.splice(at, 0, moved);
        changed = true;
        repairs.push({ week, modality: mod.key, row: c[t.h.exercise], from: LABEL[from], to: LABEL[target.day] });
      }
    }
    if (changed) out = out.replace(t.re, `${t.m[1]}${[t.header, ...rows.map((c) => c.join('\t'))].join('\n')}${t.m[3]}`);
  }
  return { program: out, repaired: out !== original, repairs };
}
