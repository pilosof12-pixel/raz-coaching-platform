// Language accuracy: what the prose claims must match what the program is.
//
// The coach's example: a program telling a Tactical athlete they have "three
// structured sessions" and then prescribing five. Nobody mis-programmed
// anything -- the training was fine and the sentence was wrong -- but the
// athlete reads the sentence, and a plan that miscounts itself does not read
// like it was written by someone paying attention.
//
// These are counting and proofreading checks, deliberately narrow. Every rule
// compares a number the prose states against a number the structure can be
// asked for, or flags a textual defect no editor would leave in. Nothing here
// judges coaching.

import { parseWeek } from './v34_workload_accounting.js';
import { classifyExercise, CATEGORY } from './v38_movement_taxonomy.js';
import { goalTierFor } from './v52_session_hierarchy.js';

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

function numberFrom(token) {
  const word = NUMBER_WORDS[String(token || '').toLowerCase()];
  if (Number.isFinite(word)) return word;
  const n = Number(String(token || '').trim());
  return Number.isFinite(n) ? n : null;
}
const NUM = `(${Object.keys(NUMBER_WORDS).join('|')}|\\d{1,2})`;
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function narrative(program) { return String(program || '').split(/START_WEEK1_TSV/i)[0]; }

// What the program actually contains, per week, for the things prose counts.
export function structureCounts(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const days = new Map();
  for (const cells of parsed.rows) {
    const day = String(cells[parsed.day] || '').trim();
    const name = String(cells[parsed.exercise] || '').trim();
    if (!day || !name || isWarmup(name)) continue;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(classifyExercise(name).category);
  }
  const isConditioning = (c) => c === CATEGORY.ENDURANCE || c === CATEGORY.LOADED_CARRY;
  let strengthDays = 0;
  let conditioningDays = 0;
  for (const cats of days.values()) {
    if (cats.some((c) => !isConditioning(c))) strengthDays += 1;
    if (cats.some(isConditioning)) conditioningDays += 1;
  }
  return { calendarDays: days.size, strengthDays, conditioningDays, dayLabels: [...days.keys()] };
}

// Claims of the form "<number> <qualifier> sessions/days". The qualifier decides
// which count the claim is about, so "three strength sessions" is checked
// against strength days and "five calendar days" against every training day.
const COUNT_CLAIMS = [
  { re: new RegExp(`\\b${NUM}\\s+(?:real\\s+|true\\s+|dedicated\\s+)?(?:strength|lifting|gym|resistance)\\s+(?:sessions?|days?)\\b`, 'i'), field: 'strengthDays', label: 'strength sessions' },
  { re: new RegExp(`\\b${NUM}\\s+(?:calendar|training|separate|distinct)\\s+days?\\b`, 'i'), field: 'calendarDays', label: 'training days' },
  { re: new RegExp(`\\b${NUM}\\s+(?:structured|scheduled|weekly|planned)\\s+(?:sessions?|days?)\\b`, 'i'), field: 'calendarDays', label: 'structured sessions' },
  { re: new RegExp(`\\b${NUM}\\s+(?:running|run|conditioning|cardio)\\s+(?:sessions?|days?)\\b`, 'i'), field: 'conditioningDays', label: 'conditioning sessions' },
];

export function collectCountClaimFlags(program, intake = {}) {
  const head = narrative(program);
  if (!head.trim()) return [];
  const counts = structureCounts(program, 1);
  if (!counts) return [];

  const flags = [];
  for (const claim of COUNT_CLAIMS) {
    const m = head.match(claim.re);
    if (!m) continue;
    const stated = numberFrom(m[1]);
    const actual = counts[claim.field];
    if (!Number.isFinite(stated) || !Number.isFinite(actual) || stated === actual) continue;
    flags.push({
      code: 'V46_COUNT_CLAIM_MISMATCH',
      claim: m[0].trim(),
      stated,
      actual,
      field: claim.field,
      message: `The summary says "${m[0].trim()}", but Week 1 prescribes ${actual} ${claim.label}. State the number the program actually contains.`,
    });
  }
  return flags;
}

// Proofreading defects an editor would not leave in a document a client pays for.
const TEXT_DEFECTS = [
  { code: 'doubled_word', re: /\b(\w{3,})\s+\1\b/i, describe: (m) => `the word "${m[1]}" is repeated` },
  { code: 'space_before_punctuation', re: /\s+[,.;:!?](?:\s|$)/, describe: () => 'a space sits before a punctuation mark' },
  { code: 'unclosed_bracket', re: /\([^)]*$/, describe: () => 'an opening bracket is never closed' },
  { code: 'placeholder', re: /\b(?:TBD|TODO|FIXME|XXX|lorem ipsum|\[insert[^\]]*\])/i, describe: (m) => `placeholder text "${m[0]}" was left in` },
  { code: 'markdown_artifact', re: /(?:\*\*|__|`{1,3}|^#{1,6}\s)/m, describe: () => 'raw markdown formatting is showing' },
  { code: 'double_space', re: /\S {2,}\S/, describe: () => 'a double space appears mid-sentence' },
];

export function collectTextDefectFlags(program) {
  const head = narrative(program);
  if (!head.trim()) return [];
  const flags = [];
  for (const defect of TEXT_DEFECTS) {
    const m = head.match(defect.re);
    if (!m) continue;
    const at = Math.max(0, m.index - 30);
    flags.push({
      code: 'V46_TEXT_DEFECT',
      defect: defect.code,
      excerpt: head.slice(at, at + 90).replace(/\s+/g, ' ').trim(),
      message: `Client-facing summary: ${defect.describe(m)} ("...${head.slice(at, at + 70).replace(/\s+/g, ' ').trim()}...").`,
    });
  }
  return flags;
}

// --- what the athlete asked for vs what the program schedules ----------------

// A coach reading a live program counted five training days against an intake
// asking for four. Nothing objected: the count rule above compares prose against
// structure, and no sentence had made a claim. The athlete's own stated
// frequency is a claim too, and a louder one.
export function collectScheduleFrequencyFlags(program, intake = {}) {
  const stated = Number(intake?.days_per_week || intake?.training_days_per_week || 0);
  if (!Number.isFinite(stated) || stated <= 0) return [];
  const counts = structureCounts(program, 1);
  if (!counts) return [];
  if (counts.calendarDays <= stated) return [];

  // An athlete who has said they can spread work across more days has already
  // answered this. Tactical states exactly that, and flagging it would be
  // contradicting the intake rather than checking it.
  const sanctioned = /\b(?:can train|able to train|comfortable|happy to)\b[^.]{0,60}\b(?:across|over|on)\s+(?:up to\s+)?(\w+)\s+(?:calendar\s+)?days\b/i
    .exec(`${txt(intake.notes)} ${txt(intake.clarification_answers)}`);
  if (sanctioned) {
    const word = String(sanctioned[1]).toLowerCase();
    const allowed = NUMBER_WORDS[word] ?? Number(word);
    if (Number.isFinite(allowed) && counts.calendarDays <= allowed) return [];
  }

  return [{
    code: 'V46_SCHEDULE_EXCEEDS_STATED_FREQUENCY',
    stated,
    actual: counts.calendarDays,
    days: counts.dayLabels,
    message: `The athlete asked for ${stated} training days a week and Week 1 schedules ${counts.calendarDays} (${counts.dayLabels.join(', ')}). Fit the plan into the frequency they agreed to, or say plainly on which day the extra work sits and why it is not a session.`,
  }];
}

// --- an optional qualifier must name what is optional ------------------------

// The same review read "earned, optional" on the primary One-Arm Pull-up row as
// marking the primary work optional. It did not -- the qualifier attaches to one
// extra single, and the prescribed sets are not in question -- but a client
// skimming their own program can make exactly that mistake, and on a primary
// exposure the cost of being misread is high.
// "Earned" is not in this list. A note saying "keep the earned standard" means
// achieved, not discretionary, and flagging it called good coaching language a
// defect. Only words that actually make work skippable belong here.
const OPTIONAL_QUALIFIER = /\b(?:optional|if you feel like it|only if you want|skip (?:it )?if you prefer|entirely up to you)\b/i;
const NAMES_AN_ADDITION = /\b(?:add|extra|additional|one more|another|bonus|top-?up)\b/i;

export function collectOptionalQualifierFlags(program, intake = {}, isPrimary = () => false) {
  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name) || !isPrimary(name)) continue;
      const note = String(cells[parsed.notes] || '');
      const m = note.match(OPTIONAL_QUALIFIER);
      if (!m) continue;
      // The qualifier must sit close to the addition it describes.
      const window = note.slice(Math.max(0, m.index - 90), m.index + 40);
      if (NAMES_AN_ADDITION.test(window)) continue;
      flags.push({
        code: 'V46_OPTIONAL_QUALIFIER_ON_PRIMARY',
        week,
        exercise: name,
        qualifier: m[0],
        message: `${name} (Week ${week}) is primary-goal work and its note says "${m[0]}" without naming what is optional. State the addition the qualifier applies to, so the prescribed work cannot be read as discretionary.`,
      });
    }
  }
  return flags;
}

export function collectLanguageAccuracyFlags(program, intake = {}) {
  return [
    ...collectCountClaimFlags(program, intake),
    ...collectTextDefectFlags(program),
    ...collectScheduleFrequencyFlags(program, intake),
    ...collectOptionalQualifierFlags(program, intake, (name) => goalTierFor(name, intake) === 'primary'),
  ];
}

// A miscounted sentence is an objective error with a mechanical correction, so
// it blocks release; the repair below fixes it without regeneration. Textual
// defects are reported rather than enforced -- rewriting a client's prose on a
// regex match risks doing more damage than the typo.
export const LANGUAGE_HARD_CODES = new Set(['V46_COUNT_CLAIM_MISMATCH']);

const WORD_FOR = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

// Restate the number to the one the program actually contains, keeping the
// claim's own wording and its numeral-or-word style.
export function repairCountClaims(program, intake = {}) {
  const head = narrative(program);
  if (!head.trim()) return { program, repaired: false, repairs: [] };
  const counts = structureCounts(program, 1);
  if (!counts) return { program, repaired: false, repairs: [] };

  let out = head;
  const repairs = [];
  for (const claim of COUNT_CLAIMS) {
    const m = out.match(claim.re);
    if (!m) continue;
    const stated = numberFrom(m[1]);
    const actual = counts[claim.field];
    if (!Number.isFinite(stated) || !Number.isFinite(actual) || stated === actual) continue;
    const spelled = /^\d+$/.test(m[1]) ? String(actual) : (WORD_FOR[actual] ?? String(actual));
    const corrected = m[0].replace(m[1], spelled);
    out = out.slice(0, m.index) + corrected + out.slice(m.index + m[0].length);
    repairs.push({ type: 'v46_count_restated', from: m[0].trim(), to: corrected.trim() });
  }
  if (!repairs.length) return { program, repaired: false, repairs };
  return { program: out + String(program).slice(head.length), repaired: true, repairs };
}

export function buildLanguageAccuracyBrief(intake = {}) {
  return [
    'LANGUAGE ACCURACY: every number the summary states must match the program below it.',
    'If you say the athlete has three strength sessions, prescribe three. If you say five calendar days, use five. Count before you write the sentence.',
    'The summary is client-facing prose: no placeholder text, no raw markdown, no repeated words, no stray double spaces.',
    'Schedule the plan into the training frequency the athlete asked for. If a day carries something you do not consider a session, say so on that day rather than leaving them to count.',
    'On primary-goal work, never leave "optional" or "earned" standing without naming what is optional. The prescribed sets are not discretionary; only a stated addition is.',
  ].join('\n');
}
