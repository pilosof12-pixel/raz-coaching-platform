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

export function repairEventComponentCoverage(program, intake = {}, now = Date.now()) {
  const components = namedComponentsFor(intake);
  if (components.length < 2) return { program: String(program || ''), changed: false, swaps: [] };

  const model = componentExposures(program, intake);
  if (!model) return { program: String(program || ''), changed: false, swaps: [] };

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

  return { program: out, changed: swaps.length > 0, swaps };
}
