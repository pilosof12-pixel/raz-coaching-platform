// A program that trains on more days than the intake's days_per_week has to
// say which reading governs, or the athlete reads "2 days" in her own intake and
// finds training on five.
//
// The coach's rule TRAINING_DAYS_VS_INTAKE charged the sprint triathlete's
// delivered block for exactly that: two gym sessions, seven sport sessions, and
// nothing in the narrative connecting the number she typed to the week she was
// given. The block was right; it just never said why the count differed.
//
// The sentence is true by construction or it is not written. It is added only
// when every week holds exactly days_per_week strength days on the days she
// named, and when the other days come from a sport schedule she supplied --
// otherwise "your two gym sessions" would itself be a claim the table
// contradicts, which is a worse defect than the one it fixes. It is English
// only: the engine does not write sentences into a program in a language it
// was not asked for.

import { trainingDaysVsIntake } from './coach_rules.js';
import { parseProgramModel, strengthDaysForWeek } from './program_model.js';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const LONG = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const key = (d) => String(d || '').trim().slice(0, 3).toLowerCase();

const join = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function sportPhrase(intake = {}) {
  const sport = String(intake.sport || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return sport ? `${sport.toLowerCase()} sessions` : 'sport sessions';
}

export function collectTrainingDaysReadingFlags(program, intake = {}) {
  try {
    return trainingDaysVsIntake(program, intake);
  } catch {
    return [];
  }
}

export function normalizeTrainingDaysReading(program, intake = {}) {
  const original = String(program || '');
  const unchanged = { program: original, repaired: false, repairs: [] };
  // The detector decides, so production exercises the rule the grader charges.
  if (!collectTrainingDaysReadingFlags(original, intake).length) return unchanged;

  const lang = String(intake.language || 'en').toLowerCase();
  if (lang && !lang.startsWith('en')) return unchanged;

  const stated = Number(intake.days_per_week);
  if (!Number.isInteger(stated) || stated < 1 || stated > 7) return unchanged;
  const schedule = Array.isArray(intake.sport_schedule) ? intake.sport_schedule : [];
  if (!schedule.length) return unchanged;

  const named = (Array.isArray(intake.available_gym_days) ? intake.available_gym_days : []).map(key).filter((d) => LONG[d]);

  let model;
  try { model = parseProgramModel(original, intake); } catch { return unchanged; }
  const weeks = (model?.weeks || []).map((w) => w.week);
  if (!weeks.length) return unchanged;
  for (const w of weeks) {
    const days = (strengthDaysForWeek(model, w) || []).map((d) => key(d.day));
    if (days.length !== stated) return unchanged;
    if (named.length && days.some((d) => !named.includes(d))) return unchanged;
  }

  const count = WORDS[stated] || String(stated);
  const when = named.length ? ` are on ${join(named.map((d) => LONG[d]))}` : '';
  const sentence = `Your ${count} gym sessions${when}; every other day in this block is one of your ${sportPhrase(intake)}, taken from the schedule you gave, so the week covers more days than ${count} without adding gym work.`;

  const at = original.search(/START_WEEK1_TSV/i);
  if (at < 0) return unchanged;
  const head = original.slice(0, at).replace(/\s+$/, '');
  const rebuilt = `${head ? `${head}\n\n` : ''}${sentence}\n\n${original.slice(at)}`;
  if (collectTrainingDaysReadingFlags(rebuilt, intake).length) return unchanged; // the sentence must actually resolve it
  return { program: rebuilt, repaired: true, repairs: [{ action: 'state_training_days_reading', sentence }] };
}
