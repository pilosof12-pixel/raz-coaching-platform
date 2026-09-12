// engine/tsv_shape.js
//
// A row with the wrong number of cells is a typing accident, not a coaching
// decision, and it must never be the reason a customer gets nothing.
//
// Final QA requires every week row to hold exactly nine tab-separated cells.
// That check was a hard throw with no repair behind it, so one stray tab inside
// a note -- or one missing trailing Results cell -- ended the build. A fight
// camp spent an entire attempt on forty-six of them in a single week table.
//
// Every case here has one mechanically correct answer:
//   - too few cells: the row is missing trailing columns, so add empty ones.
//     Nothing the model wrote is moved, renamed or dropped.
//   - too many cells: a tab found its way into the free-text column, so fold
//     the surplus back into Notes and keep Results last. The nine structured
//     fields keep their meaning; the prose is rejoined with a space.
//   - no tabs at all: this is a line of prose that landed inside the table, not
//     a row. Padding it would manufacture a phantom training day, so it is
//     removed instead.
//
// What this does not do is decide anything about training. If the shape is
// right, the program comes back byte-identical.

const COLUMNS = 9;
const NOTES = 7;

function normalizeLine(line) {
  const cells = line.split('\t');
  if (cells.length === COLUMNS) return line;
  if (cells.length <= 1) return null; // prose, not a row
  if (cells.length < COLUMNS) return [...cells, ...Array(COLUMNS - cells.length).fill('')].join('\t');
  const head = cells.slice(0, NOTES);
  const results = cells[cells.length - 1];
  const notes = cells.slice(NOTES, cells.length - 1).map((c) => c.trim()).filter(Boolean).join(' ');
  return [...head, notes, results].join('\t');
}

// Returns { program, repaired, rows } -- rows counts the physical lines changed.
export function normalizeWeekTsvShape(program) {
  const text = String(program || '');
  let out = text;
  let rows = 0;

  for (let week = 1; week <= 4; week += 1) {
    const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
    const m = out.match(re);
    if (!m) continue;
    const lines = m[2].split('\n');
    const kept = [];
    let changed = false;
    lines.forEach((line, i) => {
      if (!line.trim()) { kept.push(line); return; }
      // The header is checked separately and is never rewritten here: a wrong
      // header is a different defect with a different answer.
      if (i === 0) { kept.push(line); return; }
      const fixed = normalizeLine(line);
      if (fixed === line) { kept.push(line); return; }
      changed = true;
      rows += 1;
      if (fixed !== null) kept.push(fixed);
    });
    if (!changed) continue;
    out = out.replace(re, `$1${kept.join('\n')}$3`);
  }

  return { program: out, repaired: rows > 0, rows };
}
