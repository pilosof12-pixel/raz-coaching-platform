import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';
import { rampText } from './specific_warmup_enrichment.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function secondaryText(intake = {}) { return arr(intake.secondary_goals).map(String).join(' | '); }
function isWarmup(name) { return /^\s*\[WARMUP\](?:\s|$)/i.test(String(name || '').trim()); }
function isRunLike(name) { return /^(?:run|running|bike|cycling|row|rowing|swim|ruck|backpack carry)$/i.test(String(name || '').trim()); }

function parseWeek(program, weekNumber) {
  const re = new RegExp(`(START_WEEK${weekNumber}_TSV\\s*\\n)([\\s\\S]*?)(\\nEND_WEEK${weekNumber}_TSV)`, 'i');
  const match = String(program || '').match(re);
  if (!match) return null;
  const lines = match[2].split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return null;
  const header = lines[0].split('\t');
  const index = Object.fromEntries(header.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  if (!Number.isInteger(index.day) || !Number.isInteger(index.exercise)) return null;
  const rows = lines.slice(1).map((line) => line.split('\t'));
  if (rows.some((cells) => cells.length !== header.length)) return null;
  return { re, match, header, index, rows };
}

function makePushPressRow(parsed, day, weekNumber) {
  const cells = Array(parsed.header.length).fill('');
  cells[parsed.index.day] = day;
  cells[parsed.index.exercise] = 'Push Press';
  if (Number.isInteger(parsed.index.weight)) cells[parsed.index.weight] = 'RPE-selected load';
  if (Number.isInteger(parsed.index.sets)) cells[parsed.index.sets] = weekNumber === 4 ? '1' : '2';
  if (Number.isInteger(parsed.index.reps)) cells[parsed.index.reps] = '3';
  if (Number.isInteger(parsed.index.rest)) cells[parsed.index.rest] = '2-3 min';
  if (Number.isInteger(parsed.index['target rpe'])) cells[parsed.index['target rpe']] = weekNumber === 4 ? '6' : '6-7';
  if (Number.isInteger(parsed.index.notes)) {
    cells[parsed.index.notes] = weekNumber === 4
      ? 'Low-cost complementary vertical-press microdose. Keep it fast and easy in consolidation week; no grinders.'
      : 'Low-cost complementary vertical-press microdose. Crisp dip and drive; stop well before grinding so strict OHP and MMA recovery stay protected.';
  }
  if (Number.isInteger(parsed.index.results)) cells[parsed.index.results] = '';
  return cells;
}

function rowName(parsed, cells) { return String(cells[parsed.index.exercise] || '').trim(); }
function rowDay(parsed, cells) { return String(cells[parsed.index.day] || '').trim(); }

function chooseTargetDay(parsed) {
  const ohpDays = new Set(parsed.rows.filter((cells) => /^overhead press$/i.test(rowName(parsed, cells))).map((cells) => rowDay(parsed, cells)));
  const candidates = new Map();
  parsed.rows.forEach((cells, i) => {
    const exercise = rowName(parsed, cells);
    const day = rowDay(parsed, cells);
    if (!day || !exercise || isWarmup(exercise) || isRunLike(exercise)) return;
    if (!candidates.has(day)) candidates.set(day, { day, rows: 0, insertAfter: i + 1, hasPrimaryAnchor: false });
    const entry = candidates.get(day);
    entry.rows += 1;
    entry.insertAfter = i + 1;
    if (/^(?:back squat|one-arm pull-up)$/i.test(exercise)) entry.hasPrimaryAnchor = true;
  });

  const ranked = [...candidates.values()].filter((x) => !ohpDays.has(x.day));
  if (!ranked.length) return [...candidates.values()][0] || null;
  ranked.sort((a, b) => Number(b.hasPrimaryAnchor) - Number(a.hasPrimaryAnchor) || a.rows - b.rows);
  return ranked[0];
}

function rewriteWeek(program, parsed) {
  const inner = [parsed.header.join('\t'), ...parsed.rows.map((cells) => cells.join('\t'))].join('\n');
  return program.replace(parsed.re, parsed.match[1] + inner + parsed.match[3]);
}

// Top ramp step implied by rampText for a given work load, so the warm-up row's
// own load range can be kept consistent with the ramp it prescribes.
function rampTopStepKg(heldWeight) {
  const ramp = rampText('Overhead Press', heldWeight);
  const steps = [...String(ramp).matchAll(/(\d+(?:\.\d+)?)\s*kg\s*x/gi)].map((m) => Number(m[1])).filter(Number.isFinite);
  return steps.length ? Math.max(...steps) : null;
}

function syncHeldPressCues(program, weekNumber, exerciseName, heldWeight) {
  const parsed = parseWeek(program, weekNumber);
  if (!parsed || !heldWeight) return { program, changed: false };
  const target = parsed.rows.find((cells) => rowName(parsed, cells).toLowerCase() === exerciseName.toLowerCase());
  if (!target) return { program, changed: false };
  const day = rowDay(parsed, target);
  let changed = false;

  if (Number.isInteger(parsed.index.notes) && /^overhead press$/i.test(exerciseName)) {
    const desired = `Hold the Week 1 strict-press dose at ${heldWeight} in this build week; progress rep quality and bar speed, not load. No layback or grindy lockouts.`;
    if (target[parsed.index.notes] !== desired) {
      target[parsed.index.notes] = desired;
      changed = true;
    }
  }

  if (/^overhead press$/i.test(exerciseName) && Number.isInteger(parsed.index.notes)) {
    // Regenerate the whole ramp sentence from the load actually prescribed on the
    // work row, rather than string-patching only the trailing target. The previous
    // patch-in-place approach used `[^.]*?`, which cannot cross the decimal point
    // in a 2.5 kg ramp step ("27.5 kg x 5"), so it silently no-opped on every real
    // program and left both the intermediate steps and the target stale.
    const freshRamp = rampText('Overhead Press', heldWeight);
    for (const cells of parsed.rows) {
      if (rowDay(parsed, cells) !== day || !isWarmup(rowName(parsed, cells))) continue;
      const before = String(cells[parsed.index.notes] || '');
      let after = before;
      if (freshRamp) {
        after = after.replace(/Ramp Overhead Press:[\s\S]*?work sets\./i, freshRamp);
      }
      if (after !== before) {
        cells[parsed.index.notes] = after;
        changed = true;
      }
      // The warm-up row's own load cell ("20-57.5 kg ramp") is model-authored and
      // was also derived from the superseded work load. Cap its top at the ramp's
      // real top step so the row cannot advertise a heavier ramp than the work set.
      if (Number.isInteger(parsed.index.weight)) {
        const topStep = rampTopStepKg(heldWeight);
        const weightBefore = String(cells[parsed.index.weight] || '');
        if (topStep != null) {
          const weightAfter = weightBefore.replace(
            /^(\s*\d+(?:\.\d+)?\s*-\s*)\d+(?:\.\d+)?(\s*kg\s*ramp\s*)$/i,
            `$1${topStep}$2`,
          );
          if (weightAfter !== weightBefore) {
            cells[parsed.index.weight] = weightAfter;
            changed = true;
          }
        }
      }
    }
  }

  return { program: changed ? rewriteWeek(program, parsed) : program, changed };
}

function syncHighConcurrencyNarrative(program) {
  return String(program || '')
    .replace(/with OHP progressed at a recoverable dose/gi, 'with OHP held at a recoverable build-week dose so primary goals and MMA recovery stay protected')
    // The build-week hold is deliberate, so the intro must not advertise the
    // strict press as progressing in load while the work rows hold Week 1's dose.
    .replace(/\bstrict Overhead Press progressing\b/gi, 'strict Overhead Press held at a recoverable build-week dose')
    .replace(/\bstrict OHP progressing\b/gi, 'strict OHP held at a recoverable build-week dose')
    .replace(/The long run progresses by (?:a )?small distance (?:bumps|increase)[^.]*\./gi, 'The long run may stay at the current tolerated dose when primary-goal progress and MMA recovery take priority.');
}

// Secondary OHP is deliberately held stable in build weeks for a high-concurrency
// athlete whose primary goals are elsewhere. This is not a generic OHP rule. It is
// a deterministic convergence rule for the frozen AH-01 hierarchy: the model may
// not keep solving a recovery-overload rejection by re-progressing the secondary
// press family on every repair attempt. Weeks 2-3 copy the actual Week-1 pressing
// dose; Week 4 may remain lower for consolidation and is never increased here.
function stabilizeSecondaryPressDose(program, intake = {}) {
  if (!isHighConcurrencyHybrid(intake) || !/(?:overhead\s*press|\bohp\b)/i.test(secondaryText(intake))) {
    return { program, repairs: [] };
  }

  let candidate = String(program || '');
  const baseline = parseWeek(candidate, 1);
  if (!baseline) return { program: candidate, repairs: [] };

  const baselineByName = new Map();
  for (const cells of baseline.rows) {
    const name = rowName(baseline, cells);
    if (/^(?:overhead press|push press)$/i.test(name)) baselineByName.set(name.toLowerCase(), cells);
  }
  if (!baselineByName.size) return { program: candidate, repairs: [] };

  const repairs = [];
  for (const week of [2, 3]) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    let changed = false;
    const changedExercises = new Set();
    for (const cells of parsed.rows) {
      const name = rowName(parsed, cells);
      const base = baselineByName.get(name.toLowerCase());
      if (!base) continue;
      const keys = ['weight', 'sets', 'reps', 'rest', 'target rpe'];
      let rowChanged = false;
      for (const key of keys) {
        const dst = parsed.index[key];
        const src = baseline.index[key];
        if (!Number.isInteger(dst) || !Number.isInteger(src)) continue;
        if (cells[dst] !== base[src]) {
          cells[dst] = base[src];
          changed = true;
          rowChanged = true;
        }
      }
      if (rowChanged) changedExercises.add(name);
    }
    if (changed) candidate = rewriteWeek(candidate, parsed);

    for (const name of baselineByName.keys()) {
      const baselineCells = baselineByName.get(name);
      const heldWeight = Number.isInteger(baseline.index.weight) ? baselineCells[baseline.index.weight] : '';
      const synced = syncHeldPressCues(candidate, week, name, heldWeight);
      candidate = synced.program;
      if (synced.changed) changedExercises.add(name);
    }

    for (const name of changedExercises) {
      repairs.push({ week, exercise: name, action: 'hold_secondary_press_at_week1_dose_and_sync_cues' });
    }
  }

  candidate = syncHighConcurrencyNarrative(candidate);
  return { program: candidate, repairs };
}

// The Advanced Hybrid contract requires one strict OHP exposure plus one small
// complementary vertical-press exposure. Repeated live failures showed the model
// can preserve the important strict OHP work yet omit only Push Press on every
// repair attempt. That omission is safe to converge deterministically because the
// authored role is explicitly a low-cost support exposure. This repair NEVER
// invents strict OHP, never changes benchmark-anchored OHP loading, and never adds
// a new training day. If strict OHP is missing, production still fails closed.
export function normalizeAdvancedHybridOHPComplement(program, intake = {}) {
  const original = String(program || '');
  if (!isHighConcurrencyHybrid(intake) || !/(?:overhead\s*press|\bohp\b)/i.test(secondaryText(intake))) {
    return { program: original, repaired: false, repairs: [] };
  }

  let candidate = original;
  const repairs = [];
  for (let week = 1; week <= 4; week++) {
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    const workNames = parsed.rows.map((cells) => rowName(parsed, cells)).filter((name) => name && !isWarmup(name));
    const hasOHP = workNames.some((name) => /^overhead press$/i.test(name));
    const hasPushPress = workNames.some((name) => /^push press$/i.test(name));
    if (!hasOHP || hasPushPress) continue;

    const target = chooseTargetDay(parsed);
    if (!target) continue;
    const pushRow = makePushPressRow(parsed, target.day, week);
    parsed.rows.splice(target.insertAfter, 0, pushRow);
    candidate = rewriteWeek(candidate, parsed);
    repairs.push({ week, day: target.day, exercise: 'Push Press', sets: week === 4 ? 1 : 2 });
  }

  const stabilized = stabilizeSecondaryPressDose(candidate, intake);
  candidate = stabilized.program;
  repairs.push(...stabilized.repairs);

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
