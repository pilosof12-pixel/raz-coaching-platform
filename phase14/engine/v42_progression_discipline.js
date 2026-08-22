// One-stressor-at-a-time progression.
//
// When an athlete carries injury history or a week already dense with stress the
// plan does not control, raising several stress dimensions at once removes the
// ability to attribute a bad response to anything. If load, reps and distance
// all move and the shin flares, nothing can be repeated or backed off with
// confidence -- the week has to be guessed at.
//
// So in an elevated-risk context exactly one dimension may rise per movement per
// week, unless the program says plainly why more than one is moving. Outside
// that context this is ordinary programming and raises nothing.

import { parseWeek } from './v34_workload_accounting.js';
import { elevatedRiskContext } from './v42_weekly_load.js';

export const STRESS_DIMENSIONS = ['load', 'reps', 'sets', 'distance', 'pace', 'assistance'];

// Assistance is inverted: less help is more stress. Ordered easiest to hardest.
const ASSISTANCE_SCALE = ['heavy', 'strong', 'thick', 'moderate', 'medium', 'light', 'micro', 'minimal', 'none', 'unassisted'];

function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function kgOf(raw) {
  const m = String(raw || '').match(/\+?\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function kmOf(raw) {
  const s = String(raw || '');
  const km = s.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  if (km) return Number(km[1]);
  const m = s.match(/\b(\d{3,4})\s*m\b/i);
  return m ? Number(m[1]) / 1000 : null;
}
function repsOf(raw) {
  const s = String(raw || '').trim();
  if (/\b(?:sec|secs|second|seconds|min|mins|minute|minutes|km|m)\b/i.test(s)) return null;
  return firstNum(s);
}
// Prescribed pace as seconds per km; faster is harder, so it is inverted below.
function paceSecPerKm(raw) {
  const m = String(raw || '').match(/\b(\d{1,2}):(\d{2})\s*(?:\/|per\s*)\s*km\b/i);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function assistanceRank(raw) {
  const s = String(raw || '').toLowerCase();
  if (!/assist|band/.test(s)) return null;
  for (let i = ASSISTANCE_SCALE.length - 1; i >= 0; i--) {
    if (s.includes(ASSISTANCE_SCALE[i])) return i;
  }
  return null;
}

// A progression the program itself gates on the athlete's response is not a
// blind multi-dimensional jump; it is a decision the athlete makes on the day.
const JUSTIFIED = /\b(?:only if|if\b|when\b|provided|earned|unless|hold if|repeat if|stay at|back off)\b/i;

function rowKey(cells, parsed) {
  return `${String(cells[parsed.day] || '').trim().toLowerCase()}|${String(cells[parsed.exercise] || '').trim().toLowerCase()}`;
}

function measure(cells, parsed) {
  return {
    load: parsed.load == null ? null : kgOf(cells[parsed.load]),
    reps: repsOf(cells[parsed.reps]),
    sets: firstNum(cells[parsed.sets]),
    distance: kmOf(cells[parsed.reps]),
    pace: paceSecPerKm(`${cells[parsed.reps]} ${cells[parsed.notes] || ''}`),
    assistance: assistanceRank(`${parsed.load == null ? '' : cells[parsed.load]} ${cells[parsed.notes] || ''}`),
  };
}

// Which dimensions got harder from one week to the next.
export function risingDimensions(previous, current) {
  const risen = [];
  for (const dim of STRESS_DIMENSIONS) {
    const before = previous[dim];
    const now = current[dim];
    if (!Number.isFinite(before) || !Number.isFinite(now)) continue;
    // Pace is the one dimension where a smaller number is more stress.
    const harder = dim === 'pace' ? now < before : now > before;
    if (harder) risen.push({ dimension: dim, from: before, to: now });
  }
  return risen;
}

export function collectProgressionDisciplineFlags(program, intake = {}) {
  const risk = elevatedRiskContext(intake);
  if (!risk.elevated) return [];

  const flags = [];
  let previous = new Map();
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const thisWeek = new Map();

    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const key = rowKey(cells, parsed);
      const current = measure(cells, parsed);
      thisWeek.set(key, current);

      const before = previous.get(key);
      if (!before) continue;
      const risen = risingDimensions(before, current);
      if (risen.length < 2) continue;
      const note = `${parsed.load == null ? '' : cells[parsed.load]} ${cells[parsed.notes] || ''}`;
      if (JUSTIFIED.test(note)) continue;

      flags.push({
        code: 'V42_MULTIPLE_STRESSORS_RAISED',
        week,
        exercise: name,
        day: String(cells[parsed.day] || '').trim(),
        dimensions: risen.map((r) => r.dimension),
        detail: risen,
        risk_reasons: risk.reasons,
        message: `${name} (Week ${week}) raises ${risen.length} stress dimensions at once (${risen.map((r) => `${r.dimension} ${r.from}->${r.to}`).join(', ')}). This athlete is in an elevated-risk context (${risk.reasons.join('; ')}), so move one dimension at a time or state why several must move together.`,
      });
    }
    previous = thisWeek;
  }
  return flags;
}

export function buildProgressionDisciplineBrief(intake = {}) {
  const risk = elevatedRiskContext(intake);
  if (!risk.elevated) return '';
  return [
    `ONE STRESSOR AT A TIME: this athlete is in an elevated-risk context (${risk.reasons.join('; ')}).`,
    `For any given movement, only one of ${STRESS_DIMENSIONS.join(', ')} may increase from one week to the next.`,
    'Raising several at once means a bad response cannot be attributed to anything, so nothing can be repeated or backed off with confidence.',
    'If more than one genuinely must move together, say why on that row. A progression the athlete gates on their own response ("only if last week was clean") counts as one decision, not a blind jump.',
  ].join('\n');
}
