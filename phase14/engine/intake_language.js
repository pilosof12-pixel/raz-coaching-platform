// The engine reads the athlete's own words. It only reads them in English.
//
// Run #144 delivered a Hebrew lifter a block containing no squat, no bench press
// and no deadlift, for an athlete whose two stated goals are a 140 kg squat and a
// 100 kg bench. It passed every gate on the first attempt. The same program with
// the same goals written in English is refused twice over --
// NAMED_GOAL_DIRECT_EXPOSURE_MISSING and PRIMARY_EXACT_MOVEMENT_MISSING -- because
// every rule that asks "does this program train what the client asked for" matches
// English words against the goal text, and "סקוואט 140 ק\"ג" matches none of them.
//
// So the most important gate in the engine was not failing for Hebrew athletes. It
// was not running.
//
// The fix is deliberately not a Hebrew-aware copy of each rule. There are 68
// modules reading intake free text and 43 of them test it with an English pattern;
// teaching each one Hebrew is a tax that gets forgotten exactly once, silently,
// which is how this survived. Instead the intake's free text is normalised once,
// here, before any rule sees it: the English term is APPENDED to the athlete's own
// words rather than replacing them, so nothing is lost, an English intake is
// untouched, and every existing rule starts working without knowing this file
// exists.
//
// Validation only. The model is still given the client's own words in their own
// language, and the program still comes back in it.

import { HEBREW_EXERCISE_MAP } from './exercise_dictionary.js';

const HEBREW = /[֐-׿]/;
export const hasHebrew = (v) => HEBREW.test(String(v || ''));

// Goal and benchmark vocabulary, which is not the same as exercise-name
// vocabulary: a goal says "סקוואט 140 ק"ג", not "סקוואט אחורי". The exercise map
// is merged in underneath for the names that do appear verbatim.
// Hebrew letters are not \w, so \b never matches beside one: every pattern here
// was written with \b first and silently matched nothing at all -- the same shape
// of failure as the bug this file exists to fix. Boundaries are expressed against
// the Hebrew block instead.
//
// Longest phrase first, so "מתח במשקל" is read as a weighted pull-up rather than
// being consumed by the "מתח" that sits inside it.
const HEB = '֐-׿';
// Hebrew glues its prepositions and article onto the front of a word -- "הכושר
// האירובי" is "כושר אירובי" with a ה on each -- so a left boundary rejects the
// very phrases we are looking for, and a space between words is not just a space.
// Prefixes are allowed on every word; the right boundary stays, so "מתח" does not
// match inside "מתחיל".
const PREFIX = '[\u05d5\u05d1\u05dc\u05de\u05e9\u05db\u05d4]?';
const term = (pattern) => new RegExp(
  `(?:${pattern.split('\\s+').join(`\\s+${PREFIX}`)})(?![${HEB}])`, 'g',
);
const GOAL_TERMS = [
  ['לחיצת\\s+עמידת\\s+ידיים', 'Handstand Push-up'],
  ['חתירה\\s+במכונה', 'rowing erg'],
  ['לחיצת\\s+כתפיים', 'Overhead Press'],
  ['כושר\\s+אירובי', 'aerobic fitness conditioning'],
  ['פלג\\s+גוף\\s+עליון', 'upper body'],
  ['פלג\\s+גוף\\s+תחתון', 'lower body'],
  ['מתח\\s+במשקל', 'Weighted Pull-up Pull-up'],
  ['ירידה\\s+במשקל', 'lose weight fat loss'],
  ['חצי\\s+מרתון', 'half-marathon running'],
  ['לחיצת\\s+חזה', 'Bench Press'],
  ['עמידת\\s+ידיים', 'Handstand'],
  ['שכיבות\\s+סמיכה', 'Push-up'],
  ['מסת\\s+שריר', 'muscle mass hypertrophy'],
  ['חזרה\\s+אחת', '1RM one rep max'],
  ['פרונט\\s+לבר', 'Front Lever'],
  ['גב\\s+תחתון', 'lower back'],
  ['מאסל[-\\s]?אפ', 'Muscle-up'],
  ['סקוואט', 'Squat Back Squat'],
  ['דדליפט', 'Deadlift'],
  ['מרתון', 'marathon running'],
  ['ספרינט', 'sprint running'],
  ['שחייה', 'swim swimming'],
  ['אופניים', 'bike cycling'],
  ['סיבולת', 'endurance'],
  ['פלאנץ', 'Planche'],
  ['חתירה', 'Row'],
  ['ריצה|ריצת', 'run running'],
  ['דיפ(?:ים)?', 'Dip'],
  ['מתח', 'Pull-up'],
  ['כוח', 'strength'],
  ['כתף', 'shoulder'],
  ['מרפק', 'elbow'],
  ['ברך', 'knee'],
  ['כאב', 'pain'],
  ['פציעה', 'injury'],
  ['חזרות', 'reps'],
  ['ק"?ג', 'kg'],
].map(([pattern, english]) => [term(pattern), english]);

// The exercise map keyed by name, longest first so "מתח במשקל" is not consumed by
// "מתח". Built once.
// Boundary-aware like the goal terms, and for the same reason: a plain substring
// test read "מתחיל" -- a beginner -- as a pull-up, because "מתח" sits inside it.
const NAME_TERMS = [...HEBREW_EXERCISE_MAP.entries()]
  .filter(([hebrew]) => hasHebrew(hebrew))
  .sort((a, b) => b[0].length - a[0].length)
  .map(([hebrew, english]) => [term(hebrew.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')), english]);

// The English a piece of Hebrew text is talking about, as a plain string of terms.
// Order matters only in that longer phrases are matched before their fragments.
export function englishTermsIn(value) {
  const text = String(value || '');
  if (!hasHebrew(text)) return '';
  const found = [];
  let remaining = text;
  // Goal vocabulary first. The exercise map is keyed on what a client types as an
  // exercise NAME, where a bare "סקוואט" is a bodyweight squat -- but in a goal
  // reading "סקוואט 140 ק\"ג" it is plainly a barbell squat, and letting the name
  // map claim the word first labelled a 140 kg goal "Bodyweight Squat".
  for (const [re, english] of GOAL_TERMS) {
    re.lastIndex = 0;
    if (re.test(remaining)) { found.push(english); remaining = remaining.replace(re, ' '); }
    re.lastIndex = 0;
  }
  for (const [re, english] of NAME_TERMS) {
    re.lastIndex = 0;
    if (re.test(remaining)) { found.push(english); remaining = remaining.replace(re, ' '); }
    re.lastIndex = 0;
  }
  // Deduplicated by phrase, not by word: splitting on spaces turned "Back Squat"
  // into "Squat Back" and any rule matching the movement name exactly stopped
  // seeing it.
  return [...new Set(found)].join(' ');
}

// Free-text fields the rules read. Structured fields are left alone.
const TEXT_FIELDS = [
  'primary_goals', 'secondary_goals', 'maintenance_goals', 'performance_markers',
  'current_numbers', 'notes', 'injuries', 'equipment', 'sport', 'recovery_rating',
];
const PAIN_FIELDS = ['description', 'character', 'severity', 'tolerated_movements', 'next_day_baseline'];

// Returns the value itself when nothing changed, so an English intake comes back
// as the very object that went in and callers can compare by identity.
const augment = (value) => {
  if (Array.isArray(value)) {
    const mapped = value.map(augment);
    return mapped.some((v, i) => v !== value[i]) ? mapped : value;
  }
  if (typeof value !== 'string') return value;
  const terms = englishTermsIn(value);
  return terms ? `${value} (${terms})` : value;
};

// A copy of the intake whose free text carries its English equivalent. The
// athlete's own words are kept: a rule that quotes the goal back still quotes what
// they wrote, and a rule that matches on English now matches.
export function withEnglishTerms(intake = {}) {
  if (!intake || typeof intake !== 'object') return intake;
  let touched = false;
  const out = { ...intake };
  for (const field of TEXT_FIELDS) {
    if (!(field in out)) continue;
    const next = augment(out[field]);
    if (next !== out[field]) { out[field] = next; touched = true; }
  }
  if (out.pain && typeof out.pain === 'object' && !Array.isArray(out.pain)) {
    const pain = { ...out.pain };
    let painTouched = false;
    for (const field of PAIN_FIELDS) {
      if (typeof pain[field] !== 'string') continue;
      const next = augment(pain[field]);
      if (next !== pain[field]) { pain[field] = next; painTouched = true; }
    }
    if (painTouched) { out.pain = pain; touched = true; }
  }
  // clarification_answers is a flat bag of free text the rules also read.
  if (out.clarification_answers && typeof out.clarification_answers === 'object') {
    const answers = { ...out.clarification_answers };
    let answersTouched = false;
    for (const key of Object.keys(answers)) {
      if (typeof answers[key] !== 'string') continue;
      const next = augment(answers[key]);
      if (next !== answers[key]) { answers[key] = next; answersTouched = true; }
    }
    if (answersTouched) { out.clarification_answers = answers; touched = true; }
  }
  return touched ? out : intake;
}
