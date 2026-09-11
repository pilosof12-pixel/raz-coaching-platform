// engine/v92_prescription_integrity.js
//
// Say what actually decides the weight.
//
// The fight camp prescribed "RPE-selected load" and then told the athlete the
// set was "about 86% of your +35 kg x 3 benchmark". Those are two different
// instructions wearing one row. If RPE selects the load then the percentage did
// not, and printing it implies a precision the prescription does not have --
// the coach called it false precision, and it is: the number looks like it was
// computed when nothing about the set was.
//
// The rule the coach gave for fixing it: RPE is always the real determinant,
// and the weight reference is a starting point -- last week's load, adjusted a
// little. If the athlete hits the target RPE under the reference weight, the
// lighter weight is correct and the reference was only ever a place to begin.
// So a row may carry a load reference or an RPE target or both, as long as it
// says which one wins.
//
// Two more things that do not belong near an event, both named in the same
// review: a movement the athlete has never done before, and a week that never
// says when to stop.

import { parseWeek } from './v34_workload_accounting.js';
import { STATE, stateForWeek, competitionProfile, eventNoun } from './v68_competition_state.js';

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }

// A load cell that names no weight: the RPE is doing the choosing.
const RPE_SELECTED = /^\s*(?:rpe[- ]selected|autoregulated|by feel|athlete[- ]selected)/i;
// A claim that the set sits at a computed fraction of a known best.
const PERCENT_CLAIM = /\b(?:about|approx(?:imately)?|roughly|~)?\s*\d{1,3}\s*%\s*of\b/i;
// Language that already subordinates the number to how the set feels.
const RPE_GOVERNS = /\b(?:rpe (?:is|decides|governs|wins|rules)|let rpe|rpe over (?:the )?(?:number|weight|load)|whichever is lighter|if that feels heavier|back off if|go lighter if)\b/i;
// An explicit instruction to stop or cut.
const STOP_RULE = /\b(?:stop (?:the (?:set|session|day)|there|early|immediately|if)|cut (?:the )?(?:volume|session|set)|shut it down|end the session|drop the (?:set|session)|skip the rest|leave it)\b/i;

function eventWeekOf(intake, now) {
  if (!competitionProfile(intake, now)) return 0;
  for (let week = 1; week <= 4; week += 1) {
    if (stateForWeek(intake, week, now) === STATE.COMPETITION_WEEK) return week;
  }
  return 0;
}

function rowsOf(program, week) {
  const parsed = parseWeek(program, week);
  if (!parsed) return null;
  const rows = [];
  parsed.rows.forEach((cells, index) => {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) return;
    rows.push({
      index,
      name,
      load: String(cells[parsed.load] || ''),
      note: Number.isInteger(parsed.notes) ? String(cells[parsed.notes] || '') : '',
    });
  });
  return { parsed, rows };
}

// Movements the athlete has actually performed earlier in the block.
function seenBefore(program, week) {
  const seen = new Set();
  for (let w = 1; w < week; w += 1) {
    const data = rowsOf(program, w);
    if (!data) continue;
    data.rows.forEach((r) => seen.add(r.name.toLowerCase()));
  }
  return seen;
}

export function collectPrescriptionIntegrityFlags(program, intake = {}, now = Date.now()) {
  const flags = [];
  const noun = eventNoun(intake).toLowerCase();

  // 1. False precision, anywhere in the block: a computed-looking percentage on
  //    a row whose weight is chosen by feel.
  for (let week = 1; week <= 4; week += 1) {
    const data = rowsOf(program, week);
    if (!data) continue;
    data.rows.forEach((r) => {
      if (!RPE_SELECTED.test(r.load)) return;
      if (!PERCENT_CLAIM.test(r.note)) return;
      if (RPE_GOVERNS.test(r.note)) return;
      flags.push({
        code: 'V92_FALSE_PRECISION_LOAD',
        week,
        exercise: r.name,
        detail: `Week ${week} ${r.name} is prescribed as "${r.load.trim()}" and the note still states a percentage of a benchmark. `
          + `If RPE selects the weight then the percentage did not, and printing it claims a precision the set does not have. `
          + `Give the reference as a starting point -- last week's load, adjusted a little -- and say plainly that RPE decides: if the target RPE arrives under the reference weight, the lighter weight is right.`,
      });
    });
  }

  const week = eventWeekOf(intake, now);
  if (!week) return flags;
  const data = rowsOf(program, week);
  if (!data) return flags;

  // 2. Nothing new this close to the event.
  const known = seenBefore(program, week);
  if (known.size) {
    const novel = data.rows.filter((r) => !known.has(r.name.toLowerCase()));
    if (novel.length) {
      flags.push({
        code: 'V92_NOVEL_EXERCISE_NEAR_EVENT',
        week,
        detail: `${eventNoun(intake)} introduces ${[...new Set(novel.map((r) => r.name))].join(', ')}, which the athlete has not done earlier in this block. `
          + `A movement, a range of motion or an eccentric the body has not met produces soreness on an unknown timeline, and there is no time left to find out. `
          + `Nothing new in the last seven to ten days.`,
      });
    }
  }

  // 3. A week that never says when to stop.
  const saysStop = data.rows.some((r) => STOP_RULE.test(r.note));
  if (!saysStop && data.rows.length) {
    flags.push({
      code: 'V92_NO_FATIGUE_STOP_RULE',
      week,
      detail: `No session in ${noun} says when to stop. Bar speed dropping, soreness climbing, a cut going badly or a night of poor sleep all mean the same thing this week -- cut the volume immediately -- and the program has to say so rather than leaving the athlete to decide mid-session.`,
    });
  }
  return flags;
}

// --- repair -----------------------------------------------------------------

const GOVERNS_SENTENCE = 'Start from last week\'s load and adjust it slightly; RPE decides. If the target RPE arrives under that weight, the lighter weight is the right one.';
const STOP_SENTENCE = 'Stop the session early if bar speed drops, soreness is climbing, the cut is going badly or sleep was poor.';

export function repairPrescriptionIntegrity(program, intake = {}, now = Date.now()) {
  let out = String(program || '');

  // A percentage that did not choose the weight is removed, and replaced with
  // the thing that did. The row keeps its reference, but as a place to begin.
  for (let week = 1; week <= 4; week += 1) {
    const data = rowsOf(out, week);
    if (!data) continue;
    const { parsed } = data;
    if (!Number.isInteger(parsed.notes)) continue;
    const rows = parsed.rows.map((c) => c.slice());
    let changed = false;
    data.rows.forEach((r) => {
      if (!RPE_SELECTED.test(r.load) || !PERCENT_CLAIM.test(r.note) || RPE_GOVERNS.test(r.note)) return;
      const stripped = r.note
        .replace(/\b(?:about|approx(?:imately)?|roughly|~)?\s*\d{1,3}\s*%\s*of\s+(?:your\s+)?[^.;]*[.;]?\s*/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      rows[r.index][parsed.notes] = stripped ? `${stripped} ${GOVERNS_SENTENCE}` : GOVERNS_SENTENCE;
      changed = true;
    });
    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }

  const week = eventWeekOf(intake, now);
  if (!week) return out;
  const data = rowsOf(out, week);
  if (!data) return out;
  const { parsed } = data;
  const rows = parsed.rows.map((c) => c.slice());
  let changed = false;

  // A movement the block never taught is dropped rather than rewritten: there
  // is nothing to rewrite it into that the athlete has done, and a session is
  // never emptied to satisfy this.
  const known = seenBefore(out, week);
  const dropped = new Set();
  if (known.size) {
    const survivors = data.rows.filter((r) => known.has(r.name.toLowerCase())).length;
    let remaining = survivors;
    data.rows.forEach((r) => {
      if (known.has(r.name.toLowerCase())) return;
      if (remaining < 1) return;
      dropped.add(r.index);
      changed = true;
    });
    if (!survivors) dropped.clear();
  }

  if (Number.isInteger(parsed.notes)) {
    const kept = data.rows.filter((r) => !dropped.has(r.index));
    if (kept.length && !kept.some((r) => STOP_RULE.test(String(rows[r.index][parsed.notes] || '')))) {
      const at = kept[0].index;
      const cur = String(rows[at][parsed.notes] || '').trim();
      rows[at][parsed.notes] = cur ? `${cur} ${STOP_SENTENCE}` : STOP_SENTENCE;
      changed = true;
    }
  }

  if (!changed) return out;
  const keptRows = rows.filter((_, i) => !dropped.has(i));
  const rebuilt = [parsed.header.join('\t'), ...keptRows.map((c) => c.join('\t'))].join('\n');
  return out.replace(parsed.re, `$1${rebuilt}$3`);
}

export function buildPrescriptionIntegrityBrief(intake = {}, now = Date.now()) {
  const week = eventWeekOf(intake, now);
  const lines = [
    '* SAY WHAT DECIDES THE WEIGHT, AND DO NOT IMPLY A PRECISION THE SET DOES NOT HAVE.',
    '  RPE is the real determinant. Give a load reference as a starting point -- last week\'s load, adjusted slightly -- and say so: if the target RPE arrives under that weight, the lighter weight is correct.',
    '  Do not write "about 86% of your +35 kg x 3" on a row whose weight is chosen by feel. Either prescribe the kilos and mean them, or give the reference as a starting point and let RPE govern. Never both as if each decided.',
  ];
  if (week) {
    lines.push(
      `* ${eventNoun(intake).toUpperCase()} INTRODUCES NOTHING NEW.`,
      '  No new exercise, no new range of motion, no novel eccentric in the last seven to ten days. Soreness from an unfamiliar movement arrives on a timeline nobody can predict, and there is no time left to find out.',
      '  SAY WHEN TO STOP. Bar speed dropping, soreness climbing, a cut going badly, a poor night of sleep: each of them means cut the volume immediately. Write that on the week rather than leaving the athlete to judge it mid-session.',
      '  Keep power exposure separate from conditioning: throws and jumps are low-rep and fully rested, never a finisher.',
    );
  }
  return lines.join('\n');
}
