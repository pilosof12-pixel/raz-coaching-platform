// engine/v78_sport_taper.js
//
// Taper the camp, not just the gym.
//
// The engine has always held the fighter's full week -- seven sessions with
// their intensities -- and never once showed it. The athlete received two gym
// days and no view of the thing those days are built around, and nothing in
// the program said when the last hard sparring should be.
//
// A gym taper inside an untapered camp is not a taper. The cluster is explicit
// that hard sparring is the major CNS, metabolic, tissue and technical
// stressor, and that the last truly damaging live exposure has to sit early
// enough that soreness, cognitive fatigue and sleep disruption have resolved
// before Day 0.

import { weekdayKey as dayKey } from './weekday.js';
import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile, eventType } from './v68_competition_state.js';
import { eventWeekday } from './v77_fight_week_clock.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
const isHard = (i) => /hard|spar|live|competition|intense/i.test(String(i || ''));
const isLight = (i) => /light|easy|technical|drill|recovery/i.test(String(i || ''));

export function sportWeek(intake = {}) {
  return arr(intake.sport_schedule)
    .map((s) => ({ day: dayKey(s && s.day), intensity: String((s && s.intensity) || '').toLowerCase() }))
    .filter((s) => s.day);
}

export function governsSportTaper(intake = {}, now = Date.now()) {
  if (eventType(intake) !== 'combat') return false;
  if (!sportWeek(intake).length) return false;
  const profile = competitionProfile(intake, now);
  return Boolean(profile) && profile.weeks.some((w) => w.state !== STATE.NORMAL);
}

// How much hard contact each week should carry. The last damaging exposure
// belongs early enough to have resolved; fight week keeps technical feel only.
export function sportTaperPlan(intake = {}, now = Date.now()) {
  if (!governsSportTaper(intake, now)) return null;
  const week = sportWeek(intake);
  const hard = week.filter((s) => isHard(s.intensity)).length;
  const profile = competitionProfile(intake, now);

  return profile.weeks.map((w) => {
    let target;
    switch (w.state) {
      case STATE.COMPETITION_WEEK: target = 0; break;
      case STATE.TAPER: target = Math.max(1, Math.floor(hard / 2)); break;
      case STATE.LATE_CAMP: target = Math.max(1, hard - 1); break;
      default: target = hard;
    }
    return { week: w.week, state: w.state, hardTarget: target, hardBaseline: hard };
  });
}

// What the camp actually is, week by week and day by day. Rendering used to
// compute this inline, which meant anything else wanting to know whether a
// given Friday was hard had to work it out again -- and the row notes did
// exactly that, from the intake, while the schedule demoted the same Friday to
// technical to hit its hard-contact target. Two derivations, one truth, and the
// athlete read both. So the table is now a view of this, and so is every check.
export function campPlanByWeek(intake = {}, now = Date.now(), options = {}) {
  const plan = sportTaperPlan(intake, now);
  if (!plan) return null;
  const week = sportWeek(intake);
  const planned = arr(intake.available_gym_days).map(dayKey).filter(Boolean);
  const actual = options.workingDays instanceof Map ? options.workingDays : null;
  const gymFor = (weekNumber) => {
    const days = actual?.get(weekNumber);
    return days && days.size ? [...days] : planned;
  };
  const eventDay = eventWeekday(intake);
  const eventIndex = eventDay ? WEEKDAYS.indexOf(eventDay) : -1;
  // The fight is not always in week 4.
  //
  // This asked whether a week was the LAST week of the block, which is only the
  // same question when the event happens to land there. The fight-camp corpus
  // has a bout nineteen days out, so the competition week is week 3 -- and week
  // 4, which is entirely after the fight, was rendered as an ordinary training
  // week. The calendar then prescribed MMA on fight day and the day after it,
  // with more hard contact in that week than in any other, and the build was
  // refused for V91_CALENDAR_TRAINS_THROUGH_THE_EVENT on a program the model
  // had delivered clean.
  const competitionWeekNumber = plan.find((p) => p.state === STATE.COMPETITION_WEEK)?.week;

  const out = new Map();
  for (const p of plan) {
    const gym = gymFor(p.week);
    let remaining = p.hardTarget;
    const isEventWeek = eventIndex >= 0 && p.week === competitionWeekNumber;
    // Nothing in this block sits after Day 0, so a week past the fight is not a
    // lighter week, it is not part of the block at all.
    const isAfterEvent = competitionWeekNumber != null && p.week > competitionWeekNumber;
    const days = new Map();
    WEEKDAYS.forEach((d, i) => {
      if (isAfterEvent) return days.set(d, { after: true, sport: null, gym: false, clock: '' });
      if (isEventWeek && i === eventIndex) return days.set(d, { event: true, sport: null, gym: false, clock: '' });
      if (isEventWeek && i > eventIndex) return days.set(d, { after: true, sport: null, gym: false, clock: '' });
      const clock = isEventWeek ? `D-${eventIndex - i} ` : '';
      const s = week.find((x) => x.day === d);
      let sport = null;
      if (s && isHard(s.intensity)) {
        // Hard days beyond the week's target become technical work.
        const keep = remaining > 0;
        if (keep) remaining -= 1;
        sport = keep ? 'hard' : 'technical';
      } else if (s) {
        sport = isLight(s.intensity) ? 'light' : 'moderate';
      }
      return days.set(d, { sport, gym: gym.includes(d), clock });
    });
    out.set(p.week, { ...p, days });
  }
  return out;
}

const cellText = (d) => {
  if (d.event) return 'FIGHT DAY';
  if (d.after) return '-';
  const parts = [];
  if (d.sport) parts.push(`MMA ${d.sport}`);
  if (d.gym) parts.push('gym');
  return d.clock + (parts.join(' + ') || 'rest');
};

// The camp the athlete actually trains, rendered so the taper is visible.
export function renderCampSchedule(intake = {}, now = Date.now(), options = {}) {
  const byWeek = campPlanByWeek(intake, now, options);
  if (!byWeek) return '';
  const plan = [...byWeek.values()];

  const lines = ['CAMP SCHEDULE', 'Sport sessions are load. The gym is built around them, and the contact comes down as the fight approaches.', ''];
  const head = ['', ...WEEKDAYS.map((d) => LABEL[d]), 'hard contact'];

  // A week after the fight has no contact target: printing one said "3 of 3"
  // beside a row of dashes, which is the table disagreeing with itself.
  const rows = plan.map((p) => {
    const cells = WEEKDAYS.map((d) => cellText(p.days.get(d)));
    const afterEvent = cells.every((c) => c === '-');
    return [`W${p.week}`, ...cells, afterEvent ? '-' : `${p.hardTarget} of ${p.hardBaseline}`];
  });

  // Pipes, not padding. This block sits ahead of the week tables so the
  // sport-taper rule can see it, and a normalizer in that region collapses runs
  // of whitespace -- which turned a column-aligned table into one run-on line in
  // the delivered program and left the spreadsheet nothing it could parse. A
  // delimiter survives; alignment does not.
  const line = (cells) => cells.map((c) => String(c).trim()).join(' | ');
  lines.push(line(head), ...rows.map(line));
  lines.push('', `Hard contact falls ${plan[0].hardTarget} to ${plan[plan.length - 1].hardTarget} across the block. The last hard session sits far enough from Day 0 that soreness, cognitive fatigue and sleep disruption have resolved.`);
  return lines.join('\n');
}

// Which weekdays each week's table actually trains on. The calendar is a view
// of this, not a second opinion about it.
export function workingDaysByWeek(program) {
  const out = new Map();
  for (let w = 1; w <= 4; w += 1) {
    const parsed = parseWeek(program, w);
    if (!parsed) continue;
    const days = new Set();
    let lastDay = '';
    parsed.rows.forEach((cells) => {
      const raw = String(cells[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || /^\s*\[WARMUP\]/i.test(name)) return;
      const key = dayKey(lastDay);
      if (key) days.add(key);
    });
    if (days.size) out.set(w, days);
  }
  return out;
}

const ADDRESSES_SPORT = /\b(?:sparring|spar|live (?:work|rounds)|hard contact|mat time|wrestl|rolling)\b/i;
const ADDRESSES_TAPER = /\b(?:reduce|reduc|cut|fewer|last hard|drop|come down|pull back|taper|withdraw)\b/i;

export function collectSportTaperFlags(program, intake = {}, now = Date.now()) {
  if (!governsSportTaper(intake, now)) return [];
  const narrative = String(program || '').split(/START_WEEK1_TSV/i)[0];
  if (ADDRESSES_SPORT.test(narrative) && ADDRESSES_TAPER.test(narrative)) return [];
  return [{
    code: 'V78_SPORT_TAPER_NOT_ADDRESSED',
    detail: 'The program tapers the gym but never says what happens to the sparring. Hard contact is the largest stressor in this camp, so the block must state when hard sparring and live wrestling come down and where the last hard session sits relative to the fight. A gym taper inside an untapered camp is not a taper.',
  }];
}

export function buildSportTaperBrief(intake = {}, now = Date.now()) {
  const plan = sportTaperPlan(intake, now);
  if (!plan) return '';
  const week = sportWeek(intake);
  const layout = week.map((s) => `${LABEL[s.day]} ${s.intensity}`).join(', ');
  return [
    `* TAPER THE CAMP, NOT ONLY THE GYM. The athlete's sport week is: ${layout}.`,
    '  Hard sparring and live wrestling are the largest stressors here -- CNS, metabolic, tissue and technical at once. The gym is built around them and must not be planned as though they were not happening.',
    `  Hard contact comes down as the fight approaches: about ${plan[0].hardTarget} hard sessions in Week 1, ${plan[2] ? plan[2].hardTarget : 1} in the taper week, and none in fight week beyond technical and tactical work at competition speed.`,
    '  Say explicitly in the summary when hard sparring reduces and where the last hard session sits. The last truly damaging exposure must be early enough that soreness, cognitive fatigue and sleep disruption have resolved before Day 0.',
    '  Replacing a hard round with a technical round is a reduction in cost, not in skill: keep the frequency and take out the damage.',
  ].join('\n');
}

export function appendCampSchedule(program, intake = {}, now = Date.now()) {
  const source = String(program || '');
  const schedule = renderCampSchedule(intake, now, { workingDays: workingDaysByWeek(source) });
  if (!schedule || source.includes('CAMP SCHEDULE')) return source;

  // Before the week tables, not after them. The schedule is the context the
  // weeks are read against -- and the sport-taper rule reads the narrative
  // section only, so a schedule appended at the end would leave the very flag
  // it answers still standing.
  const m = source.match(/\n?START_WEEK1_TSV/i);
  if (!m) return `${source.replace(/\s*$/, '')}\n\n${schedule}\n`;
  const at = source.indexOf(m[0]);
  return `${source.slice(0, at).replace(/\s*$/, '')}\n\n${schedule}\n${source.slice(at)}`;
}

// --- the rows must describe the camp the schedule shows ----------------------
//
// A delivered fight camp told the athlete every Friday that the gym session was
// "deliberately low-cost after hard MMA". The camp schedule two hundred lines
// above said Friday was MMA technical, in all four weeks. Both were written by
// this engine: the schedule demoted Friday to hit its hard-contact target, and
// the notes were written from the intake, which still called Friday hard.
//
// The athlete reads the note at the top of the session he is about to do. If it
// tells him he has just done hard sparring when he has not, the entire premise
// of that session's dose is wrong -- and in a taper week that is the difference
// between recovering and under-training.

const SPORT_STATE = /\b(?:after|following)\s+(?:a\s+|the\s+)?(hard|technical|moderate|light|easy)\s+(?:MMA|mat|sport|sparring|session|training)\b/gi;
const NORMALISE = { hard: 'hard', technical: 'technical', moderate: 'moderate', light: 'light', easy: 'light' };

// Walk each week's rows with the day they belong to, carrying the last named
// day forward the way the tables themselves do. The collector and the repair
// both go through here, so neither can develop its own opinion about which
// Friday it is looking at.
function eachSportRow(program, intake, now, visit) {
  const byWeek = campPlanByWeek(intake, now);
  if (!byWeek) return null;
  const source = String(program || '');
  let out = source;
  for (const [week, plan] of byWeek) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    let lastDay = '';
    let touched = false;
    const rows = parsed.rows.map((cells) => {
      const raw = String(cells[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      const key = dayKey(lastDay);
      const day = key && plan.days.get(key);
      if (!day || !day.sport) return cells;
      const next = visit({ week, day: key, sport: day.sport, cells });
      if (next && next !== cells) touched = true;
      return next || cells;
    });
    if (!touched) continue;
    const body = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${body}$3`);
  }
  return out;
}

function sportStateMismatches(program, intake, now) {
  const found = [];
  eachSportRow(program, intake, now, ({ week, day, sport, cells }) => {
    for (const m of cells.join(' ').matchAll(SPORT_STATE)) {
      const said = NORMALISE[m[1].toLowerCase()];
      if (said !== sport) found.push({ week, day, said, actual: sport, phrase: m[0] });
    }
    return cells;
  });
  return found;
}

export function collectSportStateFlags(program, intake = {}, now = Date.now()) {
  return sportStateMismatches(program, intake, now).map((m) => ({
    code: 'V78_SPORT_STATE_MISDESCRIBED',
    week: m.week,
    day: m.day,
    detail: `Week ${m.week} ${LABEL[m.day]} tells the athlete the session comes "${m.phrase}", and the camp schedule for that day says MMA ${m.actual}. The schedule is what the block tapered to; the note is describing the camp the athlete was doing before this program changed it. Describe the sport session the athlete is actually being sent to.`,
  }));
}

// Rewritten cell by cell, never document-wide. Replacing the matched phrase
// across the whole program looked simpler and was wrong: "after hard MMA"
// appears on Tuesday, where the answer is moderate, and on Friday, where it is
// technical, so fixing Tuesday silently made Friday wrong in a new way. The
// stress suite caught it; the unit tests, which only ever damaged one day, did
// not.
export function repairSportStateLanguage(program, intake = {}, now = Date.now()) {
  const source = String(program || '');
  const out = eachSportRow(source, intake, now, ({ sport, cells }) => {
    const next = cells.map((cell) => String(cell).replace(SPORT_STATE, (phrase) => phrase.replace(/\b(hard|technical|moderate|light|easy)\b/i, sport)));
    return next.some((c, i) => c !== cells[i]) ? next : cells;
  });
  if (out == null || out === source) return { program: source, changed: false };
  return { program: out, changed: true };
}
