// engine/supporting_progression_standard.js
//
// A supporting exposure that repeats the same load, sets and reps through every
// build week, under a note that never changes, is the single most common reason
// a reviewed block loses progression marks. It is not always wrong to hold the
// numbers -- for a masters athlete returning from injury, or an accessory beside
// a heavy primary, holding is often exactly right -- but then the block has to
// say what IS advancing. Otherwise the athlete opens Week 3, reads the same
// sentence they read in Week 1, and correctly concludes nobody wrote it for them.
//
// This generalises the pattern the Advanced Hybrid OAP work already uses: keep
// the dose, and state per week what the athlete is trying to beat. The repair
// touches notes only. No load, set, rep or rest value changes, so it cannot add
// fatigue, and it converges in a single pass.

import { parseWeek } from './v34_workload_accounting.js';
import { CATEGORY, ROLE, classifyExercise } from './v38_movement_taxonomy.js';

const BUILD_WEEKS = [1, 2, 3];

function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }

// Only work the athlete would notice going nowhere. Trunk, tissue-capacity and
// GPP work held flat for three weeks is ordinary coaching, not a defect -- a
// dead bug does not need a progression essay. Endurance rows progress by
// distance, duration or pace and answer to their own rules. What is left is the
// loaded compound and assistance work whose whole point is to get harder: a
// goblet squat stuck at 18 kg for three weeks is the case this rule exists for.
const EXEMPT_CATEGORIES = new Set([
  CATEGORY.TRUNK, CATEGORY.GPP, CATEGORY.TISSUE_CAPACITY,
  CATEGORY.ENDURANCE, CATEGORY.WARMUP, CATEGORY.SKILL,
]);

function isSubstantive(name) {
  const { category, role } = classifyExercise(name);
  if (EXEMPT_CATEGORIES.has(category)) return false;
  return role === ROLE.PRIMARY || role === ROLE.SECONDARY;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// The note already names something the athlete is meant to beat this week. A
// deliberate hold that says "keep the load, progress bar speed" is good coaching
// and must not be rewritten; "keep the same load and execution standard" names
// nothing to beat and is the case this rule exists for.
const STATES_WHAT_ADVANCES = /\b(?:progress(?:es|ing)?|improve|beat|advance[sd]?|tighten|earn(?:ed|s)?|standard:)\b/i;

const MARKER = /\bWeek [1-3] standard:|\bWeek [23] advance:/i;

// One sentence pasted onto every flagged row would re-create the defect this
// rule exists to remove: five exercises in a week reading identically is copy-
// paste whether a human or a repair wrote it. The standard a lifter is asked to
// beat differs by movement, so the cue does too -- a squat is judged on depth and
// bracing, a press on a lockout that does not slow, a carry on posture over the
// full distance.
const QUALITY = {
  [CATEGORY.KNEE_DOMINANT]: 'the same depth and bracing on every rep, with an unhurried tempo out of the bottom',
  [CATEGORY.HIP_DOMINANT]: 'a full, controlled lockout with the ribs down and no lumbar extension to finish',
  [CATEGORY.UNILATERAL_LOWER]: 'balance and control on the weaker side, which leads every set',
  [CATEGORY.HORIZONTAL_PUSH]: 'a controlled lowering and a lockout that does not slow down across sets',
  [CATEGORY.VERTICAL_PUSH]: 'a controlled lowering and a lockout that does not slow down across sets',
  [CATEGORY.HORIZONTAL_PULL]: 'finishing each rep with the upper back rather than a swing or a shrug',
  [CATEGORY.VERTICAL_PULL]: 'a full range from a dead hang, finishing with the back rather than a kip',
  [CATEGORY.LOADED_CARRY]: 'a taller posture and a steadier grip across the whole distance',
  [CATEGORY.POWER]: 'speed and height, stopping the moment either drops',
};
const DEFAULT_QUALITY = 'control of the lowering on every rep';

// Some machines sit in a category whose cue is written for the free-weight
// pattern. A machine hamstring curl is hip-dominant by classification, but
// telling it to lock out with the ribs down is a hinge cue on a knee-flexion
// machine. Where the movement is isolation work, its own standard wins.
const ISOLATION = /leg curl|hamstring curl|leg extension|calf raise|(?:biceps|triceps|hammer|preacher) curl|lateral raise|(?:face|band) pull|pec (?:deck|fly)|cable fly/i;
const ISOLATION_QUALITY = 'a controlled lowering and a full, deliberate finish at the end of range, with no swing to start the rep';

const EARNED = {
  [CATEGORY.LOADED_CARRY]: 'you may add a few metres to the last carry only',
  [CATEGORY.POWER]: 'you may add one crisp rep to the last set only',
};
const DEFAULT_EARNED = 'you may add one clean rep to the last set only';

function buildStandard(week, name) {
  const { category } = classifyExercise(name);
  const quality = ISOLATION.test(name) ? ISOLATION_QUALITY : (QUALITY[category] || DEFAULT_QUALITY);
  const earned = EARNED[category] || DEFAULT_EARNED;
  if (week === 1) {
    return `Week 1 standard: set the benchmark. Use a load you can repeat cleanly on every set and note ${quality} - that is what Weeks 2 and 3 are measured against, not a bigger number.`;
  }
  if (week === 2) {
    return `Week 2 advance: beat Week 1 on ${quality}, at the same or a lower RPE. The numbers hold on purpose - this week the progression is execution.`;
  }
  return `Week 3 advance: the prescription holds again. If every set in Week 2 was clean at or below the target RPE, ${earned} - earned, optional, and skipped entirely on any grind, symptom or loss of position.`;
}

function rowsByName(parsed) {
  const out = new Map();
  parsed.rows.forEach((cells, rowIndex) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name) || !isSubstantive(name)) return;
    const key = normalize(name);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ rowIndex, cells, name });
  });
  return out;
}

function signatureOf(entries, parsed) {
  return entries
    .map(({ cells }) => [
      Number.isInteger(parsed.load) ? normalize(cells[parsed.load]) : '',
      normalize(cells[parsed.sets]),
      normalize(cells[parsed.reps]),
    ].join('|'))
    .sort()
    .join(' || ');
}

function noteOf(entries, parsed) {
  if (!Number.isInteger(parsed.notes)) return '';
  return entries.map(({ cells }) => normalize(cells[parsed.notes])).sort().join(' || ');
}

// Exposures whose build-week prescription never changes and whose notes never
// say what is advancing instead.
export function collectSupportingProgressionFlags(program, intake = {}) {
  const source = String(program || '');
  const weeks = new Map();
  for (const week of BUILD_WEEKS) {
    const parsed = parseWeek(source, week);
    if (!parsed) return [];
    weeks.set(week, { parsed, byName: rowsByName(parsed) });
  }

  const flags = [];
  const first = weeks.get(1);
  for (const [key, entries] of first.byName) {
    const present = BUILD_WEEKS.every((w) => weeks.get(w).byName.has(key));
    if (!present) continue;

    const signatures = BUILD_WEEKS.map((w) => {
      const { parsed, byName } = weeks.get(w);
      return signatureOf(byName.get(key), parsed);
    });
    if (new Set(signatures).size > 1) continue;

    const statesAdvance = BUILD_WEEKS.some((w) => {
      const { parsed, byName } = weeks.get(w);
      return byName.get(key).some(({ cells }) => Number.isInteger(parsed.notes)
        && STATES_WHAT_ADVANCES.test(String(cells[parsed.notes] || '')));
    });
    if (statesAdvance) continue;

    const notes = BUILD_WEEKS.map((w) => {
      const { parsed, byName } = weeks.get(w);
      return noteOf(byName.get(key), parsed);
    });

    flags.push({
      code: 'V97_SUPPORTING_PROGRESSION_UNSTATED',
      exercise: entries[0].name,
      identical_notes: new Set(notes).size === 1,
      detail: `${entries[0].name} carries the same load, sets and reps in Weeks 1, 2 and 3, and no week says what the athlete is meant to improve instead. Holding the prescription is often correct beside a heavy primary or on a return to training, but then the block must state the standard being beaten -- execution, control, symmetry or RPE at the same load. An unchanged prescription under an unchanged note reads as copy-paste.`,
    });
  }
  return flags;
}

// Notes-only repair. Writes the per-week standard onto every build-week row of a
// flagged exposure, leaving load, sets, reps, rest and RPE untouched.
export function normalizeSupportingProgressionStandard(program, intake = {}) {
  const original = String(program || '');
  const flagged = new Set(collectSupportingProgressionFlags(original, intake)
    .map((f) => normalize(f.exercise)));
  if (!flagged.size) return { program: original, repaired: false, repairs: [] };

  let candidate = original;
  const repairs = [];
  for (const week of BUILD_WEEKS) {
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const byName = rowsByName(parsed);
    let changed = false;
    for (const key of flagged) {
      const entries = byName.get(key);
      if (!entries) continue;
      for (const { cells, name } of entries) {
        const note = String(cells[parsed.notes] || '').trim();
        if (MARKER.test(note)) continue;
        const standard = buildStandard(week, name);
        cells[parsed.notes] = note ? `${note} ${standard}` : standard;
        changed = true;
        repairs.push({ type: 'supporting_progression_standard', week, exercise: name });
      }
    }
    if (!changed) continue;
    const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
    candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
