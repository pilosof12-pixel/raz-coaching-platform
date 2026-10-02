// Three strength days in a row is a schedule defect, not a content defect.
//
// Run #158 paid for this twice. The tactical block came back with strength on
// three consecutive days in all four weeks, the architecture gate aborted it,
// and the model regenerated the entire program: 1026 seconds and two billed
// calls for a block whose exercises, doses and frequencies were never the
// problem. The delivered second attempt put the same three sessions on Mon,
// Thu and Sat. Nothing about the training changed -- only which calendar day
// each session sat on.
//
// That is a permutation, and a permutation is something we can do ourselves.
//
// The repair swaps the day labels of two day-blocks. A swap is chosen rather
// than a move because it keeps the set of training weekdays exactly as the
// model wrote it: the same number of training days, so an explicit
// calendar-day budget cannot start failing because we spread the week out.
//
// The gate's own analysis is the oracle. We do not re-implement its streak
// rule; we apply a candidate swap, ask it again, and keep the swap only if the
// overclustering count falls and nothing else gets worse. That makes the
// search converge on the real rule rather than on a copy of it that can drift.
//
// The prose is part of the program. A block that says "a shorter Monday easy
// run kept on purpose to spread impact" is false the moment Monday's work
// moves, and a stale day name there reads as a contradiction between the text
// and the table -- the same defect class as a note left behind over a changed
// dose. So a swap renames the weekday in the narrative too, in both the long
// and short forms, simultaneously, and among equally good swaps the one that
// disturbs the least prose wins.

import { tacticalScheduleAnalysis } from './coaching_progression_gpp.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};
// Three of the gate's four violation types are answered by moving a session to
// a different day: strength landing in a block, impact landing in a chain, and
// two substantive pull-up exposures landing back to back. The fourth,
// exceeding an explicit calendar-day budget, is not -- clearing it means
// combining two sessions into one day, which is a content decision and stays
// with the model. So we minimise the first three and refuse any swap that
// makes the fourth worse.
const PERMUTABLE = [
  'strength_days_overclustered',
  'impact_days_overclustered',
  'priority_pull_days_adjacent',
];
const BUDGET = 'calendar_day_budget_exceeded';
const OVERCLUSTERED = 'strength_days_overclustered';
const WEEK_BLOCK = (n) => new RegExp(`(START_WEEK${n}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${n}_TSV)`, 'i');

const dayIndex = (day) => WEEKDAYS.indexOf(String(day || '').trim().slice(0, 3));

// --- detection ---------------------------------------------------------------

export function collectTacticalStrengthSpacingFlags(program, intake = {}) {
  let analysis;
  try {
    analysis = tacticalScheduleAnalysis(program, intake);
  } catch {
    return [];
  }
  if (!analysis?.applicable) return [];
  const out = [];
  for (const week of analysis.violations || []) {
    for (const violation of week.violations || []) {
      if (!PERMUTABLE.includes(violation.type)) continue;
      out.push({
        code: violation.type === OVERCLUSTERED
          ? 'TACTICAL_STRENGTH_DAYS_OVERCLUSTERED'
          : 'TACTICAL_SCHEDULE_DAY_PLACEMENT',
        type: violation.type,
        week: week.week,
        max_streak: violation.max_streak,
        days: violation.days,
      });
    }
  }
  return out;
}

// --- rewriting ---------------------------------------------------------------

function weekBlocks(program) {
  const found = [];
  for (let week = 1; week <= 4; week += 1) {
    const m = String(program).match(WEEK_BLOCK(week));
    if (m) found.push({ week, header: m[1], body: m[2], footer: m[3] });
  }
  return found;
}

// Rows carry their day in column 0, so a block is just the run of rows sharing
// that label. Order of first appearance is kept, because that is the order the
// week is read in.
function dayGroups(body) {
  const lines = body.split('\n');
  if (!lines.length) return null;
  const head = lines[0];
  const groups = [];
  const seen = new Map();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const day = line.split('\t')[0];
    if (dayIndex(day) < 0) return null; // not weekday-labelled; leave it alone
    if (!seen.has(day)) {
      seen.set(day, groups.length);
      groups.push({ day, lines: [] });
    }
    groups[seen.get(day)].lines.push(line);
  }
  return groups.length ? { head, groups } : null;
}

function relabel(line, from, to) {
  const cells = line.split('\t');
  if (cells[0] === from) cells[0] = to;
  else if (cells[0] === to) cells[0] = from;
  return cells.join('\t');
}

function swapInBlock(block, a, b) {
  const parsed = dayGroups(block.body);
  if (!parsed) return null;
  const swapped = parsed.groups.map((group) => ({
    day: group.day === a ? b : group.day === b ? a : group.day,
    lines: group.lines.map((line) => relabel(line, a, b)),
  }));
  // A week is read in calendar order. Having moved a label, the blocks have to
  // follow it, or the table lists Friday above Tuesday.
  swapped.sort((x, y) => dayIndex(x.day) - dayIndex(y.day));
  const body = [parsed.head, ...swapped.flatMap((group) => group.lines)].join('\n');
  return `${block.header}${body}${block.footer}`;
}

// Everything outside the week tables is prose the athlete reads, and it names
// days. Both names move at once via a placeholder, so a Mon/Fri swap does not
// turn every Monday into Friday and then back again.
function swapProseDays(text, a, b) {
  const token = (k) => `\u0000${k}\u0000`;
  let out = text;
  let touched = 0;
  const forms = [[LONG[a], LONG[b]], [a, b]];
  forms.forEach(([wordA, wordB], i) => {
    const wrap = (w) => new RegExp(`\\b${w}\\b`, 'g');
    out = out.replace(wrap(wordA), () => { touched += 1; return token(`A${i}`); });
    out = out.replace(wrap(wordB), () => { touched += 1; return token(`B${i}`); });
    out = out.split(token(`A${i}`)).join(wordB).split(token(`B${i}`)).join(wordA);
  });
  return { text: out, touched };
}

function applySwap(program, a, b) {
  const blocks = weekBlocks(program);
  if (!blocks.length) return null;
  let next = String(program);
  const tables = [];
  for (const block of blocks) {
    const rebuilt = swapInBlock(block, a, b);
    if (!rebuilt) return null;
    tables.push({ week: block.week, rebuilt });
  }
  // Hold the tables out while the prose is renamed, so day labels inside the
  // tables are never caught by the prose substitution.
  const holes = [];
  for (const table of tables) {
    const hole = `\u0001TSV${table.week}\u0001`;
    next = next.replace(WEEK_BLOCK(table.week), hole);
    holes.push({ hole, rebuilt: table.rebuilt });
  }
  const prose = swapProseDays(next, a, b);
  next = prose.text;
  for (const { hole, rebuilt } of holes) next = next.split(hole).join(rebuilt);
  return { program: next, prose_touched: prose.touched };
}

// --- scoring a candidate -----------------------------------------------------

function violationCounts(program, intake) {
  let analysis;
  try {
    analysis = tacticalScheduleAnalysis(program, intake);
  } catch {
    return null;
  }
  if (!analysis?.applicable) return null;
  const counts = new Map();
  for (const week of analysis.violations || []) {
    for (const violation of week.violations || []) {
      counts.set(violation.type, (counts.get(violation.type) || 0) + 1);
    }
  }
  return counts;
}

const countOf = (counts, type) => counts.get(type) || 0;
const permutableTotal = (counts) => PERMUTABLE.reduce((sum, type) => sum + countOf(counts, type), 0);

// Better means: strictly fewer day-placement violations overall, and the
// calendar-day budget no worse than it was. A repair that trades one blocking
// violation for another has not repaired anything, so the total has to fall
// rather than merely move between types.
function improves(before, after) {
  if (!after) return false;
  if (permutableTotal(after) >= permutableTotal(before)) return false;
  if (countOf(after, BUDGET) > countOf(before, BUDGET)) return false;
  return true;
}

function candidateDays(program) {
  const present = new Set();
  for (const block of weekBlocks(program)) {
    const parsed = dayGroups(block.body);
    if (!parsed) return [];
    for (const group of parsed.groups) present.add(group.day);
  }
  return { present: [...present], all: WEEKDAYS };
}

export function normalizeTacticalStrengthSpacing(program, intake = {}) {
  const original = String(program || '');
  // The detector decides whether there is anything to do, so the live path
  // exercises the same rule the tests assert on.
  if (!collectTacticalStrengthSpacingFlags(original, intake).length) {
    return { program: original, repaired: false, repairs: [] };
  }

  let current = original;
  const repairs = [];
  // One swap per round. Past a handful the schedule is not a permutation
  // problem any more and the model has to be asked again, so the loop is
  // bounded rather than run to exhaustion.
  for (let round = 0; round < 6; round += 1) {
    const before = violationCounts(current, intake);
    if (!before || !permutableTotal(before)) break;
    const { present, all } = candidateDays(current);
    if (!present.length) break;

    let best = null;
    for (const a of present) {
      for (const b of all) {
        if (a === b) continue;
        const applied = applySwap(current, a, b);
        if (!applied || applied.program === current) continue;
        const after = violationCounts(applied.program, intake);
        if (!improves(before, after)) continue;
        const score = [permutableTotal(after), applied.prose_touched];
        // Fewest remaining violations first; among equals, the swap that
        // rewrites the least prose.
        if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
          best = { a, b, score, program: applied.program, prose_touched: applied.prose_touched };
        }
      }
    }
    if (!best) break;
    current = best.program;
    repairs.push({
      action: 'swap_day_labels',
      from: best.a,
      to: best.b,
      prose_renamed: best.prose_touched,
      remaining_day_placement_violations: best.score[0],
    });
  }

  return { program: current, repaired: current !== original, repairs };
}
