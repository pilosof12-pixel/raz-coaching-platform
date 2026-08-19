// Generic gym-day readiness scoring.
//
// The planner historically reasoned about sport stress on the SAME day, so a
// primary neural or skill exposure could still land the morning after an open
// mat. Readiness here is derived entirely from the intake -- sport schedule,
// goal priority, injury history, recovery context -- and never from hardcoded
// weekdays or avatar names. Nothing in this module knows what "Monday" or
// "Advanced Hybrid" means.

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function txt(v) {
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}
function lower(v) { return String(v || '').toLowerCase(); }
function dayKey(day) {
  const d = lower(day).trim().slice(0, 3);
  return WEEKDAYS.includes(d) ? d : null;
}
function priorDay(day) {
  const i = WEEKDAYS.indexOf(day);
  return i < 0 ? null : WEEKDAYS[(i + 6) % 7];
}

// Sport stress per weekday, 0-3, from the structured schedule when present.
export function sportStressByDay(intake = {}) {
  const out = {};
  for (const entry of arr(intake.sport_schedule)) {
    const day = dayKey(entry?.day);
    if (!day) continue;
    const intensity = lower(entry?.intensity || entry?.load || '');
    const score = /hard|high|competition|open mat|spar/.test(intensity) ? 3
      : /moderate|medium/.test(intensity) ? 2
        : /light|easy|technical|drill/.test(intensity) ? 1 : 2;
    out[day] = Math.max(out[day] || 0, score);
  }
  return out;
}

// How demanding an exposure is, which decides how much readiness it deserves.
// Derived from the exposure descriptor the caller supplies, not from a name list.
export function exposureDemand({ neural = false, skill = false, impact = false, quality = false, lowCost = false } = {}) {
  if (lowCost) return 'low';
  if (neural || skill || quality) return 'high';
  if (impact) return 'moderate';
  return 'moderate';
}

function injurySensitivity(intake = {}) {
  const src = lower(`${txt(intake.injuries)} ${txt(intake.pain)} ${txt(intake.notes)}`);
  return {
    impact: /shin|tibial|stress fracture|plantar|achilles|knee|foot|ankle/.test(src),
    upperPull: /elbow|forearm|golfer|epicond|lat strain|shoulder/.test(src),
  };
}

function recoveryPenalty(intake = {}) {
  const src = lower(`${txt(intake.sleep_hours)} ${txt(intake.recovery_rating)}`);
  if (/poor|bad|low|<\s*6|5-6/.test(src)) return 2;
  if (/average|ok|moderate|fair/.test(src)) return 1;
  return 0;
}

// Readiness for each candidate gym day, higher is fresher. Deterministic and
// intake-driven: same-day sport, previous-day sport, previous-day heavy gym work,
// injury-relevant local stress, and global recovery context.
export function gymDayReadiness(intake = {}, options = {}) {
  const gymDays = arr(options.gymDays && options.gymDays.length ? options.gymDays : intake.available_gym_days)
    .map(dayKey)
    .filter(Boolean);
  const sport = sportStressByDay(intake);
  const priorGymLoad = options.priorGymLoad || {};
  const injury = injurySensitivity(intake);
  const globalPenalty = recoveryPenalty(intake);

  const days = (gymDays.length ? gymDays : WEEKDAYS).map((day) => {
    const prev = priorDay(day);
    const sameDaySport = sport[day] || 0;
    const prevDaySport = prev ? (sport[prev] || 0) : 0;
    const prevDayGym = prev ? Number(priorGymLoad[prev] || 0) : 0;
    // Same-day sport costs most, the day after a hard session still costs real
    // neural and connective-tissue freshness.
    let score = 10 - (sameDaySport * 2) - (prevDaySport * 1.5) - prevDayGym - globalPenalty;
    const factors = { same_day_sport: sameDaySport, previous_day_sport: prevDaySport, previous_day_gym: prevDayGym, recovery_penalty: globalPenalty };
    return { day, score: Math.round(score * 10) / 10, factors };
  });

  days.sort((a, b) => b.score - a.score || WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day));
  return { days, injury };
}

// Which day a given exposure should preferentially take. High-demand primary
// work takes the freshest day; explicitly low-cost technical microdoses are
// allowed to sit on compromised days so they do not consume good readiness.
export function preferredDayForExposure(intake = {}, exposure = {}, options = {}) {
  const { days } = gymDayReadiness(intake, options);
  if (!days.length) return null;
  const demand = exposureDemand(exposure);
  if (demand === 'low') return days[days.length - 1].day;
  return days[0].day;
}

export function buildReadinessBrief(intake = {}, options = {}) {
  const { days } = gymDayReadiness(intake, options);
  if (days.length < 2) return '';
  const sport = sportStressByDay(intake);
  if (!Object.keys(sport).length) return '';
  const ranked = days.map((d) => `${d.day}(${d.score})`).join(' > ');
  const best = days[0].day;
  const worst = days[days.length - 1].day;
  return [
    '=== READINESS-WEIGHTED SCHEDULING ===',
    `Deterministic gym-day readiness for this athlete, freshest first: ${ranked}. The score falls for same-day sport, for the day AFTER a hard sport session, and for poor recovery context.`,
    `Place the highest-priority high-neural, high-skill or race-quality exposure on the freshest available day (currently ${best}). Do not place it the day after a hard sport session just because the calendar allows it.`,
    `Explicitly low-cost technical microdoses (low RPE, low volume, stated as recovery-first) may occupy the least fresh day (currently ${worst}); that is the point of them, and they may sit adjacent to another exposure of the same pattern provided they stay genuinely low fatigue.`,
    'These are scheduling preferences derived from this athlete\'s own sport schedule and recovery context, not fixed weekday rules. If a different day is better for a stated reason, say the reason in the program.',
  ].join('\n');
}
