import { isHighConcurrencyHybrid } from './advanced_hybrid_concurrency.js';
import { validateAdvancedHybridCoachingSpecV1 } from './coaching_spec_v1_quality.js';
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
// Only the hierarchy rule speaks to whether the press must be held. Any other
// Coaching Specification failure is another repair's business, and reading one
// as "the hierarchy demands a hold" made this hold a block whose real complaint
// was COACH_SPEC_V1_AH_UNCONDITIONAL_MAJOR_LIFT_PROGRESSION.
const HIERARCHY_CODE = 'COACH_SPEC_V1_AH_RECOVERY_HIERARCHY_OVERLOADED';

function hierarchyAccepts(program, intake) {
  try { return validateAdvancedHybridCoachingSpecV1(program, intake)?.ok === true; }
  catch (err) { return err?.code !== HIERARCHY_CODE; }
}


function stabilizeSecondaryPressDose(program, intake = {}) {
  if (!isHighConcurrencyHybrid(intake) || !/(?:overhead\s*press|\bohp\b)/i.test(secondaryText(intake))) {
    return { program, repairs: [] };
  }

  let candidate = String(program || '');

  // The hold exists to converge AH-01, not as a coaching preference. AH-01 only
  // refuses when four or more families materially progress, so when the block
  // already satisfies the hierarchy the hold buys nothing and costs the athlete
  // a named goal.
  //
  // The coach on the delivered Advanced Hybrid: "The secondary goal is 100 kg
  // OHP, with current performance 80x4, yet the only strict OHP exposure is
  // 65 kg for three weeks... Do not leave a named 100 kg strength goal
  // essentially flat for three weeks." That block progresses squat and OAP and
  // holds the marathon -- three families with the press moving, which AH-01
  // accepts. It was flattened anyway, by this repair, for nothing.
  //
  // The frozen validator is the arbiter rather than a second copy of its rule.
  if (hierarchyAccepts(candidate, intake)) return { program: candidate, repairs: [] };

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
      // Keyed by the same lowercased name the baseline map uses. Adding the
      // display name here and the lowercased name below counted every held
      // press twice, so the repair log reported double the repairs actually made.
      if (rowChanged) changedExercises.add(name.toLowerCase());
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

// The coach on the delivered block: "The secondary goal is 100 kg OHP, with
// current performance 80x4, yet the only strict OHP exposure is 65 kg, 65, 65,
// 67.5... I don't want more total pressing. I want the existing pressing budget
// allocated better. Make strict OHP the main secondary press, with Push Press
// optional/secondary... Do not leave a named 100 kg strength goal essentially
// flat for three weeks."
//
// So where the hierarchy does not require the press to be held, a named press
// goal that sits at one load through every build week is stepped. This adds no
// pressing volume -- the sets, reps and days are untouched, and only the load on
// the existing strict exposure moves.
const PRESS_STEP_KG = 2.5;

function pressGoalTargetKg(intake) {
  const m = secondaryText(intake).match(/(\d+(?:\.\d+)?)\s*kg[^|]{0,20}overhead press|overhead press[^|]{0,20}?(\d+(?:\.\d+)?)\s*kg/i);
  return m ? Number(m[1] ?? m[2]) : null;
}

function demonstratedPressKg(intake) {
  const m = String(intake?.current_numbers || '').match(/overhead press[^\n]{0,20}?(\d+(?:\.\d+)?)\s*kg/i);
  return m ? Number(m[1]) : null;
}

const kgOf = (raw) => {
  const m = String(raw || '').match(/^\s*(\d+(?:\.\d+)?)\s*kg\s*$/i);
  return m ? Number(m[1]) : null;
};

// The press that carries the goal, not whichever one is typed first.
//
// A block can run two strict OHP exposures in a week, and the delivered Advanced
// Hybrid does: a lighter Monday row beside the Sunday row that is the actual
// progression. Taking the first match read 62.5 in Week 1 against 67.5 in Weeks 2
// and 3, so the loads looked like they were already moving and the step-up bailed
// -- leaving the Sunday press at 67.5 / 67.5 / 67.5 and bumping to 70 in the
// consolidation week, which is the exact shape the coach charged: "Do not leave a
// named 100 kg strength goal essentially flat for three weeks."
//
// The lead is the heaviest loaded row, with total reps as the tie-break. Same
// rule coaching_progression_gpp.js already uses to decide whether a family moved.
// A progression belongs to ONE exposure, tracked across the block.
//
// Computing the lead per week independently picked Sunday in Week 1 (67.5 for
// 4x4) and Monday in Weeks 2 and 3 (both rows 67.5 for 3x4, tie broken by
// position), so the step-up moved Monday and left the Sunday press flat at 67.5
// -- progressing a row nobody was tracking while the one the goal rides on stood
// still. The lead day is fixed from Week 1 and every later week reads that day.
function leadPressDay(program) {
  const parsed = parseWeek(program, 1);
  if (!parsed) return null;
  const lead = strictPressRow(parsed);
  return lead ? rowDay(parsed, lead.cells) : null;
}

function strictPressRow(parsed, onDay = null) {
  let candidates = parsed.rows
    .map((cells, i) => ({ i, cells }))
    .filter(({ cells }) => /^overhead press$/i.test(rowName(parsed, cells)));
  if (onDay) {
    const sameDay = candidates.filter(({ cells }) => rowDay(parsed, cells) === onDay);
    if (sameDay.length) candidates = sameDay;
  }
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const load = ({ cells }) => (Number.isInteger(parsed.index.weight) ? kgOf(cells[parsed.index.weight]) : null);
  const volume = ({ cells }) => {
    const n = (k) => Number(String(k ?? '').match(/\d+/)?.[0] || 0);
    return n(Number.isInteger(parsed.index.sets) ? cells[parsed.index.sets] : 0)
      * n(Number.isInteger(parsed.index.reps) ? cells[parsed.index.reps] : 0);
  };
  const loaded = candidates.filter((c) => Number.isFinite(load(c)));
  const pool = loaded.length ? loaded : candidates;
  return pool.reduce((best, c) => {
    const a = load(c); const b = load(best);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a > b ? c : best;
    return volume(c) > volume(best) ? c : best;
  }, pool[0]);
}

function stepPress(program, base, ceiling, probe = false) {
  let candidate = String(program || '');
  const onDay = leadPressDay(candidate);
  for (const week of [2, 3]) {
    const next = base + PRESS_STEP_KG * (week - 1);
    if (!probe && next > ceiling) continue;
    const parsed = parseWeek(candidate, week);
    if (!parsed || !Number.isInteger(parsed.index.weight)) continue;
    const row = strictPressRow(parsed, onDay);
    if (!row) continue;
    row.cells[parsed.index.weight] = `${next} kg`;
    candidate = rewriteWeek(candidate, parsed);
  }
  return candidate;
}

// Week 4 consolidates, and the complementary press consolidates with it.
//
// makePushPressRow already writes 1 set in Week 4 and 2 in the build weeks, so
// that is this module's own statement of the right dose. A block that arrived
// with its own Push Press never went through that path, and the delivered
// Advanced Hybrid carried 2 x 3 in all four weeks -- identical through a
// consolidation week the rest of the block deloads. The grader charges it as a
// flat secondary exposure, and the coach asked for Push Press to be the
// optional press rather than a standing one.
//
// Only the consolidation week moves, and only downward: this never adds a set.
function deloadComplementaryPress(program) {
  let candidate = String(program || '');
  const build = parseWeek(candidate, 2) || parseWeek(candidate, 1);
  const week4 = parseWeek(candidate, 4);
  if (!build || !week4 || !Number.isInteger(week4.index.sets)) return { program: candidate, repairs: [] };

  const buildRow = build.rows.find((c) => /^push press$/i.test(rowName(build, c)));
  const lateRow = week4.rows.find((c) => /^push press$/i.test(rowName(week4, c)));
  if (!buildRow || !lateRow) return { program: candidate, repairs: [] };

  const buildSets = Number(String(buildRow[build.index.sets] || '').match(/\d+/)?.[0]);
  const lateSets = Number(String(lateRow[week4.index.sets] || '').match(/\d+/)?.[0]);
  if (!Number.isFinite(buildSets) || !Number.isFinite(lateSets)) return { program: candidate, repairs: [] };
  if (lateSets < buildSets || buildSets < 2) return { program: candidate, repairs: [] };

  lateRow[week4.index.sets] = String(buildSets - 1);
  if (Number.isInteger(week4.index.notes)) {
    lateRow[week4.index.notes] = 'Low-cost complementary vertical-press microdose. Keep it fast and easy in consolidation week; one set is the whole job here.';
  }
  candidate = rewriteWeek(candidate, week4);
  return { program: candidate, repairs: [{ week: 4, exercise: 'Push Press', action: 'deload_complementary_press', from: `${buildSets} sets`, to: `${buildSets - 1} sets` }] };
}

function progressNamedSecondaryPress(program, intake = {}) {
  const target = pressGoalTargetKg(intake);
  if (!target) return { program, repairs: [] };

  const onDay = leadPressDay(program);
  const loads = [];
  for (const week of [1, 2, 3]) {
    const parsed = parseWeek(program, week);
    if (!parsed || !Number.isInteger(parsed.index.weight)) return { program, repairs: [] };
    const row = strictPressRow(parsed, onDay);
    if (!row) return { program, repairs: [] };
    const kg = kgOf(row.cells[parsed.index.weight]);
    if (kg == null) return { program, repairs: [] };
    loads.push(kg);
  }
  // Only a genuinely flat build block is stepped. A press already moving, or one
  // whose loads are benchmark-anchored text rather than a number, is left alone.
  if (new Set(loads).size !== 1) return { program, repairs: [] };


  const base = loads[0];
  // Never past what the athlete has already demonstrated, and never past the goal.
  const ceiling = Math.min(target, demonstratedPressKg(intake) ?? target);

  // Ask the hierarchy the counterfactual before touching anything: if this press
  // progressed at all, would AH-01 object? A press the hold flattened looks
  // exactly like a press that was never progressed, so without this the two
  // repairs trade blows for ever -- the hold flattens it, the step puts it back.
  //
  // The counterfactual ignores the demonstrated-ability ceiling on purpose. A
  // step capped to a single week does not always restore the fourth progressing
  // family, so asking "does the block AS REPAIRED still pass" let a partial step
  // through and the oscillation resumed. The question that has to be asked is
  // whether the press is allowed to move, not whether this particular move slips
  // under the detector.
  if (!hierarchyAccepts(stepPress(program, base, ceiling, true), intake)) return { program, repairs: [] };
  let candidate = String(program || '');
  const repairs = [];

  for (const week of [2, 3]) {
    const next = base + PRESS_STEP_KG * (week - 1);
    if (next > ceiling) continue;
    const parsed = parseWeek(candidate, week);
    if (!parsed) continue;
    const row = strictPressRow(parsed, onDay);
    if (!row) continue;
    const weight = `${next} kg`;
    row.cells[parsed.index.weight] = weight;
    if (Number.isInteger(parsed.index.notes)) {
      row.cells[parsed.index.notes] = `Take the planned ${PRESS_STEP_KG} kg step only if both Week ${week - 1} sets were crisp at or under RPE 8; otherwise repeat the last successful load. Same two sets either way -- the load moves, the pressing volume does not.`;
    }
    candidate = rewriteWeek(candidate, parsed);
    // The ramp and the warm-up row's own load cell were derived from the old
    // work load, and a stale ramp is how this exact row broke before.
    const synced = syncHeldPressCues(candidate, week, 'Overhead Press', weight);
    candidate = synced.program;
    const reparsed = parseWeek(candidate, week);
    const restored = reparsed && strictPressRow(reparsed, onDay);
    if (restored && Number.isInteger(reparsed.index.notes)) {
      restored.cells[reparsed.index.notes] = `Take the planned ${PRESS_STEP_KG} kg step only if both Week ${week - 1} sets were crisp at or under RPE 8; otherwise repeat the last successful load. Same two sets either way -- the load moves, the pressing volume does not.`;
      candidate = rewriteWeek(candidate, reparsed);
    }
    repairs.push({ week, exercise: 'Overhead Press', from: `${base} kg`, to: weight });
  }

  // The hierarchy is the arbiter here too, and it is the whole oscillation guard.
  // A press the hold flattened looks exactly like a press that never progressed,
  // so the step would put it straight back and the two repairs would trade blows
  // for ever -- except that restoring it restores the fourth progressing family,
  // which is precisely what AH-01 refuses. Stepping a genuinely held press always
  // fails this check, so the held block is a fixed point without needing to
  // recognise its own note.
  if (!repairs.length || !hierarchyAccepts(candidate, intake)) return { program, repairs: [] };
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

  // Only where the hierarchy did not call for a hold. A block that needed one
  // must not have the press stepped straight back up again.
  if (!stabilized.repairs.length) {
    const progressed = progressNamedSecondaryPress(candidate, intake);
    candidate = progressed.program;
    repairs.push(...progressed.repairs);
  }

  const deloaded = deloadComplementaryPress(candidate);
  candidate = deloaded.program;
  repairs.push(...deloaded.repairs);

  return { program: candidate, repaired: repairs.length > 0, repairs };
}
