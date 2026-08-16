import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProductionProgram } from '../engine/production_validation.js';
import { parseProgramModel, strengthDaysForWeek } from '../engine/program_model.js';
import {
  ADVANCED_HYBRID_LAUNCH_INTAKE,
  advancedHybridLaunchProgram,
} from './fixtures/advanced_hybrid_launch.js';

// This is an objective release rubric, not a claim that automation can replace
// a human coach's final 9/10 judgement. The live AI output still gets manual review.
function scoreAdvancedHybrid(program) {
  const validated = validateProductionProgram(program, ADVANCED_HYBRID_LAUNCH_INTAKE);
  const model = validated.model || parseProgramModel(validated.program, ADVANCED_HYBRID_LAUNCH_INTAKE);
  const checks = [];

  checks.push(['production_clean', validated.ok === true]);

  checks.push(['fixed_strength_calendar', model.weeks.every((week) => {
    const days = strengthDaysForWeek(model, week.week).map((d) => d.day).sort();
    return JSON.stringify(days) === JSON.stringify(['friday', 'monday', 'sunday', 'tuesday']);
  })]);

  checks.push(['squat_specificity', model.weeks.every((week) => {
    const names = week.days.flatMap((d) => d.exercises).map((x) => String(x.display_name || '').toLowerCase());
    return names.filter((n) => n === 'back squat').length >= 2;
  })]);

  checks.push(['oap_specificity', model.weeks.every((week) => {
    const names = week.days.flatMap((d) => d.exercises).map((x) => String(x.display_name || '').toLowerCase());
    return names.some((n) => n === 'one-arm pull-up') && names.some((n) => n === 'assisted one-arm pull-up');
  })]);

  checks.push(['ohp_progression', model.weeks.every((week) => {
    const names = week.days.flatMap((d) => d.exercises).map((x) => String(x.display_name || '').toLowerCase());
    return names.includes('overhead press') && names.includes('push press');
  })]);

  checks.push(['marathon_sidequest_real_but_subordinate', model.weeks.every((week) => {
    const runs = week.days.flatMap((d) => d.exercises).filter((x) => x.modality === 'running');
    return runs.length === 1 && /easy|conversational/i.test(`${runs[0].load_target || ''} ${runs[0].notes || ''}`);
  })]);

  checks.push(['no_extra_hard_conditioning', model.weeks.every((week) => {
    return week.days.flatMap((d) => d.exercises).every((x) => {
      const n = String(x.display_name || '').toLowerCase();
      return x.modality !== 'conditioning' && !/interval|sprint|burpee|emom|metcon/.test(n);
    });
  })]);

  checks.push(['bounded_gpp', model.weeks.every((week) => week.days.flatMap((d) => d.exercises).length <= 12)]);

  checks.push(['muscle_maintenance_floor', model.weeks.every((week) => {
    const names = week.days.flatMap((d) => d.exercises).map((x) => String(x.display_name || '').toLowerCase());
    return names.includes('bulgarian split squat') && names.includes('dip') && names.includes('leg curl');
  })]);

  checks.push(['week4_consolidates', /18 km[\s\S]*Consolidate durability/i.test(program) && /week === 4/.test(String(advancedHybridLaunchProgram)) === false]);

  return { score: checks.filter(([, ok]) => ok).length, checks };
}

test('advanced hybrid pre-live candidate clears an objective 9/10 quality floor', () => {
  const result = scoreAdvancedHybrid(advancedHybridLaunchProgram());
  assert.ok(result.score >= 9, `advanced hybrid objective score ${result.score}/10: ${JSON.stringify(result.checks)}`);
});
