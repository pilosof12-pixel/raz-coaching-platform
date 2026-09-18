// engine/benchmark_exposure_repair.js
//
// Put the missing benchmarked movement back, preferably by spending a
// redundant slot rather than by adding one.
//
// This is the coach's highest-cost class -- 0.55 for a missing Olympic pull,
// 0.40 for a missing trap bar deadlift -- and the joint most common defect
// across everything we have delivered. The brief already names the movement
// in full ("Snatch Pull (130 kg x 3)") and run #114 omitted it anyway, so the
// instruction is not the missing piece.
//
// Two paths, in this order, because goal_exposure.js has the right rule for
// this and states it plainly: adding training is a heavier repair than
// changing what is already there, so convert before adding.
//
//   SWAP    The block is already carrying redundancy -- the weightlifting
//           program with no Olympic pull had four rowing exposures, which the
//           coach charged separately. Trading one for the missing movement
//           fixes both findings in one edit and leaves weekly volume, session
//           length and MRV exactly where they were.
//
//   INSERT  Only when nothing is redundant. The fight camp had no hinge at
//           all, so there was no slot to spend and two sets had to be added.
//
// Every week gets its own exposure, which is stricter than the rule that
// triggers this: benchmarkExposure asks for the movement anywhere in the
// block, but the standard the coach wrote asks for it in every week, and
// repairing to the rule rather than to the standard would be grading our own
// homework. Being stricter is safe -- the rule is satisfied a fortiori, so it
// still converges.
//
// It never touches competition week. Adding load to a taper to satisfy a
// maintenance requirement trades a 0.40 finding for a worse one.

import { parseWeek } from './v34_workload_accounting.js';
import { benchmarkExposure, accessoryRedundancy, movementFunction, movementExposed, benchmarks } from './coach_rules.js';
import { competitionWeek } from './v90_competition_week.js';
import { newRow, rebuild } from './tsv_rows.js';
import { matchDictionary } from './exercise_dictionary.js';
import { THRESHOLDS } from './coach_standard.js';

// Down to the plate, never up. Rounding to the nearest 2.5 kg put the last
// step of the ramp above its own ceiling; a maintenance dose that lands heavier
// than intended is the one rounding error worth avoiding.
const round2p5 = (kg) => Math.floor(kg / 2.5) * 2.5;
const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));

// The dose the standard asks for: at least two work sets, RPE 6-8, at least
// 75% of the benchmark load.
//
// It climbs across the block. The first version of this repair wrote the same
// 2x3 at 97.5 kg into all four weeks, which satisfied the exposure rule and
// immediately tripped IMPROVEMENT_GOAL_FLAT instead -- correctly, because a
// movement the athlete's own goal asks to improve had been made present and
// stationary. 75% is the floor, not the prescription; the ramp starts there
// and adds a step a week.
const STEP = 0.05;
const CEILING = 0.875;

export function maintenanceDose(bench, step = 0) {
  const fraction = Math.min(CEILING, THRESHOLDS.MAINTENANCE_MIN_LOAD_FRACTION_OF_BENCHMARK + STEP * step);
  const kg = bench.kg ? round2p5(bench.kg * fraction) : null;
  const reps = Number((String(bench.value).match(/x\s*(\d+)/i) || [])[1]) || 3;
  return {
    load: kg ? `${kg} kg` : 'RPE-selected load',
    sets: String(THRESHOLDS.MAINTENANCE_MIN_WORK_SETS),
    reps: String(reps),
    rest: '3 min',
    rpe: '7',
  };
}

// The note has to track the ramp. Calling week 4 a "maintenance dose" while
// the bar is 18% heavier than it was in week 1 is the text contradicting the
// table, which is its own deduction.
const noteFor = (name, bench, step) => (step === 0
  ? `Keeps the benchmarked ${name.toLowerCase()} (${bench.value}) in the block. Crisp reps well short of a limit; stop the set the moment speed or position slips.`
  : `Same ${name.toLowerCase()}, one step heavier than last week. Still well short of a limit -- stop the set the moment speed or position slips.`);

export function repairBenchmarkExposure(program, intake = {}, now = Date.now()) {
  const missing = benchmarkExposure(program, intake);
  if (!missing.length) return { program: String(program || ''), changed: false, swaps: [], inserts: [] };

  const byName = new Map(benchmarks(intake).map((b) => [b.name.toLowerCase(), b]));

  // What may be spent: exercises the redundancy rule already named as surplus.
  const spendable = new Set();
  for (const r of accessoryRedundancy(program, intake)) {
    for (const m of String(r.detail).matchAll(/\(([^)]+)\)/g)) {
      for (const name of m[1].split(',').map((x) => x.trim())) if (name) spendable.add(name.toLowerCase());
    }
  }

  const compWeek = competitionWeek(intake, now);
  let out = String(program || '');
  const swaps = [];
  const inserts = [];

  for (const gap of missing) {
    const bench = byName.get(String(gap.movement).toLowerCase());
    if (!bench) continue;

    // Only write a name the engine's own vocabulary accepts. Without this the
    // repair produced rows that the hallucinated-exercise validator then
    // refused, turning a finding it could have fixed into a build that asked
    // the model to try again -- a blocking gate with no converging repair,
    // which is the one outcome worse than the defect.
    if (matchDictionary(gap.movement)?.status !== 'hit') continue;
    const wantFn = movementFunction(gap.movement);
    let step = 0;

    for (let week = 1; week <= 4; week += 1) {
      if (week === compWeek) continue;
      const parsed = parseWeek(out, week);
      if (!parsed || !parsed.rows.length) continue;

      const named = parsed.rows.map((c) => String(c[parsed.exercise] || '').trim());
      if (movementExposed(gap.movement, named.map((n) => n.toLowerCase()))) continue;

      const dose = maintenanceDose(bench, step);
      const cells = parsed.rows.map((c) => [...c]);

      // Which day each row belongs to, since only the first row of a day
      // carries the day cell.
      const dayOf = [];
      let lastDay = '';
      cells.forEach((c, i) => {
        const raw = String(c[parsed.day] || '').trim();
        if (raw) lastDay = raw;
        dayOf[i] = lastDay;
      });

      // --- SWAP: spend the redundant exercise furthest from this movement's
      // function, so a rowing slot goes before a pulling one.
      const candidates = named
        .map((name, index) => ({ index, name }))
        .filter((r) => !isWarmup(r.name) && spendable.has(r.name.toLowerCase()))
        .sort((a, b) => Number(movementFunction(a.name) === wantFn) - Number(movementFunction(b.name) === wantFn));

      if (candidates.length) {
        const t = candidates[0];
        const row = cells[t.index];
        row[parsed.exercise] = gap.movement;
        if (Number.isInteger(parsed.load)) row[parsed.load] = dose.load;
        row[parsed.sets] = dose.sets;
        row[parsed.reps] = dose.reps;
        if (Number.isInteger(parsed.rest)) row[parsed.rest] = dose.rest;
        const rpeCol = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
        if (rpeCol >= 0) row[rpeCol] = dose.rpe;
        if (Number.isInteger(parsed.notes)) row[parsed.notes] = noteFor(gap.movement, bench, step);
        out = rebuild(out, parsed, cells);
        swaps.push({ week, from: t.name, to: gap.movement, dose });
        step += 1;
        continue;
      }

      // --- INSERT: nothing is redundant, so the movement has to be added.
      // It goes at the end of the day that already trains nearest to it, so
      // hinge work lands beside hinge work instead of opening a new session.
      const workRows = named.map((name, index) => ({ index, name })).filter((r) => !isWarmup(r.name));
      if (!workRows.length) continue;
      const kin = workRows.filter((r) => movementFunction(r.name) === wantFn);
      const host = kin.length ? dayOf[kin[kin.length - 1].index] : dayOf[workRows[0].index];
      const lastOfHost = workRows.filter((r) => dayOf[r.index] === host).slice(-1)[0];
      if (!lastOfHost) continue;

      // The day cell is written, not left blank. These tables repeat the day
      // on every row, and the semantic calendar reads each row's own cell: a
      // blank one became a third, "unknown" gym day for an athlete who asked
      // for two, and the frequency gate refused the whole program over a row
      // that was sitting inside Tuesday's session all along.
      cells.splice(lastOfHost.index + 1, 0, newRow(parsed, {
        day: host,
        name: gap.movement,
        load: dose.load,
        sets: dose.sets,
        reps: dose.reps,
        rest: dose.rest,
        rpe: dose.rpe,
        note: noteFor(gap.movement, bench, step),
      }));
      out = rebuild(out, parsed, cells);
      inserts.push({ week, day: host, movement: gap.movement, dose });
      step += 1;
    }
  }

  return { program: out, changed: swaps.length + inserts.length > 0, swaps, inserts };
}
