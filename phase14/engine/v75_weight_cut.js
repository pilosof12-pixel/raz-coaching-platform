// engine/v75_weight_cut.js
//
// A weight cut spends the same recovery the training does.
//
// The engine treated the fight camp's tolerance as a function of sport load and
// weeks-out alone. An athlete taking four kilograms off in the last ten days
// has less recovery margin than the same athlete at weight, and every gym
// decision has to come down accordingly -- volume, eccentric load, conditioning
// and accessory work all cost more when the athlete is depleted.
//
// The cluster's rule: "IF a difficult cut is underway, THEN prioritize safe
// weight management and technical freshness over maintaining normal gym
// volume." This module is that rule, plus the arithmetic to know when it fires.
//
// Deliberately out of scope: how to make weight. That is a medical question
// with real risk, the cluster names it as an unresolved source gap, and the
// engine has no business improvising it.

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile, weeksOut } from './v68_competition_state.js';
import { bodyweightKg } from './intake_bodyweight.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function txt(v) { return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' '); }
function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function firstInt(v) { const m = String(v || '').match(/\d+/); return m ? Number(m[0]) : null; }
function topOf(v) {
  const n = [...String(v || '').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return n.length ? Math.max(...n) : null;
}

// "79 kg now, 77 kg class" -> 2 kg to lose. Also reads it out of free text.
// Whether the athlete is making weight at all. Without a weight-class signal
// there is no cut to reason about, and inferring one is how a weightlifter's
// two snatch numbers -- 112 kg in training, 108 kg at his last meet -- became a
// "4 kg weight cut" that capped his effort for a whole peak block and killed
// the build.
export function makingWeight(intake = {}) {
  const said = `${txt(intake.weight_vs_class)} ${txt(intake.weight_class_status)} ${txt(intake.notes)}`;
  if (intake.weigh_in_date) return true;
  if (txt(intake.weight_vs_class).trim()) return true;
  if (/\b(?:weight class|weigh[- ]?in|make weight|making weight|weight cut|cutting weight|division limit|class limit)\b/i.test(said)) return true;
  return /\b(?:cut|lose|drop)\D{0,16}\d{1,2}(?:\.\d)?\s*kg\b/i.test(said);
}

export function cutSize(intake = {}) {
  if (!makingWeight(intake)) return null;
  // The bodyweight-versus-limit pair is only meaningful where the intake is
  // actually talking about the class. Read anywhere else it matches any two kg
  // numbers in a sentence, and a list of lifts is full of those.
  const classText = `${txt(intake.weight_vs_class)} ${txt(intake.weight_class_status)}`;
  const source = `${classText} ${txt(intake.notes)}`;
  const pair = classText.match(/(\d{2,3}(?:\.\d)?)\s*kg[^\d]{0,24}?(\d{2,3}(?:\.\d)?)\s*kg/i);
  if (pair) {
    const a = Number(pair[1]);
    const b = Number(pair[2]);
    if (a > b && a - b <= 15) return Math.round((a - b) * 10) / 10;
  }
  const explicit = source.match(/(?:cut|lose|drop)\D{0,16}(\d{1,2}(?:\.\d)?)\s*kg/i);
  if (explicit) return Number(explicit[1]);
  const bw = bodyweightKg(intake);
  const cls = source.match(/(\d{2,3})\s*kg\s*(?:class|division|limit)/i);
  if (bw && cls && bw > Number(cls[1])) {
    const diff = bw - Number(cls[1]);
    if (diff <= 15) return Math.round(diff * 10) / 10;
  }
  return null;
}

// Weigh-in timing changes the problem: same-day leaves hours to rehydrate,
// day-before leaves a night.
export function weighInWindow(intake = {}, now = Date.now()) {
  const raw = intake?.weigh_in_date;
  if (raw) {
    const when = Date.parse(String(raw));
    const event = intake?.competition_date ? Date.parse(String(intake.competition_date)) : null;
    if (Number.isFinite(when) && Number.isFinite(event)) {
      const hours = Math.round((event - when) / (DAY_MS / 24));
      if (hours >= 0 && hours <= 72) return hours;
    }
  }
  const text = txt(intake.notes).toLowerCase();
  if (/same[- ]day weigh/.test(text)) return 4;
  if (/day[- ]before weigh|24[- ]hour weigh/.test(text)) return 24;
  return null;
}

export function cutSeverity(intake = {}) {
  const declared = String(intake?.weight_class_status || '').toLowerCase();
  const kg = cutSize(intake);
  const bw = bodyweightKg(intake);
  const pct = kg && bw ? (kg / bw) * 100 : null;

  if (declared === 'difficult') return { level: 'difficult', kg, pct };
  // Above about 5% of bodyweight is a hard cut whatever the athlete calls it.
  if (pct != null && pct >= 5) return { level: 'difficult', kg, pct };
  if (declared === 'routine' || (pct != null && pct > 0)) return { level: 'routine', kg, pct };
  if (/weight cut|making weight|weigh[- ]?in/i.test(txt(intake.notes))) return { level: 'routine', kg, pct };
  return { level: 'none', kg: null, pct: null };
}

export function cutIsActive(intake = {}) {
  return cutSeverity(intake).level !== 'none';
}

// When a cut is on, the last two weeks carry less than they otherwise would.
const CUT_RPE_CEILING = 7;

function governedWeeks(intake, now) {
  const profile = competitionProfile(intake, now);
  if (!profile || !cutIsActive(intake)) return [];
  return profile.weeks
    .filter((w) => w.state === STATE.TAPER || w.state === STATE.COMPETITION_WEEK)
    .map((w) => w.week);
}

export function collectWeightCutFlags(program, intake = {}, now = Date.now()) {
  const weeks = governedWeeks(intake, now);
  if (!weeks.length) return [];
  const severity = cutSeverity(intake);
  const flags = [];

  for (const week of weeks) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const rpe = rpeCol >= 0 ? topOf(cells[rpeCol]) : null;
      if (rpe != null && rpe > CUT_RPE_CEILING) {
        flags.push({
          code: 'V75_EFFORT_TOO_HIGH_DURING_CUT',
          week, exercise: name, rpe,
          detail: `Week ${week} prescribes ${name} at RPE ${rpe} while a ${severity.level} weight cut is underway`
            + `${severity.kg ? ` (about ${severity.kg} kg to lose)` : ''}. A depleted athlete has less recovery margin, so the effort ceiling comes down with it.`,
        });
      }
    }
  }
  return flags;
}

export function repairWeightCutLoad(program, intake = {}, now = Date.now()) {
  const weeks = governedWeeks(intake, now);
  if (!weeks.length) return String(program || '');
  let out = String(program || '');

  for (const week of weeks) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
    if (rpeCol < 0) continue;
    const rows = parsed.rows.map((c) => c.slice());
    let changed = false;
    for (const cells of rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const rpe = topOf(cells[rpeCol]);
      if (rpe == null || rpe <= CUT_RPE_CEILING) continue;
      cells[rpeCol] = String(CUT_RPE_CEILING);
      if (Number.isInteger(parsed.notes)) {
        const note = String(cells[parsed.notes] || '').trim();
        const reason = 'Effort held while making weight: a depleted athlete recovers slower, and nothing this week is worth arriving tired for.';
        if (!note.includes('while making weight')) cells[parsed.notes] = note ? `${note} ${reason}` : reason;
      }
      changed = true;
    }
    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export function buildWeightCutBrief(intake = {}, now = Date.now()) {
  if (!cutIsActive(intake) || !competitionProfile(intake, now)) return '';
  const severity = cutSeverity(intake);
  const hours = weighInWindow(intake, now);
  const lines = [
    `* WEIGHT CUT IN PROGRESS (${severity.level}${severity.kg ? `, about ${severity.kg} kg` : ''}): the cut spends the same recovery the training does.`,
    '  Tolerance for gym volume, eccentric load, conditioning and accessory work all drop further than the taper alone would justify. Prioritise safe weight management and technical freshness over maintaining normal gym volume.',
    '  Do not answer weight-cut fatigue with more training. Feeling flat during a cut is the cut, not a fitness problem.',
  ];
  if (hours != null) {
    lines.push(hours <= 12
      ? `  Weigh-in is about ${hours} hours before the event: there is little time to rehydrate and refuel, so the final days must leave the athlete as intact as possible.`
      : `  Weigh-in is about ${hours} hours before the event, which leaves a rehydration and refuelling window. Plan the last sessions around it rather than ignoring it.`);
  }
  lines.push('  How to make the weight is a medical question and outside what this program prescribes. Say so rather than improvising a cut protocol.');
  return lines.join('\n');
}
