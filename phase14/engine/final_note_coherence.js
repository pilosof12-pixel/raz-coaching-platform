// Final note coherence.
//
// The deterministic normalizers produce the authoritative prescription, but the
// model-authored coaching note attached to a row can survive that normalization
// and keep describing the dose the model originally proposed. The result is a
// row that prescribes 2 x 1 while its own note talks about "the third rep" and
// "3x2", or a Week 4 row that claims "reduce one set" when the set count did not
// move.
//
// This pass fixes that class generically: it only touches QUANTITATIVE claims a
// note makes about its OWN row, and it derives every corrected number from the
// row's final structured fields. Qualitative coaching language -- technique
// cues, symptom gating, readiness rules, autoregulation -- is never rewritten.
// When a claim cannot be verified against structured fields, it is left alone.

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }
function norm(v) { return String(v || '').trim().toLowerCase(); }

function parseWeek(program, week) {
  const re = new RegExp(`(START_WEEK${week}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${week}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const col = (...names) => names.map((n) => idx[n]).find(Number.isInteger);
  const day = idx.day;
  const exercise = idx.exercise;
  const sets = idx.sets;
  const reps = col('reps', 'reps / duration', 'reps/duration');
  if (![day, exercise, sets, reps].every(Number.isInteger)) return null;
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  return { re, match, header, rows, day, exercise, sets, reps, notes: col('notes', 'coaching note') };
}
function rebuild(program, parsed) {
  const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
  return program.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
}

// "1 per arm" -> 1, "5-6" -> 5 (the conservative first number, matching how the
// release validators read a rep cell), "30 sec" -> null (not a rep count).
function repCount(raw) {
  const s = String(raw || '').trim();
  if (/\b(?:sec|secs|second|seconds|min|mins|minute|minutes|km|m)\b/i.test(s) && !/per\s+arm|per\s+side/i.test(s)) return null;
  return firstNum(s);
}

const ORDINALS = { second: 2, third: 3, fourth: 4, fifth: 5 };

// Repair only the claim shapes below, each anchored to an explicit lexical cue
// about this row's own sets/reps/attempts.
function repairNote(note, { sets, reps, priorSets }) {
  let out = String(note || '');
  const changes = [];
  if (!out.trim()) return { note: out, changes };

  // (a) "stay at N clean sets" / "keep N sets" / "hold N sets"
  if (Number.isFinite(sets)) {
    out = out.replace(/\b(stay at|keep|hold|maintain|remain at)\s+(\d+)(\s+(?:clean|quality|good|solid)?\s*sets?\b)/gi,
      (whole, verb, n, tail) => {
        if (Number(n) === sets) return whole;
        changes.push({ kind: 'set_count_claim', from: Number(n), to: sets });
        return `${verb} ${sets}${tail}`;
      });
  }

  // (b) "reduce/drop/trim one set" when the set count did not actually fall.
  if (Number.isFinite(sets) && Number.isFinite(priorSets) && sets >= priorSets) {
    out = out.replace(/\b(?:reduce|drop|trim|cut|remove)\s+(?:one|a|1)\s+set\b[,.]?\s*/gi, () => {
      changes.push({ kind: 'false_set_reduction', sets, prior_sets: priorSets });
      return 'Hold the set count and consolidate through rep quality and a slightly lower effort, ';
    });
  }

  // (c) "add the third rep" when fewer reps than that ordinal are prescribed.
  if (Number.isFinite(reps)) {
    out = out.replace(/\b(?:if[^.;]{0,60}?,?\s*)?add (?:the|a|an)\s+(second|third|fourth|fifth)\s+rep\b[^.;]{0,40}?[.;]?\s*/gi,
      (whole, word) => {
        const ordinal = ORDINALS[String(word).toLowerCase()];
        if (!Number.isFinite(ordinal) || ordinal <= reps) return whole;
        changes.push({ kind: 'nonexistent_rep_claim', ordinal, reps });
        return '';
      });
  }

  // (d) "keep 3x2" style scheme claims that disagree with the row's own dose.
  if (Number.isFinite(sets) && Number.isFinite(reps)) {
    out = out.replace(/\b(keep|stay at|hold|maintain|return to)\s+(\d+)\s*(?:x|×)\s*(\d+)\b/gi,
      (whole, verb, a, bnum) => {
        if (Number(a) === sets && Number(bnum) === reps) return whole;
        changes.push({ kind: 'scheme_claim', from: `${a}x${bnum}`, to: `${sets} x ${reps}` });
        return `${verb} ${sets} x ${reps}`;
      });
  }

  // (e) An attempt ceiling that exceeds the prescribed total is not a ceiling.
  if (Number.isFinite(sets) && Number.isFinite(reps)) {
    const prescribed = sets * reps;
    out = out.replace(/\b(up to|no more than|at most)\s+(\d+)(\s+total\s+(?:attempts?|entries|reps?)\b)/gi,
      (whole, verb, n, tail) => {
        if (Number(n) <= prescribed) return whole;
        changes.push({ kind: 'attempt_ceiling_above_prescription', from: Number(n), to: prescribed });
        return `${verb} ${prescribed}${tail}`;
      });
  }

  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.;,])/g, '$1').trim();
  // Removing a leading conditional clause can leave the sentence starting
  // lower-case ("otherwise keep ..."); restore sentence case so the client-facing
  // note still reads like written coaching.
  if (changes.length && /^[a-z]/.test(out)) out = out.charAt(0).toUpperCase() + out.slice(1);
  return { note: out, changes };
}

export function normalizeFinalNoteCoherence(program, intake = {}) {
  const original = String(program || '');
  const repairs = [];
  let candidate = original;

  // Previous-week set counts per day+exercise, so a "reduce one set" claim can be
  // checked against what the athlete actually did the week before.
  const priorSetsByKey = new Map();

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    const thisWeekSets = new Map();
    let changed = false;

    parsed.rows.forEach((cells, row) => {
      const name = cells[parsed.exercise];
      const key = `${norm(cells[parsed.day])}|${norm(name)}`;
      const sets = firstNum(cells[parsed.sets]);
      const reps = repCount(cells[parsed.reps]);
      if (Number.isFinite(sets)) thisWeekSets.set(key, sets);
      if (isWarmup(name) || !Number.isInteger(parsed.notes)) return;

      const before = String(cells[parsed.notes] || '');
      const { note, changes } = repairNote(before, { sets, reps, priorSets: priorSetsByKey.get(key) });
      if (changes.length && note !== before) {
        cells[parsed.notes] = note;
        repairs.push({ type: 'final_note_coherence', week, row, exercise: String(name || '').trim(), changes });
        changed = true;
      }
    });

    for (const [key, value] of thisWeekSets) priorSetsByKey.set(key, value);
    if (changed) candidate = rebuild(candidate, parsed);
  }

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
