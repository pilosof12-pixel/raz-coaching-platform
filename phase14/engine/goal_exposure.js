// engine/goal_exposure.js
//
// Rules that refuse a program for missing an exposure the athlete's own goal
// requires, in a module that raises eleven blocking codes and repairs none.
//
// A named modality goal with no direct exposure of that modality. A strict
// overhead press goal served by push presses. A one-arm pull-up benchmark
// trained with eccentrics. A box squat goal with only one of the two qualities
// it needs. Each refuses the build, each names precisely what is missing, and
// none of them could put it there.
//
// Adding training is a heavier repair than rewriting a note, so the rules here
// are narrow. Convert before adding: a vertical press that is not strict
// becomes the strict press the goal asked for, rather than a new row appearing
// beside it. Add only a movement the dictionary accepts and the goal itself
// names. Never touch a week the rule does not read.

import { parseWeek } from './v34_workload_accounting.js';
import { matchDictionary } from './exercise_dictionary.js';
import { specificModalityRequirement, hasSpecificModalityExposure } from './phase15_program_qa.js';
import { rebuild, newRow } from './tsv_rows.js';

const isWarmup = (n) => /^\s*\[WARMUP\]/i.test(String(n || ''));
const goalText = (intake, key) => {
  const v = intake?.[key];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x || '')).join(' | ');
};

// --- 1. The narrative does not contradict the goal ---------------------------

const POSTPONES_OHP = /overhead press[\s\S]{0,200}?(maintain(?:ed)?|later block|not progress)/i;

export function repairGoalNarrative(program, intake = {}) {
  const secondary = goalText(intake, 'secondary_goals');
  if (!/overhead press|\bohp\b/i.test(secondary)) return String(program || '');
  const src = String(program || '');
  const at = src.search(/START_WEEK1_TSV/i);
  const head = at < 0 ? src : src.slice(0, at);
  if (!POSTPONES_OHP.test(head)) return src;

  // The narrative is describing the wrong plan. Replace the sentence that
  // postpones the goal with one that says what the block actually does.
  const fixed = head.split(/(?<=[.!?])\s+/)
    .map((sentence) => (POSTPONES_OHP.test(sentence)
      ? 'The overhead press progresses across this block: it is one of your stated goals, not something held over for a later one.'
      : sentence))
    .join(' ');
  return at < 0 ? fixed : fixed + src.slice(at);
}

// --- 2 & 3. The overhead press goal is trained overhead -----------------------

const VERTICAL_PRESS = /overhead press|push press|z press|dumbbell shoulder press/i;
const STRICT_PRESS = /\b(?:overhead press|standing barbell overhead press)\b/i;

export function repairOverheadExposure(program, intake = {}) {
  const secondary = goalText(intake, 'secondary_goals');
  if (!/overhead press|\bohp\b/i.test(secondary)) return String(program || '');
  const wantsStrict = /strict overhead press/i.test(secondary);
  let out = String(program || '');

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => c.slice());
    let changed = false;

    const rowsOf = () => cells.map((c, i) => ({ i, name: String(c[parsed.exercise] || '').trim() }))
      .filter((x) => x.name && !isWarmup(x.name));

    // Strict is a variation, not a new session: the press that is already
    // there becomes the press the goal named.
    if (wantsStrict && !rowsOf().some((x) => STRICT_PRESS.test(x.name) && !/push press/i.test(x.name))) {
      const convertible = rowsOf().find((x) => VERTICAL_PRESS.test(x.name));
      if (convertible) {
        cells[convertible.i][parsed.exercise] = 'Overhead Press';
        if (Number.isInteger(parsed.notes)) {
          const note = String(cells[convertible.i][parsed.notes] || '').trim();
          const add = 'Strict press, no leg drive: the goal is the strict lift, so that is the lift that gets trained.';
          if (!note.includes('no leg drive')) cells[convertible.i][parsed.notes] = note ? `${note} ${add}` : add;
        }
        changed = true;
      }
    }

    // Two exposures, not one. The second goes on a day that has none, so the
    // press is spread across the week rather than doubled in one session.
    const dayOf = [];
    let lastDay = '';
    cells.forEach((c, i) => {
      const raw = String(c[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      dayOf[i] = lastDay;
    });
    const pressDays = new Set(rowsOf().filter((x) => VERTICAL_PRESS.test(x.name)).map((x) => dayOf[x.i]));
    if (pressDays.size === 1) {
      const otherDay = [...new Set(rowsOf().map((x) => dayOf[x.i]))].find((d) => !pressDays.has(d));
      if (otherDay && matchDictionary('Dumbbell Shoulder Press')?.status === 'hit') {
        const at = rowsOf().filter((x) => dayOf[x.i] === otherDay).slice(-1)[0];
        if (at) {
          cells.splice(at.i + 1, 0, newRow(parsed, {
            day: '', name: 'Dumbbell Shoulder Press', load: 'RPE-selected load', sets: 3, reps: '8',
            rest: '2 min', rpe: 7,
            note: 'Second overhead exposure of the week. One session a week is not enough to move a press; this is the volume that does it, at a cost the rest of the week can absorb.',
          }));
          changed = true;
        }
      }
    }

    if (!changed) continue;
    out = rebuild(out, parsed, cells);
  }
  return out;
}

// --- 4. The named modality is trained directly -------------------------------

const MODALITY_ROW = {
  running: { name: 'Run', load: '-', sets: 1, reps: '30 min', rest: '-', rpe: 5,
    note: 'Direct running exposure: the goal is a running goal, and nothing else trains it. Easy, conversational pace.' },
  cycling: { name: 'Zone-2 Bike', load: '-', sets: 1, reps: '40 min', rest: '-', rpe: 5,
    note: 'Direct cycling exposure: the goal is a cycling goal, and cross-training does not replace time on the bike.' },
  swimming: { name: 'Swim', load: '-', sets: 1, reps: '30 min', rest: '-', rpe: 5,
    note: 'Direct swimming exposure: the goal is a swimming goal, and the pool is the only place it is trained.' },
};

export function repairModalityExposure(program, intake = {}) {
  const req = specificModalityRequirement(intake);
  if (!req || req.externalSatisfied) return String(program || '');
  if (hasSpecificModalityExposure(program, intake)) return String(program || '');
  const spec = MODALITY_ROW[req.key];
  if (!spec || matchDictionary(spec.name)?.status === 'miss') return String(program || '');

  let out = String(program || '');
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const names = parsed.rows.map((c) => String(c[parsed.exercise] || ''));
    if (names.some((n) => !isWarmup(n) && req.exposure.test(n))) continue;
    const cells = parsed.rows.map((c) => c.slice());
    cells.push(newRow(parsed, { day: '', ...spec }));
    out = rebuild(out, parsed, cells);
  }
  return out;
}

// --- 5. An advanced skill is trained as an advanced skill ---------------------

const OAP_ECCENTRIC = /one.?arm (?:pull|chin).?up (?:eccentric|negative)/i;

export function repairAdvancedSkillExposure(program, intake = {}) {
  const all = `${goalText(intake, 'primary_goals')} | ${goalText(intake, 'secondary_goals')}`;
  if (!/one.?arm pull|oap/i.test(all)) return String(program || '');
  let out = String(program || '');

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed) continue;
    const cells = parsed.rows.map((c) => c.slice());
    let changed = false;

    // An athlete who already owns strict reps does not train the movement with
    // eccentrics: that is a regression dressed as progression. The exposure
    // becomes assisted work, which is the next thing below strict, not below
    // the movement.
    cells.forEach((c, i) => {
      const name = String(c[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !OAP_ECCENTRIC.test(name)) return;
      cells[i][parsed.exercise] = 'Assisted One-Arm Pull-up';
      if (Number.isInteger(parsed.notes)) {
        const note = String(cells[i][parsed.notes] || '').trim();
        const add = 'Assisted rather than eccentric: you already own strict reps, so the exposure that builds on them is assisted volume, not lowering.';
        if (!note.includes('Assisted rather than eccentric')) cells[i][parsed.notes] = note ? `${note} ${add}` : add;
      }
      changed = true;
    });

    if (!changed) continue;
    out = rebuild(out, parsed, cells);
  }
  return out;
}
