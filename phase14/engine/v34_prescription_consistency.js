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

// ---------------------------------------------------------------------------
// Progression-language, rep-word and warm-up sanity checks.
//
// The first pass compared a note against its OWN row. These compare a note's
// claim against the WEEK-OVER-WEEK delta for the same day+exercise, against
// spelled-out rep words, and against the day's own warm-up ramp. Every check is
// arithmetic on structured fields; qualitative cues are never inspected.
// ---------------------------------------------------------------------------

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
// "doubles" means 2 reps, "triples" 3, "singles" 1.
const REP_WORDS = { single: 1, singles: 1, double: 2, doubles: 2, triple: 3, triples: 3 };

function rowKey(cells, parsed) {
  return `${String(cells[parsed.day] || '').trim().toLowerCase()}|${String(cells[parsed.exercise] || '').trim().toLowerCase()}`;
}
function kgOf(raw) {
  const m = String(raw || '').match(/\+?\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function kmOf(raw) {
  const m = String(raw || '').match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : null;
}

// Claim verbs, each with the sign it asserts for the metric it names.
const CLAIMS = [
  { re: /\b(?:trim|reduce|drop|cut|lower)\b[^.;]{0,24}\b(sets?|set count|total work|volume|reps?|distance)\b/i, direction: 'down' },
  { re: /\b(?:fewer|less)\s+(?:total\s+)?(sets?|reps?|work|volume|distance)\b/i, direction: 'down' },
  { re: /\b(?:slightly less|less)\s+total\s+(?:work|volume)\b/i, direction: 'down' },
  { re: /\bfewer\s+total\s+reps?\b/i, direction: 'down' },
  { re: /\b(?:repeat|hold|keep|maintain|match)\b[^.;]{0,30}\b(?:this|the|same)\s+(?:load|weight|dose)\b/i, direction: 'same', metric: 'load' },
  { re: /\brepeat\s+(?:this|the)\s+load\b/i, direction: 'same', metric: 'load' },
];

export function collectProgressionLanguageFlags(program, intake = {}) {
  const flags = [];
  let previous = new Map();

  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    const thisWeek = new Map();

    parsed.rows.forEach((cells, row) => {
      const exercise = String(cells[parsed.exercise] || '').trim();
      if (!exercise || isWarmup(exercise)) return;
      const key = rowKey(cells, parsed);
      const sets = firstNum(cells[parsed.sets]);
      const reps = repCount(cells[parsed.reps]);
      const load = Number.isInteger(parsed.load) ? kgOf(cells[parsed.load]) : null;
      const km = Number.isInteger(parsed.reps) ? kmOf(cells[parsed.reps]) : null;
      const current = { sets, reps, load, km, volume: (Number.isFinite(sets) && Number.isFinite(reps)) ? sets * reps : null };
      thisWeek.set(key, current);

      const prior = previous.get(key);
      if (!prior) return;
      const note = String(cells[parsed.notes] || '');
      const loadText = Number.isInteger(parsed.load) ? String(cells[parsed.load] || '') : '';
      const repsText = Number.isInteger(parsed.reps) ? String(cells[parsed.reps] || '') : '';
      const claimText = [loadText, repsText, note].filter((x) => x.trim()).join(' | ');
      if (!claimText.trim()) return;
      const where = { week, row, exercise };

      let claimed = false;
      for (const claim of CLAIMS) {
        if (claimed) break;
        const matchedClaim = claimText.match(claim.re);
        if (!matchedClaim) continue;
        if (claim.metric === 'load') {
          if (Number.isFinite(load) && Number.isFinite(prior.load) && load !== prior.load) {
            claimed = true;
            flags.push({ code: 'V34_PROGRESSION_LANGUAGE_MISMATCH', ...where, claim: 'repeat/hold load', previous_load: prior.load, current_load: load,
              message: `${exercise} (Week ${week}) says the load is repeated or held, but it moved from ${prior.load} to ${load}.` });
          }
          continue;
        }
        if (claim.direction === 'down') {
          const metricText = String(matchedClaim?.[1] || matchedClaim?.[0] || '').toLowerCase();
          let reductionMissing = false;
          let metric = 'work';
          if (/set/.test(metricText)) {
            metric = 'sets';
            reductionMissing = Number.isFinite(sets) && Number.isFinite(prior.sets) && sets >= prior.sets;
          } else if (/distance/.test(metricText)) {
            metric = 'distance';
            reductionMissing = Number.isFinite(km) && Number.isFinite(prior.km) && km >= prior.km;
          } else {
            metric = /rep/.test(metricText) ? 'total reps' : 'volume';
            reductionMissing = Number.isFinite(current.volume) && Number.isFinite(prior.volume) && current.volume >= prior.volume;
          }
          if (reductionMissing) {
            claimed = true;
            flags.push({ code: 'V34_PROGRESSION_LANGUAGE_MISMATCH', ...where, claim: `reduction:${metric}`,
              previous: { sets: prior.sets, reps: prior.reps, km: prior.km, volume: prior.volume }, current: { sets, reps, km, volume: current.volume },
              message: `${exercise} (Week ${week}) claims reduced ${metric}, but that metric did not fall from the immediately previous week.` });
          }
        }
      }
    });

    // Compare only to the immediately previous week. A movement that disappears
    // for a week must not be compared to stale history when it returns later.
    previous = thisWeek;
  }
  return flags;
}

// Spelled-out attempt claims ("Three quality attempts per set") and rep words
// ("clean symmetrical doubles") must match the numeric reps on the row.
export function collectRepWordFlags(program) {
  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.notes)) continue;
    // How many work rows each movement has on each day: a movement split across a
    // priority set plus back-off singles may legitimately name the other sets.
    const rowsPerKey = new Map();
    parsed.rows.forEach((cells) => {
      const nm = String(cells[parsed.exercise] || '').trim();
      if (!nm || isWarmup(nm)) return;
      const k = rowKey(cells, parsed);
      rowsPerKey.set(k, (rowsPerKey.get(k) || 0) + 1);
    });
    parsed.rows.forEach((cells, row) => {
      const exercise = String(cells[parsed.exercise] || '').trim();
      if (!exercise || isWarmup(exercise)) return;
      const reps = repCount(cells[parsed.reps]);
      if (!Number.isFinite(reps)) return;
      const note = String(cells[parsed.notes] || '');
      const where = { week, row, exercise };

      for (const m of note.matchAll(/\b([a-z]+)\s+(?:quality\s+|clean\s+|good\s+)?(?:attempts?|reps?|entries)\s+per\s+set\b/gi)) {
        const n = NUMBER_WORDS[String(m[1]).toLowerCase()];
        if (Number.isFinite(n) && n !== reps) {
          flags.push({ code: 'V34_NOTE_PER_SET_MISMATCH', ...where, note_claim: n, prescribed_reps: reps,
            message: `${exercise} (Week ${week}) prescribes ${reps} per set but its note states ${m[1]} per set.` });
        }
      }
      const companionRows = rowsPerKey.get(rowKey(cells, parsed)) || 1;
      for (const m of (companionRows > 1 ? [] : note.matchAll(/\b(singles?|doubles?|triples?)\b/gi))) {
        const n = REP_WORDS[String(m[1]).toLowerCase()];
        if (Number.isFinite(n) && n !== reps) {
          flags.push({ code: 'V34_NOTE_REP_WORD_MISMATCH', ...where, note_claim: m[1], prescribed_reps: reps,
            message: `${exercise} (Week ${week}) prescribes ${reps} rep(s) per set but its note describes ${m[1]}.` });
        }
      }
    });
  }
  return flags;
}

// A normal ramp finishes below the work set, and one movement's ramp must not be
// duplicated inside another movement's warm-up note when it already has its own.
export function collectWarmupSanityFlags(program) {
  const flags = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.load) || !Number.isInteger(parsed.notes)) continue;

    const workLoadByKey = new Map();
    parsed.rows.forEach((cells) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!name || isWarmup(name)) return;
      const kg = kgOf(cells[parsed.load]);
      const key = rowKey(cells, parsed);
      if (Number.isFinite(kg)) workLoadByKey.set(key, Math.max(workLoadByKey.get(key) ?? -Infinity, kg));
    });

    const rampOwners = new Map();
    parsed.rows.forEach((cells, row) => {
      const name = String(cells[parsed.exercise] || '').trim();
      if (!isWarmup(name)) return;
      const day = String(cells[parsed.day] || '').trim().toLowerCase();
      const note = String(cells[parsed.notes] || '');
      for (const m of note.matchAll(/Ramp\s+([A-Za-z][A-Za-z\- ]*?):\s*([^;]*?)\bbefore\s+\+?(\d+(?:\.\d+)?)\s*kg\s+work sets\./gi)) {
        const movement = m[1].trim();
        const steps = [...m[2].matchAll(/\+?(\d+(?:\.\d+)?)\s*kg\s*x/gi)].map((x) => Number(x[1])).filter(Number.isFinite);
        const target = Number(m[3]);
        const key = `${day}|${movement.toLowerCase()}`;
        const work = workLoadByKey.get(key);

        const top = steps.length ? Math.max(...steps) : null;
        if (Number.isFinite(top) && Number.isFinite(work) && top >= work) {
          flags.push({ code: 'V34_WARMUP_HEAVIER_THAN_WORK', week, row, exercise: movement, top_ramp_kg: top, work_kg: work,
            message: `${movement} (Week ${week}) ramps to ${top} kg before ${work} kg work sets. A ramp must finish below the work load unless a potentiation protocol is explicitly prescribed.` });
        }
        if (Number.isFinite(target) && Number.isFinite(work) && target !== work) {
          flags.push({ code: 'V34_WARMUP_TARGET_MISMATCH', week, row, exercise: movement, ramp_target_kg: target, work_kg: work,
            message: `${movement} (Week ${week}) ramps toward ${target} kg but the work row prescribes ${work} kg.` });
        }
        // Duplicate specific ramps for the same movement on the same day.
        if (rampOwners.has(key)) {
          flags.push({ code: 'V34_DUPLICATE_SPECIFIC_RAMP', week, row, exercise: movement,
            message: `${movement} (Week ${week}) has its ramp prescribed in more than one warm-up row on the same day.` });
        } else rampOwners.set(key, row);
      }
    });
  }
  return flags;
}

export function collectAllV34ConsistencyFlags(program, intake = {}) {
  return [
    ...collectPrescriptionConsistencyFlags(program, intake),
    ...collectProgressionLanguageFlags(program, intake),
    ...collectRepWordFlags(program),
    ...collectWarmupSanityFlags(program),
  ];
}

// Release-boundary gate. Objective contradictions between structured fields and
// quantitative note claims are repairable: the correct response is regeneration
// with feedback, not silently inventing a replacement prescription.
export function validatePrescriptionConsistency(program, intake = {}, RetriableValidationError) {
  const flags = collectAllV34ConsistencyFlags(program, intake);
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
