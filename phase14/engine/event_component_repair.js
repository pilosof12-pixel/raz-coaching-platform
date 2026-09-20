// engine/event_component_repair.js
//
// Put the race back into a race block.
//
// The brief names all eight stations with their race doses and run #117 trained
// three. That is the second time an instruction has reached the model in full
// and not come back in the program, and the first time -- the Snatch Pull --
// ended the same way: prevention was not enough and a repair had to do it.
//
// The dictionary gap is fixed separately, and it explains a great deal of why
// the model substituted rather than complied. This runs anyway, because a brief
// plus a vocabulary is still an instruction, and the whole point of a
// deterministic repair is that it does not depend on being obeyed.
//
// It spends rather than adds, for the reason the coach gave when he charged the
// generic upper-body work: "Those exercises are not inherently bad. Their
// opportunity cost is the problem this close to the race." Four weeks out, a
// slot spent on a movement that serves no stated goal and is not part of the
// event is a slot the race should have.

import { rows } from './coach_rules.js';
import { componentExposures, componentRaceDose, spendableRowsFor } from './event_component_rules.js';
import { namedComponentsFor } from './coach_standard.js';
import { competitionWeek } from './v90_competition_week.js';
import { matchDictionary } from './exercise_dictionary.js';
import { rebuild } from './tsv_rows.js';
import { parseWeek } from './v34_workload_accounting.js';

// Which weeks each movement appears in, across the whole block.
//
// Spending an accessory slot in week 1 does not only change week 1. If that was
// the movement's last appearance before a taper week where it still occurs, the
// later instance becomes a movement the athlete has never done in this block --
// and V74 refuses the build for introducing a novel exercise near the event.
//
// Live run #122 is what this is for: the repair swapped four accessories out of
// the early weeks, V74 then flagged Calf Raise, Seated Calf Raise, Side Plank
// and Band Pallof Press as novel in week 3, and the build spent five model calls
// before the salvage path delivered a program with four of eight stations
// missing. The repair manufactured the defect that blocked it.
function weeksByMovement(program, intake, now) {
  const map = new Map();
  for (let w = 1; w <= 4; w += 1) {
    const parsed = parseWeek(program, w);
    if (!parsed) continue;
    for (const row of parsed.rows) {
      const name = String(row[parsed.exercise] || '').trim().toLowerCase();
      if (!name) continue;
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(w);
    }
  }
  return map;
}

// Spending a slot can strand a later copy of the same movement, and the repair
// has to clear up after itself rather than decline the slot.
//
// Filtering those rows out of the spendable set was tried first and is the wrong
// trade: it keeps V74 quiet by abandoning the coverage the repair exists to
// achieve, and it broke five tests that require every station trained in weeks 1
// and 2. The coach charges 0.60 for incomplete coverage, which is the most
// expensive line in his table.
//
// So the slot is still spent, and any later copy left novel by the spend is
// converted to the SAME station. That answers both rules at once: nothing is
// introduced near the event that was not trained earlier, and the component
// picks up the second exposure that weeks 1 to 3 require anyway.
function reconcileStrandedCopies(program, intake, swaps, components) {
  let out = String(program || '');
  for (const swap of swaps) {
    const from = String(swap.from || '').trim().toLowerCase();
    if (!from) continue;
    const dose = componentRaceDose(swap.to);
    for (let w = swap.week + 1; w <= 4; w += 1) {
      const parsed = parseWeek(out, w);
      if (!parsed) continue;
      // Still trained at or before the week it was spent in? Then the later copy
      // is not novel and must be left exactly as the model wrote it.
      let earlier = false;
      for (let e = 1; e <= swap.week; e += 1) {
        const p2 = parseWeek(out, e);
        if (!p2) continue;
        if (p2.rows.some((r) => String(r[p2.exercise] || '').trim().toLowerCase() === from)) earlier = true;
      }
      if (earlier) continue;

      const cells = parsed.rows.map((c) => [...c]);
      let touched = false;
      for (const row of cells) {
        if (String(row[parsed.exercise] || '').trim().toLowerCase() !== from) continue;
        row[parsed.exercise] = swap.to;
        if (Number.isInteger(parsed.load)) row[parsed.load] = dose.load;
        row[parsed.sets] = dose.sets;
        row[parsed.reps] = dose.reps;
        if (Number.isInteger(parsed.rest)) row[parsed.rest] = dose.rest;
        if (Number.isInteger(parsed.notes)) row[parsed.notes] = dose.note;
        touched = true;
      }
      if (touched) out = rebuild(out, parsed, cells);
    }
  }
  return out;
}

export function repairEventComponentCoverage(program, intake = {}, now = Date.now()) {
  const components = namedComponentsFor(intake);
  if (components.length < 2) return { program: String(program || ''), changed: false, swaps: [] };

  const model = componentExposures(program, intake);
  if (!model) return { program: String(program || ''), changed: false, swaps: [] };

  const byMovement = weeksByMovement(program, intake, now);

  const compWeek = competitionWeek(intake, now);
  let out = String(program || '');
  const swaps = [];

  // Weeks 1 and 2 carry the coverage requirement: everything must have appeared
  // at least once by the end of week 2. Week 3 keeps what is already there and
  // competition week is exempt.
  for (const week of [1, 2]) {
    if (week === compWeek) continue;

    // Per week, not across the block. His floor is two direct exposures across
    // weeks 1 to 3, so putting every station into week 1 satisfies coverage and
    // immediately fails frequency -- and leaves a week that is all race and a
    // block that is none.
    const current = componentExposures(out, intake);
    const missing = components.filter((c) => !current.trainedIn(week, c));
    if (!missing.length) continue;

    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const spendable = spendableRowsFor(parsed, intake, components);
    if (!spendable.length) continue;

    const cells = parsed.rows.map((c) => [...c]);
    let spent = 0;

    for (const component of missing) {
      if (spent >= spendable.length) break;
      // Never write a name the engine's own vocabulary refuses: that turns a
      // finding it could fix into a build that asks the model to start over.
      const canonical = matchDictionary(component)?.canonical || component;
      if (!matchDictionary(component)) continue;

      const target = spendable[spent];
      const dose = componentRaceDose(component);
      const row = cells[target.index];
      row[parsed.exercise] = canonical;
      if (Number.isInteger(parsed.load)) row[parsed.load] = dose.load;
      row[parsed.sets] = dose.sets;
      row[parsed.reps] = dose.reps;
      if (Number.isInteger(parsed.rest)) row[parsed.rest] = dose.rest;
      const rpeCol = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
      if (rpeCol >= 0) row[rpeCol] = dose.rpe;
      if (Number.isInteger(parsed.notes)) row[parsed.notes] = dose.note;
      swaps.push({ week, from: target.name, to: canonical, dose: `${dose.sets}x${dose.reps}` });
      spent += 1;
    }

    if (!spent) continue;
    out = rebuild(out, parsed, cells);
  }

  if (swaps.length) out = reconcileStrandedCopies(out, intake, swaps, components);

  return { program: out, changed: swaps.length > 0, swaps };
}
