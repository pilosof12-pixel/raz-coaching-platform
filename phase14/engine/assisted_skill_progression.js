// An assisted skill progresses by needing less help, not by being repeated.
//
// Youth Gymnastics was scored 8.5, and the coach's charge on the muscle-up was
// precise: "The transition drill progresses assistance, but the actual
// integrated movement barely progresses." He was exactly right. Across all four
// weeks, in both sessions, the delivered block wrote:
//
//   Banded Muscle-up | Band assistance selected for a smooth full bar turnover | 2 x 1
//
// Identical weight cell, identical dose, identical note, four weeks running,
// while the component drill beside it moved from "Moderate band assistance" to
// "Lightest band assistance that still preserves a clean bar turnover". The
// integrated skill -- the one the goal is actually named after -- stood still.
//
//   "Claude should implement a skill-gated progression rather than merely
//    repeating the same 2x1. If all assisted reps are fast and technically
//    clean, reduce assistance. Once the lightest useful assistance is owned,
//    permit 1-3 fresh unassisted attempts before assisted work."
//
// So this moves the assistance and states what earns the next rung. It does not
// touch sets or reps: at 13 the progression is skill quality and assistance
// reduction, not fatigue, and the athlete already owns a ring muscle-up -- what
// he lacks is the bar turnover, not the strength.
//
// Nothing here may say "failure", "grind", "AMRAP" or "forced reps": Coaching
// Specification v1.0 YG-07 refuses youth work written in that language, and a
// repair of mine once injected the forbidden word itself.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';

export const ASSISTED_SKILL_STATIC = 'V108_ASSISTED_SKILL_STATIC';

// The integrated skill, as opposed to its components. A transition drill or a
// high pull is a piece of the movement; this is the whole thing with help.
const INTEGRATED_ASSISTED = /\b(?:banded|assisted)\s+(?:bar\s+)?muscle-?up\b/i;
// Any assisted variant of a skill the athlete has named as a goal. The Advanced
// Hybrid block asks for four strict One-Arm Pull-ups and then prescribes
// "Assisted One-Arm Pull-up | Minimum assistance for clean reps | 2 x 1 per arm"
// in all four weeks -- the same defect as the youth muscle-up, on a PRIMARY
// goal, and the costliest single finding the grader raises on that block.
const ASSISTED_PREFIX = /^\s*(?:banded|assisted|band[- ]assisted)\s+(.+?)\s*$/i;
const OWNS_IT = /\b(?:bar )?muscle-?up\b[^.\n]{0,40}\b(?:achieved|owned|established|consistent)\b/i;
const BAR_GOAL = /\b(?:first|achieve|get)\b[^.\n]{0,30}\bbar muscle-?up\b/i;
const BUILD_WEEKS = [1, 2, 3];

const RUNGS = {
  1: {
    weight: 'Band that lets you catch every rep cleanly',
    note: 'Integrated assisted singles, taken after the component practice. This is the rung to beat: if both singles are fast and the catch is clean, take one band off next week. Stop after any miss or technical deterioration.',
  },
  2: {
    weight: 'One band lighter than Week 1 if Week 1 was clean, otherwise repeat Week 1',
    note: 'Assistance comes off before anything else does. Drop one band only if both Week 1 singles were fast with a clean catch; if they were not, repeat the Week 1 band and earn it this week. Same number of singles either way.',
  },
  3: {
    weight: 'Lightest band you can still catch cleanly on',
    note: 'Lightest useful assistance. If the Week 2 singles were clean, take up to 3 fresh unassisted attempts before the assisted singles and stop at the first slow one. The assisted singles stay as written whether or not the attempts go in.',
  },
  4: {
    weight: 'The lightest band you owned in Week 3 -- no new rung this week',
    note: 'Consolidation: repeat the assistance you owned in Week 3 rather than chasing a lighter one. Up to 2 fresh unassisted attempts first if last week was clean.',
  },
};

// Rungs for an assisted skill that is not the bar muscle-up. Same principle --
// assistance comes off before anything else does -- in language that fits a
// movement with no band and no catch, where the help may be a foot, the free
// hand or a band.
function genericRungs(movement) {
  const m = String(movement || 'the skill');
  return {
    1: {
      weight: 'Assistance that lets every rep stay clean and fast',
      note: `Assisted ${m}: this is the rung to beat. If every rep is clean and fast, take a measurable step off the assistance next week -- a lighter band, less foot, less hand. Stop the set the moment a rep slows.`,
    },
    2: {
      weight: 'One measurable step less than Week 1, if Week 1 was clean',
      note: `Assisted ${m}: assistance comes off before reps or sets do. Take the step down only if every Week 1 rep was clean and fast; if it was not, repeat Week 1's assistance and earn it this week. Same reps and sets either way.`,
    },
    3: {
      weight: 'The least assistance you can still hold clean form on',
      note: `Assisted ${m}: least useful assistance. If Week 2 was clean, take one or two fresh unassisted attempts before the assisted work and stop at the first slow one. The assisted sets stay as written whether or not the attempts go in.`,
    },
    4: {
      weight: 'The least assistance you owned in Week 3 -- no new step this week',
      note: `Assisted ${m}: consolidation. Repeat the assistance you owned in Week 3 rather than chasing a lighter one, and keep every rep clean.`,
    },
  };
}

// The assisted rows that serve a skill this athlete actually named.
export function assistedGoalSkillRows(program, intake = {}, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const goals = [intake.primary_goals, intake.secondary_goals].flat().filter(Boolean).map(String).join(' | ');
  const rows = [];
  parsed.rows.forEach((cells, i) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || /^\[WARMUP\]/i.test(name)) return;
    const m = name.match(ASSISTED_PREFIX);
    if (!m) return;
    const base = m[1];
    // "One-Arm Pull-up" has to be found in "4 One arm pullups": punctuation and
    // plurals differ, so both sides are reduced to their letters.
    const key = base.toLowerCase().replace(/[^a-z]/g, '');
    const hay = goals.toLowerCase().replace(/[^a-z]/g, '');
    const singular = key.replace(/s$/, '');
    if (!key || (!hay.includes(key) && !hay.includes(singular))) return;
    rows.push({ i, cells, name, base });
  });
  return { parsed, rows };
}

export function assistedBarMuscleUpGoal(intake = {}) {
  const goals = [intake.primary_goals].flat().filter(Boolean).map(String).join(' | ');
  if (!BAR_GOAL.test(goals) && !/muscle-?up/i.test(goals)) return false;
  // A ring muscle-up already owned is not the bar muscle-up being chased, so the
  // current-numbers line is read for the bar specifically.
  const owns = String(intake.current_numbers || '');
  return !OWNS_IT.test(owns.replace(/ring muscle-?up[^.\n]*/gi, ''));
}

function integratedRows(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const rows = [];
  parsed.rows.forEach((cells, i) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (INTEGRATED_ASSISTED.test(name)) rows.push({ i, cells, name });
  });
  return { parsed, rows };
}

const assistanceOf = (cells, parsed) => String(parsed.load != null ? cells[parsed.load] : '').trim().toLowerCase();

export function collectAssistedSkillFlags(program, intake = {}) {
  if (!assistedBarMuscleUpGoal(intake)) return [];
  const text = String(program || '');
  const seen = [];
  for (const week of BUILD_WEEKS) {
    const found = integratedRows(text, week);
    if (!found || !found.rows.length) continue;
    seen.push({
      week,
      assistance: found.rows.map((r) => assistanceOf(r.cells, found.parsed)).sort().join(' || '),
    });
  }
  if (seen.length < 2) return [];
  const flags = [];
  for (let i = 1; i < seen.length; i += 1) {
    if (seen[i].assistance === seen[i - 1].assistance) {
      flags.push({
        code: ASSISTED_SKILL_STATIC,
        weeks: [seen[i - 1].week, seen[i].week],
        detail: `The integrated assisted muscle-up asks for the same assistance in Week ${seen[i].week} as in Week ${seen[i - 1].week}. `
          + 'An assisted skill progresses by needing less help; repeating the same assisted single is not a pathway to a first unassisted rep.',
      });
    }
  }
  return flags;
}

// The same rule for every other assisted variant of a named goal skill.
export function collectAssistedGoalSkillFlags(program, intake = {}) {
  const text = String(program || '');
  const byMovement = new Map();
  for (const week of BUILD_WEEKS) {
    const found = assistedGoalSkillRows(text, intake, week);
    if (!found) continue;
    for (const row of found.rows) {
      if (INTEGRATED_ASSISTED.test(row.name)) continue; // owned by the muscle-up ladder
      const key = row.name.toLowerCase();
      if (!byMovement.has(key)) byMovement.set(key, { movement: row.base, weeks: [] });
      byMovement.get(key).weeks.push({
        week,
        assistance: String(found.parsed.load != null ? row.cells[found.parsed.load] : '').trim().toLowerCase(),
      });
    }
  }
  const flags = [];
  for (const { movement, weeks } of byMovement.values()) {
    if (weeks.length < 2) continue;
    const distinct = new Set(weeks.map((w) => w.assistance));
    if (distinct.size > 1) continue;
    flags.push({
      code: ASSISTED_SKILL_STATIC,
      movement,
      weeks: weeks.map((w) => w.week),
      detail: `Assisted ${movement} asks for the same assistance in every build week while it serves a named goal. `
        + 'An assisted skill progresses by needing less help.',
    });
  }
  return flags;
}

export function normalizeAssistedSkillProgression(program, intake = {}) {
  const original = String(program || '');
  if (!assistedBarMuscleUpGoal(intake)) return { program: original, repaired: false, repairs: [] };
  if (!collectAssistedSkillFlags(original, intake).length) return { program: original, repaired: false, repairs: [] };

  let out = original;
  const repairs = [];
  for (const week of [1, 2, 3, 4]) {
    const found = integratedRows(out, week);
    if (!found || !found.rows.length) continue;
    const rung = RUNGS[week];
    const { parsed } = found;
    if (parsed.load == null || parsed.notes == null) continue;
    const rows = parsed.rows.map((cells, i) => {
      const hit = found.rows.find((r) => r.i === i);
      if (!hit) return cells;
      const copy = cells.slice();
      copy[parsed.load] = rung.weight;
      copy[parsed.notes] = rung.note;
      return copy;
    });
    out = rebuild(out, parsed, rows);
    repairs.push({ week, rows: found.rows.length, assistance: rung.weight });
  }

  if (out === original) return { program: original, repaired: false, repairs: [] };
  return { program: out, repaired: true, repairs };
}

export function normalizeAssistedGoalSkillProgression(program, intake = {}) {
  const original = String(program || '');
  const flagged = collectAssistedGoalSkillFlags(original, intake);
  if (!flagged.length) return { program: original, repaired: false, repairs: [] };
  const targets = new Set(flagged.map((f) => String(f.movement).toLowerCase()));

  let out = original;
  const repairs = [];
  for (const week of [1, 2, 3, 4]) {
    const found = assistedGoalSkillRows(out, intake, week);
    if (!found || !found.rows.length) continue;
    const { parsed } = found;
    if (parsed.load == null || parsed.notes == null) continue;
    const hits = found.rows.filter((r) => targets.has(String(r.base).toLowerCase()) && !INTEGRATED_ASSISTED.test(r.name));
    if (!hits.length) continue;
    const rows = parsed.rows.map((cells, i) => {
      const hit = hits.find((r) => r.i === i);
      if (!hit) return cells;
      const rung = genericRungs(hit.base)[week];
      const copy = cells.slice();
      copy[parsed.load] = rung.weight;
      copy[parsed.notes] = rung.note;
      return copy;
    });
    out = rebuild(out, parsed, rows);
    repairs.push({ week, movements: hits.map((h) => h.name) });
  }

  if (out === original) return { program: original, repaired: false, repairs: [] };
  return { program: out, repaired: true, repairs };
}

export function buildAssistedSkillBrief(intake = {}) {
  if (!assistedBarMuscleUpGoal(intake)) return '';
  return [
    '* AN ASSISTED SKILL PROGRESSES BY NEEDING LESS HELP.',
    '  Where the goal is a first repetition of a skill the athlete cannot yet do unassisted, the assisted version of the full movement must reduce its assistance across the build weeks, and each week must state what earns the next rung -- for example, both singles fast with a clean catch.',
    '  Repeating the same assisted dose for four weeks is not a pathway to a first unassisted rep, even when a component drill beside it is progressing.',
    '  Once the lightest useful assistance is owned, permit a small number of fresh unassisted attempts before the assisted work. Progress the assistance and the readiness gate, not the set and rep count.',
  ].join('\n');
}
