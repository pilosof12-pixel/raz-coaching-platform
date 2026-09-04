// engine/v86_training_clock.js
//
// Every athlete is somewhere on a clock, and the clock governs the block.
//
// The review that prompted this named the pattern exactly: the generator builds
// good sessions but does not always build the larger temporal problem. Three
// athletes, three different clocks, and in each case the sessions were sound
// while the frame around them was not.
//
//   The weightlifter needs an EVENT clock. The meet is a date; every week has a
//   distance from it, and that distance decides what the week is for.
//
//   The footballer needs a MICROCYCLE clock. There is no event, but there is a
//   match every week, and everything is placed by how far it sits from it.
//
//   The returning athlete needs a REHAB clock. Not the injury history -- the
//   stage of the return. Nine months post-injury and discharged is a different
//   athlete from six weeks post-injury, and the same history describes both.
//
// Exactly one clock governs. The rules here make the engine state which, and
// place the block on it, rather than leaving the temporal frame implied.

import { parseWeek } from './v34_workload_accounting.js';
import { competitionProfile, STATE, stateForWeek } from './v68_competition_state.js';
import { isInSeason, matchDays } from './v83_in_season.js';
import { isDischarged } from './v84_injury_constraint.js';

export const CLOCK = { EVENT: 'event', MICROCYCLE: 'microcycle', REHAB: 'rehab', NONE: 'none' };

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) { return arr(v).map((x) => String(x || '')).join(' '); }

// Time since the injury, in months, from the athlete's own account.
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, twenty: 20,
};

export function monthsSinceInjury(intake = {}) {
  const said = txt([intake.injuries, intake.notes, intake.pain && intake.pain.description]);
  // People write "nine months ago" as often as "9 months ago", and reading only
  // the digits put this athlete a whole stage earlier in her return than she is.
  const m = said.match(/(\d+(?:\.\d+)?|[a-z]+)\s*(year|month|week)s?\s+ago/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const n = /^\d/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  return unit === 'year' ? n * 12 : unit === 'week' ? n / 4.345 : n;
}

// A return is a staged process, and the stage -- not the diagnosis -- sets how
// fast the block may progress.
export const STAGE = {
  PROTECTED: 'protected',      // recent, or still symptomatic: capacity before load
  REBUILD: 'rebuild',          // cleared, building tolerance back
  PERFORMANCE: 'performance',  // tolerant, training for the goal again
};

export function rehabStage(intake = {}) {
  const pain = intake.pain || {};
  const months = monthsSinceInjury(intake);
  const cleared = isDischarged(intake);
  const symptomatic = pain.active === true
    && /\b([4-9]|10)\s*\/\s*10\b/.test(String(pain.severity || ''));

  if (symptomatic) return STAGE.PROTECTED;
  if (!cleared && (months == null || months < 3)) return STAGE.PROTECTED;
  if (cleared && months != null && months >= 6) return STAGE.PERFORMANCE;
  return STAGE.REBUILD;
}

export function returningFromInjury(intake = {}) {
  const said = txt([intake.injuries, intake.notes]);
  if (!said.trim() || /none reported/i.test(said)) return false;
  return /\b(?:discharged|cleared|return(?:ing)?|rehab|physio|post[- ]op|since the injury|after the injury|layoff)\b/i.test(said);
}

export function governingClock(intake = {}, now = Date.now()) {
  if (competitionProfile(intake, now)) return CLOCK.EVENT;
  if (isInSeason(intake)) return CLOCK.MICROCYCLE;
  if (returningFromInjury(intake)) return CLOCK.REHAB;
  return CLOCK.NONE;
}

// How the block should describe where it sits. Each clock has its own units:
// weeks out for an event, day-relative for a microcycle, stage for a return.
const CLOCK_MARKERS = {
  [CLOCK.EVENT]: /\b(?:weeks? (?:out|to go|from|before|away)|week -\d|\d+\s*weeks? (?:out|until|before)|runway|weeks? -\d+ to -\d+)\b/i,
  [CLOCK.MICROCYCLE]: /\b(?:match ?day|md\s*[-+]?\d|day (?:before|after) (?:the )?match|the day before a match|days? (?:before|after) (?:the )?match|between matches|every week)\b/i,
  [CLOCK.REHAB]: /\b(?:stage|phase of (?:the )?return|months? (?:since|after|post)|returning|return to (?:sport|performance|training)|graded (?:return|loading)|build(?:ing)? (?:the )?exposure back)\b/i,
};

export function collectClockFlags(program, intake = {}, now = Date.now()) {
  const clock = governingClock(intake, now);
  if (clock === CLOCK.NONE) return [];
  const narrative = String(program || '').split(/START_WEEK1_TSV/i)[0];
  if (CLOCK_MARKERS[clock].test(narrative)) return [];

  const detail = {
    [CLOCK.EVENT]: 'This athlete has a competition date, so the block sits at a known distance from it, and that distance is what decides whether a week builds, sharpens or tapers. The narrative never says where these four weeks fall on that runway. State it: which weeks these are, how far the event is, and what that makes this block.',
    [CLOCK.MICROCYCLE]: 'This athlete competes every week, so the match is the anchor and everything is placed relative to it. The narrative never says so. State which day the match falls on, and describe the week in terms of distance from it rather than as a standalone training week.',
    [CLOCK.REHAB]: 'This athlete is returning from injury, and the stage of that return -- not the diagnosis -- is what governs how fast the block may progress. The narrative never says which stage they are at. State how far past the injury they are, what has been cleared, and what that permits now.',
  }[clock];

  return [{ code: 'V86_GOVERNING_CLOCK_NOT_STATED', clock, detail }];
}

export function buildClockBrief(intake = {}, now = Date.now()) {
  const clock = governingClock(intake, now);
  if (clock === CLOCK.NONE) return '';

  if (clock === CLOCK.EVENT) {
    const profile = competitionProfile(intake, now);
    const states = profile.weeks.map((w, i) => `Week ${i + 1} ${w.state.replace(/_/g, ' ')}`).join(', ');
    return [
      '* THE EVENT DATE GOVERNS THIS BLOCK.',
      `  The event is about ${profile.weeksOut} weeks away, and this block covers ${states}.`,
      profile.blockEndsAtEvent
        ? '  These four weeks run into the event, so the block must arrive: volume comes down, specificity goes up, and the last week is competition week rather than another training week.'
        : '  These four weeks do NOT reach the event. They are a build block on the runway, and the taper is a separate block generated closer to the date. Do not taper here, and do not write as though the athlete is arriving at anything.',
      '  Say in the opening paragraph which weeks of the runway these are and how far the event sits from them. A block that does not state its distance from the event is not being governed by it.',
      '  Every week should differ from the one before it because of where it sits on that runway, not because a template says week 3 is heavy.',
    ].join('\n');
  }

  if (clock === CLOCK.MICROCYCLE) {
    const days = matchDays(intake);
    const label = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
    return [
      '* THE MATCH GOVERNS THE WEEK.',
      days.length
        ? `  The match is on ${days.map((d) => label[d]).join(' and ')}. Everything else is placed by its distance from that day.`
        : '  The athlete competes weekly, and everything is placed by its distance from match day.',
      '  Describe sessions by where they sit in the microcycle -- the day after the match is recovery, the middle of the week carries whatever hard work there is, the day before is short and sharp -- rather than as free-standing gym days.',
      '  The heaviest and most damaging work goes as far from the next match as the week allows, which usually means early. Nothing novel or eccentric-heavy sits within two days of the match.',
      '  The week repeats because the fixture repeats. That is not a lack of progression: the progression is in what the athlete can do on the same schedule, and the narrative should say so rather than inventing variety to look like a plan.',
    ].join('\n');
  }

  const stage = rehabStage(intake);
  const months = monthsSinceInjury(intake);
  const wording = {
    [STAGE.PROTECTED]: 'They are early in the return, or still symptomatic. Build capacity and tolerance before load, keep every exposure well inside what is comfortable, and progress by how the tissue responds rather than by the calendar.',
    [STAGE.REBUILD]: 'They are cleared and rebuilding tolerance. Reintroduce the loaded patterns deliberately and in a controlled range, add one variable at a time, and let each exposure be tolerated twice before it grows.',
    [STAGE.PERFORMANCE]: 'They are far enough out, cleared, and asymptomatic. Train them for the goal. The constraint is real and shapes exercise selection, but it is no longer the subject of the programme -- the goal is.',
  }[stage];
  return [
    '* THE STAGE OF THE RETURN GOVERNS THE PROGRESSION, NOT THE DIAGNOSIS.',
    months != null
      ? `  They are about ${Math.round(months)} months past the injury, which puts them at the ${stage} stage. ${wording}`
      : `  This is the ${stage} stage of a return. ${wording}`,
    '  Say in the opening paragraph how far past the injury they are and what that permits now, so the athlete can see the reasoning rather than a programme that is cautious for reasons it never explains.',
    '  Where the goal movement is also the movement that injured them, the block is the graded reintroduction of that movement. Build it back on purpose, in named steps, rather than avoiding it or assuming it.',
    '  Progress on tolerance, not on the calendar: an exposure earns its increase by being tolerated, and a bad week means holding rather than continuing to the next line of the plan.',
  ].join('\n');
}

// Stating where the block sits is a narrative fact the engine already knows, so
// a program that omits it can be corrected rather than regenerated.
export function repairClockStatement(program, intake = {}, now = Date.now()) {
  const source = String(program || '');
  if (!collectClockFlags(source, intake, now).length) return source;
  const clock = governingClock(intake, now);

  let sentence = '';
  if (clock === CLOCK.EVENT) {
    const profile = competitionProfile(intake, now);
    sentence = profile.blockEndsAtEvent
      ? `This block runs into the event, now about ${profile.weeksOut} weeks away: the final week is competition week, not another training week.`
      : `The event is about ${profile.weeksOut} weeks away, so these four weeks sit on the runway rather than at the end of it. This is a build block; the taper comes later, as its own block.`;
  } else if (clock === CLOCK.MICROCYCLE) {
    const days = matchDays(intake);
    const label = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
    // The wording has to carry a marker the rule recognises, or the remedy
    // leaves the flag it answers still standing -- which is exactly what it did.
    sentence = days.length
      ? `Match day is ${days.map((d) => label[d]).join(' and ')}, and every session in this block is placed by its distance from match day.`
      : 'The athlete competes every week, and every session is placed by its distance from match day.';
  } else {
    const months = monthsSinceInjury(intake);
    const stage = rehabStage(intake);
    sentence = months != null
      ? `This block is written for someone about ${Math.round(months)} months past their injury, at the ${stage} stage of the return, and it progresses on what the tissue tolerates rather than on the calendar.`
      : `This block is written for the ${stage} stage of a return, and it progresses on what the tissue tolerates rather than on the calendar.`;
  }

  const split = source.search(/START_WEEK1_TSV/i);
  if (split < 0) return `${sentence}\n\n${source}`;
  return `${sentence} ${source.slice(0, split).replace(/^\s+/, '')}${source.slice(split)}`;
}
