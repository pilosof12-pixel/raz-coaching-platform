// engine/v68_competition_state.js
//
// Where the athlete stands relative to their competition, and what that makes
// this week.
//
// Derived from the Competition Preparation / Peaking / Tapering knowledge
// cluster. The cluster's own instruction is that the engine should "construct
// the correct competition-preparation shape from the athlete and event rather
// than generate a normal training plan and then patch it with last-week
// prohibitions", which is exactly what the engine did before this module
// existed: a four-week block with Week 4 labelled Consolidate / Express,
// whether the athlete competed in three weeks or in six months.
//
// Nothing here fires for an athlete with no event. Most people do not compete,
// and their program must not change because this module exists.

const DAY_MS = 24 * 60 * 60 * 1000;

// Appendix C. A week is in exactly one of these.
export const STATE = {
  NORMAL: 'normal_training',
  SPECIFICITY: 'prepeak_specificity',
  REALIZATION: 'realization',
  TAPER: 'taper',
  COMPETITION_WEEK: 'competition_week',
  POST: 'postcompetition',
};

export const PRIORITY = { A: 'A', B: 'B', C: 'C' };

// Section 6: priority decides how much long-term training is sacrificed.
// A C-priority event or technical mock "may need only a small reduction", so it
// never reaches a full taper state.
const PRIORITY_REACH = {
  A: [STATE.COMPETITION_WEEK, STATE.TAPER, STATE.REALIZATION, STATE.SPECIFICITY],
  B: [STATE.COMPETITION_WEEK, STATE.TAPER, STATE.REALIZATION],
  C: [STATE.COMPETITION_WEEK],
};

const EVENT_WORDS = /\b(?:fight|bout|match|competition|competes?|meet\b|tournament|qualifier|championship|contest|race day|weigh[- ]?in|mock meet)\b/i;

function txt(v) { return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' '); }

// "in 8 weeks", "in 3 months", "4 weeks out", "in 10 days".
function weeksFromPhrase(source) {
  const s = String(source || '');
  const w = s.match(/\bin\s+(\d+(?:\.\d+)?)\s*weeks?\b/i) || s.match(/\b(\d+(?:\.\d+)?)\s*weeks?\s+(?:out|away|from now)\b/i);
  if (w) return Number(w[1]);
  const d = s.match(/\bin\s+(\d+)\s*days?\b/i) || s.match(/\b(\d+)\s*days?\s+(?:out|away)\b/i);
  if (d) return Number(d[1]) / 7;
  const m = s.match(/\bin\s+(\d+(?:\.\d+)?)\s*months?\b/i);
  if (m) return Number(m[1]) * 4.345;
  return null;
}

// A real date beats a phrase; a phrase beats nothing. Both beat guessing.
export function weeksOut(intake = {}, now = Date.now()) {
  const raw = intake?.competition_date || intake?.event_date;
  if (raw) {
    const when = Date.parse(String(raw));
    if (Number.isFinite(when)) {
      const weeks = (when - now) / (7 * DAY_MS);
      // A date in the past is history, not a plan.
      if (weeks >= -2 && weeks <= 104) return Math.round(weeks * 10) / 10;
    }
  }
  const phrase = weeksFromPhrase(`${txt(intake.primary_goals)} ${txt(intake.secondary_goals)} ${txt(intake.notes)}`);
  return phrase != null && phrase <= 104 ? phrase : null;
}

export function hasEvent(intake = {}) {
  if (intake?.competition_date || intake?.event_date || intake?.event_type) return true;
  const source = `${txt(intake.primary_goals)} ${txt(intake.secondary_goals)} ${txt(intake.notes)}`;
  return EVENT_WORDS.test(source) && weeksOut(intake) != null;
}

export function eventPriority(intake = {}) {
  const raw = String(intake?.event_priority || '').trim().toUpperCase();
  if (PRIORITY[raw]) return raw;
  const source = `${txt(intake.primary_goals)} ${txt(intake.notes)}`.toLowerCase();
  if (/\b(?:technical mock|training day|low[- ]priority|c[- ]priority)\b/.test(source)) return PRIORITY.C;
  if (/\b(?:b[- ]priority|tune[- ]?up|warm[- ]?up meet)\b/.test(source)) return PRIORITY.B;
  // The cluster treats an unlabelled real competition as one worth peaking for.
  return PRIORITY.A;
}

export function eventType(intake = {}) {
  const declared = String(intake?.event_type || '').trim().toLowerCase();
  if (declared) return declared;
  const source = `${txt(intake.sport)} ${txt(intake.primary_goals)} ${txt(intake.notes)}`.toLowerCase();
  if (/\b(?:fight|bout|mma|boxing|muay thai|kickbox|bjj|grappl|wrestl)\b/.test(source)) return 'combat';
  if (/\b(?:meet|snatch|clean and jerk|weightlifting|powerlifting|total)\b/.test(source)) return 'strength_meet';
  if (/\bmock\b/.test(source)) return 'technical_mock';
  return 'general';
}

// The state of one week of the block. Week 1 starts at weeksOut; week N starts
// (N-1) weeks later, so a four-week block for an athlete four weeks out puts
// competition week at week 4.
export function stateForWeek(intake = {}, week = 1, now = Date.now()) {
  if (!hasEvent(intake)) return STATE.NORMAL;
  const out = weeksOut(intake, now);
  if (out == null) return STATE.NORMAL;

  const remaining = out - (week - 1);
  if (remaining < 0) return STATE.POST;

  const priority = eventPriority(intake);
  const reachable = new Set(PRIORITY_REACH[priority] || PRIORITY_REACH.A);

  // Thresholds follow the cluster's phase model: competition week is the last
  // seven days; the taper literature centres on 8-14 days; specificity and
  // realization precede it. These are defaults, not laws -- the cluster is
  // explicit that "these are functional phases, not mandatory calendar blocks".
  let state;
  if (remaining <= 1) state = STATE.COMPETITION_WEEK;
  else if (remaining <= 2) state = STATE.TAPER;
  else if (remaining <= 4) state = STATE.REALIZATION;
  else if (remaining <= 8) state = STATE.SPECIFICITY;
  else state = STATE.NORMAL;

  // Priority pulls the athlete back toward normal training: a C-priority event
  // gets competition week and nothing else, because the cluster says not to
  // destroy a training block for a minor event.
  if (state !== STATE.NORMAL && !reachable.has(state)) {
    const order = [STATE.SPECIFICITY, STATE.REALIZATION, STATE.TAPER, STATE.COMPETITION_WEEK];
    const softer = order.slice(0, order.indexOf(state)).reverse().find((s) => reachable.has(s));
    state = softer || STATE.NORMAL;
  }
  return state;
}

// Section: freshness is an active training objective, not a by-product.
export function freshnessPriority(state) {
  switch (state) {
    case STATE.COMPETITION_WEEK: return 'maximal';
    case STATE.TAPER: return 'high';
    case STATE.REALIZATION: return 'medium';
    default: return 'low';
  }
}

export function competitionProfile(intake = {}, now = Date.now()) {
  if (!hasEvent(intake)) return null;
  const out = weeksOut(intake, now);
  if (out == null) return null;
  const priority = eventPriority(intake);
  const weeks = [1, 2, 3, 4].map((w) => ({
    week: w,
    weeksOut: Math.round((out - (w - 1)) * 10) / 10,
    state: stateForWeek(intake, w, now),
  }));
  return {
    eventType: eventType(intake),
    priority,
    weeksOut: out,
    weeks,
    freshness: freshnessPriority(weeks[3].state),
    // True when the block runs into the event, which is the case that makes
    // Week 4 mean something other than Consolidate / Express.
    blockEndsAtEvent: weeks.some((w) => w.state === STATE.COMPETITION_WEEK),
  };
}
