// What counts as a youth athlete's primary skill practice. One definition,
// shared by the rule that skill comes first while fresh
// (YOUTH_PRIMARY_SKILL_NOT_FRESH) and by the intraday reorder, which used to
// rank a Ring Dip as primary strength and lift it above the bar muscle-up and
// handstand work. Run #163 spent all four attempts on that: the reorder broke
// the rule, the rule refused it, and the program shipped carrying it.

export const YOUTH_PRIMARY_SKILL_NAME = /bar muscle-up|transition|hip-to-bar|handstand|kick-up/i;
export const YOUTH_PRIMARY_SKILL_BASES = ['bar_muscle_up', 'handstand'];

export function isYouthAthlete(intake = {}) {
  const n = Number(intake.age || intake.age_years || 0);
  return Number.isFinite(n) && n > 0 && n < 18;
}
