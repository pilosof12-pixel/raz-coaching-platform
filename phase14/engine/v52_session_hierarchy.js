// Within-session goal hierarchy.
//
// A coach reviewing a live program found secondary Push Press sitting between
// the two primary exposures of the session -- One-Arm Pull-up, then Push Press,
// then Back Squat. Nothing in the engine objected. Order inside a session had
// only ever been checked for warm-ups and conditioning placement, never for goal
// priority, so a secondary lift could be dropped into the middle of the two
// qualities the block exists to develop and pass every gate.
//
// The rule is narrow on purpose. It does not dictate which primary comes first,
// or where support work sits relative to anything else. It objects to exactly
// one thing: lower-priority work interrupting the run of primary exposures.

import { parseWeek } from './v34_workload_accounting.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }

// Movement families a stated goal is about. Deliberately conservative: a goal
// that names no recognisable movement contributes no pattern, so an athlete
// whose goals cannot be mapped is never second-guessed.
const GOAL_PATTERNS = [
  { re: /squat/i, movement: /squat/i },
  { re: /deadlift/i, movement: /deadlift/i },
  { re: /one[- ]?arm\s*(?:pull|chin)|\boap\b/i, movement: /one[- ]arm\s+(?:pull|chin)-?up/i },
  { re: /muscle[- ]?up/i, movement: /muscle-?up/i },
  { re: /pull[- ]?up|chin[- ]?up/i, movement: /pull-?up|chin-?up/i },
  { re: /overhead press|\bohp\b|strict press/i, movement: /overhead press|push press|shoulder press/i },
  { re: /bench/i, movement: /bench/i },
  { re: /handstand/i, movement: /handstand/i },
  { re: /marathon|\d+\s*k(?:m)?\b|run/i, movement: /\brun(?:ning)?\b/i },
  { re: /ruck/i, movement: /ruck/i },
];

function patternsFor(goals) {
  const text = txt(goals);
  return GOAL_PATTERNS.filter((g) => g.re.test(text)).map((g) => g.movement);
}

// A movement's tier: primary beats secondary beats everything else. A movement
// serving both a primary and a secondary goal counts as primary.
export function goalTierFor(exercise, intake = {}) {
  const name = String(exercise || '');
  const primary = patternsFor(arr(intake.primary_goals));
  if (primary.some((re) => re.test(name))) return 'primary';
  const secondary = patternsFor(arr(intake.secondary_goals));
  if (secondary.some((re) => re.test(name))) return 'secondary';
  return 'support';
}

export function collectSessionHierarchyFlags(program, intake = {}) {
  if (!arr(intake.primary_goals).length) return [];
  const flags = [];

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const byDay = new Map();
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      const day = String(cells[parsed.day] || '').trim();
      if (!name || !day || isWarmup(name)) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ name, tier: goalTierFor(name, intake) });
    }

    for (const [day, rows] of byDay) {
      const primaryAt = rows.map((r, i) => (r.tier === 'primary' ? i : -1)).filter((i) => i >= 0);
      if (primaryAt.length < 2) continue;
      const first = primaryAt[0];
      const last = primaryAt[primaryAt.length - 1];
      // Only secondary work interrupting the primaries is objectionable. Support
      // and accessory work between them is a coach's business, not a rule's.
      const interrupting = rows.slice(first + 1, last).filter((r) => r.tier === 'secondary');
      if (!interrupting.length) continue;

      flags.push({
        code: 'V52_SECONDARY_BETWEEN_PRIMARIES',
        week,
        day,
        interrupting: interrupting.map((r) => r.name),
        primaries: primaryAt.map((i) => rows[i].name),
        message: `${day} (Week ${week}) places ${interrupting.map((r) => r.name).join(', ')} between the session's primary exposures (${rows[first].name} then ${rows[last].name}). Secondary work belongs after the primary qualities it is subordinate to, not between them.`,
      });
    }
  }
  return flags;
}

// Reordering changes no prescription, so this is repaired rather than
// regenerated: the interrupting rows move to just after the last primary
// exposure, keeping their own relative order and everything else where it was.
export function repairSessionHierarchy(program, intake = {}) {
  const repairs = [];
  let candidate = String(program || '');

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    let changed = false;

    for (const flag of collectSessionHierarchyFlags(candidate, intake).filter((f) => f.week === week)) {
      const indices = parsed.rows.map((c, i) => ({ c, i }))
        .filter(({ c }) => String(c[parsed.day] || '').trim() === flag.day
          && String(c[parsed.exercise] || '').trim()
          && !isWarmup(String(c[parsed.exercise] || '')));
      const tiers = indices.map(({ c, i }) => ({ i, tier: goalTierFor(String(c[parsed.exercise] || ''), intake) }));
      const primaryPositions = tiers.filter((t) => t.tier === 'primary').map((t) => t.i);
      if (primaryPositions.length < 2) continue;
      const lastPrimary = primaryPositions[primaryPositions.length - 1];
      const moving = tiers.filter((t) => t.tier === 'secondary' && t.i > primaryPositions[0] && t.i < lastPrimary);
      if (!moving.length) continue;

      const rows = parsed.rows;
      // Hold the anchor row itself, not its index: removing the interrupting
      // rows shifts every index after them, and anchoring on a stale one landed
      // the moved work after unrelated support instead of directly after the
      // primary it is subordinate to.
      const anchorRow = rows[lastPrimary];
      const movedRows = moving.map((m) => rows[m.i]);
      for (const row of movedRows) rows.splice(rows.indexOf(row), 1);
      const anchor = rows.indexOf(anchorRow);
      const insertAt = anchor >= 0 ? anchor + 1 : rows.length;
      rows.splice(insertAt, 0, ...movedRows);
      repairs.push({ type: 'v52_secondary_moved_after_primaries', week, day: flag.day, moved: flag.interrupting });
      changed = true;
    }
    if (changed) {
      const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
      candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
    }
  }
  return { program: candidate, repaired: repairs.length > 0, repairs };
}

export function buildSessionHierarchyBrief(intake = {}) {
  if (!arr(intake.primary_goals).length || !arr(intake.secondary_goals).length) return '';
  return [
    'WITHIN-SESSION HIERARCHY: when a session carries more than one primary-goal exposure, keep them together.',
    `Primary: ${arr(intake.primary_goals).join('; ')}. Secondary: ${arr(intake.secondary_goals).join('; ')}.`,
    'Secondary work goes after the primary qualities it is subordinate to, never between them. A secondary lift sitting between two primary exposures spends freshness that belongs to the primaries.',
  ].join('\n');
}
