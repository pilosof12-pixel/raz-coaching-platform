// Goal exposure semantics for ProgramModel.
//
// This module deliberately ignores coaching notes when deciding whether an
// exercise is a direct exposure to a named goal. Notes can explain intent, but
// they cannot turn a different movement into the target movement.

import { normalizeSemanticText as norm } from './semantic_text.js';

function familyMatches(exerciseFamily, targetFamily) {
  if (!exerciseFamily || !targetFamily) return false;
  if (exerciseFamily === targetFamily) return true;
  if (exerciseFamily === 'bar_muscle_up' && targetFamily === 'muscle_up') return true;
  return false;
}

function freestandingBalanceGoal(target) {
  const raw = norm(target?.raw);
  return /freestanding handstand|handstand balance|unsupported handstand/.test(raw);
}

export function isDirectGoalExercise(exercise, target) {
  if (!exercise || !target || exercise.role === 'warm_up' || exercise.modality === 'warm_up') return false;

  const display = norm(exercise.display_name);
  const base = exercise.base_movement;
  const family = target.family;

  if (family === 'bar_muscle_up') return base === 'bar_muscle_up';

  if (family === 'handstand' && freestandingBalanceGoal(target)) {
    if (base !== 'handstand') return false;
    if (/handstand push|hspu/.test(display)) return false;
    if (/wall handstand hold|wall facing handstand hold|back to wall handstand hold/.test(display)) return false;
    return /controlled handstand kick up|freestanding handstand|handstand balance|kick up|toe pull|balance drill/.test(display);
  }

  if (family === 'pull_up') return base === 'pull_up';
  if (family === 'ruck') return exercise.modality === 'ruck' || base === 'ruck';
  if (family === 'running') return exercise.modality === 'running' || base === 'run';
  if (family === 'squat') return typeof base === 'string' && base.includes('squat');
  if (family === 'deadlift') return base === 'deadlift';
  if (family === 'overhead_press') return base === 'overhead_press';
  if (family === 'muscle_up') return ['muscle_up', 'bar_muscle_up', 'ring_muscle_up'].includes(base);

  return familyMatches(exercise.goal_family, family);
}

export function applyDirectGoalSemantics(model) {
  const goals = Array.isArray(model?.goals) ? model.goals : [];

  for (const week of model?.weeks || []) {
    for (const day of week.days || []) {
      for (const exercise of day.exercises || []) {
        const directTargets = goals.filter((target) => isDirectGoalExercise(exercise, target));
        const familyTargets = goals.filter((target) => familyMatches(exercise.goal_family, target.family));

        exercise.direct_goal_exposure = directTargets.length > 0;
        exercise.direct_goal_families = [...new Set(directTargets.map((target) => target.family))];
        exercise.direct_goal_targets = directTargets.map((target) => ({
          family: target.family,
          tier: target.tier,
          raw: target.raw,
        }));

        if (exercise.role !== 'warm_up') {
          if (directTargets.some((target) => target.tier === 'primary')) exercise.role = 'primary_goal';
          else if (directTargets.length || familyTargets.length) exercise.role = 'support';
        }
      }

      for (const session of day.sessions || []) {
        const primaryDirect = (session.exercises || []).some((exercise) =>
          (exercise.direct_goal_targets || []).some((target) => target.tier === 'primary')
        );
        if (primaryDirect) session.priority = 'primary';
      }
    }
  }

  return model;
}

export function directGoalExposureViolations(model) {
  const violations = [];
  const goals = Array.isArray(model?.goals) ? model.goals : [];

  for (const week of model?.weeks || []) {
    for (const goal of goals) {
      const exposures = [];
      for (const day of week.days || []) {
        for (const exercise of day.exercises || []) {
          if ((exercise.direct_goal_targets || []).some((target) =>
            target.family === goal.family && target.tier === goal.tier && target.raw === goal.raw
          )) {
            exposures.push({ day: day.day, exercise: exercise.display_name });
          }
        }
      }
      if (!exposures.length) {
        violations.push({
          week: week.week,
          family: goal.family,
          tier: goal.tier,
          goal: goal.raw,
          type: 'named_goal_direct_exposure_missing',
        });
      }
    }
  }

  return violations;
}
