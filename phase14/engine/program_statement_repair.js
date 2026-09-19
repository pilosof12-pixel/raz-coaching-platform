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

import { borrowedSportLanguage } from './coach_race_block_rules.js';
import { rows, trainingDaysVsIntake, sportScheduleChangedSilently, unsupportedAthleteFact, contingencyCreatesAdjacentDuplicate, promisedMovementAbsent } from './coach_rules.js';

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

export const STATEMENT_REPAIRS = [
  repairTrainingDaysStatement, repairSportScheduleStatement,
  repairUnsupportedFact, repairContingencyDuplicate,
  repairBorrowedLanguage, repairBrokenPromise,
];

// --- 3. a fact about the athlete that the intake does not contain -------------
//
// "...accessory work stays lean while you manage the routine 4 kg cut." There
// is no weight cut anywhere in this athlete's intake. The coach charged 0.20
// for it, and the objection is not that cutting weight is bad advice -- it is
// that the program asserted something about this person that nobody told it,
// and a client reading their own program cannot tell invention from record.
//
// The repair removes the claim rather than rewriting it. There is nothing to
// put in its place: the fact is not known.

export function repairUnsupportedFact(program, intake = {}) {
  const findings = unsupportedAthleteFact(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, removed: [] };

  let out = String(program || '');
  const removed = [];
  for (const f of findings) {
    const claim = (String(f.detail).match(/states "([^"]+)"/) || [])[1];
    if (!claim) continue;
    // Work inside the sentence the claim sits in, and cut from the connective
    // NEAREST the claim. A regex that took the first connective in the sentence
    // matched "with a meaningful but controlled dose, back squat and pulling
    // strength stay on maintenance, and accessory work stays lean while you
    // manage the routine 4 kg cut" and removed the lot -- three true statements
    // deleted to remove one invented one.
    // Prose only, and never inside a table.
    //
    // The first version searched the whole program. The same phrase appears in
    // a note cell, so the sentence boundaries it found spanned the TSV blocks
    // and the "sentence" it deleted took all twenty-six rows of every week with
    // it. A text repair that can reach the tables is not a text repair.
    const tablesAt = out.search(START);
    const limit = tablesAt < 0 ? out.length : tablesAt;
    const at = out.indexOf(claim);
    if (at < 0 || at >= limit) continue;
    let start = out.lastIndexOf('.', at);
    start = start < 0 ? 0 : start + 1;
    let end = out.indexOf('.', at + claim.length);
    end = end < 0 || end > limit ? limit : end + 1;
    const sentence = out.slice(start, end);

    const CONNECTIVE = /\b(?:while|as|given|during|with|since|now that)\b/gi;
    const claimAt = sentence.indexOf(claim);
    let cutFrom = -1;
    for (const m of sentence.matchAll(CONNECTIVE)) {
      if (m.index < claimAt) cutFrom = m.index;
    }

    let rebuilt;
    if (cutFrom >= 0) {
      const head = sentence.slice(0, cutFrom).replace(/[\s,;]+$/, '');
      rebuilt = `${head}.`;
    } else {
      // No clause to peel: the claim is the sentence, so the sentence goes.
      rebuilt = '';
    }
    out = out.slice(0, start) + rebuilt + out.slice(end);
    removed.push(claim);
  }
  // Tidy the prose only. Running this over the whole program collapsed the
  // whitespace inside TSV cells, which changed the tables and tripped the guard
  // below -- so the repair reverted itself and reported no change on a program
  // it had correctly fixed. The guard was right; the cleanup was too wide.
  const cut = out.search(START);
  if (cut > 0) {
    out = out.slice(0, cut).replace(/\s+([.,;])/g, '$1').replace(/[ \t]{2,}/g, ' ') + out.slice(cut);
  }
  // Belt and braces: if anything below the first table moved, this repair did
  // something it is not allowed to do, so none of it ships.
  const tail = (t) => { const i = t.search(START); return i < 0 ? '' : t.slice(i); };
  if (tail(out) !== tail(String(program || ''))) {
    return { program: String(program || ''), changed: false, removed: [] };
  }
  return { program: out, changed: removed.length > 0, removed };
}

// --- 4. a contingency that puts the same lift on two days in a row ------------
//
// "A contingency swaps Front Squat on Monday for Back Squat, which is already
// prescribed on Tuesday. Taking the substitution puts Back Squat on two
// consecutive days, which was not the plan the athlete was given."
//
// The substitution is reasonable and so is the plan; what is missing is the one
// line saying they cannot both be taken. Naming a different exercise here would
// be choosing the athlete's training for them, so the repair states the
// condition instead, which is what the block was missing rather than what it
// got wrong.

export function repairContingencyDuplicate(program, intake = {}) {
  const findings = contingencyCreatesAdjacentDuplicate(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, notes: [] };

  const notes = [];
  let out = String(program || '');
  for (const f of findings) {
    const lift = (String(f.detail).match(/for ([A-Z][A-Za-z -]+?), which is already/) || [])[1];
    if (!lift || notes.includes(lift)) continue;
    notes.push(lift);
  }
  if (!notes.length) return { program: out, changed: false, notes: [] };

  const sentence = `One note on the substitutions: if taking one would put ${notes.join(' or ')} on two days in a row, do not take it. `
    + `Keep the day as written and drop the load instead -- the point of the swap is to protect the week, and two heavy days back to back is the thing it was protecting you from.`;
  out = addToSummary(out, sentence);
  return { program: out, changed: true, notes };
}

// --- 5. coaching language carried over from another athlete -------------------
//
// "Horizontal power for level changes and takedown entries" in a Hyrox block.
// He charged 0.10, and his reading was exactly right: the justification was
// inherited from a combat athlete rather than written for this event. The fix
// is to say why the movement is there for THIS race, which the row already
// knows -- it is a broad jump in a block whose event contains a burpee broad
// jump.

const BORROWED_CLAUSE = /\b(?:for|to (?:help|support|train))?\s*(?:level changes?|takedown entries|takedowns?|clinch work|shot entries)\b[^.]*\./i;

export function repairBorrowedLanguage(program, intake = {}) {
  const findings = borrowedSportLanguage(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, rewritten: [] };

  const sport = String(intake.sport || 'this event').trim();
  let out = String(program || '');
  const rewritten = [];
  for (const f of findings) {
    const phrase = (String(f.detail).match(/^"([^"]+)"/) || [])[1];
    if (!phrase) continue;
    // Replace the sentence the borrowed phrase sits in, not the whole note: the
    // rest of the row is real coaching about how to perform the movement.
    const re = new RegExp(`[^.\\t]*\\b${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b[^.\\t]*\\.`, 'i');
    if (!re.test(out)) continue;
    out = out.replace(re, `Horizontal power for ${sport}.`);
    rewritten.push(phrase);
  }
  return { program: out, changed: rewritten.length > 0, rewritten };
}

// --- 6. a progression the block promised and never made ----------------------
//
// "Week 2 adds one acceleration rep if Week 1 stayed crisp" -- and no exercise
// in any week is an acceleration. The athlete is told about a progression in
// something they were never given.
//
// Two ways to resolve it and only one is honest here. Adding acceleration work
// to a footballer playing five times a week and a match is a fatigue decision.
// Removing a promise the block cannot keep is not: the sentence was describing
// training that does not exist.

export function repairBrokenPromise(program, intake = {}) {
  const findings = promisedMovementAbsent(program, intake);
  if (!findings.length) return { program: String(program || ''), changed: false, removed: [] };

  let out = String(program || '');
  const removed = [];
  const tablesAt = out.search(START);
  const limit = tablesAt < 0 ? out.length : tablesAt;
  for (const f of findings) {
    const quoted = (String(f.detail).match(/--\s*"([^"]+)"/) || [])[1];
    if (!quoted) continue;
    const at = out.indexOf(quoted.slice(0, 60));
    if (at < 0 || at >= limit) continue;
    let start = out.lastIndexOf('.', at);
    start = start < 0 ? 0 : start + 1;
    let end = out.indexOf('.', at + Math.min(quoted.length, 60));
    end = end < 0 || end > limit ? limit : end + 1;
    out = out.slice(0, start) + out.slice(end);
    removed.push(quoted.slice(0, 60));
  }
  const cut = out.search(START);
  if (cut > 0) out = out.slice(0, cut).replace(/\s+([.,;])/g, '$1').replace(/[ \t]{2,}/g, ' ') + out.slice(cut);
  const tail = (t) => { const i = t.search(START); return i < 0 ? '' : t.slice(i); };
  if (tail(out) !== tail(String(program || ''))) return { program: String(program || ''), changed: false, removed: [] };
  return { program: out, changed: removed.length > 0, removed };
}
