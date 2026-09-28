// engine/self_selected_load_protocol.js
//
// When an athlete has no benchmark for a variation, the engine deliberately
// refuses to invent a kilogram figure and writes "RPE-selected load" instead.
// That is the right call -- fabricating a leg-press weight for someone nine
// months past a disc herniation would be worse than saying nothing.
//
// But "RPE-selected load" on its own is a blank, not a prescription. The masters
// block shipped eight rows that way, and exactly one of them told her how to
// choose. The other seven left an athlete standing at a cable stack with no way
// to pick a weight, which is the question a paying client asks first.
//
// A self-selected load is legitimate; an unexplained one is not. The rule is
// therefore not "put a number here" but "say how to find the number", and the
// answer is derivable from the row itself: the target RPE already states how
// much should be left in the tank. Recording the chosen load in the Results
// column is what makes the next week repeatable.

import { parseWeek } from './v34_workload_accounting.js';
import { CATEGORY, classifyExercise } from './v38_movement_taxonomy.js';

function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }

// Loads that name no weight and no way to find one.
const UNSPECIFIED_LOAD = /^(?:\s*|n\/a|rpe[- ]?selected(?:\s+load)?|self[- ]?selected(?:\s+load)?|athlete[- ]?selected(?:\s+load)?|as\s+needed|to\s+be\s+selected|choose\s+load)$/i;

// A load with an actual anchor: kilograms, pounds, a percentage, a band, or
// bodyweight. None of these needs a selection protocol.
const ANCHORED_LOAD = /\d+(?:\.\d+)?\s*(?:kg|lb|%)|\bbodyweight\b|\bbw\b|\bband\b|\bempty bar\b|\bmin\b|\bm\b|\bsec\b/i;

// Movements whose dose is bodyweight and whose progression variable is reps,
// tempo, range or leverage rather than a weight to choose. Some of them CAN be
// loaded, but a row that left its load unspecified is not asking the athlete to
// add any, and "pick a weight you could stop 3 reps short with" is the wrong
// instruction for a push-up. Cable-resisted trunk work such as a Pallof Press is
// deliberately absent from this list: there the load is a real choice.
const BODYWEIGHT_BY_DEFAULT = /^(?:push[- ]?up|pull[- ]?up|chin[- ]?up|dip|plank|side plank|dead ?bug|bird ?dog|hollow (?:hold|body hold)|glute bridge|sit[- ]?up|crunch|(?:hanging )?(?:leg|knee) raise|mountain climber|burpee|air squat|bodyweight squat|ring row|inverted row|nordic(?: hamstring)? curl|pistol squat|scapular pull[- ]?up|superman)\b/i;

const HAS_PROTOCOL = /reps?\s+in\s+reserve|\bRIR\b|stop\s+\d+\s+reps?\s+short|leave\s+\d+(?:-\d+)?\s+reps?|(?:choose|select|pick)\s+a\s+(?:load|weight)|load selection:/i;

const MARKER = 'Load selection:';

function rirFrom(effort) {
  const nums = String(effort || '').match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const values = nums.map(Number).filter((n) => n >= 1 && n <= 10);
  if (!values.length) return null;
  const clamp = (n) => Math.max(1, Math.min(5, Math.round(10 - n)));
  const high = clamp(Math.min(...values));   // lower RPE leaves more in reserve
  const low = clamp(Math.max(...values));
  return low === high ? `${low}` : `${low}-${high}`;
}

function needsProtocol(cells, parsed) {
  const name = String(cells[parsed.exercise] || '').trim();
  if (!name || isWarmup(name)) return false;
  // An erg, run or ride is dosed by split, pace and duration. Asking it for a
  // load-selection protocol would be answering a question nobody asked.
  if (classifyExercise(name).category === CATEGORY.ENDURANCE) return false;
  if (BODYWEIGHT_BY_DEFAULT.test(name)) return false;
  if (!Number.isInteger(parsed.load) || !Number.isInteger(parsed.notes)) return false;
  const load = String(cells[parsed.load] || '').trim();
  if (ANCHORED_LOAD.test(load)) return false;
  if (!UNSPECIFIED_LOAD.test(load) && !/rpe[- ]?selected/i.test(load)) return false;
  if (HAS_PROTOCOL.test(String(cells[parsed.notes] || ''))) return false;
  return rirFrom(effortCell(cells, parsed)) !== null;
}

function effortCell(cells, parsed) {
  const index = parsed.header.findIndex((h) => /target rpe|effort|rpe/i.test(String(h || '')));
  return index >= 0 ? cells[index] : '';
}

export function collectSelfSelectedLoadFlags(program, intake = {}) {
  const source = String(program || '');
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(source, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      if (!needsProtocol(cells, parsed)) continue;
      flags.push({
        code: 'V100_SELF_SELECTED_LOAD_WITHOUT_PROTOCOL',
        week,
        exercise: String(cells[parsed.exercise] || '').trim(),
        detail: `Week ${week} ${String(cells[parsed.exercise] || '').trim()} leaves the load to the athlete without saying how to choose it. Self-selection is fine where no benchmark exists, but the row has to state the standard -- how much should be left in reserve, and where to record what was used -- or the athlete has no way to pick a weight or repeat it next week.`,
      });
    }
  }
  return flags;
}

export function normalizeSelfSelectedLoadProtocol(program, intake = {}) {
  const original = String(program || '');
  // The collector is the single source of truth for which rows need this. An
  // earlier draft re-derived the predicate here, which meant the detector and
  // the repair could disagree about the same row.
  const flags = collectSelfSelectedLoadFlags(original, intake);
  if (!flags.length) return { program: original, repaired: false, repairs: [] };

  const wanted = new Map();
  for (const flag of flags) {
    if (!wanted.has(flag.week)) wanted.set(flag.week, new Set());
    wanted.get(flag.week).add(flag.exercise.toLowerCase());
  }

  let candidate = original;
  const repairs = [];
  for (const [week, names] of wanted) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    let changed = false;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!names.has(name.toLowerCase())) continue;
      if (!needsProtocol(cells, parsed)) continue;
      const rir = rirFrom(effortCell(cells, parsed));
      if (!rir) continue;
      const note = String(cells[parsed.notes] || '').trim();
      const line = `${MARKER} pick a weight you could stop with about ${rir} clean rep${rir === '1' ? '' : 's'} still in reserve on the last set, write it in the Results column, and start from that number next week.`;
      cells[parsed.notes] = note ? `${note} ${line}` : line;
      changed = true;
      repairs.push({ type: 'self_selected_load_protocol', week, exercise: name });
    }
    if (!changed) continue;
    const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
    candidate = candidate.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
