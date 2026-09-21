// Gather a race rehearsal out of components the block already trains.
//
// The coach charges 0.45 for a four-week arrival block with no session that
// rehearses the race, and his INSTEAD was specific: runs alternating with sled
// push, sled pull, burpee broad jump and an erg dose. The rule encodes that as
// at least half the named components in one day with at least three transitions
// between them.
//
// Unlike the compromised-running finding -- which turned out to be a run and a
// station sitting on the same day in the wrong order -- this one is NOT latent.
// On run #122 the best day carries three of the four components needed, and no
// amount of reordering makes a fourth appear. So this repair moves one component
// row from another day in the SAME week onto the day that is closest, which
// keeps the week's coverage identical while giving one day the density a
// rehearsal needs.
//
// It is the most invasive repair in the chain: it changes what two sessions
// contain, not just their order. Every move is therefore checked with the same
// before/after audit the destructive repairs use, and declined outright if any
// structural code gets worse. Moving work into a day can push it past its time
// budget or leave the donor day too thin, and those are exactly the codes the
// audit already counts.

import { parseWeek } from './v34_workload_accounting.js';
import { namedComponentsFor } from './coach_standard.js';
import { matcherFor } from './event_component_rules.js';
import { auditProgramStructure } from './v38_structural_audit.js';
import { collectEconomyFlags, collectNoveltyFlags } from './v74_camp_economy.js';
import { rebuild } from './tsv_rows.js';

const REHEARSAL_SHARE = 0.5;
const REHEARSAL_WEEKS = [1, 2];
const isWarmup = (s) => /^\s*\[WARMUP\]/i.test(String(s || ''));

// The guard has to watch the gate that would actually refuse this repair.
//
// auditProgramStructure alone does not raise the camp-economy codes, and
// V74_CAMP_SESSION_TOO_BUSY is exactly what a repair that moves rows ONTO a day
// risks causing -- it is also the single QA rejection in run #123's trace. A
// guard blind to the one gate its own repair can trip is not a guard; it passed
// here by luck rather than by design.
function brokeSomething(before, after, intake) {
  const codes = (program) => {
    try {
      const structural = auditProgramStructure(program, intake).map((f) => f.code || f.rule);
      const economy = [
        ...(collectEconomyFlags(program, intake) || []),
        ...(collectNoveltyFlags(program, intake) || []),
      ].map((f) => f.code || f.rule);
      return [...structural, ...economy].filter(Boolean);
    } catch { return null; }
  };
  const a = codes(before);
  const b = codes(after);
  if (!a || !b) return true; // cannot tell, so do not risk it
  const tally = (l) => l.reduce((m, c) => ({ ...m, [c]: (m[c] || 0) + 1 }), {});
  const ta = tally(a);
  const tb = tally(b);
  return Object.keys(tb).some((c) => (tb[c] || 0) > (ta[c] || 0));
}

// Deliberately NOT a local matcher. Writing a second one is how "Chest-Supported
// Row" got counted as a rowing erg for the third time: this repair reported four
// components on a Wednesday that had three, declared success, and left the
// finding in place. The rule's matcher carries the exclusions that make Row mean
// the erg, so the repair borrows it rather than approximating it.

export function repairRaceRehearsal(program, intake = {}) {
  const components = namedComponentsFor(intake);
  if (components.length < 4) return { program: String(program || ''), changed: false, moves: [] };
  const need = Math.ceil(components.length * REHEARSAL_SHARE);

  let out = String(program || '');
  const moves = [];

  for (const week of REHEARSAL_WEEKS) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.day)) continue;

    const nameOf = (r) => String(r[parsed.exercise] || '').trim();
    const dayOf = (r) => String(r[parsed.day] || '').trim();
    const componentOf = (n) => components.find((c) => matcherFor(c).test(n)) || null;

    // What each day already carries.
    const byDay = new Map();
    parsed.rows.forEach((r, i) => {
      const d = dayOf(r);
      const n = nameOf(r);
      if (!d || isWarmup(n)) return;
      if (!byDay.has(d)) byDay.set(d, { rows: [], components: new Set() });
      byDay.get(d).rows.push(i);
      const c = componentOf(n);
      if (c) byDay.get(d).components.add(c);
    });
    if (!byDay.size) continue;

    // Already a rehearsal this week? Then leave the week alone.
    if ([...byDay.values()].some((d) => d.components.size >= need)) continue;

    // The host is the day closest to being one.
    const host = [...byDay.entries()].sort((a, b) => b[1].components.size - a[1].components.size)[0];
    if (!host) continue;
    const [hostDay, hostInfo] = host;

    let cells = parsed.rows.map((c) => [...c]);
    let placed = 0;

    while (hostInfo.components.size + placed < need) {
      // A component row on another day that the host does not already have.
      let donorIndex = -1;
      let donorComponent = null;
      for (let i = 0; i < cells.length; i += 1) {
        const d = dayOf(cells[i]);
        const n = nameOf(cells[i]);
        if (!d || d === hostDay || isWarmup(n)) continue;
        const c = componentOf(n);
        if (!c || hostInfo.components.has(c)) continue;
        // Never strip a day down to nothing.
        const donorRows = byDay.get(d);
        if (!donorRows || donorRows.rows.length <= 2) continue;
        donorIndex = i;
        donorComponent = c;
        break;
      }
      if (donorIndex < 0) break;

      // Move it to sit after the host's last row, so the rehearsal reads as one
      // continuous block rather than being spliced into the middle of a session.
      const row = [...cells[donorIndex]];
      row[parsed.day] = hostDay;
      const hostRowsNow = cells.map((r, i) => ({ r, i })).filter((x) => dayOf(x.r) === hostDay);
      const insertAfter = hostRowsNow.length ? hostRowsNow[hostRowsNow.length - 1].i : donorIndex;
      const without = cells.filter((_, i) => i !== donorIndex);
      const adjusted = insertAfter > donorIndex ? insertAfter - 1 : insertAfter;
      const candidateCells = [...without.slice(0, adjusted + 1), row, ...without.slice(adjusted + 1)];

      const candidate = rebuild(out, parsed, candidateCells);
      if (brokeSomething(out, candidate, intake)) break;

      cells = candidateCells;
      out = candidate;
      hostInfo.components.add(donorComponent);
      moves.push({ week, day: hostDay, component: donorComponent });
      placed += 1;
      if (placed > 4) break;
    }
  }

  return { program: out, changed: moves.length > 0, moves };
}
