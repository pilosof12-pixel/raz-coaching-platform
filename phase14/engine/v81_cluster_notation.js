// engine/v81_cluster_notation.js
//
// A cluster is not a straight set, and must not be written as one.
//
// The delivered block prescribed 3 reps and told the athlete to "treat each
// 3-rep set as 3 crisp triples with 15-20 sec reset". That is three separate
// contradictions in one sentence: with a reset between every rep the set is a
// cluster, not a straight triple; the unit being repeated is a single, not a
// triple; and "3 triples" describes nine reps, not three. The reps cell said
// only "3", so a coach reading the table sees a touch-and-go triple while the
// note describes something else entirely.
//
// The fix is to record the structure rather than leave it implied. Once the
// cell says 3 (1+1+1), the table and the prose agree, and every other rule that
// reads reps can tell a cluster from a straight set instead of guessing.

import { parseWeek } from './v34_workload_accounting.js';

const UNIT_WORD = { 1: 'singles', 2: 'doubles', 3: 'triples' };

// Rest taken inside a set, which is what makes it a cluster.
const INTRA_SET_REST = /\b(?:reset|re-?rack|intra[- ]set rest|rest between reps|drop and reset|between each rep)\b/i;
// "Treat each 3-rep set as 3 crisp triples", where the count repeats the reps.
const AS_UNITS = /\b(?:as|into|in)\s+(\d+)\s+((?:crisp|clean|quality|sharp|fast)\s+)?(singles?|doubles?|triples?)\b/i;

function isWarmup(n) { return /^\s*\[WARMUP\]/i.test(String(n || '')); }
function repsOf(v) { const m = String(v || '').match(/\d+/); return m ? Number(m[0]) : null; }

// Structure already recorded, e.g. "3 (1+1+1)".
export function clusterStructure(repsCell) {
  const m = String(repsCell || '').match(/\((\d+(?:\s*\+\s*\d+)+)\)/);
  if (!m) return null;
  const parts = m[1].split('+').map((x) => Number(x.trim())).filter(Number.isFinite);
  return parts.length > 1 ? parts : null;
}

// A note that describes a set broken up by rest, with the number of pieces it
// is broken into.
export function describesCluster(note, reps) {
  const text = String(note || '');
  if (!INTRA_SET_REST.test(text)) return null;
  const m = text.match(AS_UNITS);
  if (!m) return null;
  const pieces = Number(m[1]);
  if (!Number.isFinite(pieces) || pieces < 2) return null;
  // Only a claim about this row's own set: "3 pieces" of a 3-rep set.
  if (Number.isFinite(reps) && pieces !== reps) return null;
  return { pieces, word: m[3].toLowerCase() };
}

export function collectClusterFlags(program, intake = {}) {
  const flags = [];
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes) || !Number.isInteger(parsed.reps)) continue;
    parsed.rows.forEach((cells, row) => {
      const exercise = String(cells[parsed.exercise] || '').trim();
      if (!exercise || isWarmup(exercise)) return;
      const reps = repsOf(cells[parsed.reps]);
      const cluster = describesCluster(cells[parsed.notes], reps);
      if (!cluster) return;
      if (clusterStructure(cells[parsed.reps])) return;

      flags.push({
        code: 'V81_CLUSTER_LABELLED_AS_STRAIGHT_SET',
        week, row, exercise,
        detail: `${exercise} (Week ${week}) prescribes ${reps} reps and describes resting between every one of them, which is a cluster rather than a straight set. The table says only "${String(cells[parsed.reps]).trim()}", so it reads as a touch-and-go set, and the note calls each piece a ${cluster.word.replace(/s$/, '')} when the piece is a single. Record the structure -- ${reps} (${Array(reps).fill(1).join('+')}) -- and name the unit correctly.`,
      });
    });
  }
  return flags;
}

export function repairClusterNotation(program, intake = {}) {
  let out = String(program || '');
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeek(out, week);
    if (!parsed || !Number.isInteger(parsed.notes) || !Number.isInteger(parsed.reps)) continue;
    const rows = parsed.rows.map((c) => c.slice());
    let changed = false;

    rows.forEach((cells) => {
      const exercise = String(cells[parsed.exercise] || '').trim();
      if (!exercise || isWarmup(exercise)) return;
      const reps = repsOf(cells[parsed.reps]);
      const note = String(cells[parsed.notes] || '');
      const cluster = describesCluster(note, reps);
      if (!cluster || clusterStructure(cells[parsed.reps])) return;

      // The set total is unchanged -- this records how it is performed, not how
      // much of it there is -- so every rule that counts reps still reads the
      // same number.
      const structure = Array(reps).fill(1).join('+');
      cells[parsed.reps] = `${String(cells[parsed.reps]).trim()} (${structure})`;

      // Each piece of a cluster of singles is a single, whatever the note called
      // it -- and notes refer back to the unit later in the same breath ("only
      // if the doubles stay fast"). Renaming just the matched phrase leaves the
      // note contradicting the row it sits on, so every reference to the old
      // unit in this note moves with it.
      const unit = UNIT_WORD[1];
      const stale = new RegExp(`\\b${cluster.word}\\b`, 'gi');
      cells[parsed.notes] = note
        .replace(AS_UNITS, (whole, count, adj, word) => whole.replace(word, unit))
        .replace(stale, unit);
      changed = true;
    });

    if (!changed) continue;
    const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}

export function buildClusterBrief(intake = {}) {
  const lifting = /weightlift|olympic lift|snatch|clean and jerk/i.test(
    [intake.sport, intake.primary_goals, intake.secondary_goals].flat().filter(Boolean).map(String).join(' '),
  );
  if (!lifting) return '';
  return [
    '* WRITE A CLUSTER AS A CLUSTER. If the athlete rests between the reps of a set, that set is a cluster and must be recorded as one: put the structure in the reps column -- 3 (1+1+1) -- and name the rest in the note.',
    '  The unit of a cluster of singles is a single. Do not call it a triple: "3 crisp triples" describes nine reps, not three, and contradicts the row it sits on.',
    '  A straight triple and a 1+1+1 cluster are different exercises in cost and intent. A coach reading the table must be able to tell which one you meant without reading the note.',
  ].join('\n');
}
