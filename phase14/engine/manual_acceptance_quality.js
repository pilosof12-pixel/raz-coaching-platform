import { RetriableValidationError } from './exercise_dictionary.js';
import { parseProgramModel, WEEKDAY_ORDER } from './program_model.js';
import { isHighConcurrencyHybrid, currentRunBaseline } from './advanced_hybrid_concurrency.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function text(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
function age(intake = {}) {
  const n = Number(intake.age || intake.age_years || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function repUpper(raw) {
  const nums = [...String(raw || '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}
function kgLoad(raw) {
  const m = String(raw || '').match(/(?:^|\s)(\d+(?:\.\d+)?)\s*kg\b/i);
  return m ? Number(m[1]) : null;
}
function kmDose(exercise) {
  const s = `${exercise?.dose?.load || ''} ${exercise?.dose?.reps_raw || ''} ${exercise?.notes || ''}`;
  const m = s.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : null;
}
function fail(code, amendment, details = {}) {
  throw new RetriableValidationError(code, amendment, details);
}

function currentBackSquat1rm(intake = {}) {
  const src = `${text(intake.current_numbers)} ${text(intake.performance_markers)}`;
  const patterns = [
    /back\s*squat\s*:\s*(\d+(?:\.\d+)?)\s*kg\s*(?:1\s*rm|1rm|max)?/i,
    /back\s*squat[^\d]{0,18}(\d+(?:\.\d+)?)\s*kg\s*(?:1\s*rm|1rm|max)/i,
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

function currentRingDipMax(intake = {}) {
  const src = `${text(intake.current_numbers)} ${text(intake.performance_markers)} ${text(intake.clarification_answers)}`;
  const patterns = [
    /(?:about\s*)?(\d{1,2})\s*(?:good|clean|strict)?\s*ring\s*dips?\b/i,
    /ring\s*dips?[^\d]{0,16}(\d{1,2})\s*(?:reps?)?/i,
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 40) return n;
  }
  return null;
}

function effortUpper(exercise) {
  const effort = exercise?.dose?.effort;
  if (!effort) return null;
  if (effort.range && Number.isFinite(Number(effort.range.max))) return Number(effort.range.max);
  const n = Number(effort.value);
  return Number.isFinite(n) ? n : null;
}

function isPrimaryYouthSkill(exercise) {
  const base = String(exercise?.base_movement || '');
  const name = String(exercise?.display_name || '');
  return ['bar_muscle_up', 'handstand'].includes(base) || /bar muscle-up|transition|hip-to-bar|handstand|kick-up/i.test(name);
}

export function validateYouthManualAcceptanceSemantic(program, intake = {}, suppliedModel = null) {
  if (!(age(intake) != null && age(intake) < 18)) return { ok: true, skipped: true };
  const model = suppliedModel || parseProgramModel(program, intake);
  const flexible = String(intake.gym_availability_mode || '').toLowerCase() === 'flexible' && !arr(intake.available_gym_days).length;
  const goalText = goals(intake);

  for (const week of model.weeks || []) {
    const activeDays = (week.days || []).filter((day) => (day.exercises || []).some((x) => x.role !== 'warm_up' && x.modality !== 'warm_up'));
    if (flexible) {
      const labels = activeDays.map((d) => String(d.day || '').toLowerCase());
      const weekdayLabels = labels.filter((d) => WEEKDAY_ORDER.includes(d));
      if (weekdayLabels.length) {
        fail(
          'YOUTH_FLEXIBLE_SCHEDULE_INVENTED_WEEKDAYS',
          `Week ${week.week} has flexible availability but invents weekday assignments (${weekdayLabels.join(', ')}). Use Session A and Session B rather than Monday/Tuesday or other fabricated calendar days.`,
          { week: week.week, labels },
        );
      }
    }

    for (const day of activeDays) {
      const work = (day.exercises || []).filter((x) => x.role !== 'warm_up' && x.modality !== 'warm_up');
      const firstSkill = work.findIndex(isPrimaryYouthSkill);
      const hasSkill = firstSkill >= 0;
      if (hasSkill && firstSkill > 0) {
        fail(
          'YOUTH_PRIMARY_SKILL_NOT_FRESH',
          `Week ${week.week} ${day.day}: primary bar-muscle-up/handstand skill work appears after ${firstSkill} support exercise(s). Put primary skill practice first while fresh, then foundation strength and accessories.`,
          { week: week.week, day: day.day, first_skill_index: firstSkill, preceding: work.slice(0, firstSkill).map((x) => x.display_name) },
        );
      }

      if (/freestanding handstand|handstand/i.test(goalText)) {
        for (const exercise of work) {
          if (!/controlled handstand kick-up|kick-up/i.test(String(exercise.display_name || ''))) continue;
          const sets = Number(exercise?.dose?.sets || 0);
          const attempts = repUpper(exercise?.dose?.reps_raw || exercise?.dose?.reps);
          if ((Number.isFinite(sets) && sets > 5) || (Number.isFinite(sets) && Number.isFinite(attempts) && sets * attempts > 20)) {
            fail(
              'YOUTH_HANDSTAND_ATTEMPT_VOLUME_EXCESSIVE',
              `Week ${week.week} ${day.day}: kick-up practice is ${sets} sets with an upper target of ${attempts} attempts, which turns balance practice into fatigue volume. Keep controlled kick-up work to about 3-5 quality sets and no more than roughly 20 planned attempts per session. Progress successful entries, independent balance time, body line or wall dependence rather than piling on sets.`,
              { week: week.week, day: day.day, sets, attempts, planned_attempt_upper: Number.isFinite(sets) && Number.isFinite(attempts) ? sets * attempts : null },
            );
          }
        }
      }
    }
  }

  const dipMax = currentRingDipMax(intake);
  if (dipMax) {
    for (const week of model.weeks || []) {
      for (const day of week.days || []) {
        for (const exercise of day.exercises || []) {
          if (String(exercise.base_movement || '') !== 'dip' || !/ring/i.test(String(exercise.display_name || ''))) continue;
          const sets = Number(exercise?.dose?.sets || 0);
          const reps = repUpper(exercise?.dose?.reps_raw || exercise?.dose?.reps);
          const rpe = effortUpper(exercise);
          if (!Number.isFinite(sets) || sets < 3 || !Number.isFinite(reps)) continue;
          const ratio = reps / dipMax;
          if (ratio >= 0.85 || (rpe != null && rpe <= 8.5 && ratio >= 0.80)) {
            fail(
              'RING_DIP_DOSE_EXCEEDS_KNOWN_CAPACITY',
              `Week ${week.week} ${day.day}: ${sets} sets with a ${reps}-rep upper target is too close to the athlete's demonstrated ${dipMax}-rep ring-dip capacity for repeated quality work. A current max/ceiling is not a multi-set prescription. Use clearly submaximal sets, fewer reps, assistance/tempo, or another controlled progression variable.`,
              { week: week.week, day: day.day, sets, reps_upper: reps, known_ring_dip_max: dipMax, ratio, rpe },
            );
          }
        }
      }
    }
  }

  return { ok: true, skipped: false, model };
}

function multiSetLoadCap(reps) {
  if (!Number.isFinite(reps)) return 0.90;
  if (reps >= 6) return 0.78;
  if (reps >= 5) return 0.82;
  if (reps >= 4) return 0.85;
  if (reps >= 3) return 0.88;
  if (reps >= 2) return 0.92;
  return 0.96;
}

export function validateAdvancedHybridManualAcceptanceSemantic(program, intake = {}, suppliedModel = null) {
  if (!isHighConcurrencyHybrid(intake)) return { ok: true, skipped: true };
  const model = suppliedModel || parseProgramModel(program, intake);
  const squat1rm = currentBackSquat1rm(intake);
  const goalText = goals(intake);

  for (const week of model.weeks || []) {
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        if (squat1rm && /^back squat$/i.test(String(exercise.display_name || ''))) {
          const sets = Number(exercise?.dose?.sets || 0);
          const reps = repUpper(exercise?.dose?.reps_raw || exercise?.dose?.reps);
          const load = kgLoad(exercise?.dose?.load);
          if (sets >= 2 && Number.isFinite(load) && Number.isFinite(reps)) {
            const ratio = load / squat1rm;
            const cap = multiSetLoadCap(reps);
            if (ratio > cap + 0.005) {
              fail(
                'ADVANCED_HYBRID_SQUAT_LOAD_EXCEEDS_CURRENT_CAPACITY',
                `Week ${week.week} ${day.day}: Back Squat ${load} kg for ${sets} x ${reps} is ${Math.round(ratio * 100)}% of the supplied ${squat1rm} kg current 1RM and is too aggressive for repeated work in this high-concurrency block. The future 220 kg goal is not current capacity. For ${reps}-rep multi-set work keep the starting prescription at or below about ${Math.round(cap * 100)}% of current 1RM, then progress conditionally from achieved RPE and bar speed.`,
                { week: week.week, day: day.day, sets, reps, load, current_1rm: squat1rm, ratio, cap },
              );
            }
          }
        }

        if (/one[- ]?arm\s*(?:pull|chin)|\boap\b/i.test(goalText) && /one-arm pull-up/i.test(String(exercise.display_name || ''))) {
          const doseText = `${exercise?.dose?.reps_raw || ''} ${exercise?.notes || ''}`;
          if (!/(?:per|each)\s*(?:arm|side)|\/\s*(?:arm|side)|both\s+(?:arms|sides)/i.test(doseText)) {
            fail(
              'ADVANCED_HYBRID_OAP_SIDE_DOSING_AMBIGUOUS',
              `Week ${week.week} ${day.day}: One-Arm Pull-up dosing must explicitly state per arm/each side. A unilateral primary skill cannot leave the client guessing whether ${exercise?.dose?.sets || '?'} x ${exercise?.dose?.reps_raw || '?'} is total or per side.`,
              { week: week.week, day: day.day, exercise: exercise.display_name, reps: exercise?.dose?.reps_raw, notes: exercise?.notes },
            );
          }
        }
      }
    }

    if (squat1rm) {
      const dayMap = new Map((week.days || []).map((d) => [String(d.day || '').toLowerCase(), d]));
      for (const [runDay, day] of dayMap) {
        const longRun = (day.exercises || []).find((x) => x.modality === 'running' && (kmDose(x) || 0) >= Math.max(12, (currentRunBaseline(intake).longest_km || 0) * 0.75));
        if (!longRun || !WEEKDAY_ORDER.includes(runDay)) continue;
        const nextDay = WEEKDAY_ORDER[(WEEKDAY_ORDER.indexOf(runDay) + 1) % WEEKDAY_ORDER.length];
        const next = dayMap.get(nextDay);
        if (!next) continue;
        const heavySquat = (next.exercises || []).find((x) => /^back squat$/i.test(String(x.display_name || '')) && (kgLoad(x?.dose?.load) || 0) >= squat1rm * 0.80);
        if (heavySquat) {
          fail(
            'ADVANCED_HYBRID_LONG_RUN_PRECEDES_HEAVY_SQUAT',
            `Week ${week.week}: the long run is on ${runDay} immediately before a heavy Back Squat exposure on ${nextDay}. In a five-MMA-session hybrid block, do not stack the longest lower-body endurance dose directly before the primary heavy squat when another placement exists. Move the long run or change which squat day is heavy while preserving the fixed lifting calendar.`,
            { week: week.week, run_day: runDay, next_day: nextDay, run_km: kmDose(longRun), squat_load: kgLoad(heavySquat?.dose?.load), current_1rm: squat1rm },
          );
        }
      }
    }
  }

  return { ok: true, skipped: false, model };
}
