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
import { namedComponentsFor, eventIsOrdered } from './coach_standard.js';
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


// Gathering components onto one day is not yet a rehearsal.
//
// Reviewing run #124 the coach charged 0.45 for exactly this: the session billed
// as the week 2 rehearsal read Row, Sandbag Lunge, Wall Ball, Calf Raise,
// Prowler Push, Row, Run, Farmer Carry, which is "neither HYROX competition
// order nor an alternating run to station structure". His point is that at two
// to three weeks out the value is not doing many race movements in one session,
// it is rehearsing the sequencing problem the athlete will actually meet. A hard
// multi-station circuit is not automatically a rehearsal.
//
// namedComponentsFor returns the catalogue in competition order already, so the
// component rows on the rehearsal day are sorted into that order in the slots
// they already occupy. Nothing is added, removed, or re-dosed; only the sequence
// changes, and only for an event the catalogue says is ordered.
//
// A run row is pulled to the front of the chain where one exists, because the
// race opens with a run and the first transition an athlete meets is run into
// station. Manufacturing the three extra runs his INSTEAD describes would be
// writing a session rather than repairing one.
export function orderIntoCompetitionSequence(program, intake, week, hostDay) {
  if (!eventIsOrdered(intake)) return program;
  const components = namedComponentsFor(intake) || [];
  if (components.length < 2) return program;

  const parsed = parseWeek(program, week);
  if (!parsed || !Number.isInteger(parsed.day)) return program;

  const rank = new Map(components.map((c, i) => [c, i]));
  const nameOf = (r) => String(r[parsed.exercise] || '').trim();
  const dayOf = (r) => String(r[parsed.day] || '').trim();
  const componentOf = (n) => components.find((c) => matcherFor(c).test(n)) || null;
  const isRun = (n) => /\brun\b|\brunning\b|treadmill/i.test(n) && !componentOf(n);

  const cells = parsed.rows.map((c) => [...c]);
  const slots = [];
  const movable = [];
  cells.forEach((row, i) => {
    if (dayOf(row) !== hostDay) return;
    const n = nameOf(row);
    if (!n || isWarmup(n)) return;
    const c = componentOf(n);
    if (!c && !isRun(n)) return;
    slots.push(i);
    movable.push({ row, component: c, run: isRun(n) });
  });
  if (movable.length < 3) return program;

  const runs = movable.filter((m) => m.run);
  const comps = movable.filter((m) => m.component)
    .sort((a, b) => (rank.get(a.component) ?? 99) - (rank.get(b.component) ?? 99));
  const ordered = [...runs.slice(0, 1), ...comps, ...runs.slice(1)];
  if (ordered.length !== slots.length) return program;

  slots.forEach((slot, i) => { cells[slot] = ordered[i].row; });
  return rebuild(program, parsed, cells);
}

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

    // A day that already carries enough components does not need gathering --
    // but it may still be in the wrong order, and that is precisely the case the
    // coach charged 0.45 for. This used to `continue` here, which skipped the
    // week entirely and meant the sequencing below could never run on the one
    // shape it exists to fix.
    const alreadyDense = [...byDay.values()].some((d) => d.components.size >= need);

    // The host is the day closest to being one.
    const host = [...byDay.entries()].sort((a, b) => b[1].components.size - a[1].components.size)[0];
    if (!host) continue;
    const [hostDay, hostInfo] = host;

    let cells = parsed.rows.map((c) => [...c]);
    let placed = 0;

    while (!alreadyDense && hostInfo.components.size + placed < need) {
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
      byDay.get(hostDay).components.add(donorComponent);
      moves.push({ week, day: hostDay, component: donorComponent });
      placed += 1;
      if (placed > 4) break;
    }

    // Sequence EVERY day dense enough to read as a rehearsal, not just the
    // densest one.
    //
    // Targeting only the host missed the finding entirely on run #124: Monday
    // carried six components and was already in race order, so the repair saw
    // nothing to do, while the session the prose actually called the rehearsal
    // was Wednesday with five components in the wrong order. The coach reviewed
    // the day the program pointed him at, not the day with the highest count.
    // Any day a reader would take for a rehearsal has to survive being read as
    // one.
    const dense = [...byDay.entries()].filter(([, d]) => d.components.size >= need).map(([d]) => d);
    for (const day of dense) {
      const sequenced = orderIntoCompetitionSequence(out, intake, week, day);
      if (sequenced === out) continue;
      if (brokeSomething(out, sequenced, intake)) continue;
      out = sequenced;
      moves.push({ week, day, component: 'competition order' });
    }
  }

  return { program: out, changed: moves.length > 0, moves };
}
