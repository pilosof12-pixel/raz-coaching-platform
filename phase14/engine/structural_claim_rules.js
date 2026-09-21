// Prose that describes the rows underneath it, checked against those rows.
//
// Two of the coach's five findings on run #124 were claims the program made
// about its own structure that the structure did not support:
//
//   "one continuous 50% rehearsal in competition order" on a day that read Row,
//   Sandbag Lunge, Wall Ball, Calf Raise, Prowler Push, Row, Run, Farmer Carry
//
//   "Each rep flows straight into the sled pull row below" on a Run row whose
//   next row was Rower
//
// He charged 0.45 and 0.15. Neither was caused by a repair -- the model wrote
// both, and the engine had nothing that reads a claim about sequence and checks
// it. Claim-integrity already covers numbers a note states about its own row;
// this covers claims about what comes next.
//
// Both are decidable from the table alone, which is what makes them rules rather
// than judgement: either the row below is the one named, or it is not.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';
import { namedComponentsFor, eventIsOrdered } from './coach_standard.js';
import { matcherFor } from './event_component_rules.js';
import { matchDictionary } from './exercise_dictionary.js';

const isWarmup = (s) => /^\s*\[WARMUP\]/i.test(String(s || ''));
// Case-insensitive on the movement, because the model writes "the sled pull row
// below" in lower case and requiring a capital missed the coach's finding
// entirely. The dictionary check below is the real filter -- "the next row" and
// "the easy row" name no movement and are dropped there -- so the capital was
// buying nothing but a miss.
const NAMES_NEXT_ROW = /\b(?:into|straight into|flows into|feeds|then)\b[^.;]{0,40}?\b([A-Za-z'-]+(?:\s+[A-Za-z'-]+){0,3})\s+row\b/i;
const CLAIMS_ORDER = /\b(?:in\s+)?(?:competition|race)\s+order\b/i;

// "the sled pull row below" has to be the row below.
export function nextRowClaimUnsupported(program, intake = {}) {
  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;

    const rows = parsed.rows.map((r) => ({
      day: String(r[parsed.day] || '').trim(),
      name: String(r[parsed.exercise] || '').trim(),
      note: String(r[parsed.notes] || ''),
    }));

    rows.forEach((row, i) => {
      if (!row.name || isWarmup(row.name)) return;
      const m = row.note.match(NAMES_NEXT_ROW);
      if (!m) return;
      // The capture can swallow a leading article: "into the sled pull row"
      // yields "the sled pull", which reads badly in the message and matches
      // nothing in the dictionary.
      const claimed = m[1].trim().replace(/^(?:the|a|an)\s+/i, '');
      // status must be a hit: matchDictionary answers an object for a miss too,
      // so a truthiness check passes for "next" in "the next row below" and the
      // rule fires on ordinary prose.
      if (matchDictionary(claimed)?.status !== 'hit') return;

      // The next working row on the same day.
      let j = i + 1;
      while (j < rows.length && (isWarmup(rows[j].name) || !rows[j].name)) j += 1;
      const actual = j < rows.length && rows[j].day === row.day ? rows[j].name : null;
      if (actual && new RegExp(claimed.replace(/\s+/g, '\\s*'), 'i').test(actual)) return;

      out.push({
        rule: 'NEXT_ROW_CLAIM_UNSUPPORTED',
        week,
        movement: row.name,
        claimed,
        detail: `Week ${week} ${row.day}: the note on ${row.name} says the work flows into the ${claimed} row below, but the row below is ${actual || 'the end of the day'}. The point of that row is the transition, so a claimed transition that is not programmed is the defect rather than the wording.`,
      });
    });
  }
  return out;
}

// "in competition order" has to be in competition order.
export function competitionOrderClaimUnsupported(program, intake = {}) {
  if (!eventIsOrdered(intake)) return [];
  const components = namedComponentsFor(intake) || [];
  if (components.length < 3) return [];
  const rank = new Map(components.map((c, i) => [c, i]));

  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;

    const byDay = new Map();
    for (const r of parsed.rows) {
      const day = String(r[parsed.day] || '').trim();
      const name = String(r[parsed.exercise] || '').trim();
      const note = String(r[parsed.notes] || '');
      if (!day || !name || isWarmup(name)) continue;
      if (!byDay.has(day)) byDay.set(day, { claims: false, seq: [] });
      const d = byDay.get(day);
      if (CLAIMS_ORDER.test(note)) d.claims = true;
      const c = components.find((x) => matcherFor(x).test(name));
      if (c) d.seq.push(c);
    }

    for (const [day, d] of byDay) {
      if (!d.claims || d.seq.length < 3) continue;
      const ranks = d.seq.map((c) => rank.get(c) ?? 99);
      const ordered = ranks.every((v, i) => i === 0 || v >= ranks[i - 1]);
      if (ordered) continue;
      out.push({
        rule: 'COMPETITION_ORDER_CLAIM_UNSUPPORTED',
        week,
        day,
        detail: `Week ${week} ${day} says the session is in competition order, but the components run ${d.seq.join(' -> ')} against a race order of ${components.join(' -> ')}. At two to three weeks out the value of a rehearsal is rehearsing the sequencing problem, so a session that claims the order and does not keep it is not a rehearsal.`,
      });
    }
  }
  return out;
}

// --- transitions stated in either direction ---------------------------------
//
// The "X row below" form was only ever one phrasing. Run #127 wrote the same
// promise four other ways -- "straight off Rowing Ergometer", "straight into
// SkiErg", "straight into the paired run", "straight into the 400 m run" -- and
// the coach charged 0.25 for notes that named a transition the rows did not
// make, in weeks 1, 2 and 3.
//
// His WHY is the part that matters: the athlete cannot know whether to follow
// the row order or the note, and the engine cannot tell whether compromised
// running was actually programmed. A note that lies about the sequence is worse
// than no note.
//
// "off X" looks backwards to the previous working row on the day; "into X"
// looks forwards. Both are decided by the table, and the note is restated to
// name the row that is really there -- the rows are already put into race order
// by the rehearsal sequencer, and moving them again to satisfy a sentence would
// let prose drive programming.
const OFF_CLAIM = /\b(?:straight|directly)?\s*off\s+(?:the\s+)?([A-Za-z'-]+(?:\s+[A-Za-z'-]+){0,3})\b/i;
// "move straight to SkiErg" is the same promise as "straight into SkiErg", and
// the coach charged 0.10 for it on run #129 while this rule watched for `into`
// and `onto` only. A bare "to" needs the straight/directly qualifier in front of
// it, or the rule would fire on every ordinary sentence containing the word.
const INTO_CLAIM = /\b(?:(?:straight|directly)\s*(?:into|onto|to)|into|onto)\s+(?:the\s+)?([A-Za-z'-]+(?:\s+[A-Za-z'-]+){0,3})\b/i;
const TRAILING_NOUN = /\s+(?:row|rep|reps|set|sets)$/i;

const known = (name) => {
  const cleaned = String(name || '').replace(TRAILING_NOUN, '').replace(/^\d+\s*m\s+/i, '').trim();
  return matchDictionary(cleaned)?.status === 'hit' ? cleaned : null;
};

function dayRows(parsed) {
  return parsed.rows.map((r) => ({
    day: String(r[parsed.day] || '').trim(),
    name: String(r[parsed.exercise] || '').trim(),
    note: String(r[parsed.notes] || ''),
  }));
}

const neighbour = (rows, i, dir) => {
  let j = i + dir;
  while (j >= 0 && j < rows.length && (!rows[j].name || isWarmup(rows[j].name))) j += dir;
  return j >= 0 && j < rows.length && rows[j].day === rows[i].day ? rows[j] : null;
};

export function transitionClaimUnsupported(program, intake = {}) {
  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const rows = dayRows(parsed);

    rows.forEach((row, i) => {
      if (!row.name || isWarmup(row.name) || !row.note) return;
      for (const [re, dir, word] of [[OFF_CLAIM, -1, 'off'], [INTO_CLAIM, 1, 'into']]) {
        const m = row.note.match(re);
        if (!m) continue;
        const claimed = known(m[1]);
        if (!claimed) continue;
        const actual = neighbour(rows, i, dir);
        const ok = actual && new RegExp(claimed.replace(/\s+/g, '\\s*'), 'i').test(actual.name);
        if (ok) continue;
        out.push({
          rule: 'TRANSITION_CLAIM_UNSUPPORTED',
          week,
          movement: row.name,
          claimed,
          detail: `Week ${week} ${row.day}: the note on ${row.name} says the work goes ${word} ${claimed}, but the row ${dir < 0 ? 'before' : 'after'} it is ${actual ? actual.name : 'not there'}. The athlete cannot tell whether to follow the table or the note, and nothing downstream can tell whether the transition was programmed.`,
        });
      }
    });
  }
  return out;
}

export function repairTransitionClaim(program, intake = {}) {
  let out = String(program || '');
  const moves = [];

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const cells = parsed.rows.map((c) => [...c]);
    const rows = dayRows(parsed);
    let touched = false;

    rows.forEach((row, i) => {
      if (!row.name || isWarmup(row.name) || !row.note) return;
      for (const [re, dir, word] of [[OFF_CLAIM, -1, 'off'], [INTO_CLAIM, 1, 'into']]) {
        const m = String(cells[i][parsed.notes] || '').match(re);
        if (!m) continue;
        const claimed = known(m[1]);
        if (!claimed) continue;
        const actual = neighbour(rows, i, dir);
        if (actual && new RegExp(claimed.replace(/\s+/g, '\\s*'), 'i').test(actual.name)) continue;

        const note = String(cells[i][parsed.notes] || '');
        if (actual) {
          cells[i][parsed.notes] = note.replace(m[0], m[0].replace(new RegExp(claimed.replace(/\s+/g, '\\s*'), 'i'), actual.name));
          moves.push({ week, movement: row.name, word, from: claimed, to: actual.name });
        } else {
          // Nothing on either side to point at, so the promise is removed rather
          // than pointed somewhere equally untrue.
          cells[i][parsed.notes] = note.replace(m[0], '').replace(/\s{2,}/g, ' ').replace(/^[;,.\s]+/, '').trim();
          moves.push({ week, movement: row.name, word, from: claimed, to: null });
        }
        touched = true;
      }
    });

    if (touched) out = rebuild(out, parsed, cells);
  }

  return { program: out, changed: moves.length > 0, moves };
}

export const STRUCTURAL_CLAIM_RULES = [nextRowClaimUnsupported, competitionOrderClaimUnsupported, transitionClaimUnsupported];


// The table is authoritative and a note is derived text, so a claim about the
// next row is restated rather than the row being moved. Moving rows to satisfy
// a sentence would let prose drive programming, which is the wrong way round --
// and the coach's INSTEAD offered both options, listing the note rewrite second
// precisely because the transition may not be what the session is for.
export function repairNextRowClaim(program, intake = {}) {
  let out = String(program || '');
  const moves = [];

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let touched = false;

    for (let i = 0; i < cells.length; i += 1) {
      const name = String(cells[i][parsed.exercise] || '').trim();
      const note = String(cells[i][parsed.notes] || '');
      const day = String(cells[i][parsed.day] || '').trim();
      if (!name || isWarmup(name) || !note) continue;
      const m = note.match(NAMES_NEXT_ROW);
      if (!m) continue;
      const claimed = m[1].trim().replace(/^(?:the|a|an)\s+/i, '');
      if (matchDictionary(claimed)?.status !== 'hit') continue;

      let j = i + 1;
      while (j < cells.length && (!String(cells[j][parsed.exercise] || '').trim()
        || isWarmup(String(cells[j][parsed.exercise] || '')))) j += 1;
      const actual = j < cells.length && String(cells[j][parsed.day] || '').trim() === day
        ? String(cells[j][parsed.exercise] || '').trim() : null;
      if (!actual) continue;
      if (new RegExp(claimed.replace(/\s+/g, '\\s*'), 'i').test(actual)) continue;

      cells[i][parsed.notes] = note.replace(m[0], m[0].replace(new RegExp(claimed.replace(/\s+/g, '\\s*'), 'i'), actual));
      moves.push({ week, movement: name, from: claimed, to: actual });
      touched = true;
    }
    if (touched) out = rebuild(out, parsed, cells);
  }

  return { program: out, changed: moves.length > 0, moves };
}
