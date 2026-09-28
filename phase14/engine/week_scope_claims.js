// engine/week_scope_claims.js
//
// "Start with the empty bar only this week."
//
// Week 1 of the masters block said that at 20 kg. Weeks 2 and 3 were also 20 kg.
// The athlete reads Week 1, plans to move up, arrives at Week 2 and finds the
// same load under a note saying to keep it. The prescription is defensible; the
// sentence describing it is false, and a reader cannot tell which one to trust.
//
// A note may scope a claim to one week. It may not do so when a later build week
// contradicts it. The repair strips the false scope and leaves the instruction,
// because the instruction is the part that was right.

import { parseWeek } from './v34_workload_accounting.js';

const BUILD_WEEKS = [1, 2, 3, 4];

// "only this week", "this week only", "just for this week", "for this week only".
const SCOPE_CLAIM = /\s*(?:,\s*)?\b(?:only|just)\s+(?:for\s+)?this\s+week\b|\s*(?:,\s*)?\bthis\s+week\s+only\b|\s*(?:,\s*)?\bfor\s+this\s+week\s+only\b/gi;

function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function normalize(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function weekIndex(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const byName = new Map();
  parsed.rows.forEach((cells, rowIndex) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    const key = normalize(name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push({ rowIndex, cells, name });
  });
  return { parsed, byName };
}

function loadsOf(entries, parsed) {
  if (!Number.isInteger(parsed.load)) return new Set();
  return new Set(entries.map(({ cells }) => normalize(cells[parsed.load])).filter(Boolean));
}

// A scope claim is contradicted when the same exercise carries the same load in
// any later build week.
export function collectWeekScopeClaimFlags(program, intake = {}) {
  const source = String(program || '');
  const weeks = new Map();
  for (const week of BUILD_WEEKS) {
    const parsed = weekIndex(source, week);
    if (parsed) weeks.set(week, parsed);
  }
  if (weeks.size < 2) return [];

  const flags = [];
  for (const [week, { parsed, byName }] of weeks) {
    if (!Number.isInteger(parsed.notes)) continue;
    for (const [key, entries] of byName) {
      for (const { cells, name } of entries) {
        const note = String(cells[parsed.notes] || '');
        SCOPE_CLAIM.lastIndex = 0;
        if (!SCOPE_CLAIM.test(note)) continue;
        const loads = loadsOf(entries, parsed);
        if (!loads.size) continue;

        const contradictedIn = [];
        for (const [later, laterWeek] of weeks) {
          if (later <= week) continue;
          const laterEntries = laterWeek.byName.get(key);
          if (!laterEntries) continue;
          const laterLoads = loadsOf(laterEntries, laterWeek.parsed);
          if ([...laterLoads].some((l) => loads.has(l))) contradictedIn.push(later);
        }
        if (!contradictedIn.length) continue;

        flags.push({
          code: 'V98_WEEK_SCOPE_CLAIM_CONTRADICTED',
          week,
          exercise: name,
          contradicted_in: contradictedIn,
          detail: `Week ${week} ${name} scopes its instruction to this week alone, but Week${contradictedIn.length > 1 ? 's' : ''} ${contradictedIn.join(' and ')} prescribe the same load. The athlete is told a dose is temporary and then given it again, which makes the note contradict the table it sits in.`,
        });
      }
    }
  }
  return flags;
}

// Strips the false scope and keeps the instruction.
export function normalizeWeekScopeClaims(program, intake = {}) {
  const original = String(program || '');
  const flags = collectWeekScopeClaimFlags(original, intake);
  if (!flags.length) return { program: original, repaired: false, repairs: [] };

  const targets = new Map();
  for (const flag of flags) {
    if (!targets.has(flag.week)) targets.set(flag.week, new Set());
    targets.get(flag.week).add(normalize(flag.exercise));
  }

  let candidate = original;
  const repairs = [];
  for (const [week, names] of targets) {
    const indexed = weekIndex(candidate, week);
    if (!indexed || !Number.isInteger(indexed.parsed.notes)) continue;
    const { parsed, byName } = indexed;
    let changed = false;
    for (const key of names) {
      for (const { cells, name } of byName.get(key) || []) {
        const before = String(cells[parsed.notes] || '');
        const after = before.replace(SCOPE_CLAIM, '').replace(/\s{2,}/g, ' ').trim();
        if (after === before) continue;
        cells[parsed.notes] = after;
        changed = true;
        repairs.push({ type: 'week_scope_claim_corrected', week, exercise: name });
      }
    }
    if (!changed) continue;
    const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
    candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
