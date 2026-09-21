// A split belongs to the machine that produced it.
//
// The coach charges 0.20 for a prescription whose number survives the movement
// changing. Run #124 delivered a Rower row at "1:51-1:52/500 m" with the note
// "Use SkiErg here": the same athlete does not produce the same split on both
// machines, so the effort changes while the number that defines it does not,
// and nothing downstream can check which one was actually done.
//
// The fix is not to delete the alternative. An athlete who finds the rower taken
// still needs to know what to do, and removing that line would answer the rule
// by making the program less useful. What cannot stand is the alternative
// inheriting a number that was never measured on it, so the substitution clause
// is rewritten to hand the alternative its own anchor -- the RPE the row already
// carries -- and to say plainly that the split does not transfer.
//
// A note that offers no alternative, or a row whose load carries no
// machine-specific number, is left exactly as written.

import { parseWeek } from './v34_workload_accounting.js';
import { rebuild } from './tsv_rows.js';

const SUBSTITUTION = /\b(?:prefer|use|swap to|switch to|if .{0,30}(?:is )?(?:open|free|available|taken|busy))\b/i;
const MODALITY = /\b(ski ?erg|row ?erg|rower|bike ?erg|assault bike|treadmill|echo bike)\b/gi;
const MODALITY_NUMBER = /\d+:\d{2}\s*(?:\/|per )\s*(?:500\s*m|km|k)\b|\bsplit\b/i;

// The sentence that offers the other machine, so only that clause is rewritten
// and the rest of the coaching note survives untouched.
const clauseWith = (note, modality) => note
  .split(/(?<=[.;])\s+/)
  .find((c) => SUBSTITUTION.test(c) && new RegExp(modality.replace(/\s+/g, '\\s*'), 'i').test(c));

export function repairModalitySubstitution(program, intake = {}) {
  let out = String(program || '');
  const moves = [];

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;

    const cells = parsed.rows.map((c) => [...c]);
    let touched = false;

    for (const row of cells) {
      const name = String(row[parsed.exercise] || '').trim();
      const note = String(row[parsed.notes] || '');
      const load = Number.isInteger(parsed.load) ? String(row[parsed.load] || '') : '';
      if (!name || !note) continue;
      if (!SUBSTITUTION.test(note)) continue;
      if (!MODALITY_NUMBER.test(load) && !MODALITY_NUMBER.test(note)) continue;

      const named = [...new Set([...note.matchAll(MODALITY)].map((m) => m[1].toLowerCase().replace(/\s+/g, ' ')))];
      const prescribed = name.toLowerCase();
      const different = named.filter((m) => !prescribed.includes(m.split(' ')[0]));
      if (!different.length) continue;

      const clause = clauseWith(note, different[0]);
      if (!clause) continue;

      // Hand the alternative the anchor that does transfer. RPE is on the row
      // already; a split is not.
      const rpeCol = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
      const rpe = rpeCol >= 0 ? String(row[rpeCol] || '').trim() : '';
      // The wording matters as much as the anchor. The first version of this
      // replacement said "If you use SkiErg instead ... rather than this split",
      // which contains both a substitution verb and the word split, so it
      // re-triggered the very rule it was answering: the repair fired on all
      // four weeks and the finding did not move. The sentence has to stop
      // reading as an offer to swap machines and start reading as what to do on
      // the other machine.
      // Title-casing the matched text gives "Skierg", which is not what the
      // machine is called. Client-facing text uses the canonical spelling.
      const DISPLAY = {
        'skierg': 'SkiErg', 'ski erg': 'SkiErg', 'rower': 'Rower', 'rowerg': 'RowErg',
        'row erg': 'RowErg', 'bikeerg': 'BikeErg', 'bike erg': 'BikeErg',
        'assault bike': 'Assault Bike', 'echo bike': 'Echo Bike', 'treadmill': 'treadmill',
      };
      const other = DISPLAY[different[0]] || different[0].replace(/\b\w/g, (c) => c.toUpperCase());
      const anchored = rpe
        ? `On a ${other}, hold RPE ${rpe}; the two machines do not share a pace.`
        : `On a ${other}, match the effort, not the number; the two machines do not share a pace.`;

      row[parsed.notes] = note.replace(clause, anchored).replace(/\s{2,}/g, ' ').trim();
      moves.push({ week, movement: name, alternative: different[0] });
      touched = true;
    }

    if (touched) out = rebuild(out, parsed, cells);
  }

  return { program: out, changed: moves.length > 0, moves };
}

// --- the note prescribes a different movement than the row names -------------
//
// Run #124 carried five rows reading "Goblet Squat / Competition load / 25 reps"
// whose note said "Use Wall Ball here; keep throw rhythm honest". The notes are
// describing throws, so the athlete is being told to do wall balls off a row
// that names a squat. Two things follow, and both are worse than untidy prose:
// the client reads a contradiction, and every count downstream records the work
// as squat volume rather than as a race station, so component coverage
// understates the station that is actually being trained.
//
// The structured row is normally authoritative and a note is derived text. Here
// the note is plainly the instruction and the name is the mistake -- the dose,
// the rest and the RPE all belong to the movement the note names. So the row is
// renamed to what is actually prescribed and the clause that carried it is
// dropped, rather than deleting a note that was telling the truth.
//
// Only fires when the named movement is in the engine's own dictionary. A note
// naming something the vocabulary does not know is not evidence of intent, it
// is a hallucination, and renaming a row to it would launder one.

import { matchDictionary } from './exercise_dictionary.js';

// The verb is matched case-insensitively but the movement is not: a capitalised
// name is what separates "Use Wall Ball here" from "use both reps here". The
// first version wrote the verb lowercase with no flag and matched nothing at
// all, because every one of these notes begins the sentence.
const NAMES_A_MOVEMENT = /\b(?:[Uu]se|[Dd]o|[Pp]erform)\s+([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3})\s+(?:here|instead|for this)\b/;


// matchDictionary answers {status:'hit'} for a name that is already canonical
// and only carries a canonical field when it resolved an alias. Reading
// .canonical alone therefore returns undefined for every exact name, which is
// how the first version of this rule found nothing at all on a program carrying
// five instances of it.
function canonicalName(named) {
  const hit = matchDictionary(named);
  if (!hit || hit.status !== 'hit') return null;
  return hit.canonical || named;
}

export function noteNamesAnotherMovement(program, intake = {}) {
  const out = [];
  const seen = new Set();
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    for (const row of parsed.rows) {
      const name = String(row[parsed.exercise] || '').trim();
      const note = String(row[parsed.notes] || '');
      if (!name || !note) continue;
      const m = note.match(NAMES_A_MOVEMENT);
      if (!m) continue;
      const named = m[1].trim();
      const canonical = canonicalName(named);
      if (!canonical) continue;
      if (canonical.toLowerCase() === name.toLowerCase()) continue;
      const key = `${week}|${name}|${canonical}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        rule: 'NOTE_PRESCRIBES_A_DIFFERENT_MOVEMENT',
        week,
        movement: name,
        named: canonical,
        detail: `Week ${week} names ${name} in the table while the note tells the athlete to do ${canonical}. The dose, rest and RPE on the row belong to ${canonical}, so the work is recorded against the wrong movement everywhere downstream.`,
      });
    }
  }
  return out;
}

export function repairNoteNamedMovement(program, intake = {}) {
  let out = String(program || '');
  const moves = [];

  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const cells = parsed.rows.map((c) => [...c]);
    let touched = false;

    for (const row of cells) {
      const name = String(row[parsed.exercise] || '').trim();
      const note = String(row[parsed.notes] || '');
      if (!name || !note) continue;
      const m = note.match(NAMES_A_MOVEMENT);
      if (!m) continue;
      const canonical = canonicalName(m[1].trim());
      if (!canonical || canonical.toLowerCase() === name.toLowerCase()) continue;

      row[parsed.exercise] = canonical;
      row[parsed.notes] = note.replace(m[0], '').replace(/^[;,.\s]+/, '').replace(/\s{2,}/g, ' ').trim();
      moves.push({ week, from: name, to: canonical });
      touched = true;
    }
    if (touched) out = rebuild(out, parsed, cells);
  }

  return { program: out, changed: moves.length > 0, moves };
}
