// engine/v83_in_season.js
//
// A season is not an event.
//
// Every competition rule in this engine is built backwards from one date: the
// block ends at the event, volume falls into it, and the last week is a taper.
// That shape is wrong for an athlete who competes every week. There is no date
// to count down to, the season outlasts the block, and the requirement is not
// to peak once but to be ready on Saturday and then ready again the Saturday
// after that.
//
// The in-season footballer never even reached the model: the intake saw the
// word "match", concluded there was an event, and refused to build until it was
// given a date that does not exist. Recognising a recurring fixture is what
// lets the rest of the engine plan for availability instead of a peak.

import { parseWeek } from './v34_workload_accounting.js';

const MATCH_INTENSITY = /\b(?:match|game|fixture|competition)\b/i;
const SEASON_LANGUAGE = /\b(?:in[- ]season|mid[- ]season|the season|this season|league|fixture|matchday|match day|every (?:week|saturday|sunday)|most (?:saturdays|sundays|weeks)|each week|weekly match(?:es)?)\b/i;
// Language that only makes sense when there is one thing to arrive at.
//
// Deliberately narrow. Reducing gym load into match day is correct in-season
// practice and is often called tapering, and another brief invites the model to
// label a short session a "taper" to license two exercises. Neither is the
// error here. The error is planning towards a single date, so the pattern
// requires the event, not the word.
const PEAKING_LANGUAGE = /\btaper(?:ing)?\s+(?:in)?to\s+(?:the\s+)?(?:event|competition|meet|fight|race|peak)\b|\btaper(?:ing)?\s+for\s+(?:the\s+)?(?:event|competition|meet|fight|race)\b|\bfinal taper\b|\bpeak(?:ing)? for\b|\bpeak week\b|\b(?:competition|fight|meet) week\b|\brealis?ation (?:phase|block|week)\b|\bbuild(?:ing)? towards? the (?:event|competition|meet|race)\b/i;

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) { return arr(v).map((x) => String(x || '')).join(' '); }
function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function dayKey(d) {
  const s = String(d || '').trim().toLowerCase().slice(0, 3);
  return WEEKDAYS.includes(s) ? s : null;
}

// The days the athlete actually competes, read from the schedule they gave us.
export function matchDays(intake = {}) {
  return arr(intake.sport_schedule)
    .filter((s) => s && MATCH_INTENSITY.test(String(s.intensity || '')))
    .map((s) => dayKey(s.day))
    .filter(Boolean);
}

// Recurring competition, as opposed to one event to build towards. Deliberately
// requires a real signal -- a match on the weekly schedule, or the athlete
// saying so -- because treating a one-off event as a season would remove the
// taper from someone who needs one.
export function isInSeason(intake = {}) {
  if (intake.competition_date || intake.event_date) return false;
  if (matchDays(intake).length) return true;
  const said = txt([intake.notes, intake.primary_goals, intake.secondary_goals, intake.maintenance_goals]);
  return SEASON_LANGUAGE.test(said);
}

// The day before each match: the day a coach can most easily ruin a weekend.
export function protectedDays(intake = {}) {
  const before = new Set();
  for (const day of matchDays(intake)) {
    const i = WEEKDAYS.indexOf(day);
    before.add(WEEKDAYS[(i + 6) % 7]);
  }
  return [...before];
}

// A dose that costs something: more than a single set, or real effort.
function isHardDose(cells, parsed) {
  const sets = Number(String(cells[parsed.sets] || '').match(/\d+/)?.[0]);
  if (Number.isFinite(sets) && sets > 1) return true;
  const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
  if (rpeCol >= 0) {
    const rpe = Number(String(cells[rpeCol] || '').match(/\d+(?:\.\d+)?/)?.[0]);
    if (Number.isFinite(rpe) && rpe >= 7) return true;
  }
  return false;
}

const HIGH_COST = /\b(?:nordic|romanian deadlift|rdl|good ?morning|deadlift|back squat|front squat|depth jump|drop jump|bounding|eccentric|slow eccentric|tempo squat)\b/i;

export function collectInSeasonFlags(program, intake = {}) {
  if (!isInSeason(intake)) return [];
  const flags = [];
  const source = String(program || '');

  // 1. A block that talks about peaking has misread the athlete's calendar.
  const narrative = source.split(/START_WEEK1_TSV/i)[0];
  const peak = narrative.match(PEAKING_LANGUAGE);
  if (peak) {
    flags.push({
      code: 'V83_SEASON_PLANNED_AS_EVENT',
      detail: `The block uses peaking language ("${peak[0]}") for an athlete who competes every week. There is no single date to arrive at and the season outlasts these four weeks, so nothing here should taper into anything. The requirement is to be ready on every match day and still ready the following week.`,
    });
  }

  // 2. Damaging work the day before a match.
  const guarded = protectedDays(intake);
  if (guarded.length) {
    for (let week = 1; week <= 4; week += 1) {
      const parsed = parseWeek(source, week);
      if (!parsed) continue;
      parsed.rows.forEach((cells, row) => {
        const name = String(cells[parsed.exercise] || '').trim();
        const day = dayKey(cells[parsed.day]);
        if (!name || isWarmup(name) || !day || !guarded.includes(day)) return;
        if (!HIGH_COST.test(name)) return;
        // Judge the prescription, not the exercise. A single light set the day
        // before a match is a primer and is ordinary practice; the problem is a
        // hard dose. Keying this on the name alone made a flag its own repair
        // could never clear, however light the set became.
        if (!isHardDose(cells, parsed)) return;
        flags.push({
          code: 'V83_HIGH_COST_WORK_BEFORE_MATCH',
          week, row, exercise: name, day,
          detail: `${name} is prescribed on ${LABEL[day]} (Week ${week}), the day before a match. Work that leaves soreness or takes the edge off speed belongs early in the week, not the day before the athlete is selected to perform. Move it or replace it with something that costs nothing.`,
        });
      });
    }
  }
  return flags;
}

// Peaking words, and what they should have said for an athlete who competes
// every week. Without this the season flag would survive its own repair -- the
// row fix below never touches the narrative -- and spend the attempt budget on
// a sentence no amount of regeneration is guaranteed to reword.
const SEASON_WORDING = [
  [/\btaper(?:ing)?\s+(?:in)?to\s+(?:the\s+)?(?:event|competition|meet|fight|race|peak)\b/gi, 'keep the gym load light into match day'],
  [/\btaper(?:ing)?\s+for\s+(?:the\s+)?(?:event|competition|meet|fight|race)\b/gi, 'keep the gym load light before matches'],
  [/\bfinal taper\b/gi, 'lighter gym week'],
  [/\bpeak week\b/gi, 'match week'],
  [/\b(?:competition|fight|meet) week\b/gi, 'match week'],
  [/\bpeaking for\b/gi, 'staying ready for'],
  [/\bpeak for\b/gi, 'stay ready for'],
  [/\brealis?ation (?:phase|block|week)\b/gi, 'match readiness'],
  [/\bbuild(?:ing)? towards? the (?:event|competition|meet|race)\b/gi, 'staying ready every week'],
];

export function repairSeasonNarrative(program, intake = {}) {
  if (!isInSeason(intake)) return String(program || '');
  const source = String(program || '');
  const split = source.search(/START_WEEK1_TSV/i);
  if (split < 0) return source;
  let narrative = source.slice(0, split);
  const rest = source.slice(split);
  const before = narrative;
  for (const [re, replacement] of SEASON_WORDING) narrative = narrative.replace(re, replacement);
  return narrative === before ? source : narrative + rest;
}

export function repairInSeason(program, intake = {}) {
  if (!isInSeason(intake)) return String(program || '');
  let out = repairSeasonNarrative(program, intake);
  const guarded = protectedDays(intake);
  if (!guarded.length) return out;

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const rows = parsed.rows.map((c) => c.slice());
    let changed = false;

    // The day before a match is not a training slot to be filled. Rather than
    // invent a replacement exercise, cut the cost of what is there: a single
    // light set keeps the movement without spending the weekend.
    rows.forEach((cells) => {
      const name = String(cells[parsed.exercise] || '').trim();
      const day = dayKey(cells[parsed.day]);
      if (!name || isWarmup(name) || !day || !guarded.includes(day)) return;
      if (!HIGH_COST.test(name)) return;
      cells[parsed.sets] = '1';
      if (Number.isInteger(parsed.load)) cells[parsed.load] = 'Light, well short of a hard set';
      const rpeCol = parsed.header.findIndex((h) => /rpe|effort/i.test(String(h || '')));
      if (rpeCol >= 0) cells[rpeCol] = '5-6';
      const note = String(cells[parsed.notes] || '');
      const add = 'Day before a match: this is a primer, not a session. One easy set to keep the pattern, nothing that can be felt tomorrow.';
      if (!note.includes('Day before a match')) cells[parsed.notes] = note ? `${note} ${add}` : add;
      changed = true;
    });

    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export function buildInSeasonBrief(intake = {}) {
  if (!isInSeason(intake)) return '';
  const days = matchDays(intake).map((d) => LABEL[d]);
  const guarded = protectedDays(intake).map((d) => LABEL[d]);
  const lines = [
    '* THIS IS AN IN-SEASON BLOCK. THERE IS NO EVENT TO PEAK FOR.',
    days.length
      ? `  The athlete competes on ${days.join(' and ')}, most weeks, and the season continues past this block.`
      : '  The athlete competes most weeks and the season continues past this block.',
    '  Do not taper, do not peak, and do not build towards a date. Nothing in the block arrives at anything: the athlete has to be ready this weekend and ready again the weekend after. Week 4 is not a culmination, it is another match week.',
    '  Gym work exists to keep them available and fast. It is a minimum effective dose that protects the qualities the sport degrades -- it is not where fitness is built during a season, and a session that leaves them sore has cost more than it bought.',
    guarded.length
      ? `  ${guarded.join(' and ')} is the day before a match and is protected. No heavy, novel or eccentric-heavy work there; keep it light and short or leave it out.`
      : '  The day before a match is protected: no heavy, novel or eccentric-heavy work.',
    '  The day after a match is for recovery, not for making up missed work.',
    '  Progress across the block is measured in availability and retained speed, not in load added. Say plainly that holding a quality through a season is a success, because it is.',
  ];
  return lines.join('\n');
}

// The sport is the load, and until it is on the page the gym is being planned
// against something invisible. The fight camp has had a schedule block since
// v78; an in-season athlete had nothing, so five football sessions and a match
// appeared in the delivered programme only as passing mentions in prose.
export function renderTrainingWeek(intake = {}) {
  if (!isInSeason(intake)) return '';
  const week = arr(intake.sport_schedule)
    .map((s) => ({ day: dayKey(s && s.day), intensity: String((s && s.intensity) || '').trim() }))
    .filter((s) => s.day);
  if (!week.length) return '';

  const gym = new Set(arr(intake.available_gym_days).map(dayKey).filter(Boolean));
  const sport = String(intake.sport || 'sport').replace(/\s*\(.*$/, '').trim();
  const guarded = new Set(protectedDays(intake));

  const cells = WEEKDAYS.map((d) => {
    const s = week.find((x) => x.day === d);
    const parts = [];
    if (s) {
      parts.push(MATCH_INTENSITY.test(s.intensity)
        ? `${sport} MATCH`
        : `${sport} ${s.intensity.toLowerCase()}`);
    }
    if (gym.has(d)) parts.push('gym');
    if (!parts.length) parts.push('rest');
    const label = parts.join(' + ');
    return guarded.has(d) ? `${label} (protected)` : label;
  });

  return [
    'WEEKLY SCHEDULE',
    'The sport is the load. The gym is placed around it, and the day before a match is protected.',
    '',
    ['', ...WEEKDAYS.map((d) => LABEL[d].slice(0, 3))].join(' | '),
    ['Every week', ...cells].join(' | '),
    '',
    'This repeats for all four weeks: the fixture repeats, so the week does. Progress is measured in what the athlete can do on this schedule, not in load added to it.',
  ].join('\n');
}

export function appendTrainingWeek(program, intake = {}) {
  const source = String(program || '');
  const rendered = renderTrainingWeek(intake);
  if (!rendered || source.includes('WEEKLY SCHEDULE')) return source;
  // Before the week tables, where the microcycle rule reads and a coach looks
  // first -- and pipe-delimited, because the normalizer in that region collapses
  // runs of whitespace and would flatten an aligned table into one line.
  const at = source.search(/START_WEEK1_TSV/i);
  if (at < 0) return `${source.replace(/\s*$/, '')}\n\n${rendered}\n`;
  return `${source.slice(0, at).replace(/\s*$/, '')}\n\n${rendered}\n${source.slice(at)}`;
}

export function collectSportWeekFlags(program, intake = {}) {
  if (!isInSeason(intake)) return [];
  if (!arr(intake.sport_schedule).length) return [];
  if (String(program || '').includes('WEEKLY SCHEDULE')) return [];
  return [{
    code: 'V83_SPORT_WEEK_NOT_SHOWN',
    detail: 'The athlete trains and competes on a fixed weekly schedule, and the programme never shows it. Two gym sessions planned around five sport sessions and a match cannot be read, checked or adjusted unless the whole week is on the page. Show the week: sport, gym, match and rest days together.',
  }];
}
