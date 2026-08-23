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

// --- a key session must not be crowded by the day before it ------------------

// A coach found the engine placing the lower-cost squat exposure on Sunday, the
// day before Monday's primary One-Arm Pull-up and 172.5 kg squat, and said
// plainly that recovery-aware scheduling was not overriding the template. He was
// right: the existing adjacency rule only objects when BOTH days breach axial
// and lower-body load, and a light Sunday squat breaches neither on its own.
//
// The question is not whether each day is heavy. It is whether the same primary
// pattern is loaded on the day before the session that pattern's block is built
// around. Two squat exposures are required for a primary squat goal; they just
// must not be back to back.

const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dayIndex = (d) => WEEK_ORDER.indexOf(String(d || '').trim().slice(0, 3).toLowerCase());
function circularGap(from, to) {
  const a = dayIndex(from), b = dayIndex(to);
  if (a < 0 || b < 0) return null;
  return (b - a + 7) % 7;
}
// How far apart two days are, whichever way round the week you count.
function separation(a, b) {
  const f = circularGap(a, b);
  return f == null ? null : Math.min(f, 7 - f);
}
function loadKg(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}

// Every day on which a primary movement pattern is loaded, heaviest first.
function primaryExposures(parsed, intake) {
  const out = [];
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    const day = String(cells[parsed.day] || '').trim();
    if (!name || !day || isWarmup(name)) return;
    if (goalTierFor(name, intake) !== 'primary') return;
    out.push({ index, day, name, kg: parsed.load == null ? null : loadKg(cells[parsed.load]) });
  });
  return out;
}

export function collectKeySessionCrowdingFlags(program, intake = {}) {
  if (!arr(intake.primary_goals).length) return [];
  const flags = [];

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    const exposures = primaryExposures(parsed, intake);
    // Group by movement, so a squat is compared with a squat.
    const byMovement = new Map();
    for (const e of exposures) {
      const key = e.name.toLowerCase();
      if (!byMovement.has(key)) byMovement.set(key, []);
      byMovement.get(key).push(e);
    }

    for (const [, group] of byMovement) {
      if (group.length < 2) continue;
      const loaded = group.filter((e) => Number.isFinite(e.kg));
      if (loaded.length < 2) continue;
      const sorted = [...loaded].sort((a, b) => b.kg - a.kg);
      const heavy = sorted[0];
      for (const other of sorted.slice(1)) {
        if (other.day === heavy.day) continue;
        if (separation(other.day, heavy.day) !== 1) continue;
        flags.push({
          code: 'V52_KEY_SESSION_CROWDED',
          week,
          movement: heavy.name,
          heavy_day: heavy.day,
          crowding_day: other.day,
          heavy_kg: heavy.kg,
          crowding_kg: other.kg,
          message: `Week ${week} loads ${other.name} at ${other.kg} kg on ${other.day}, the day immediately before the ${heavy.kg} kg exposure on ${heavy.day}. The key session for a primary goal should get the best available readiness; put the lower-cost exposure where it does not spend the day before.`,
        });
      }
    }
  }
  return flags;
}

// Moving a row between existing training days changes no prescription, so this
// is repaired. The lower-cost exposure goes to whichever training day sits
// furthest from the heavy one, counting either way round the week.
export function repairKeySessionCrowding(program, intake = {}) {
  const repairs = [];
  let candidate = String(program || '');

  for (let week = 1; week <= 4; week++) {
    for (let guard = 0; guard < 4; guard++) {
      const flags = collectKeySessionCrowdingFlags(candidate, intake).filter((f) => f.week === week);
      if (!flags.length) break;
      const flag = flags[0];
      const parsed = parseWeek(candidate, week);
      if (!parsed) break;

      // Only the athlete's own strength days are eligible. Choosing from every
      // day present in the week put a barbell squat on the running day, which
      // invents a strength session rather than relocating one.
      const stated = arr(intake.available_gym_days).map((d) => String(d).trim().toLowerCase()).filter(Boolean);
      const present = [...new Set(parsed.rows
        .map((c) => String(c[parsed.day] || '').trim())
        .filter((d) => d && dayIndex(d) >= 0))];
      const days = stated.length
        ? present.filter((d) => stated.includes(d.toLowerCase()))
        : present;
      const target = days
        .filter((d) => d !== flag.heavy_day && d !== flag.crowding_day)
        .map((d) => ({ d, sep: separation(d, flag.heavy_day) ?? 0 }))
        .sort((a, b) => b.sep - a.sep)[0];
      if (!target || target.sep <= 1) break;

      const row = parsed.rows.find((c) => String(c[parsed.day] || '').trim() === flag.crowding_day
        && String(c[parsed.exercise] || '').trim().toLowerCase() === flag.movement.toLowerCase());
      if (!row) break;
      row[parsed.day] = target.d;
      // Primary work leads the session it lands in. Appending it left a barbell
      // squat sitting after the neck isometrics.
      const at = parsed.rows.indexOf(row);
      parsed.rows.splice(at, 1);
      let insertAt = parsed.rows.length;
      let seenTargetDay = false;
      for (let i = 0; i < parsed.rows.length; i += 1) {
        const sameDay = String(parsed.rows[i][parsed.day] || '').trim() === target.d;
        if (sameDay) seenTargetDay = true;
        if (sameDay && isWarmup(String(parsed.rows[i][parsed.exercise] || ''))) continue;
        if (sameDay) { insertAt = i; break; }
        if (seenTargetDay) { insertAt = i; break; }
      }
      parsed.rows.splice(insertAt, 0, row);

      const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
      const next = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
      if (next === candidate) break;
      candidate = next;
      repairs.push({ type: 'v52_key_session_uncrowded', week, movement: flag.movement, from: flag.crowding_day, to: target.d });
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
    'KEY SESSION READINESS: the day before a primary session is part of that session. Where a primary movement has two exposures, do not put the lower-cost one on the day immediately before the heavy one; separate them so the key session gets the best available readiness.',
  ].join('\n');
}
