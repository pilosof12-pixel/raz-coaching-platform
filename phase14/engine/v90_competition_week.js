// engine/v90_competition_week.js
//
// Competition week spends one currency, and it is not fitness.
//
// Nothing in the last seven days makes an athlete stronger. Every set either
// preserves a feel the athlete already has, or it takes something away from
// Day 0. So the question a competition-week row has to answer is not "is this
// good training" -- most of it is -- but "what does this buy that is worth
// arriving less fresh for".
//
// The coach's review named three ways the delivered week failed that test:
// technical touches repeated past the point of usefulness, doubles where a
// single would have said the same thing, and a Day -1 primer written as a
// prescription when it should have been an offer. All three are the same
// mistake -- the week was built as a small training week rather than as a
// descent -- so they are governed together here.
//
// The budget is enforced by shape, not by a list of banned exercises: sessions
// may not grow as Day 0 approaches, and a lift the athlete is peaking for does
// not need more than a few crisp reps to stay sharp.

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile, eventNoun } from './v68_competition_state.js';

const DAY_OFFSET = /day\s*-\s*(\d+)/i;
// Reps a competition lift may keep, per lift, per session. Three singles keeps
// the groove; ten reps of doubles is a training session wearing a taper's name.
const TOUCH_BUDGET = 3;
// Days of competition week a single exercise may appear on.
const MAX_EXPOSURE_DAYS = 2;
// A conditional on a row is not a conditional on the session. "Only if you feel
// snappy" against one box jump left the rule satisfied while the snatches below
// it were still prescribed flatly -- which is the exact week the coach read and
// asked to be made optional. What counts is an offer to skip the session.
const SESSION_OPTIONAL = /\b(?:optional|skip (?:it|this|the session|today)|nothing at all|leave it out|omit (?:it|this))\b/i;

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function num(v) { return Number(String(v || '').match(/\d+/)?.[0]) || 0; }

// Movements the athlete tracks a maximum in are the ones the block is peaking.
// Reading them from the intake rather than from a hardcoded list means the rule
// governs the lifts this athlete actually competes, and stays quiet for someone
// whose event is not a barbell at all.
export function competitionLifts(intake = {}) {
  const out = [];
  String(intake.current_numbers || '').split(/\n+/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z][A-Za-z' -]*?)\s*:/);
    if (!m) return;
    const name = m[1].trim();
    if (!name || /^current training$/i.test(name)) return;
    if (!/\d/.test(line)) return;
    out.push(name);
  });
  return out;
}

function liftMatcher(intake) {
  const lifts = competitionLifts(intake);
  if (!lifts.length) return null;
  const alts = lifts
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .sort((a, b) => b.length - a.length);
  return { re: new RegExp(`\\b(?:${alts.join('|')})\\b`, 'i'), lifts };
}

// The week's sessions, nearest-to-Day-0 last, with the working volume each one
// carries. A row inherits the day above it, the way every other clock rule in
// the engine reads a session -- a collector and a repair that disagree about
// which rows belong to a day cannot converge.
function sessionsByOffset(parsed) {
  const days = new Map();
  let lastDay = '';
  parsed.rows.forEach((cells, index) => {
    const raw = String(cells[parsed.day] || '').trim();
    if (raw) lastDay = raw;
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    const m = lastDay.match(DAY_OFFSET);
    if (!m) return;
    const offset = Number(m[1]);
    if (!days.has(offset)) days.set(offset, { offset, day: lastDay, rows: [] });
    days.get(offset).rows.push({ index, name, cells, sets: num(cells[parsed.sets]), reps: num(cells[parsed.reps]) });
  });
  return [...days.values()].sort((a, b) => b.offset - a.offset);
}

const setsIn = (session) => session.rows.reduce((n, r) => n + r.sets, 0);

// Every note written against a day, warm-up rows included: the session-level
// instruction is often carried there rather than on a working set.
function dayNotes(parsed, dayLabel) {
  if (!Number.isInteger(parsed.notes)) return '';
  const out = [];
  let lastDay = '';
  parsed.rows.forEach((cells) => {
    const raw = String(cells[parsed.day] || '').trim();
    if (raw) lastDay = raw;
    if (lastDay === dayLabel) out.push(String(cells[parsed.notes] || ''));
  });
  return out.join(' ');
}

function competitionWeek(intake, now) {
  if (!competitionProfile(intake, now)) return 0;
  for (let week = 1; week <= 4; week += 1) {
    if (stateForWeek(intake, week, now) === STATE.COMPETITION_WEEK) return week;
  }
  return 0;
}

// --- 1. technical touches must stay inside the freshness budget -------------

function overBudget(session, re) {
  const byLift = new Map();
  session.rows.forEach((r) => {
    if (!re.test(r.name)) return;
    const key = r.name.toLowerCase();
    if (!byLift.has(key)) byLift.set(key, []);
    byLift.get(key).push(r);
  });
  const out = [];
  for (const [, rows] of byLift) {
    const reps = rows.reduce((n, r) => n + r.sets * r.reps, 0);
    if (reps > TOUCH_BUDGET) out.push({ rows, reps });
  }
  return out;
}

export function collectCompetitionWeekFlags(program, intake = {}, now = Date.now()) {
  const week = competitionWeek(intake, now);
  if (!week) return [];
  const matcher = liftMatcher(intake);
  if (!matcher) return [];
  const parsed = parseWeek(program, week);
  if (!parsed) return [];
  const flags = [];
  const sessions = sessionsByOffset(parsed);

  sessions.forEach((session) => {
    overBudget(session, matcher.re).forEach(({ rows, reps }) => {
      const shown = rows.map((r) => `${r.name} ${r.sets} x ${r.reps}`).join(', ');
      flags.push({
        code: 'V90_TECHNICAL_TOUCH_REDUNDANT',
        week, day: session.day,
        detail: `${eventNoun(intake)} ${session.day} spends ${reps} reps on ${rows[0].name} (${shown}). `
          + `Nothing this week makes the athlete stronger, so every set has to buy more than it costs in freshness. `
          + `A few crisp singles keep the groove; repeated doubles are a training session wearing a taper's name. `
          + `Keep at most ${TOUCH_BUDGET} reps of a competition lift in a session and make them singles.`,
      });
    });
  });

  // No exercise earns a place on most days of competition week. The budget was
  // written against the competition lifts, so the ballistic swap quietly put
  // Explosive Push-up 3 x 3 on all five days of a meet week -- the same
  // redundant repeated exposure the coach objected to, wearing a different
  // name. Freshness does not care which exercise is spending it.
  const byExercise = new Map();
  sessions.forEach((session) => {
    new Set(session.rows.filter((r) => !matcher.re.test(r.name)).map((r) => r.name.toLowerCase())).forEach((name) => {
      if (!byExercise.has(name)) byExercise.set(name, []);
      byExercise.get(name).push(session);
    });
  });
  for (const [name, on] of byExercise) {
    if (on.length <= MAX_EXPOSURE_DAYS) continue;
    const shown = on[0].rows.find((r) => r.name.toLowerCase() === name)?.name || name;
    flags.push({
      code: 'V90_EXPOSURE_REPEATED_ALL_WEEK',
      week, day: on[on.length - 1].day,
      detail: `${shown} appears on ${on.length} of the ${sessions.length} days in ${eventNoun(intake).toLowerCase()} (${on.map((x) => x.day).join(', ')}). `
        + `Repeating one exposure most days is the same redundancy as repeated doubles: after the second, each one buys less and costs the same. `
        + `Keep it to ${MAX_EXPOSURE_DAYS} days and let the rest of the week be quiet.`,
    });
  }

  // Sessions may not grow as Day 0 approaches.
  for (let i = 1; i < sessions.length; i += 1) {
    const prev = sessions[i - 1];
    const cur = sessions[i];
    if (setsIn(cur) <= setsIn(prev)) continue;
    flags.push({
      code: 'V90_SESSION_GROWS_INTO_DAY_ZERO',
      week, day: cur.day,
      detail: `${cur.day} carries ${setsIn(cur)} working sets against ${setsIn(prev)} on ${prev.day}, so the week gets heavier as the event gets closer. `
        + `Competition week is a descent. Each session should ask less of the athlete than the one before it.`,
    });
  }

  // The last session before the event is an offer, not a prescription.
  const last = sessions[sessions.length - 1];
  if (last && last.offset <= 1) {
    if (!SESSION_OPTIONAL.test(dayNotes(parsed, last.day))) {
      flags.push({
        code: 'V90_FINAL_PRIMER_MANDATORY',
        week, day: last.day,
        detail: `${last.day} is written as a prescription. The last session before the event is conditional: it is worth doing if the athlete wakes up flat and wants to feel fast, and worth skipping entirely if they are already sharp, tired, or travelling. Say so on the session.`,
      });
    }
  }
  return flags;
}

// --- repairs ---------------------------------------------------------------

// Least justified first: what gets cut when a session has to shrink. Generic
// accessory work buys the least this close to the event, the competition lifts
// buy the most, so the trim never reaches for the thing the week is about.
const GENERIC = /\b(?:row|pulldown|fly|curl|extension|lateral raise|plank|dead bug|shoulder press|bench|chest press|leg press|calf|side bend)\b/i;

export function repairCompetitionWeek(program, intake = {}, now = Date.now()) {
  const week = competitionWeek(intake, now);
  if (!week) return String(program || '');
  const matcher = liftMatcher(intake);
  if (!matcher) return String(program || '');
  const parsed = parseWeek(program, week);
  if (!parsed) return String(program || '');

  const rows = parsed.rows.map((c) => c.slice());
  const dropped = new Set();
  let changed = false;
  const note = (index, text) => {
    if (!Number.isInteger(parsed.notes)) return;
    const cur = String(rows[index][parsed.notes] || '').trim();
    if (cur.includes(text)) return;
    rows[index][parsed.notes] = cur ? `${cur} ${text}` : text;
  };

  const view = () => {
    const p = { ...parsed, rows: rows.filter((_, i) => !dropped.has(i)) };
    // sessionsByOffset indexes into its own row list, so map back to real rows.
    const keep = rows.map((_, i) => i).filter((i) => !dropped.has(i));
    const s = sessionsByOffset(p);
    s.forEach((session) => session.rows.forEach((r) => { r.index = keep[r.index]; }));
    return s;
  };

  // 1. Technical touches back inside the budget: singles, capped.
  view().forEach((session) => {
    overBudget(session, matcher.re).forEach(({ rows: lift }) => {
      // Keep the first exposure of the lift, trim it to singles, drop repeats.
      lift.forEach((r, i) => {
        if (i > 0) { dropped.add(r.index); changed = true; return; }
        if (r.reps > 1) { rows[r.index][parsed.reps] = '1'; changed = true; }
        if (r.sets > TOUCH_BUDGET) { rows[r.index][parsed.sets] = String(TOUCH_BUDGET); changed = true; }
        note(r.index, 'Singles only this week: the touch is the point, the volume is not.');
      });
    });
  });

  // 1b. One exposure, at most a couple of days. Drop the occurrences closest to
  // the event: freshness argues for the quiet end of the week being the quiet
  // one, and a session is never emptied to satisfy this.
  const seen = new Map();
  view().forEach((session) => {
    new Set(session.rows.filter((r) => !matcher.re.test(r.name)).map((r) => r.name.toLowerCase())).forEach((name) => {
      if (!seen.has(name)) seen.set(name, []);
      seen.get(name).push(session);
    });
  });
  for (const [name, on] of seen) {
    for (let i = MAX_EXPOSURE_DAYS; i < on.length; i += 1) {
      const session = on[i];
      const live = session.rows.filter((r) => !dropped.has(r.index));
      if (live.length <= 1) continue;
      live.filter((r) => r.name.toLowerCase() === name).forEach((r) => { dropped.add(r.index); changed = true; });
    }
  }

  // 2. The week descends. Trim the least justified rows until it does.
  let sessions = view();
  for (let i = 1; i < sessions.length; i += 1) {
    let guard = 0;
    while (setsIn(sessions[i]) > setsIn(sessions[i - 1]) && guard < 20) {
      guard += 1;
      const cur = sessions[i];
      // Prefer cutting a set off generic work; drop the row once it is down to
      // one set and still over. Never touch the competition lifts.
      const generic = cur.rows.filter((r) => GENERIC.test(r.name) && !matcher.re.test(r.name));
      const target = generic.find((r) => r.sets > 1) || generic[0]
        || cur.rows.filter((r) => !matcher.re.test(r.name)).sort((a, b) => b.sets - a.sets)[0];
      if (!target) break;
      if (target.sets > 1) {
        rows[target.index][parsed.sets] = String(target.sets - 1);
        note(target.index, 'Trimmed so the week keeps descending into the event.');
      } else {
        dropped.add(target.index);
      }
      changed = true;
      sessions = view();
    }
  }

  // 2b. Say what the trimming made. The structural audit accepts a short session
  // when it is declared a taper or competition-prep session, which is exactly
  // what these are. Trimming silently gave the meet week three
  // V38_INCOMPLETE_SESSION failures the delivered program did not have -- this
  // rule manufacturing a defect for a blocking gate it has no repair for.
  view().forEach((session) => {
    const live = session.rows.filter((r) => !dropped.has(r.index));
    if (!live.length || live.length > 2) return;
    if (!Number.isInteger(parsed.notes)) return;
    const said = live.some((r) => /\bcompetition prep\b|\btaper\b/i.test(String(rows[r.index][parsed.notes] || '')));
    if (said) return;
    note(live[0].index, 'Competition prep: this session is deliberately short because the week is a descent into the event.');
    changed = true;
  });

  // 3. The final primer is an offer.
  sessions = view();
  const last = sessions[sessions.length - 1];
  if (last && last.offset <= 1 && Number.isInteger(parsed.notes)) {
    if (!SESSION_OPTIONAL.test(dayNotes({ ...parsed, rows }, last.day)) && last.rows.length) {
      note(last.rows[0].index, 'This session is optional: take it if you want to feel fast before the event, and skip it entirely if you are already sharp, tired, or travelling.');
      changed = true;
    }
  }

  if (!changed) return String(program || '');
  const kept = rows.filter((_, i) => !dropped.has(i));
  const rebuilt = [parsed.header.join('\t'), ...kept.map((c) => c.join('\t'))].join('\n');
  return String(program || '').replace(parsed.re, `$1${rebuilt}$3`);
}

export function buildCompetitionWeekBrief(intake = {}, now = Date.now()) {
  if (!competitionWeek(intake, now)) return '';
  const lifts = competitionLifts(intake);
  return [
    '* IN COMPETITION WEEK, EVERY SET MUST JUSTIFY ITSELF AGAINST FRESHNESS.',
    '  Nothing this week makes the athlete stronger. A set either preserves a feel they already have or it takes something away from Day 0, so the question is never "is this good training" but "what does this buy that is worth arriving less fresh for".',
    `  TECHNICAL WORK IS SINGLES. Keep at most ${TOUCH_BUDGET} reps of a competition lift in a session${lifts.length ? ` (here: ${lifts.slice(0, 3).join(', ')})` : ''}, taken as crisp singles. Repeated doubles are a training session wearing a taper's name -- they add fatigue and tell the athlete nothing a single did not.`,
    '  Do not repeat the same lift twice in one session, and do not add a second technical touch to a day that already has one.',
    '  THE WEEK DESCENDS. Each session asks less than the one before it. If a session is larger than the day further from the event, cut the generic work until it is not.',
    '  THE LAST SESSION IS CONDITIONAL, NOT MANDATORY. Write it as an offer: worth doing if the athlete wants to feel fast, worth skipping entirely if they are already sharp, tired, or travelling. Say that on the session itself.',
  ].join('\n');
}
