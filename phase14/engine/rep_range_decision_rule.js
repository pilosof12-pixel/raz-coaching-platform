// engine/rep_range_decision_rule.js
//
// Coach review, on the Advanced Hybrid block: "Week 3 OAP says 3x1-3 per arm.
// That's too broad for a high-skill, high-intensity movement. One versus three
// reps per set represents radically different loading. Give an actual decision
// rule: e.g. first set can attempt 3 if two clean reps are clearly owned;
// otherwise use doubles/singles."
//
// A range is a legitimate prescription -- it is how an honest coach writes
// autoregulation. What makes it unusable is a range with no rule for choosing
// within it, on work where the ends of the range are different sessions. On a
// one-arm pull-up, one rep and three reps are not the same exposure.
//
// Scoped to work where the choice actually matters: a wide range on hard or
// skill work. A 8-12 rep accessory at RPE 6 is not this problem, and demanding a
// decision rule there would bury the row that needs one.

import { parseWeek } from './v34_workload_accounting.js';
import { CATEGORY, classifyExercise } from './v38_movement_taxonomy.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));

const MARKER = /\bTake the top of the range\b/i;
// A note that already tells the athlete how to pick within the range.
const HAS_RULE = /\bonly if\b|\botherwise\b|\bif (?:all|every|both|the first|set 1)\b|\bstay at\b|\bdrop to\b|\bdefault to\b/i;

function rangeOf(raw) {
  const m = String(raw || '').match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (!m) return null;
  const low = Number(m[1]);
  const high = Number(m[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low || low < 1) return null;
  return { low, high };
}

function peakEffort(raw) {
  const nums = String(raw || '').match(/\d+(?:\.\d+)?/g);
  return nums && nums.length ? Math.max(...nums.map(Number)) : null;
}

// The ends of the range are different sessions when the top is at least double
// the bottom (1-3, 2-5), and the work is hard or skill-dependent enough for that
// to matter.
function needsRule(cells, parsed, effortIndex) {
  const name = String(cells[parsed.exercise] || '').trim();
  if (!name || isWarmup(name)) return null;
  const range = rangeOf(cells[parsed.reps]);
  if (!range || range.high < range.low * 2) return null;
  const { category } = classifyExercise(name);
  const effort = effortIndex >= 0 ? peakEffort(cells[effortIndex]) : null;
  const hard = (effort != null && effort >= 8) || category === CATEGORY.SKILL || category === CATEGORY.POWER;
  if (!hard) return null;
  if (HAS_RULE.test(String(cells[parsed.notes] || ''))) return null;
  return { name, range };
}

export function collectWideRepRangeFlags(program, intake = {}) {
  const source = String(program || '');
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(source, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const effortIndex = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
    for (const cells of parsed.rows) {
      const hit = needsRule(cells, parsed, effortIndex);
      if (!hit) continue;
      flags.push({
        code: 'V103_WIDE_REP_RANGE_WITHOUT_RULE',
        week,
        exercise: hit.name,
        reps: `${hit.range.low}-${hit.range.high}`,
        detail: `Week ${week} ${hit.name} prescribes ${hit.range.low}-${hit.range.high} reps on hard or skill work and gives no rule for choosing within it. ${hit.range.low} and ${hit.range.high} reps on this movement are different sessions, and the athlete is left to guess which one they were given.`,
      });
    }
  }
  return flags;
}

export function normalizeWideRepRange(program, intake = {}) {
  const original = String(program || '');
  if (!collectWideRepRangeFlags(original, intake).length) {
    return { program: original, repaired: false, repairs: [] };
  }

  let candidate = original;
  const repairs = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const effortIndex = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
    let changed = false;
    for (const cells of parsed.rows) {
      const hit = needsRule(cells, parsed, effortIndex);
      if (!hit) continue;
      const note = String(cells[parsed.notes] || '').trim();
      if (MARKER.test(note)) continue;
      const { low, high } = hit.range;
      // Written per shape rather than by template: a 1-2 range produced "take
      // the top only if a clean 1 is already owned; otherwise stay at 1", which
      // is not a decision rule, it is a sentence.
      const line = low === 1
        ? `Take the top of the range only when the opening rep is clean and unhurried and last week's standard held; otherwise keep every set to singles. The range is a ceiling to earn, not a target to hit.`
        : `Take the top of the range only when the previous set closed at ${high - 1} with the standard intact; otherwise stay at ${low} and keep every rep clean. The range is a ceiling to earn, not a target to hit.`;
      cells[parsed.notes] = note ? `${note} ${line}` : line;
      changed = true;
      repairs.push({ type: 'wide_rep_range_decision_rule', week, exercise: hit.name });
    }
    if (!changed) continue;
    const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
    candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
  }
  return { program: candidate, repaired: repairs.length > 0, repairs };
}
