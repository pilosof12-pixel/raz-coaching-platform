// A repeated header row is a typing accident with exactly one correct answer.
//
// Run #126's first attempt raised five gates at once:
//
//   EXERCISE_HALLUCINATION + SPORT_DAY_COUPLING_VIOLATION + V38_INCOMPLETE_SESSION
//   + V74_NOVEL_EXERCISE_NEAR_EVENT + REQUESTED_STRENGTH_SESSIONS_UNACCOUNTED
//
// and the unknown-name diagnostic named the hallucinated exercise as, literally,
// "Exercise". The model had emitted the header line a second time inside a week
// block. One stray row then read as a movement nobody has heard of, a session
// with a broken exercise in it, a day whose coupling could not be resolved, and
// a strength session that could not be accounted for. Five findings, one cause,
// and a whole regeneration spent on it.
//
// The dictionary gate is the first thing the validation bundle runs, so nothing
// downstream ever gets a chance: the build is already on its way back to the
// model before any repair sees the program. This runs before that gate.
//
// It is the narrowest possible rule. A row is a stray header only when its first
// two cells are exactly the header's own labels, which no prescription can
// legitimately be. It never touches a row that carries a real day or a real
// movement.

const HEADER_START = /^\s*Day\t\s*Exercise\t/i;

export function stripRepeatedHeaderRows(program) {
  const text = String(program || '');
  const lines = text.split('\n');
  const out = [];
  const dropped = [];

  let inBlock = false;
  let seenHeader = false;

  for (const line of lines) {
    if (/^START_WEEK\d+_TSV\s*$/i.test(line)) { inBlock = true; seenHeader = false; out.push(line); continue; }
    if (/^END_WEEK\d+_TSV\s*$/i.test(line)) { inBlock = false; seenHeader = false; out.push(line); continue; }

    if (inBlock && HEADER_START.test(line)) {
      if (!seenHeader) { seenHeader = true; out.push(line); continue; }
      dropped.push(line);   // the block already had its header
      continue;
    }
    out.push(line);
  }

  return { program: out.join('\n'), changed: dropped.length > 0, dropped };
}
