// engine/program_statement_repair.js
//
// Two findings that are not about training at all. The block made a decision
// the athlete could not see, and the fix is to say it out loud.
//
// Both rules name the sentence that resolves them, which is unusual and worth
// using: neither repair here invents a judgement, it writes down one the
// program already made. "3 formal strength sessions spread across 5 calendar
// days may be exactly right; the athlete cannot tell that from what they were
// sent."

import { rows, trainingDaysVsIntake, sportScheduleChangedSilently } from './coach_rules.js';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const START = /START_WEEK1_TSV/i;

// Put a sentence at the end of the block's opening prose, where a coach would
// put it, rather than at the very top where it reads like a disclaimer.
function addToSummary(program, sentence) {
  const src = String(program || '');
  const at = src.search(START);
  if (at < 0) return src;
  const head = src.slice(0, at).replace(/\s+$/, '');
  if (!head) return src;
  return `${head}\n\n${sentence}\n\n${src.slice(at)}`;
}

// --- 1. which reading of days_per_week governs -------------------------------

export function repairTrainingDaysStatement(program, intake = {}) {
  const findings = trainingDaysVsIntake(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, stated: null };

  const stated = Number(intake.days_per_week);
  const byWeek = new Map();
  for (const r of rows(program)) {
    if (!r.day) continue;
    if (!byWeek.has(r.week)) byWeek.set(r.week, new Set());
    byWeek.get(r.week).add(r.day);
  }
  const calendar = Math.max(...[...byWeek.values()].map((s) => s.size), 0);
  if (!Number.isFinite(stated) || !calendar) return { program: String(program || ''), changed: false, stated: null };

  const n = WORDS[stated] || String(stated);
  const sentence = `You asked for ${n} sessions a week, and that is what this is: ${n} formal strength sessions. `
    + `They sit across ${WORDS[calendar] || calendar} calendar days because the easy running and the mobility work are not sessions in that sense -- `
    + `they are the low-cost work around them, and they are not what you count when you count your week.`;
  return { program: addToSummary(program, sentence), changed: true, stated };
}

// --- 2. a sport week the block quietly rewrote --------------------------------

export function repairSportScheduleStatement(program, intake = {}) {
  const findings = sportScheduleChangedSilently(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, days: null };

  const days = (String(findings[0].detail).match(/reduces ([a-z, ]+) from the intake/i) || [])[1];
  if (!days) return { program: String(program || ''), changed: false, days: null };
  // Full names, not the three-letter forms the finding reports. The rule's own
  // fallback test looks for "if friday remains", so a sentence saying "If Fri
  // remains" satisfies a human and not the check -- which is the same thing as
  // not satisfying anyone.
  const FULL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const list = days.split(',').map((d) => d.trim()).filter(Boolean);
  const pretty = list.map((d) => FULL[d.slice(0, 3).toLowerCase()] || (d.charAt(0).toUpperCase() + d.slice(1)));
  const first = pretty[0];

  // The rule asks for two things and neither is a training decision: own the
  // change as a recommendation, and say what happens if it is refused.
  const sentence = `One thing to agree with your coach before this starts. This block assumes ${pretty.join(' and ')} `
    + `${pretty.length > 1 ? 'become' : 'becomes'} lighter mat work than your usual hard session, and that is a recommendation, not something the program can decide for you. `
    + `Ask your coach whether that is possible. If ${first} remains a hard session, keep it hard and drop the gym work that day to the warm-up and one easy set of the main lift, `
    + `so the week still fits rather than stacking two hard efforts on top of each other.`;
  return { program: addToSummary(program, sentence), changed: true, days: list };
}

export const STATEMENT_REPAIRS = [repairTrainingDaysStatement, repairSportScheduleStatement];
