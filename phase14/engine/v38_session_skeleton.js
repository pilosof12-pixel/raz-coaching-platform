// Deterministic session skeleton.
//
// A gate that rejects incomplete architecture without telling the model what
// complete architecture looks like just burns repair attempts -- that is exactly
// how the Youth loop exhausted four passes. So the same taxonomy that judges the
// program also states, before generation, which sessions exist, what role each
// one plays, and which movement categories are mandatory.
//
// The model personalises exercise choice, load and wording inside this skeleton.
// It may not delete a mandatory category or collapse a session below its
// declared content.

import {
  CATEGORY, dayKey, dayGap, WEEKDAYS,
} from './v38_movement_taxonomy.js';
import { gymDayReadiness } from './v34_readiness.js';

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function goals(intake = {}, tier = 'all') {
  if (tier === 'primary') return arr(intake.primary_goals).map(String).join(' | ');
  if (tier === 'secondary') return arr(intake.secondary_goals).map(String).join(' | ');
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}
const LABEL = {
  [CATEGORY.VERTICAL_PULL]: 'vertical pulling',
  [CATEGORY.HORIZONTAL_PULL]: 'horizontal pulling (a row)',
  [CATEGORY.VERTICAL_PUSH]: 'vertical pressing',
  [CATEGORY.HORIZONTAL_PUSH]: 'horizontal pressing (push-up, dip or bench)',
  [CATEGORY.KNEE_DOMINANT]: 'knee-dominant lower body',
  [CATEGORY.HIP_DOMINANT]: 'hip-dominant / posterior chain',
  [CATEGORY.UNILATERAL_LOWER]: 'unilateral lower body',
  [CATEGORY.TRUNK]: 'trunk strength',
  [CATEGORY.GPP]: 'GPP',
  [CATEGORY.TISSUE_CAPACITY]: 'tissue capacity (calf, tibialis, foot, elbow or grip)',
  [CATEGORY.LOADED_CARRY]: 'loaded carrying',
  [CATEGORY.POWER]: 'power',
};

// Categories this athlete's goals make mandatory across the week.
export function mandatoryWeeklyCategories(intake = {}) {
  const all = goals(intake).toLowerCase();
  const req = new Set([CATEGORY.HORIZONTAL_PULL, CATEGORY.TRUNK]);
  if (/pull[- ]?up|muscle[- ]?up|press|handstand|chin[- ]?up|dip/.test(all)) {
    req.add(CATEGORY.VERTICAL_PULL);
    req.add(CATEGORY.HORIZONTAL_PUSH);
  }
  if (/squat|deadlift|lunge|leg/.test(all)) {
    req.add(CATEGORY.KNEE_DOMINANT);
    req.add(CATEGORY.HIP_DOMINANT);
  }
  if (/\b\d+\s*k(?:m)?\b|marathon|run|ruck/.test(all)) req.add(CATEGORY.TISSUE_CAPACITY);
  return [...req];
}

// Gym days ranked by readiness, so the primary exposure is placed rather than
// discovered after the fact.
function orderedGymDays(intake = {}) {
  const declared = arr(intake.available_gym_days).map(dayKey).filter(Boolean);
  if (!declared.length) return [];
  const ranked = gymDayReadiness(intake, { gymDays: declared }).days.map((d) => d.day);
  return ranked.filter((d) => declared.includes(d));
}

// The primary exposure and its secondary counterpart must not sit on adjacent
// days of the circular week.
function separatedPair(days) {
  if (days.length < 2) return { primary: days[0] || null, secondary: null };
  const primary = days[0];
  const secondary = days.slice(1).find((d) => {
    const gap = dayGap(primary, d);
    return gap !== null && gap !== 1 && gap !== 6;
  }) || days[days.length - 1];
  return { primary, secondary };
}

export function buildSessionSkeleton(intake = {}) {
  const days = orderedGymDays(intake);
  if (!days.length) return null;
  const mandatory = mandatoryWeeklyCategories(intake);
  const { primary, secondary } = separatedPair(days);
  const sessions = days.map((day) => ({
    day,
    role: day === primary ? 'primary' : (day === secondary ? 'secondary' : 'support'),
  }));
  return { days, primary, secondary, mandatory, sessions };
}

export function buildSkeletonBrief(intake = {}) {
  const skeleton = buildSessionSkeleton(intake);
  const mandatory = mandatoryWeeklyCategories(intake);
  const lines = ['=== SESSION ARCHITECTURE (MANDATORY STRUCTURE) ==='];

  lines.push(
    'SESSION COMPLETENESS: every normal strength session needs one or two primary movements, at least one supporting compound or hypertrophy movement, and at least one accessory, tissue-capacity or GPP item. A session of only two exercises is allowed ONLY if you explicitly label it in its notes as a microdose, taper, deload, recovery session, competition-prep session or a severe time constraint, and state why. Do not produce a two-exercise session and present it as a complete training day.',
  );

  if (mandatory.length) {
    lines.push(
      `WEEKLY MOVEMENT COVERAGE: across each week the program must contain ${mandatory.map((c) => LABEL[c] || c).join('; ')}. These follow from this athlete's own stated goals. If you deliberately omit one, say in the program why the goal priority, schedule or a stated limitation requires it.`,
    );
  }

  lines.push(
    'FOUNDATIONAL STRENGTH IS NOT OPTIONAL: a skill drill does not replace the strength underneath it. A transition drill or banded muscle-up is skill practice, not pulling strength; handstand work is not pressing strength. Any session containing advanced upper-body skill work must also contain real foundational pulling and pushing.',
  );

  lines.push(
    'THE WEEK IS A CYCLE: Sunday is the day before Monday. Do not place substantial lower-body or axial loading on the day immediately before a heavy squat or deadlift session, and do not stack heavy vertical pulling on back-to-back days. Evaluate the last day of the week against the first exactly as you would any other pair.',
  );

  if (skeleton) {
    const roleLine = skeleton.sessions.map((s) => `${s.day}=${s.role}`).join(', ');
    lines.push(
      `PLACEMENT: readiness-ranked session roles for this athlete are ${roleLine}. Put the highest-priority high-neural or high-skill exposure in the primary slot, and keep the secondary exposure of that same pattern off the days immediately adjacent to it.`,
    );
  }

  lines.push(
    'ACCESSORY PURPOSE: every accessory must serve a stated purpose - hypertrophy support, weak-point work, joint or tendon capacity, movement balance, trunk strength, GPP, sport robustness, or technical assistance for a primary goal. Avoiding junk volume does not mean removing nearly all assistance work.',
  );

  return lines.join('\n');
}
