// engine/v62_block_phase.js
//
// Which phase a block is, derived from the gap between current ability and
// goal demand.
//
// The Tactical athlete runs 3 km in 13:30 -- about 4:30/km -- and wants
// sub-12:00, about 4:00/km. His Week 4 quality lands near 4:08-4:12/km. That
// is correct progression from current capacity, and it is emphatically not
// race-specific work: it is a developmental block moving toward the standard.
//
// Both facts have to be said at once, and the engine had no vocabulary for it.
// v59 stops the summary overstating specificity; this decides what the block
// actually is, so the label is derived rather than asserted:
//
//   current ability -> goal gap -> block phase -> appropriate specificity
//
// The phase never licenses faster prescription. A developmental block is
// allowed to sit slower than goal pace, and the current-capacity rule still
// owns what may be prescribed.

import { parseWeek } from './v34_workload_accounting.js';

// How far short of goal demand the quality work sits, as a fraction.
// Under 3% is the tolerance the specificity rule already uses.
export const PHASE = {
  RACE_SPECIFIC: 'race-specific',
  PRE_SPECIFIC: 'pre-specific',
  DEVELOPMENTAL: 'developmental',
  BASE: 'base',
};

const THRESHOLDS = [
  { max: 0.03, phase: PHASE.RACE_SPECIFIC },
  { max: 0.06, phase: PHASE.PRE_SPECIFIC },
  { max: 0.15, phase: PHASE.DEVELOPMENTAL },
  { max: Infinity, phase: PHASE.BASE },
];

function txt(v) { return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' '); }
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }

function clockSeconds(raw) {
  const m = String(raw || '').match(/\b(\d{1,3}):(\d{2})\b/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Named events carry their distance with them. Half marathon is tested before
// marathon, because "half marathon" contains "marathon".
const NAMED_EVENTS = [
  { re: /\bhalf[- ]?marathon\b/i, km: 21.0975 },
  { re: /\bmarathon\b/i, km: 42.195 },
];

// A pace outside this is a misread, not an athlete: 2:30/km is elite, 15:00/km
// is walking.
const MIN_PACE = 150;
const MAX_PACE = 900;

// "3 km: 13:30" is minutes and seconds. "Half marathon: 2:24" is hours and
// minutes. The clock alone cannot say which, so try both and keep whichever
// produces a pace a human could run.
function plausiblePace(clock, km) {
  const m = String(clock || '').match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const candidates = [a * 60 + b, a * 3600 + b * 60];
  for (const seconds of candidates) {
    const pace = seconds / km;
    if (pace >= MIN_PACE && pace <= MAX_PACE) return { seconds, pace };
  }
  return null;
}

// "Improve 3 km from 13:30 to sub-12:00" -> current and goal pace per km.
export function raceGap(intake = {}) {
  const goals = txt(intake.primary_goals);
  const source = `${goals} ${txt(intake.current_numbers)} ${txt(intake.performance_markers)}`;

  let km = null;
  for (const ev of NAMED_EVENTS) {
    if (ev.re.test(goals)) { km = ev.km; break; }
  }
  if (km == null) {
    // An event-style distance sits beside its time: "3 km: 13:30". A bare
    // distance elsewhere is usually weekly volume, which is not the event.
    const paired = source.match(/(\d+(?:\.\d+)?)\s*km\b[^\n]{0,24}?\b\d{1,3}:\d{2}\b/i)
      || goals.match(/(\d+(?:\.\d+)?)\s*km\b/i);
    if (!paired) return null;
    km = Number(paired[1]);
  }
  if (!(km > 0)) return null;

  const clocks = [...source.matchAll(/\b(\d{1,3}:\d{2})\b/g)].map((m) => m[1]);
  const paces = clocks.map((c) => plausiblePace(c, km)).filter(Boolean);
  if (paces.length < 2) return null;

  const slowest = paces.reduce((a, b) => (b.pace > a.pace ? b : a));
  const fastest = paces.reduce((a, b) => (b.pace < a.pace ? b : a));
  if (slowest.pace === fastest.pace) return null;

  return {
    km,
    currentPace: slowest.pace,
    goalPace: fastest.pace,
    currentSec: slowest.seconds,
    goalSec: fastest.seconds,
  };
}

// The fastest quality repetition the block actually prescribes.
export function fastestQualityPace(program) {
  const paces = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !/\brun(?:ning)?\b/i.test(name)) continue;
      const metres = (String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i) || [])[1];
      if (!metres) continue;
      const sec = clockSeconds(cells[parsed.load]);
      if (sec == null) continue;
      paces.push(sec / (Number(metres) / 1000));
    }
  }
  return paces.length ? Math.min(...paces) : null;
}

export function classifyBlockPhase(program, intake = {}) {
  const gap = raceGap(intake);
  if (!gap) return null;
  const fastest = fastestQualityPace(program);
  if (fastest == null) return null;

  const shortfall = (fastest - gap.goalPace) / gap.goalPace;
  const phase = THRESHOLDS.find((t) => shortfall <= t.max).phase;
  return {
    phase,
    shortfall,
    fastestPace: fastest,
    goalPace: gap.goalPace,
    currentPace: gap.currentPace,
    // A block that has closed the gap relative to where the athlete started is
    // progressing correctly even while it remains developmental.
    aheadOfCurrent: fastest < gap.currentPace,
  };
}

export function buildBlockPhaseBrief(intake = {}) {
  const gap = raceGap(intake);
  if (!gap) return '';
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return [
    `* BLOCK PHASE: current ability is about ${mmss(gap.currentPace)}/km and goal demand is about ${mmss(gap.goalPace)}/km.`,
    '  Derive the phase from that gap before choosing specificity: a block whose quality work is still materially slower than goal demand is developmental or pre-specific, and must be described that way rather than as race-specific.',
    '  Being developmental is not a fault and is not a reason to prescribe faster than current capacity supports. Progress from where the athlete is; a later block carries the athlete to event demand.',
  ].join('\n');
}
