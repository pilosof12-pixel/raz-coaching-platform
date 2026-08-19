// Deterministic prescription/note consistency.
//
// v33 repaired a first class of contradictions (set-count claims, false set
// reductions, non-existent reps, scheme claims, attempt ceilings). This module
// covers the remaining quantitative claim shapes and, unlike v33's repairer,
// REPORTS rather than rewrites where the correction would be subjective -- an
// unresolvable contradiction should trigger regeneration, not invented coaching.
//
// It runs after deterministic prescription repairs so it compares against final
// structured fields. Qualitative cues are never inspected.

function firstNum(raw) {
  const m = String(raw || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function isWarmup(name) { return /^\s*\[WARMUP\]/i.test(String(name || '')); }

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
  return { header, rows, day: idx.day, exercise: idx.exercise, load: col('weight', 'load / target'), sets: idx.sets, reps, notes: col('notes', 'coaching note') };
}

// Reps as a countable number; duration cells ("30 sec") are not rep counts.
function repCount(raw) {
  const s = String(raw || '').trim();
  if (/\b(?:sec|secs|second|seconds|min|mins|minute|minutes|km)\b/i.test(s)) return null;
  return firstNum(s);
}

// Language that makes an extra set/rep explicitly optional and earned is valid
// coaching, not a contradiction.
const CONDITIONAL = /\b(?:if|only if|when|provided|optional|earned|may|can|choose to|allowed to|feel free)\b/i;

// A load reference is legitimate when it appears in this row, or when it is
// explicitly framed as a previously established load.
const BACKREFERENCE = /\b(?:repeat|hold|match|same as|as in|from)\b[^.;]{0,30}\b(?:week\s*\d|last week|previous week|prior week)\b|\bweek\s*\d[^.;]{0,20}\b(?:load|weight|dose)\b/i;

function loadTokens(text) {
  return [...String(text || '').matchAll(/\+?\s*\d+(?:\.\d+)?\s*kg\b/gi)]
    .map((m) => m[0].replace(/\s+/g, '').toLowerCase());
}

export function collectPrescriptionConsistencyFlags(program, intake = {}) {
  const flags = [];
  // Loads established anywhere in the program, so "repeat the +50 kg" is only a
  // contradiction when +50 kg genuinely never existed. The athlete's own intake
  // benchmarks count as established: "anchored below the demonstrated +30 kg x 5
  // benchmark" is a legitimate reference to tested capacity, not an invention.
  const establishedLoads = new Set();
  const intakeBenchmarks = [intake.current_numbers, intake.performance_markers, intake.clarification_answers, intake.notes]
    .map((v) => (Array.isArray(v) ? v.join(' | ') : (v && typeof v === 'object' ? JSON.stringify(v) : String(v || ''))))
    .join(' ');
  loadTokens(intakeBenchmarks).forEach((t) => establishedLoads.add(t));

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed) continue;
    for (const cells of parsed.rows) {
      if (Number.isInteger(parsed.load)) loadTokens(cells[parsed.load]).forEach((t) => establishedLoads.add(t));
    }
  }

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;

    parsed.rows.forEach((cells, row) => {
      const exercise = String(cells[parsed.exercise] || '').trim();
      if (!exercise || isWarmup(exercise)) return;
      const note = String(cells[parsed.notes] || '');
      if (!note.trim()) return;
      const sets = firstNum(cells[parsed.sets]);
      const reps = repCount(cells[parsed.reps]);
      const where = { week, row, exercise };

      // 1. "N attempts per set" must equal the prescribed reps.
      if (Number.isFinite(reps)) {
        for (const m of note.matchAll(/\b(\d+)\s*(?:attempts?|reps?|tries)\s+per\s+set\b/gi)) {
          if (Number(m[1]) !== reps) {
            flags.push({ code: 'V34_NOTE_PER_SET_MISMATCH', ...where, note_claim: Number(m[1]), prescribed_reps: reps,
              message: `${exercise} (Week ${week}) prescribes ${reps} per set but its note states ${m[1]} per set.` });
          }
        }
      }

      // 2. "N total attempts" must equal sets x reps when both are numeric.
      if (Number.isFinite(sets) && Number.isFinite(reps)) {
        const total = sets * reps;
        for (const m of note.matchAll(/\b(\d+)\s+total\s+(?:attempts?|reps?|entries)\b/gi)) {
          const claimed = Number(m[1]);
          // "up to N" is a ceiling, handled by the v33 clamp; only equality
          // claims are checked here.
          const isCeiling = new RegExp(`(?:up to|no more than|at most)\\s+${claimed}\\b`, 'i').test(note);
          if (!isCeiling && claimed !== total) {
            flags.push({ code: 'V34_NOTE_TOTAL_MISMATCH', ...where, note_claim: claimed, prescribed_total: total,
              message: `${exercise} (Week ${week}) prescribes ${sets} x ${reps} = ${total} but its note states ${claimed} total.` });
          }
        }
      }

      // 3. "add a set/rep" must be reflected structurally, or be clearly optional.
      if (/\badd (?:one|an?|another|1)\s+(?:more\s+)?(set|rep|single)\b/i.test(note) && !CONDITIONAL.test(note)) {
        flags.push({ code: 'V34_NOTE_UNCONDITIONAL_ADDITION', ...where, sets, reps,
          message: `${exercise} (Week ${week}) instructs adding work but the prescription is unchanged and the instruction is not framed as conditional or optional.` });
      }

      // 4. A specific load may only be referenced if it is on this row or was
      //    established earlier and framed as a back-reference.
      const rowLoads = new Set(Number.isInteger(parsed.load) ? loadTokens(cells[parsed.load]) : []);
      for (const token of loadTokens(note)) {
        if (rowLoads.has(token)) continue;
        if (establishedLoads.has(token) && BACKREFERENCE.test(note)) continue;
        if (establishedLoads.has(token)) continue;
        flags.push({ code: 'V34_NOTE_UNDEFINED_LOAD_REFERENCE', ...where, load: token,
          message: `${exercise} (Week ${week}) references ${token} in its note, but that load is not prescribed on the row and was never established elsewhere in the program.` });
      }
    });
  }

  return flags;
}

// Release-boundary gate. Objective contradictions between structured fields and
// quantitative note claims are repairable: the correct response is regeneration
// with feedback, not silently inventing a replacement prescription.
export function validatePrescriptionConsistency(program, intake = {}, RetriableValidationError) {
  const flags = collectPrescriptionConsistencyFlags(program, intake);
  if (!flags.length) return { ok: true, flags: [] };
  const first = flags[0];
  const detail = flags.map((f) => f.message).join(' ');
  if (typeof RetriableValidationError === 'function') {
    throw new RetriableValidationError(
      first.code,
      `Prescription/note consistency: ${detail} Make every quantitative claim in a note agree with that row's own Sets, Reps and Weight fields, or state it as an explicitly conditional option. Do not reference a load that is neither prescribed on the row nor an established benchmark.`,
      { flags },
    );
  }
  return { ok: false, flags };
}
