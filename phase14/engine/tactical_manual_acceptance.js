import { RetriableValidationError } from './exercise_dictionary.js';
import { parseProgramModel } from './program_model.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function tacticalContext(intake = {}) {
  return `${goals(intake)} ${txt(intake.notes)} ${txt(intake.sport)}`;
}
function isTacticalIntake(intake = {}) {
  return /\b(?:tactical|military|special[- ]?operations|selection prep|combat[- ]?ready|operator)\b/i.test(tacticalContext(intake));
}
function hasPullUpGoal(intake = {}) {
  return /\b(?:strict\s+)?pull[- ]?ups?\b/i.test(goals(intake));
}
function weightedPullBenchmark(intake = {}) {
  const source = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)}`;
  const m = source.match(/weighted\s+(?:pull|chin)[- ]?up[^\n|]{0,40}?\+\s*(\d+(?:\.\d+)?)\s*kg\s*(?:x|×)\s*(\d{1,2})\b/i);
  if (!m) return null;
  const load = Number(m[1]);
  const reps = Number(m[2]);
  return Number.isFinite(load) && load > 0 && Number.isFinite(reps) && reps > 0 ? { load, reps } : null;
}
function addedKg(raw = '') {
  const m = String(raw || '').match(/\+\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function repUpper(raw = '') {
  const nums = [...String(raw || '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}
function fail(code, amendment, details = {}) {
  throw new RetriableValidationError(code, amendment, details);
}

export function validateTacticalManualAcceptanceSemantic(program, intake = {}, suppliedModel = null) {
  if (!isTacticalIntake(intake)) return { ok: true, skipped: true };
  const rawProgram = String(program || '');
  if (/ramp\s+(?:backpack\s+carry|ruck|loaded\s+march)[^\n]*\b\d+(?:\.\d+)?\s*kg\s*x\s*\d/i.test(rawProgram)) {
    fail('TACTICAL_RUCK_WARMUP_MISREPRESENTED', 'Ruck/backpack warm-ups must use walking and ankle/calf preparation or an easy first few minutes under the pack, not strength-style kg x reps ramps.');
  }
  const model = suppliedModel || parseProgramModel(program, intake);
  const benchmark = weightedPullBenchmark(intake);
  const requireWeightedPull = hasPullUpGoal(intake) && Boolean(benchmark);

  for (const week of model.weeks || []) {
    const work = (week.days || []).flatMap((day) => (day.exercises || []).map((exercise) => ({ day: day.day, exercise })))
      .filter(({ exercise }) => exercise?.role !== 'warm_up' && exercise?.modality !== 'warm_up');

    if (requireWeightedPull) {
      const weighted = work.filter(({ exercise }) => /^weighted\s+(?:pull|chin)[- ]?up$/i.test(String(exercise?.display_name || '')));
      const explicit = weighted.filter(({ exercise }) => Number.isFinite(addedKg(exercise?.dose?.load)) && addedKg(exercise?.dose?.load) > 0);
      if (!explicit.length) {
        fail(
          'TACTICAL_WEIGHTED_PULL_EXPOSURE_AMBIGUOUS',
          `Week ${week.week} needs one explicit weighted pull-up/chin-up strength exposure because the intake provides a weighted pulling benchmark and a strict pull-up progression goal. Use the canonical Exercise name Weighted Pull-up or Weighted Chin-up and an explicit source-grounded +kg load. Do not write a generic Pull-up row with "RPE-selected load" and then imply in Notes that it is weighted. The current weighted benchmark is capacity, not an automatic multi-set prescription, so choose a sensible submaximal +kg load and preserve the separate strict bodyweight pull-up exposure.`,
          { week: week.week, benchmark, weighted_rows: weighted.map((x) => ({ day: x.day, exercise: x.exercise?.display_name, load: x.exercise?.dose?.load })) },
        );
      }

      for (const item of explicit) {
        const load = addedKg(item.exercise?.dose?.load);
        const sets = Number(item.exercise?.dose?.sets || 0);
        const reps = repUpper(item.exercise?.dose?.reps_raw || item.exercise?.dose?.reps);
        // A demonstrated +kg x reps benchmark is evidence of capacity, not evidence
        // that the same near-limit dose can be repeated for four or five work sets.
        // At the benchmark rep count or higher, require a clearly submaximal external
        // load (more than a cosmetic 5-10% reduction), or instead reduce reps.
        if (sets >= 2 && Number.isFinite(reps) && reps >= benchmark.reps && Number.isFinite(load) && load > benchmark.load * 0.85) {
          fail(
            'TACTICAL_WEIGHTED_PULL_DOSE_TOO_CLOSE_TO_BENCHMARK',
            `Week ${week.week} ${item.day}: the athlete demonstrates Weighted Pull-up +${benchmark.load} kg x ${benchmark.reps}, but the program asks for ${sets} sets of ${reps} at +${load} kg. A demonstrated ${benchmark.reps}-rep benchmark is not a repeatable multi-set prescription. Keep weighted pulling as useful submaximal support for the strict pull-up goal: either use fewer reps per set, or use a meaningfully lighter +kg load (not merely a cosmetic reduction), while preserving clean technique and the separate bodyweight pull-up volume day. Do not turn the benchmark into 4-5 near-max sets.`,
            { week: week.week, day: item.day, benchmark_load_kg: benchmark.load, benchmark_reps: benchmark.reps, prescribed_load_kg: load, prescribed_sets: sets, prescribed_reps_upper: reps },
          );
        }
      }
    }

    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        if (exercise?.role !== 'warm_up' && exercise?.modality !== 'warm_up') continue;
        const note = String(exercise?.notes || '');
        if (/ramp\s+(?:backpack\s+carry|ruck|loaded\s+march)[^.;\n]*\bkg\s*x\s*\d/i.test(note)) {
          fail(
            'TACTICAL_RUCK_WARMUP_MISREPRESENTED',
            `Week ${week.week} ${day.day}: the ruck/backpack warm-up is written like a barbell ramp using kg x reps. A multi-kilometre loaded march is not warmed up with strength-style rep ramps. Use simple walking/ankle-calf preparation and an easy first few minutes under the pack, or omit a separate ruck warm-up row; keep the actual ruck load and distance in the work row.`,
            { week: week.week, day: day.day, note },
          );
        }
      }
    }
  }

  return { ok: true, skipped: false, model };
}
