// engine/tsv_rows.js
//
// Building a table row, and putting a changed table back.
//
// Both of these started inside goal_exposure.js and moved here when a second
// repair needed them. A row written by hand instead of through newRow gets the
// column order right on the fixture in front of you and wrong on the next
// header variant, which is the kind of defect that survives its own test.

export function rebuild(program, parsed, cells) {
  const rebuilt = [parsed.header.join('\t'), ...cells.map((c) => c.join('\t'))].join('\n');
  return program.replace(parsed.re, `$1${rebuilt}$3`);
}

// A row shaped like the ones around it, so an added exposure reads as part of
// the session rather than an appendix to it.
export function newRow(parsed, { day, name, load, sets, reps, rest, rpe, note }) {
  const row = new Array(parsed.header.length).fill('');
  row[parsed.day] = day || '';
  row[parsed.exercise] = name;
  if (Number.isInteger(parsed.load)) row[parsed.load] = load;
  row[parsed.sets] = String(sets);
  row[parsed.reps] = reps;
  if (Number.isInteger(parsed.rest)) row[parsed.rest] = rest;
  const rpeCol = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
  if (rpeCol >= 0) row[rpeCol] = String(rpe);
  if (Number.isInteger(parsed.notes)) row[parsed.notes] = note;
  return row;
}

// --- reading a reps cell -----------------------------------------------------
//
// A reps cell used to hold one number. The model now writes ladders -- "2/1/1/1"
// is a double then three singles -- and every reader that took the first number
// out of the cell read that as four sets of two.
//
// It cost two shipped defects before this was centralised. The note reconciler
// rewrote every rep word in a note to match the top rung, so "keep the back-off
// singles" became "keep the back-off triples". The session-minute estimate and
// the skill-attempt count both doubled, which trims sets the athlete should have
// kept. Three copies of the same repCount existed, and fixing one of them put
// the repair and the detector into disagreement, which is the shape that kills a
// build outright.
//
// So this is the one place that knows how to read the cell.

// The rungs of a ladder, longest first as written, or null if it is not one.
export function ladderOf(cell) {
  const text = String(cell || '').trim();
  if (!text) return null;
  // Cluster notation -- "3 (1+1+1)" -- belongs to v81_cluster_notation.js, which
  // reads it as three singles and has its own rules about labelling it. A ladder
  // is the whole cell, not a parenthetical gloss on a set count.
  if (/\(/.test(text)) return null;
  const inner = text;
  const nums = (sep) => {
    const parts = inner.split(sep).map((x) => Number(String(x).trim()));
    return parts.every((n) => Number.isFinite(n) && n > 0) ? parts : null;
  };
  // Slash and plus mean a ladder at two parts. A hyphen usually means a rep
  // RANGE -- "8-10" is eight to ten reps, not a ladder of eight then ten -- so it
  // takes three parts before it reads as one.
  const slashed = /[/+]/.test(inner) ? nums(/[/+]/) : null;
  if (slashed && slashed.length >= 2) return slashed;
  const dashed = /[–—-]/.test(inner) ? nums(/[–—-]/) : null;
  if (dashed && dashed.length >= 3) return dashed;
  return null;
}

// The longest single set the row prescribes.
export function topSetOf(cell) {
  const ladder = ladderOf(cell);
  if (ladder) return Math.max(...ladder);
  // The first number, not the last: "8-10" is a range whose guaranteed set
  // length is eight, and reading the top of a range as the set length would let
  // a range satisfy a rule about how long a single set actually is.
  const m = String(cell || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

// The one rep count the row prescribes, or null where there is not one: a
// duration, a distance, or a ladder of several different lengths.
export function repCount(cell) {
  const s = String(cell || '').trim();
  if (/\b(?:sec|secs|second|seconds|min|mins|minute|minutes|km)\b/i.test(s)) return null;
  if (ladderOf(s)) return null;
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Total reps the row prescribes, counting a ladder as the sum of its rungs
// rather than its set count times its longest one.
export function repsInRow(setsCell, repsCell) {
  const ladder = ladderOf(repsCell);
  if (ladder) return ladder.reduce((a, b) => a + b, 0);
  const sets = Number(String(setsCell || '').match(/\d+(?:\.\d+)?/)?.[0]) || 0;
  const reps = Number(String(repsCell || '').match(/\d+(?:\.\d+)?/)?.[0]) || 0;
  return sets * reps;
}

// --- reading a load cell -----------------------------------------------------
//
// Unlike the reps cell, this one has always demanded its unit, which is why it
// survived the model starting to write "RPE-selected load", "Bodyweight" and
// "Band assistance that leaves 1-2s in reserve" into it: none of those carry a
// kg, so none of them read as a weight. "Band tension that makes rep 10
// challenging" does not become ten kilograms.
//
// It existed in four byte-identical copies. They all agreed, so nothing was
// broken -- but repCount also existed in three copies that all agreed, right up
// until one of them was fixed and the other two turned into a build that could
// not converge. One copy, before that happens here too.
export function kgOf(raw) {
  const m = String(raw || '').match(/\+?\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
