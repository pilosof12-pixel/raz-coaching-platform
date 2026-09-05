// engine/v77_fight_week_clock.js
//
// Fight week is Day -7 to Day 0, not Monday to Sunday.
//
// A competition week labelled by weekday reads like any other week. The
// athlete's question in fight week is never "what day is it" but "how far is
// this from the fight", and every decision -- the last hard session, the last
// contact, the weigh-in, the final primer -- is answered in days out, not in
// weekdays.
//
// The day column stays a weekday because the whole engine parses it. The clock
// is written into the prescription instead, where the athlete reads it and the
// spreadsheet carries it without the exporter needing to know anything.

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile, weeksOut, eventType } from './v68_competition_state.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function dayKey(d) {
  const s = String(d || '').trim().toLowerCase().slice(0, 3);
  return WEEKDAYS.includes(s) ? s : null;
}

// Which weekday the event falls on, when a real date is known.
export function eventWeekday(intake = {}) {
  const raw = intake?.competition_date || intake?.event_date;
  if (!raw) return null;
  const when = Date.parse(String(raw));
  if (!Number.isFinite(when)) return null;
  return WEEKDAYS[new Date(when).getUTCDay()];
}

// Days from a given weekday to the event, counting backwards within the week.
export function daysOut(weekday, intake = {}) {
  const event = eventWeekday(intake);
  const day = dayKey(weekday);
  if (!event || !day) return null;
  const diff = (WEEKDAYS.indexOf(event) - WEEKDAYS.indexOf(day) + 7) % 7;
  return diff;
}

export function weighInDaysOut(intake = {}) {
  const weigh = intake?.weigh_in_date;
  const event = intake?.competition_date;
  if (!weigh || !event) return null;
  const a = Date.parse(String(weigh));
  const b = Date.parse(String(event));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = Math.round((b - a) / DAY_MS);
  return d >= 0 && d <= 7 ? d : null;
}

const CLOCK = /^Day -?\d+( of \d+)?:/;

// The clock is the same for any event -- Day -7 to Day 0 -- but the words are
// not. Telling a weightlifter about "fight week" is the rule speaking about a
// sport the athlete does not do, and it reads as though the engine has confused
// them with someone else.
function eventNoun(intake = {}) {
  return eventType(intake) === 'combat' ? 'Fight week' : 'Competition week';
}

export function collectFightWeekClockFlags(program, intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  if (!profile || !eventWeekday(intake)) return [];
  const flags = [];

  for (let week = 1; week <= 4; week += 1) {
    if (stateForWeek(intake, week, now) !== STATE.COMPETITION_WEEK) continue;
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const note = String(cells[parsed.notes] || '');
      if (!CLOCK.test(note)) {
        flags.push({
          code: 'V77_FIGHT_WEEK_NOT_ON_THE_CLOCK',
          week, exercise: name,
          detail: `Week ${week} is competition week but ${name} is presented by weekday alone. ${eventNoun(intake)} runs Day -7 to Day 0: every session should say how far it sits from the event, because that is the only thing that decides whether it belongs there.`,
        });
        break;
      }
    }
  }
  return flags;
}

export function repairFightWeekClock(program, intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  if (!profile || !eventWeekday(intake)) return String(program || '');
  let out = String(program || '');
  const weighIn = weighInDaysOut(intake);

  for (let week = 1; week <= 4; week += 1) {
    if (stateForWeek(intake, week, now) !== STATE.COMPETITION_WEEK) continue;
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;

    const rows = parsed.rows.map((c) => c.slice());
    let changed = false;
    for (const cells of rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const note = String(cells[parsed.notes] || '').trim();
      if (CLOCK.test(note)) continue;
      const d = daysOut(cells[parsed.day], intake);
      if (d == null) continue;

      const label = d === 0 ? 'Day 0 (event day)' : `Day -${d}`;
      const weighNote = weighIn != null && d === weighIn ? ' Weigh-in today.' : '';
      cells[parsed.notes] = `${label}:${weighNote} ${note}`.replace(/\s+/g, ' ').trim();
      changed = true;
    }
    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export function buildFightWeekClockBrief(intake = {}, now = Date.now()) {
  const profile = competitionProfile(intake, now);
  if (!profile || !profile.blockEndsAtEvent) return '';
  const weigh = weighInDaysOut(intake);
  const lines = [
    '* FIGHT WEEK IS A COUNTDOWN: present the final week as Day -7 through Day 0, not as ordinary weekdays. Every session in it is judged by how far it sits from the event.',
    '  Build that week backwards: place the last hard contact, the last meaningful gym exposure and the final primer by their distance from Day 0, then fill in what is left.',
    '  Anything whose soreness or fatigue could still be present on Day 0 belongs earlier in the week or nowhere.',
  ];
  if (weigh != null) {
    lines.push(weigh === 0
      ? '  Weigh-in is on Day 0: the last day is dominated by making weight and recovering from it, not by training.'
      : `  Weigh-in is Day -${weigh}: the days before it are constrained by the cut, and the hours after it are for rehydration and refuelling.`);
  }
  return lines.join('\n');
}
