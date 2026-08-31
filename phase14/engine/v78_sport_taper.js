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

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile, eventType } from './v68_competition_state.js';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function dayKey(d) {
  const s = String(d || '').trim().toLowerCase().slice(0, 3);
  return WEEKDAYS.includes(s) ? s : null;
}
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

// The camp the athlete actually trains, rendered so the taper is visible.
export function renderCampSchedule(intake = {}, now = Date.now()) {
  const plan = sportTaperPlan(intake, now);
  if (!plan) return '';
  const week = sportWeek(intake);
  const gym = arr(intake.available_gym_days).map(dayKey).filter(Boolean);

  const dayCell = (day, hardTarget, hardBaseline) => {
    const s = week.find((x) => x.day === day);
    const parts = [];
    if (s) {
      // Hard days beyond the week's target become technical work.
      const demoted = isHard(s.intensity) && hardTarget < hardBaseline;
      parts.push(isHard(s.intensity) && !demoted ? 'MMA hard'
        : isHard(s.intensity) ? 'MMA technical'
          : isLight(s.intensity) ? 'MMA light' : 'MMA moderate');
    }
    if (gym.includes(day)) parts.push('gym');
    return parts.join(' + ') || 'rest';
  };

  const lines = ['CAMP SCHEDULE', 'Sport sessions are load. The gym is built around them, and the contact comes down as the fight approaches.', ''];
  const head = ['', ...WEEKDAYS.map((d) => LABEL[d]), 'hard contact'];
  const rows = plan.map((p) => {
    let remaining = p.hardTarget;
    const cells = WEEKDAYS.map((d) => {
      const s = week.find((x) => x.day === d);
      if (s && isHard(s.intensity)) {
        const keep = remaining > 0;
        if (keep) remaining -= 1;
        return (keep ? 'MMA hard' : 'MMA technical') + (gym.includes(d) ? ' + gym' : '');
      }
      return dayCell(d, p.hardTarget, p.hardBaseline);
    });
    return [`W${p.week}`, ...cells, `${p.hardTarget} of ${p.hardBaseline}`];
  });

  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)) + 2);
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('').trimEnd();
  lines.push(line(head), ...rows.map(line));
  lines.push('', `Hard contact falls ${plan[0].hardTarget} to ${plan[plan.length - 1].hardTarget} across the block. The last hard session sits far enough from Day 0 that soreness, cognitive fatigue and sleep disruption have resolved.`);
  return lines.join('\n');
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
  const schedule = renderCampSchedule(intake, now);
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
