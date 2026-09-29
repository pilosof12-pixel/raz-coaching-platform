import { RetriableValidationError } from './exercise_dictionary.js';
import { weekdayKey } from './weekday.js';
import { parseWeek as parseWeekRows } from './v34_workload_accounting.js';
import { isHighConcurrencyHybrid, currentRunBaseline, marathonGoalTier } from './advanced_hybrid_concurrency.js';

// Exposure matchers for the Advanced Hybrid rules. Each rule below asks whether
// a KIND of work is present, so these accept every canonical name in the
// exercise dictionary that delivers that kind, and nothing that does not.
//
// Strict one-arm pulling is unassisted full-range work; a weighted or chin
// variant is still strict. Eccentric, isometric and partial work is explicitly
// NOT strict -- the rule exists to stop an athlete who already performs strict
// reps being regressed to prerequisite-only work -- but it does count as the
// second assistance/volume exposure the rule also requires.
const STRICT_OAP = /^(?:weighted\s+)?one[- ]arm\s+(?:pull|chin)-?up$/i;
const ASSISTED_OAP = /^(?:band[- ])?assisted\s+one[- ]arm\s+(?:pull|chin)-?up(?:\s+eccentric)?$/i;
const OAP_SUPPORT = /^one[- ]arm\s+(?:pull|chin)-?up\s+(?:eccentric|isometric|partial)$/i;

// A strict overhead press goal is a barbell goal; a dumbbell press is a
// different exposure and does not satisfy it.
const STRICT_OHP = /^(?:standing\s+)?(?:barbell\s+)?overhead press$/i;


function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function lower(v) { return String(v || '').toLowerCase(); }

function goalText(intake = {}, tier = 'all') {
  const groups = tier === 'primary' ? arr(intake.primary_goals)
    : tier === 'secondary' ? arr(intake.secondary_goals)
    : [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)];
  return groups.map(String).join(' | ').toLowerCase();
}

function parseWeeks(program) {
  const lines = String(program || '').split('\n');
  const weeks = new Map();
  let week = null;
  let header = null;
  for (const line of lines) {
    const start = line.match(/START_WEEK(\d+)_TSV/i);
    if (start) { week = Number(start[1]); weeks.set(week, []); header = null; continue; }
    if (/END_WEEK\d+_TSV/i.test(line)) { week = null; header = null; continue; }
    if (!week || !line.trim()) continue;
    if (!header) {
      header = line.split('\t').map((x) => lower(x).trim());
      continue;
    }
    const cells = line.split('\t');
    const get = (...names) => {
      for (const name of names) {
        const i = header.indexOf(name);
        if (i >= 0) return String(cells[i] || '').trim();
      }
      return '';
    };
    weeks.get(week).push({
      // The weekday the cell names, not the text of the cell: "Monday" and
      // "Day -4 (Mon)" are both Monday, and comparing raw text against the
      // intake's "Mon" made the calendar rule fire on a calendar that matched.
      day: weekdayKey(get('day')) || lower(get('day')),
      exercise: get('exercise'),
      load: get('weight', 'load / target', 'load/target'),
      sets: get('sets'),
      reps: get('reps', 'reps / duration', 'reps/duration'),
      effort: get('target rpe', 'effort'),
      notes: get('notes', 'coaching note'),
    });
  }
  return weeks;
}

function isWarmup(row) { return /\[warmup\]|warm[ -]?up/i.test(row.exercise); }
// A run is still a run when the model qualifies the name. Live run #149 refused
// an Advanced Hybrid block four times for "containing no running at all" while
// it carried an easy 16/18/20/14 km "Zone-2 Run" every week, because this
// matched the exact strings "Run" and "Running" and nothing else. The gate was
// blind to the name, not to the work, and the athlete's marathon support run was
// there the whole time.
const RUN_NAME = /(?:^|\s)(?:run|running)$/i;
function isRunName(name) { return RUN_NAME.test(String(name || '').trim()); }
function isRun(row) { return isRunName(row.exercise); }
function numericSets(row) { const n = Number(String(row.sets).match(/\d+(?:\.\d+)?/)?.[0] || 0); return Number.isFinite(n) ? n : 0; }
function numericKm(row) {
  const s = `${row.load} ${row.reps} ${row.notes}`;
  const m = s.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : null;
}
function numericRpe(row) {
  const m = String(row.effort || '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function hasNumericLoad(row) { return /\b\d+(?:\.\d+)?\s*kg\b/i.test(row.load) || /\b\d+(?:\.\d+)?\s*%\b/.test(row.load); }

function benchmarked(intake, nameRe) {
  const src = `${intake.current_numbers || ''}\n${arr(intake.performance_markers).join('\n')}`;
  return nameRe.test(src) && /\d+(?:\.\d+)?\s*kg/i.test(src);
}

function warmupHasRamp(rows, day) {
  const text = rows.filter((r) => r.day === day && isWarmup(r)).map((r) => `${r.load} ${r.reps} ${r.notes}`).join(' | ');
  const kgAnchors = text.match(/(?:\b\d+(?:\.\d+)?\s*kg\b[^|;]{0,18}(?:x|×)\s*\d+)|(?:\b\d+(?:\.\d+)?\s*kg\b)/gi) || [];
  const pctAnchors = text.match(/\b\d+(?:\.\d+)?\s*%\b/g) || [];
  const barAnchor = /(?:empty\s+bar|barbell\s*(?:x|×)\s*\d+|bar\s*(?:x|×)\s*\d+)/i.test(text);
  return kgAnchors.length >= 3 || pctAnchors.length >= 3 || (barAnchor && kgAnchors.length >= 2);
}

function fail(code, amendment, details = {}) {
  throw new RetriableValidationError(code, amendment, details);
}

export function validateAdvancedHybridQualitySemantic(program, intake = {}) {
  if (!isHighConcurrencyHybrid(intake)) return { ok: true, skipped: true };

  const weeks = parseWeeks(program);
  if (weeks.size < 4) return { ok: true, skipped: false };
  const primary = goalText(intake, 'primary');
  const allGoals = goalText(intake);
  const fixedDays = arr(intake.available_gym_days).map((d) => weekdayKey(d) || lower(d)).filter(Boolean).sort();

  for (const [week, rows] of weeks) {
    const work = rows.filter((r) => !isWarmup(r));
    const strengthDays = [...new Set(work.filter((r) => !isRun(r) && !/zone\s*2|bike|row|ruck|swim/i.test(r.exercise)).map((r) => r.day).filter(Boolean))].sort();
    if (fixedDays.length && JSON.stringify(strengthDays) !== JSON.stringify(fixedDays)) {
      fail('ADVANCED_HYBRID_CALENDAR_DRIFT', `Week ${week} must use the athlete's exact fixed strength days: ${fixedDays.join(', ')}. Do not invent or omit lifting days.`, { week, strengthDays, fixedDays });
    }

    if (/squat/.test(primary)) {
      const squats = work.filter((r) => /^back squat$/i.test(r.exercise));
      if (squats.length < 2) fail('ADVANCED_HYBRID_SQUAT_SPECIFICITY', `Week ${week} needs two direct Back Squat exposures for a primary squat goal: one compact heavy exposure and one lower-cost volume/specificity exposure. Trim accessories before removing squat specificity.`, { week });
      if (benchmarked(intake, /back squat/i) && squats.some((r) => !hasNumericLoad(r))) {
        fail('ADVANCED_HYBRID_BENCHMARK_LOADING', `Week ${week} has a supplied Back Squat benchmark, so direct Back Squat work must use benchmark-anchored kg or percentage prescriptions rather than generic RPE-selected loading.`, { week, exercise: 'Back Squat' });
      }
      for (const row of squats) if (!warmupHasRamp(rows, row.day)) {
        fail('HEAVY_STRENGTH_RAMP_MISSING', `Week ${week} ${row.day || 'strength day'} Back Squat needs a real progressive ramp before work sets. Include an empty-bar/general prep plus at least 2-3 progressively heavier load anchors with reps; duplicated generic [WARMUP] rows do not count.`, { week, day: row.day, exercise: 'Back Squat' });
      }
    }

    if (/one[- ]?arm\s*(?:pull|chin)|\boap\b/.test(primary)) {
      // These rules are about exposure types, not spellings. Matching a single
      // exact display name rejected programs that satisfied the coaching intent
      // with another name the exercise dictionary itself sanctions -- a
      // Weighted One-Arm Pull-up is strict work, a Band-Assisted One-Arm Pull-Up
      // is an assistance exposure -- and cost four regeneration attempts because
      // no rewording of the same program could ever satisfy the check.
      const hasStrict = work.some((r) => STRICT_OAP.test(r.exercise));
      const hasAssisted = work.some((r) => ASSISTED_OAP.test(r.exercise) || OAP_SUPPORT.test(r.exercise));
      if (!hasStrict || !hasAssisted) {
        // Name what the week actually contains. This rule cost three live runs,
        // and twice the fix was a guess at what the model had written because
        // the failure said only that something was missing. A build that fails
        // should say what it saw.
        const pulling = work
          .filter((r) => /pull-?up|chin-?up|row|lat|hang/i.test(r.exercise))
          .map((r) => `${r.day || '?'}:${r.exercise}`);
        fail('ADVANCED_HYBRID_OAP_SPECIFICITY',
          `Week ${week} must protect both demonstrated strict One-Arm Pull-up skill-strength and a second assistance/volume exposure. Do not regress an athlete already performing strict OAPs to prerequisite-only work. Missing: ${[!hasStrict && 'strict unilateral exposure', !hasAssisted && 'assistance/volume exposure'].filter(Boolean).join(' and ')}. Pulling work found this week: ${pulling.length ? pulling.join(', ') : 'none'}.`,
          { week, hasStrict, hasAssisted, pulling });
      }
    }

    if (/overhead\s*press|\bohp\b/.test(allGoals)) {
      const ohp = work.filter((r) => STRICT_OHP.test(r.exercise));
      const hasPushPress = work.some((r) => /^push press$/i.test(r.exercise));
      if (!ohp.length || !hasPushPress) fail('ADVANCED_HYBRID_OHP_ARCHITECTURE', `Week ${week} needs one direct strict Overhead Press exposure plus one low-cost complementary vertical press exposure such as Push Press when recovery allows.`, { week });
      if (benchmarked(intake, /overhead press/i) && ohp.some((r) => !hasNumericLoad(r))) {
        fail('ADVANCED_HYBRID_BENCHMARK_LOADING', `Week ${week} has a supplied Overhead Press benchmark, so strict OHP work must use benchmark-anchored kg or percentage prescriptions rather than generic RPE-selected loading.`, { week, exercise: 'Overhead Press' });
      }
      for (const row of ohp) if (!warmupHasRamp(rows, row.day)) {
        fail('HEAVY_STRENGTH_RAMP_MISSING', `Week ${week} ${row.day || 'strength day'} Overhead Press needs progressive load ramp sets before work sets, not repeated generic warm-up rows.`, { week, day: row.day, exercise: 'Overhead Press' });
      }
    }

    const weightedPull = work.filter((r) => /^weighted (?:chin|pull)-?up$/i.test(r.exercise));
    if (benchmarked(intake, /weighted (?:chin|pull)-?up/i) && weightedPull.some((r) => !hasNumericLoad(r))) {
      fail('ADVANCED_HYBRID_BENCHMARK_LOADING', `Week ${week} has a supplied weighted chin/pull-up benchmark, so bilateral support work must stay benchmark-anchored instead of reverting to generic RPE-selected loading.`, { week, exercise: 'Weighted Chin/Pull-up' });
    }

    if (marathonGoalTier(intake) === 'secondary') {
      const runs = work.filter(isRun);
      const easy = /easy|zone\s*2|conversational/i.test(`${runs[0]?.load || ''} ${runs[0]?.notes || ''}`);
      if (runs.length !== 1 || !easy) {
        // Say which of the three states this is, and say what NOT to do.
        //
        // The old amendment ended "Do not add extra hard endurance work" whatever
        // had gone wrong, including when the week contained no running at all.
        // Live run #148 shows the cost: attempt 1 failed this rule, the model read
        // the instruction as "take the running out", and attempt 2 came back with
        // zero runs -- failing this rule again plus NAMED_GOAL_DIRECT_EXPOSURE_MISSING,
        // TARGET_MODALITY_EXPOSURE_REDUCED, EVENT_PROGRESSING_SESSION_MISSING and
        // SPORT_MODALITY_SPECIFICITY_MISSING. Three model calls, 381 seconds, and
        // the second one was spent obeying an instruction that did not fit the
        // defect. The rule is unchanged; only its repair instruction is.
        const amendment = runs.length === 0
          ? `Week ${week} contains no running at all. The marathon is a named secondary goal and the athlete already runs about once a week, so removing running is not the fix and will fail the named-goal, target-modality and event-progression gates as well. Add exactly one substantive easy, conversational run this week and change nothing else.`
          : runs.length > 1
            ? `Week ${week} contains ${runs.length} runs. Keep exactly one substantive easy, conversational marathon-support run and remove the additional endurance work, which is what makes the marathon compete with the primary strength and skill goals. Do not remove running altogether: one easy run must remain.`
            : `Week ${week} has its one run, but it is not prescribed as easy or conversational. Make that single run easy and conversational -- pace, effort and note -- so the marathon stays secondary to the primary strength and skill goals. Do not delete the run and do not add a second one.`;
        fail('ADVANCED_HYBRID_MARATHON_SUBORDINATION', amendment, { week, runs: runs.length, easy });
      }
    }

    // Only actual programmed movement identity can create an extra hard-conditioning
    // exposure. Coaching prose may legitimately say things like "without intervals"
    // or "no sprints" and must never trigger a false release failure.
    if (work.some((r) => /interval|sprint|burpee|emom|metcon|finisher/i.test(String(r.exercise || '')))) {
      fail('ADVANCED_HYBRID_EXTRA_HARD_CONDITIONING', `Week ${week} adds hard conditioning despite five MMA sessions. Remove optional intervals, sprints, finishers or metcons unless explicitly required by a higher-priority goal.`, { week });
    }
  }

  const w3 = weeks.get(3) || [];
  const w4 = weeks.get(4) || [];
  const strengthSets = (rows) => rows.filter((r) => !isWarmup(r) && !isRun(r)).reduce((sum, r) => sum + numericSets(r), 0);
  const w3Sets = strengthSets(w3), w4Sets = strengthSets(w4);
  const w3Rpe = Math.max(0, ...w3.map(numericRpe).filter((n) => n != null));
  const w4Rpe = Math.max(0, ...w4.map(numericRpe).filter((n) => n != null));
  const w3Run = (w3.filter(isRun).map(numericKm).find((n) => n != null));
  const w4Run = (w4.filter(isRun).map(numericKm).find((n) => n != null));
  if (!(w4Sets < w3Sets) || w4Rpe > w3Rpe || (w3Run != null && w4Run != null && w4Run >= w3Run)) {
    const setTarget = Math.max(1, Math.floor(w3Sets * 0.85));
    const runTarget = w3Run == null ? null : Math.max(1, Math.floor(w3Run * 0.9));
    const runInstruction = w3Run != null
      ? ` Week 3 long run is ${w3Run} km and Week 4 is ${w4Run ?? 'not numerically stated'} km; make Week 4 strictly lower than ${w3Run} km, preferably about ${runTarget} km.`
      : '';
    fail(
      'ADVANCED_HYBRID_WEEK4_NOT_CONSOLIDATING',
      `NUMERIC WEEK 4 REPAIR REQUIRED. Week 3 currently has ${w3Sets} total strength work sets and Week 4 has ${w4Sets}. Rewrite Week 4 so total strength work sets are strictly below ${w3Sets}; target about ${setTarget} or fewer while preserving the required exercise architecture. Week 3 peak prescribed RPE is ${w3Rpe} and Week 4 peak is ${w4Rpe}; Week 4 must not exceed RPE ${w3Rpe}.${runInstruction} Keep Weeks 1-3 unchanged. Reduce sets/accessory volume and the secondary endurance dose; do not compensate by adding reps, harder RPE, extra exercises, intervals or conditioning elsewhere. A Week 4 label or prose claim does not count unless these numeric conditions are actually true.`,
      { w3Sets, w4Sets, w3Rpe, w4Rpe, w3Run, w4Run, setTarget, runTarget },
    );
  }

  if (/one[- ]?arm\s*(?:pull|chin)|\boap\b/.test(primary)) {
    const strictOapSets = (rows) => rows
      .filter((r) => !isWarmup(r) && /^one-arm pull-up$/i.test(r.exercise))
      .reduce((sum, r) => sum + numericSets(r), 0);
    const w3OapSets = strictOapSets(w3);
    const w4OapSets = strictOapSets(w4);
    if (w3OapSets > 0 && w4OapSets > w3OapSets) {
      fail(
        'ADVANCED_HYBRID_WEEK4_OAP_VOLUME_INCREASED',
        `Week 4 is a consolidation week, but strict One-Arm Pull-up work increases from ${w3OapSets} sets in Week 3 to ${w4OapSets}. Preserve skill quality while holding or reducing direct strict OAP sets; do not call an increase in primary-skill volume a reduction merely because accessories decreased elsewhere. Keep the required assisted OAP exposure and reduce fatigue around it.`,
        { w3OapSets, w4OapSets },
      );
    }
  }

  const baseline = currentRunBaseline(intake);
  if (baseline.weekly_km) {
    const w1Run = (weeks.get(1) || []).filter(isRun).map(numericKm).find((n) => n != null);
    if (w1Run != null && w1Run > baseline.weekly_km) fail('ADVANCED_HYBRID_RUN_BASELINE_EXCEEDED', `Week 1 direct running must not exceed the demonstrated current weekly running volume of about ${baseline.weekly_km} km.`, { baseline: baseline.weekly_km, w1Run });
  }

  return { ok: true, skipped: false };
}

// --- repair ----------------------------------------------------------------
//
// Week 1 may not prescribe more direct running than the athlete demonstrably
// already does. The rule was right and had no answer, so a hybrid intake that
// tripped it spent four generations and produced nothing.
//
// The answer is the distance itself, and only the distance: the run keeps its
// place in the week, its day and its purpose, and comes down to what the
// athlete has actually run. Starting a block above someone's demonstrated
// volume is the first thing that breaks them.
export function repairRunBaseline(program, intake = {}) {
  if (!isHighConcurrencyHybrid(intake)) return String(program || '');
  const baseline = currentRunBaseline(intake);
  if (!baseline.weekly_km) return String(program || '');

  const parsed = parseWeekRows(program, 1);
  if (!parsed) return String(program || '');
  const cells = parsed.rows.map((c) => c.slice());
  let changed = false;
  parsed.rows.forEach((row, i) => {
    const name = String(row[parsed.exercise] || '').trim();
    if (!isRunName(name)) return;
    // The rule reads the distance out of load, reps AND notes, so capping one
    // cell leaves the flag standing on whichever of the other two carried it.
    const columns = [parsed.load, parsed.reps, parsed.notes].filter(Number.isInteger);
    let capped = false;
    for (const col of columns) {
      const raw = String(row[col] || '');
      const next = raw.replace(/\b(\d+(?:\.\d+)?)\s*km\b/ig,
        (whole, n) => (Number(n) > baseline.weekly_km ? `${baseline.weekly_km} km` : whole));
      if (next === raw) continue;
      cells[i][col] = next;
      capped = true;
    }
    if (!capped) return;
    if (Number.isInteger(parsed.notes)) {
      const note = String(cells[i][parsed.notes] || '').trim();
      const add = `Week 1 starts from what you already run, about ${baseline.weekly_km} km, and builds from there.`;
      if (!/starts from what you already run/.test(note)) cells[i][parsed.notes] = note ? `${note} ${add}` : add;
    }
    changed = true;
  });
  if (!changed) return String(program || '');
  const rebuilt = [parsed.header.join('\t'), ...cells.map((c) => c.join('\t'))].join('\n');
  return String(program || '').replace(parsed.re, `$1${rebuilt}$3`);
}

// While the marathon sits behind primary strength and skill goals, each week
// carries exactly one substantive easy run and no extra hard endurance. The
// rule said so and could not enforce it, so a hybrid week that drifted into two
// runs -- or one run nobody had called easy -- failed four times and produced
// nothing.
//
// Both halves have a mechanical answer. A run that is not described as easy is
// described as easy, because that is what a support run is. Extra runs are
// removed, which is precisely what "do not add extra hard endurance work"
// asks -- and never the last piece of work on a day, so no session is emptied
// to satisfy a wording rule.
const EASY_LANGUAGE = /easy|zone\s*2|conversational/i;
const SUPPORT_RUN_NOTE = 'Easy, conversational pace: this run supports the marathon while the strength and skill goals stay in front of it. If you cannot talk through it, it is too fast.';

// The day the run goes on: a day the athlete is not already in the gym, taking
// the lightest sport load among those left. Nothing is invented if there is no
// free day or no demonstrated running volume to copy.
function supportRunDay(intake = {}) {
  const gym = new Set(arr(intake.available_gym_days).map((d) => weekdayKey(d) || lower(d)).filter(Boolean));
  const intensity = new Map();
  for (const entry of arr(intake.sport_schedule)) {
    const day = weekdayKey(entry?.day) || lower(entry?.day);
    if (day) intensity.set(day, String(entry?.intensity || '').toLowerCase());
  }
  const cost = (day) => {
    const level = intensity.get(day);
    if (level === 'hard' || level === 'match') return 3;
    if (level === 'moderate') return 2;
    if (level) return 1;
    return 0;
  };
  const free = ['thu', 'wed', 'sat', 'sun', 'mon', 'tue', 'fri'].filter((d) => !gym.has(d));
  if (!free.length) return null;
  return free.slice().sort((a, b) => cost(a) - cost(b))[0];
}

function restoreSupportRun(program, parsed, week, intake) {
  const baseline = currentRunBaseline(intake);
  if (!baseline?.weekly_km) return null;
  const day = supportRunDay(intake);
  if (!day) return null;

  // Week 4 must stay below Week 3 for the consolidation check, and Weeks 1-3
  // sit at -- never above -- the demonstrated weekly volume.
  const km = week === 4
    ? Math.max(1, Math.round(baseline.weekly_km * 0.875 * 10) / 10)
    : baseline.weekly_km;

  const row = new Array(parsed.header.length).fill('');
  row[parsed.day] = day.charAt(0).toUpperCase() + day.slice(1);
  row[parsed.exercise] = 'Run';
  if (Number.isInteger(parsed.load)) row[parsed.load] = 'Easy conversational pace';
  if (Number.isInteger(parsed.sets)) row[parsed.sets] = '1';
  if (Number.isInteger(parsed.reps)) row[parsed.reps] = `${km} km`;
  if (Number.isInteger(parsed.rest)) row[parsed.rest] = 'N/A';
  const rpeCol = parsed.header.findIndex((h) => /target rpe|effort/i.test(String(h || '')));
  if (rpeCol >= 0) row[rpeCol] = '4-5';
  if (Number.isInteger(parsed.notes)) {
    row[parsed.notes] = `${SUPPORT_RUN_NOTE} Held at the ${baseline.weekly_km} km a week you already run, so this adds no mileage you are not already covering.`;
  }

  const rows = parsed.rows.map((c) => c.slice());
  rows.push(row);
  const rebuilt = [parsed.header.join('\t'), ...rows.map((c) => c.join('\t'))].join('\n');
  return program.replace(parsed.re, `$1${rebuilt}$3`);
}

export function repairMarathonSubordination(program, intake = {}) {
  if (!isHighConcurrencyHybrid(intake)) return String(program || '');
  if (marathonGoalTier(intake) !== 'secondary') return String(program || '');

  let out = String(program || '');
  for (let week = 1; week <= 4; week += 1) {
    const parsed = parseWeekRows(out, week);
    if (!parsed) continue;

    const runs = [];
    const perDay = new Map();
    let lastDay = '';
    parsed.rows.forEach((row, i) => {
      const raw = String(row[parsed.day] || '').trim();
      if (raw) lastDay = raw;
      const name = String(row[parsed.exercise] || '').trim();
      if (!name || /^\s*\[WARMUP\]/i.test(name)) return;
      perDay.set(lastDay, (perDay.get(lastDay) || 0) + 1);
      if (isRunName(name)) runs.push({ index: i, day: lastDay });
    });

    // No running at all is the one state this repair used to walk away from,
    // and it is the one that reached a client. Live run #149 delivered an
    // Advanced Hybrid block with zero run rows and no mention of the marathon
    // anywhere, for an athlete whose stated secondary goal IS a marathon and
    // who already runs about once a week. Four attempts, 455 seconds, and the
    // harness shipped it with the rule still unresolved, because removing the
    // running is a state the model cannot climb back out of: it then fails this
    // rule plus the named-goal, target-modality and event-progression gates,
    // and every regeneration re-reads its own runless program.
    //
    // Restoring one easy run at the volume the athlete demonstrably already
    // covers adds no load they are not already carrying, which is the same
    // principle TARGET_MODALITY_EXPOSURE_REDUCED enforces: preserve the stated
    // current exposure. Week 4 comes down so the consolidation week still
    // consolidates.
    if (!runs.length) {
      const restored = restoreSupportRun(out, parsed, week, intake);
      if (restored) out = restored;
      continue;
    }

    const cells = parsed.rows.map((c) => c.slice());
    const noteOf = (i) => (Number.isInteger(parsed.notes) ? String(cells[i][parsed.notes] || '') : '');
    const loadOf = (i) => (Number.isInteger(parsed.load) ? String(cells[i][parsed.load] || '') : '');

    // Keep the one that already reads as the support run, otherwise the first.
    const keep = runs.find((r) => EASY_LANGUAGE.test(`${loadOf(r.index)} ${noteOf(r.index)}`)) || runs[0];
    const drop = new Set();
    for (const r of runs) {
      if (r === keep) continue;
      if ((perDay.get(r.day) || 0) <= 1) continue; // never empty a day
      drop.add(r.index);
      perDay.set(r.day, (perDay.get(r.day) || 1) - 1);
    }

    let changed = drop.size > 0;
    if (Number.isInteger(parsed.notes) && !EASY_LANGUAGE.test(`${loadOf(keep.index)} ${noteOf(keep.index)}`)) {
      const note = noteOf(keep.index).trim();
      cells[keep.index][parsed.notes] = note ? `${note} ${SUPPORT_RUN_NOTE}` : SUPPORT_RUN_NOTE;
      changed = true;
    }
    if (!changed) continue;
    const kept = cells.filter((_, i) => !drop.has(i));
    const rebuilt = [parsed.header.join('\t'), ...kept.map((c) => c.join('\t'))].join('\n');
    out = out.replace(parsed.re, `$1${rebuilt}$3`);
  }
  return out;
}
