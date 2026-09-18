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
