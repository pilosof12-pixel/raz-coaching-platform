// engine/effort_plausibility.js
//
// Coach review, on the Tactical block: "Weighted Pull-up +27.5 x4 is labeled
// RPE 4 every week. That's an odd prescription given +30x5 benchmark. Either the
// RPE estimate is wrong or this is deliberately very easy maintenance. If
// deliberate, say so."
//
// It is not deliberate, and it cannot be: +27.5 kg for four reps against a
// demonstrated +30 kg for five is roughly ninety-two percent of the benchmark
// set. That is a working set whatever the sheet says. The athlete will feel an
// eight and read a three, and every RPE number on the page loses its meaning --
// including the ones that are load-bearing safety instructions elsewhere.
//
// Correcting it changes no work. The load and the reps are prescribed; the
// effort column describes what they will feel like. An impossible description is
// simply wrong information, and the fix is to describe them accurately.

import { parseWeek } from './v34_workload_accounting.js';
import { benchmarkRows, liftFamily } from './phase15_elite_guardrails.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const MARKER = /of your benchmark set/i;

function kg(raw) {
  const m = String(raw || '').match(/(?:\+\s*)?(\d+(?:\.\d+)?)\s*kg/i);
  return m ? Number(m[1]) : null;
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function peakEffort(raw) {
  const nums = String(raw || '').match(/\d+(?:\.\d+)?/g);
  return nums && nums.length ? Math.max(...nums.map(Number)) : null;
}

// What a set at this share of a demonstrated benchmark actually feels like.
// Deliberately banded and conservative: the point is to stop the sheet claiming
// a near-benchmark set is trivial, not to pin a number nobody can verify.
function plausibleEffort(ratio) {
  if (ratio >= 0.95) return '8-9';
  if (ratio >= 0.90) return '7.5-8.5';
  return '7-8';
}

const RATIO_FLOOR = 0.85;
const IMPLAUSIBLE_AT_OR_BELOW = 5;

function benchmarkFor(name, benches) {
  const family = liftFamily(name);
  if (!family) return null;
  const same = benches.filter((b) => b.family === family && Number.isFinite(b.load) && b.load > 0);
  if (!same.length) return null;
  // The heaviest demonstrated set in the family is the honest reference.
  return same.reduce((best, b) => (b.load > best.load ? b : best), same[0]);
}

export function collectImplausibleEffortFlags(program, intake = {}) {
  const benches = benchmarkRows(intake);
  if (!benches.length) return [];
  const source = String(program || '');
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(source, week);
    if (!parsed) continue;
    const effortIndex = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
    if (effortIndex < 0 || !Number.isInteger(parsed.load)) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const load = kg(cells[parsed.load]);
      const effort = peakEffort(cells[effortIndex]);
      if (!Number.isFinite(load) || !Number.isFinite(effort)) continue;
      if (effort > IMPLAUSIBLE_AT_OR_BELOW) continue;
      const bench = benchmarkFor(name, benches);
      if (!bench) continue;
      const ratio = load / bench.load;
      if (ratio < RATIO_FLOOR) continue;
      flags.push({
        code: 'V105_EFFORT_IMPLAUSIBLE_FOR_LOAD',
        week,
        exercise: name,
        load,
        effort,
        benchmark: `${bench.load} kg x ${bench.reps}`,
        detail: `Week ${week} ${name} prescribes ${load} kg at RPE ${effort}, which is ${Math.round(ratio * 100)}% of the demonstrated ${bench.load} kg x ${bench.reps}. A set that close to a benchmark is a working set whatever the effort column says. The athlete feels one number and reads another, and every RPE on the page loses its meaning -- including the ones that are stop rules.`,
      });
    }
  }
  return flags;
}

export function normalizeImplausibleEffort(program, intake = {}) {
  const original = String(program || '');
  const flags = collectImplausibleEffortFlags(original, intake);
  if (!flags.length) return { program: original, repaired: false, repairs: [] };

  const benches = benchmarkRows(intake);
  let candidate = original;
  const repairs = [];
  for (const week of [...new Set(flags.map((f) => f.week))]) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    const effortIndex = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
    if (effortIndex < 0) continue;
    let changed = false;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) continue;
      const load = kg(cells[parsed.load]);
      const effort = peakEffort(cells[effortIndex]);
      if (!Number.isFinite(load) || !Number.isFinite(effort) || effort > IMPLAUSIBLE_AT_OR_BELOW) continue;
      const bench = benchmarkFor(name, benches);
      if (!bench) continue;
      const ratio = load / bench.load;
      if (ratio < RATIO_FLOOR) continue;

      const before = String(cells[effortIndex] || '');
      cells[effortIndex] = plausibleEffort(ratio);
      if (Number.isInteger(parsed.notes)) {
        const note = String(cells[parsed.notes] || '').trim();
        if (!MARKER.test(note)) {
          const reps = firstNum(cells[parsed.reps]);
          const line = `This sits at about ${Math.round(ratio * 100)}% of your benchmark set of ${bench.load} kg x ${bench.reps}, so expect it to feel like real work${Number.isFinite(reps) ? ` across all ${reps} reps` : ''} rather than easy. If it does feel easy, the benchmark has moved and the load should follow.`;
          cells[parsed.notes] = note ? `${note} ${line}` : line;
        }
      }
      changed = true;
      repairs.push({ type: 'effort_matched_to_load', week, exercise: name, from: before, to: cells[effortIndex] });
    }
    if (!changed) continue;
    const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
    candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
  }
  return { program: candidate, repaired: repairs.length > 0, repairs };
}
