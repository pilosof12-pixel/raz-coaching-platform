// Nine columns is a format, not a judgement, and a build should never die of one.
//
// TSV_ROW_COLUMN_COUNT_MISMATCH is a blocking gate with no repair behind it. The
// ledger has said so for weeks -- repairs: [], killedLive: "2026-09-12
// mma_fight_camp" -- and in run #156 it killed the youth gymnast too, raising the
// same flag on attempt after attempt until the token budget ran out. Four paid
// generations, no program, over a row with the wrong number of tabs.
//
// Nothing about the coaching was wrong. The engine's own standing rule applies:
// a blocking gate without a converging deterministic repair is a dead build.
//
// The two ways a row goes wrong both have one safe answer:
//
//   too many cells  a tab was typed inside a cell, nearly always the Notes
//                   prose. The first seven fields and the trailing Results are
//                   positional and reliable, so the surplus in between is
//                   rejoined into one Notes cell with the tabs turned to spaces.
//   too few cells   the trailing Results column, which is always empty by
//                   contract, was omitted. Pad to nine.
//
// This never edits a cell's meaning: no dose, no load, no day, no exercise name
// is touched. It only puts the tabs back where the schema says they go.

const COLUMNS = 9;
const NOTES = 7; // zero-based: Day, Exercise, Weight, Sets, Reps, Rest, Target RPE, Notes, Results

function repairRow(line) {
  const cells = line.split('\t');
  if (cells.length === COLUMNS) return { line, changed: false };

  if (cells.length > COLUMNS) {
    // Keep the positional head and the trailing Results; fold everything that
    // drifted in between back into Notes.
    const head = cells.slice(0, NOTES);
    const results = cells[cells.length - 1];
    const notes = cells.slice(NOTES, cells.length - 1).join(' ').replace(/\s+/g, ' ').trim();
    return { line: [...head, notes, results].join('\t'), changed: true };
  }

  // Short row: the omitted columns are the trailing ones, and Results is empty
  // by contract.
  return { line: [...cells, ...Array(COLUMNS - cells.length).fill('')].join('\t'), changed: true };
}

export function collectTsvRowShapeFlags(program) {
  const out = [];
  for (let week = 1; week <= 4; week += 1) {
    const m = String(program || '').match(new RegExp(`START_WEEK${week}_TSV\\s*\\n([\\s\\S]*?)\\nEND_WEEK${week}_TSV`, 'i'));
    if (!m) continue;
    const lines = m[1].split('\n').filter((x) => x.trim());
    for (let i = 1; i < lines.length; i += 1) {
      const n = lines[i].split('\t').length;
      if (n !== COLUMNS) out.push({ code: 'TSV_ROW_COLUMN_COUNT_MISMATCH', week, row: i, cells: n });
    }
  }
  return out;
}

export function repairTsvRowShape(program) {
  const original = String(program || '');
  let out = original;
  const repairs = [];

  for (let week = 1; week <= 4; week += 1) {
    const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
    const m = out.match(re);
    if (!m) continue;
    let touched = 0;
    const body = m[2].split('\n').map((line, i) => {
      // The header is the schema itself; a broken header is TSV_SCHEMA_VIOLATION
      // and a different conversation. Blank lines are left as they are.
      if (i === 0 || !line.trim()) return line;
      const fixed = repairRow(line);
      if (fixed.changed) touched += 1;
      return fixed.line;
    }).join('\n');
    if (touched) {
      out = out.slice(0, m.index) + m[1] + body + m[3] + out.slice(m.index + m[0].length);
      repairs.push({ week, rows: touched });
    }
  }

  if (out === original) return { program: original, repaired: false, repairs: [] };
  return { program: out, repaired: true, repairs };
}
