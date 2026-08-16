function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

function goalText(intake = {}) {
  return [...arr(intake.primary_goals), ...arr(intake.secondary_goals), ...arr(intake.maintenance_goals)].map(String).join(' | ');
}

export function marathonGoalTier(intake = {}) {
  if (arr(intake.primary_goals).some((g) => /marathon|42\.?195\s*km/i.test(String(g)))) return 'primary';
  if (arr(intake.secondary_goals).some((g) => /marathon|42\.?195\s*km/i.test(String(g)))) return 'secondary';
  if (arr(intake.maintenance_goals).some((g) => /marathon|42\.?195\s*km/i.test(String(g)))) return 'maintenance';
  return null;
}

export function currentRunBaseline(intake = {}) {
  const src = `${txt(intake.current_numbers)} ${txt(intake.performance_markers)} ${txt(intake.clarification_answers)} ${txt(intake.notes)}`;
  let sessions = null;
  let weeklyKm = null;
  let longestKm = null;

  for (const re of [
    /(?:running|run)[^\n|]{0,80}?(\d+)\s*(?:sessions?|runs?)\s*(?:a|per|\/)\s*week/i,
    /(\d+)\s*(?:running\s*)?(?:sessions?|runs?)\s*(?:a|per|\/)\s*week/i,
  ]) {
    const m = src.match(re);
    if (m) { sessions = Number(m[1]); break; }
  }

  for (const re of [
    /(?:weekly|per\s*week|a\s*week|total)[^\d]{0,20}(\d+(?:\.\d+)?)\s*km/i,
    /(?:running|run)[^\n|]{0,100}?(\d+(?:\.\d+)?)\s*km(?:\s*(?:total|per\s*week|a\s*week))?/i,
  ]) {
    const m = src.match(re);
    if (m) { weeklyKm = Number(m[1]); break; }
  }

  const longest = src.match(/longest(?:\s+recent)?\s+run[^\d]{0,25}(\d+(?:\.\d+)?)\s*km/i);
  if (longest) longestKm = Number(longest[1]);
  if (sessions == null && weeklyKm != null && /1\s*(?:session|run)\s*(?:a|per|\/)\s*week/i.test(src)) sessions = 1;

  return {
    sessions: Number.isFinite(sessions) && sessions > 0 ? sessions : null,
    weekly_km: Number.isFinite(weeklyKm) && weeklyKm > 0 ? weeklyKm : null,
    longest_km: Number.isFinite(longestKm) && longestKm > 0 ? longestKm : null,
  };
}

export function externalSportSessions(intake = {}) {
  const schedule = arr(intake.sport_schedule).filter((x) => typeof x === 'string' ? x.trim() : x?.day);
  if (schedule.length) return schedule.length;
  const direct = Number(intake.sport_sessions_per_week || intake.sport_days_per_week || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const src = `${txt(intake.sport)} ${txt(intake.notes)}`;
  const m = src.match(/(\d+)\s*(?:days?|sessions?)\s*(?:a|per|\/)\s*week/i);
  return m ? Number(m[1]) : 0;
}

export function isHighConcurrencyHybrid(intake = {}) {
  const marathonTier = marathonGoalTier(intake);
  if (!marathonTier) return false;
  const strengthDays = Number(intake.days_per_week || 0);
  const sportSessions = externalSportSessions(intake);
  const primary = arr(intake.primary_goals).join(' | ');
  const hasPrimaryStrengthSkill = /squat|deadlift|bench|overhead|press|pull[- ]?up|chin[- ]?up|one[- ]?arm|planche|lever|handstand|muscle[- ]?up|dip|strength/i.test(primary);
  return strengthDays >= 3 && sportSessions >= 3 && hasPrimaryStrengthSkill;
}

export function buildAdvancedHybridConcurrencyBrief(intake = {}) {
  if (!isHighConcurrencyHybrid(intake)) return '';

  const marathonTier = marathonGoalTier(intake);
  const baseline = currentRunBaseline(intake);
  const strengthDays = Number(intake.days_per_week || 0);
  const sportSessions = externalSportSessions(intake);
  const fixedDays = arr(intake.available_gym_days).filter(Boolean).map(String);
  const goals = goalText(intake);

  const lines = [
    '=== HIGH-CONCURRENCY HYBRID LOAD CONTRACT ===',
    `This athlete combines ${strengthDays} requested strength sessions, about ${sportSessions} external sport sessions, and a ${marathonTier} marathon goal. Treat the external sport as real fatigue.`,
    'Do NOT solve every goal with normal standalone-program volume. The four-week block must be intentionally compact and priority-driven.',
    'Primary strength/skill goals own the freshness budget. Preserve their direct exposures first. Secondary strength receives minimum effective meaningful work. Maintenance/GPP/accessories are the first volume removed.',
    'Requested strength-session count is a frequency constraint, not permission to make every gym day a full-volume bodybuilding session. A requested gym day may be a genuine low-volume microdose session when that is the best way to satisfy frequency without exceeding recoverable volume.',
    'Do not add extra hard conditioning, finishers, circuits, sprint work or threshold intervals merely because the athlete is hybrid; combat practice already supplies substantial high-intensity stress.',
    'When the marathon is lower priority than strength/skill, the current four-week block should establish or preserve a recoverable endurance pathway, not immediately imitate a dedicated marathon-specialist schedule.',
  ];

  if (baseline.sessions) {
    lines.push(`Current direct running frequency is about ${baseline.sessions} session(s) per week. Week 1 should preserve that direct frequency rather than suddenly multiplying run days.`);
  }
  if (baseline.weekly_km) {
    lines.push(`Current weekly running volume is about ${baseline.weekly_km} km. Week 1 direct running must stay at or below that demonstrated weekly volume; progress later only when recovery remains good.`);
  }
  if (baseline.longest_km) {
    lines.push(`Longest recent run is about ${baseline.longest_km} km. Use that as a durability anchor rather than treating the marathon target distance as current capacity.`);
  }
  if (marathonTier === 'secondary' && baseline.sessions === 1) {
    lines.push('For this starting state, one substantive easy long-run exposure in Week 1 is a valid marathon-side-quest pathway. Do not force a second or third run in Week 1 solely to look marathon-specific. Add frequency only in a later block or when the athlete demonstrates recovery headroom.');
  }
  if (fixedDays.length) {
    lines.push(`Fixed gym availability is ${fixedDays.join(', ')}. Use those exact strength days. Place/merge endurance around the real calendar rather than inventing new lifting days.`);
  }

  if (/one[- ]?arm\s*(?:pull|chin)|\boap\b/i.test(goals)) {
    lines.push('For a One-Arm Pull-up priority, keep direct unilateral skill-strength exposure protected. Weighted bilateral pulling is support and is reduced before direct OAP work when fatigue is excessive.');
  }
  if (/squat/i.test(arr(intake.primary_goals).join(' | '))) {
    lines.push('For a squat primary goal, use compact heavy/volume specificity rather than filling multiple days with redundant knee-dominant accessories.');
  }
  if (/overhead\s*press|\bohp\b/i.test(arr(intake.secondary_goals).join(' | '))) {
    lines.push('For a secondary strict OHP goal, preserve at least one direct strict exposure and one low-cost complementary vertical-press exposure when recovery allows; do not turn secondary pressing into a high-volume hypertrophy block.');
  }

  lines.push('If the first candidate exceeds weekly recoverability, trim optional/accessory/support sets before changing a primary goal exposure, current sport schedule, or the marathon baseline anchor.');
  return lines.join('\n');
}
