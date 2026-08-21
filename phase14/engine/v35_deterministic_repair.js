// Deterministic repair for unambiguous contradictions.
//
// v34/v35 added gates without matching repairs, so every contradiction became a
// regeneration request. The model then had to guess which of two disagreeing
// statements was authoritative, and the loop burned four attempts without
// converging. It never needed to guess: the STRUCTURED PRESCRIPTION is
// authoritative and the note is derived text, so a note that disagrees with its
// own row has exactly one correct resolution -- restate the note.
//
// Everything here is a mechanical rewrite of derived text, or a documented
// hold-the-accessory rule. No coaching decision is invented, no primary
// prescription is altered, and each repair is idempotent. Genuinely structural
// problems are deliberately left for the gates to reject.

import { rampText } from './specific_warmup_enrichment.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function kgOf(raw) {
  const m = String(raw || '').match(/\+?\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}

function parseWeek(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  const reps = col('reps', 'reps / duration', 'reps/duration');
  if (![idx.day, idx.exercise, idx.sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((l) => l.split('\t'));
  if (rows.some((c) => c.length !== header.length)) return null;
  return { re, match, header, rows, day: idx.day, exercise: idx.exercise, load: col('weight', 'load / target'), sets: idx.sets, reps, notes: col('notes', 'coaching note') };
}
function rebuild(program, parsed) {
  const inner = [parsed.header.join('\t'), ...parsed.rows.map((c) => c.join('\t'))].join('\n');
  return program.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
}
function repCount(raw) {
  const s = String(raw || '').trim();
  if (/\b(?:sec|secs|second|seconds|min|mins|minute|minutes|km)\b/i.test(s)) return null;
  return firstNum(s);
}
function rowKey(cells, parsed) {
  return `${String(cells[parsed.day] || '').trim().toLowerCase()}|${String(cells[parsed.exercise] || '').trim().toLowerCase()}`;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const REP_WORD_FOR = { 1: 'singles', 2: 'doubles', 3: 'triples' };
const CONDITIONAL = /\b(?:if|only if|when|provided|optional|earned|may|can)\b/i;

// --- 1. note claims restated from the row's own fields -----------------------

function repairRowNote(note, { sets, reps, priorSets, priorReps, priorLoad, load }) {
  let out = String(note || '');
  if (!out.trim()) return { note: out, changed: false };
  const before = out;

  // "N attempts per set" / spelled-out equivalents.
  if (Number.isFinite(reps)) {
    out = out.replace(/\b(\d+)(\s*(?:quality\s+|clean\s+|good\s+)?(?:attempts?|reps?|tries)\s+per\s+set\b)/gi,
      (w, n, tail) => (Number(n) === reps ? w : `${reps}${tail}`));
    out = out.replace(/\b([a-z]+)(\s+(?:quality\s+|clean\s+|good\s+)?(?:attempts?|reps?|entries)\s+per\s+set\b)/gi,
      (w, word, tail) => {
        const n = NUMBER_WORDS[String(word).toLowerCase()];
        return (!Number.isFinite(n) || n === reps) ? w : `${reps}${tail}`;
      });
    // Rep words describing this row's own dose.
    const wanted = REP_WORD_FOR[reps];
    if (wanted) {
      out = out.replace(/\b(singles?|doubles?|triples?)\b/gi, (w) => {
        const n = { single: 1, singles: 1, double: 2, doubles: 2, triple: 3, triples: 3 }[String(w).toLowerCase()];
        return (!Number.isFinite(n) || n === reps) ? w : wanted;
      });
    }
  }

  // "N total attempts" must equal sets x reps.
  if (Number.isFinite(sets) && Number.isFinite(reps)) {
    const total = sets * reps;
    out = out.replace(/\b(\d+)(\s+total\s+(?:attempts?|reps?|entries)\b)/gi,
      (w, n, tail) => (Number(n) === total ? w : `${total}${tail}`));
    out = out.replace(/\b((?:up to|no more than|at most)\s+)(\d+)(\s+total\s+(?:attempts?|reps?|entries)\b)/gi,
      (w, verb, n, tail) => (Number(n) <= total ? w : `${verb}${total}${tail}`));
  }

  // Set-count claims.
  if (Number.isFinite(sets)) {
    out = out.replace(/\b(stay at|keep|hold|maintain|remain at)\s+(\d+)(\s+(?:clean|quality|good|solid)?\s*sets?\b)/gi,
      (w, verb, n, tail) => (Number(n) === sets ? w : `${verb} ${sets}${tail}`));
  }

  // A claimed reduction that did not happen becomes a hold statement.
  if (Number.isFinite(sets) && Number.isFinite(priorSets) && Number.isFinite(reps) && Number.isFinite(priorReps)) {
    const fell = (sets * reps) < (priorSets * priorReps);
    if (!fell) {
      out = out.replace(/\b(?:slightly\s+)?(?:less|fewer)\s+total\s+(?:work|volume|reps?)\b/gi, 'the same total work');
      out = out.replace(/\bfewer\s+total\s+reps?\b/gi, 'the same total reps');
      out = out.replace(/\b(?:slightly\s+)?(?:trim|reduce|drop|cut|lower)\s+(?:the\s+)?set\s+count\b/gi, 'hold the set count');
      out = out.replace(/\b(?:reduce|drop|trim|cut|remove)\s+(?:one|a|1)\s+set\b/gi, 'hold the set count');
    }
  }

  // A "repeat/hold this load" claim against a load that actually moved.
  if (Number.isFinite(load) && Number.isFinite(priorLoad) && load !== priorLoad) {
    const dir = load > priorLoad ? 'Take' : 'Drop to';
    out = out.replace(/\b(repeat|hold|keep|maintain|match)\s+(?:this|the|same)\s+(load|weight|dose)\b/gi,
      `${dir} ${load} kg`);
  }

  // An unconditional instruction to add work becomes explicitly optional.
  if (/\badd (?:one|an?|another|1)\s+(?:more\s+)?(?:set|rep|single)\b/i.test(out) && !CONDITIONAL.test(out)) {
    out = out.replace(/\badd (?:one|an?|another|1)\s+(?:more\s+)?(set|rep|single)\b/i,
      'you may add one optional $1 only if every prescribed set was clean at or below the target RPE');
  }

  out = out.replace(/\s{2,}/g, ' ').trim();
  return { note: out, changed: out !== before };
}

// --- 2. warm-up ramps regenerated from the work load -------------------------

function repairWarmupRamps(parsed) {
  if (!Number.isInteger(parsed.load) || !Number.isInteger(parsed.notes)) return false;
  const workLoad = new Map();
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!name || isWarmup(name)) continue;
    const kg = kgOf(cells[parsed.load]);
    if (Number.isFinite(kg)) {
      const k = rowKey(cells, parsed);
      workLoad.set(k, Math.max(workLoad.get(k) ?? -Infinity, kg));
    }
  }
  let changed = false;
  const seen = new Set();
  for (const cells of parsed.rows) {
    const name = String(cells[parsed.exercise] || '').trim();
    if (!isWarmup(name)) continue;
    const day = String(cells[parsed.day] || '').trim().toLowerCase();
    const before = String(cells[parsed.notes] || '');
    let after = before;
    after = after.replace(/Ramp\s+([A-Za-z][A-Za-z\- ]*?):\s*[^;]*?work sets\./gi, (whole, movement) => {
      const key = `${day}|${movement.trim().toLowerCase()}`;
      const work = workLoad.get(key);
      if (!Number.isFinite(work)) return whole;
      // One specific ramp per movement per day; drop any duplicate.
      if (seen.has(key)) { changed = true; return ''; }
      seen.add(key);
      const fresh = rampText(movement.trim(), `${work} kg`);
      return fresh || whole;
    });
    after = after.replace(/;\s*;/g, ';').replace(/\s{2,}/g, ' ').trim();
    if (after !== before) { cells[parsed.notes] = after; changed = true; }
  }
  return changed;
}

// --- 3. narrative claims restated ---------------------------------------------

function repairNarrative(program, intake) {
  const head = String(program).split(/START_WEEK1_TSV/i)[0];
  if (!head.trim()) return { program, changed: false };
  let out = head;

  // Long-run "builds" claim against the structured distances.
  const km = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    let best = null;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !/\brun(?:ning)?\b/i.test(name)) continue;
      const v = (String(cells[parsed.reps] || '').match(/(\d+(?:\.\d+)?)\s*km\b/i) || [])[1];
      if (v != null) best = Math.max(best ?? 0, Number(v));
    }
    if (best != null) km.push(best);
  }
  if (km.length > 1 && !km.some((v, i) => i > 0 && v > km[i - 1])) {
    out = out.replace(/\b(the long run)\b([^.]{0,60}?)\b(builds?|building|progresses|increases?)\b/gi,
      '$1$2is held at the tolerated dose');
  }

  // Only one symptom-response hierarchy may stand. Keep the source-linked one.
  const sourceLinked = /reduce the stressor that (?:actually )?provoked|most recently increased|hold the newest/i.test(out);
  if (sourceLinked) {
    out = out.replace(/(?:^|(?<=[.!?]\s))[^.!?]*?(?:cut|reduce|trim)\s+easy[- ]?run(?:ning)?\s*(?:duration|volume)?\s*first[^.!?]*[.!?]\s*/gi, '');
  }

  out = out.replace(/[ \t]{2,}/g, ' ');
  if (out === head) return { program, changed: false };
  return { program: out + String(program).slice(head.length), changed: true };
}

// --- 4. accessory volume held when a primary quality advances ------------------

function primaryPattern(intake) {
  const p = goals(intake, 'primary').toLowerCase();
  if (/\b\d+\s*k(?:m)?\b|marathon|run|3\s*k/.test(p)) return /\brun(?:ning)?\b/i;
  if (/squat/.test(p)) return /squat/i;
  if (/pull[- ]?up|muscle[- ]?up/.test(p)) return /pull[- ]?up|muscle[- ]?up/i;
  return null;
}

function repairAccessoryCreep(program, intake, repairs) {
  const pattern = primaryPattern(intake);
  if (!pattern) return program;
  const qualityMetres = (week) => {
    const parsed = parseWeek(program, week);
    if (!parsed) return null;
    let m = 0, longest = 0;
    for (const cells of parsed.rows) {
      const name = String(cells[parsed.exercise] || '');
      if (isWarmup(name) || !pattern.test(name)) continue;
      const sets = firstNum(cells[parsed.sets]) || 0;
      const d = (String(cells[parsed.reps] || '').match(/\b(\d{2,4})\s*m\b/i) || [])[1];
      if (d != null && sets >= 2) { m += Number(d) * sets; longest = Math.max(longest, Number(d)); }
    }
    return { metres: m, longest };
  };

  let candidate = program;
  for (let week = 2; week <= 4; week++) {
    const now = parseWeek(candidate, week);
    const prev = parseWeek(candidate, week - 1);
    if (!now || !prev) continue;
    const q = qualityMetres(week), qp = qualityMetres(week - 1);
    if (!q || !qp) continue;
    if (!(q.metres > qp.metres || q.longest > qp.longest)) continue;

    const priorSets = new Map();
    for (const cells of prev.rows) {
      const name = String(cells[prev.exercise] || '').trim();
      if (!name || isWarmup(name) || pattern.test(name)) continue;
      priorSets.set(rowKey(cells, prev), firstNum(cells[prev.sets]));
    }
    let changed = false;
    for (const cells of now.rows) {
      const name = String(cells[now.exercise] || '').trim();
      if (!name || isWarmup(name) || pattern.test(name)) continue;
      const key = rowKey(cells, now);
      const before = priorSets.get(key);
      const current = firstNum(cells[now.sets]);
      if (Number.isFinite(before) && Number.isFinite(current) && current > before) {
        cells[now.sets] = String(before);
        repairs.push({ type: 'v35_accessory_volume_held', week, exercise: name, from: current, to: before });
        changed = true;
      }
    }
    if (changed) candidate = rebuild(candidate, now);
  }
  return candidate;
}

// --- entry point --------------------------------------------------------------

export function repairDeterministicContradictions(program, intake = {}) {
  let candidate = String(program || '');
  const repairs = [];

  // Accessory holds first: they change set counts that later note repairs cite.
  candidate = repairAccessoryCreep(candidate, intake, repairs);

  const prior = new Map();
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    let changed = repairWarmupRamps(parsed);
    const thisWeek = new Map();

    parsed.rows.forEach((cells, row) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name) return;
      const key = rowKey(cells, parsed);
      const sets = firstNum(cells[parsed.sets]);
      const reps = repCount(cells[parsed.reps]);
      const load = Number.isInteger(parsed.load) ? kgOf(cells[parsed.load]) : null;
      thisWeek.set(key, { sets, reps, load });
      if (isWarmup(name) || !Number.isInteger(parsed.notes)) return;

      const p = prior.get(key) || {};
      const { note, changed: noteChanged } = repairRowNote(cells[parsed.notes], {
        sets, reps, load, priorSets: p.sets, priorReps: p.reps, priorLoad: p.load,
      });
      if (noteChanged) {
        cells[parsed.notes] = note;
        repairs.push({ type: 'v35_note_restated', week, row, exercise: name });
        changed = true;
      }
    });

    for (const [k, v] of thisWeek) prior.set(k, v);
    if (changed) candidate = rebuild(candidate, parsed);
  }

  const narrative = repairNarrative(candidate, intake);
  if (narrative.changed) {
    candidate = narrative.program;
    repairs.push({ type: 'v35_narrative_restated' });
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
