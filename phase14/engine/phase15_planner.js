// Deterministic pre-LLM planning layer for Phase 15.
// This module turns intake constraints into a compact coaching skeleton BEFORE the model runs.
// The model may calibrate loads, progressions and coaching language, but it may not delete
// required exposures or violate the schedule / pain / conditioning constraints produced here.

function txt(v) {
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

function allText(intake) {
  return JSON.stringify(intake || {}).toLowerCase();
}

function has(re, intake) { return re.test(allText(intake)); }

function sportMap(intake) {
  const out = {};
  for (const s of (intake?.sport_schedule || [])) {
    if (!s?.day) continue;
    out[String(s.day).slice(0,3)] = String(s.intensity || 'moderate').toLowerCase();
  }
  return out;
}

function chooseDays(intake) {
  const n = Math.max(1, Math.min(7, Number(intake?.days_per_week || 3)));
  const listed = Array.isArray(intake?.available_gym_days) ? intake.available_gym_days.filter(Boolean).map(x => String(x).slice(0,3)) : [];
  if (listed.length >= n) return listed.slice(0,n);

  const sport = sportMap(intake);
  const canonical = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const score = d => {
    const s = sport[d];
    if (!s) return 0;
    if (s === 'light') return 1;
    if (s === 'moderate') return 2;
    return 4;
  };
  // Preserve at least one clean day for the highest-quality strength exposure.
  // Then allow deliberate stress consolidation rather than scattering fatigue everywhere.
  return canonical
    .map((d,i) => ({d,i,s:score(d)}))
    .sort((a,b) => a.s-b.s || a.i-b.i)
    .slice(0,n)
    .map(x => x.d)
    .sort((a,b) => canonical.indexOf(a)-canonical.indexOf(b));
}

function distribute(days, labels) {
  const out = Object.fromEntries(days.map(d => [d, []]));
  labels.forEach((label,i) => out[days[i % days.length]].push(label));
  return out;
}

function currentOap(intake) {
  const s = JSON.stringify(intake || {});
  const m = s.match(/(?:one.?arm pull.?up|oap)[^\d]{0,50}(\d+)\s*(?:strict\s*)?(?:reps?|rep|maximum|max)/i)
    || s.match(/(\d+)\s*strict\s*(?:one.?arm pull.?ups?|oaps?)/i);
  return m ? Number(m[1]) : null;
}

export function buildDeterministicBrief(intake = {}) {
  const days = chooseDays(intake);
  const sport = sportMap(intake);
  const primary = txt(intake.primary_goals);
  const secondary = txt(intake.secondary_goals);
  const maintenance = txt(intake.maintenance_goals);
  const pain = txt(intake.pain || intake.limitations);
  const limit = Number(intake.session_duration_minutes || intake.session_minutes || 0) || null;
  const oap = currentOap(intake);

  const required = [];
  const optional = [];
  const forbidden = [];

  const squatGoal = /squat/i.test(primary);
  const squatDual = squatGoal && /(max|1\s*rm|exceed|over\s*\d+)/i.test(primary) && /(?:x|×)\s*(?:6|7|8|9|10|11|12)\b|(?:6|7|8|9|10|11|12)\s*reps?/i.test(primary);
  if (squatDual) {
    required.push('Box squat MAX-STRENGTH exposure: working sets in the 1-5 rep range, specific to the tolerated box height.');
    required.push('Box squat REP-STRENGTH exposure: separate working exposure with >=6 reps per set or an explicit high-rep/back-off progression aimed at the stated rep goal. Speed doubles do not count.');
  } else if (squatGoal) required.push('One direct squat-specific progression exposure matching the stated squat goal.');

  const oapGoal = /one.?arm pull|\boap\b/i.test(`${primary} ${secondary}`);
  if (oapGoal && oap != null && oap >= 2) {
    required.push(`Advanced OAP exposure A: strict One-Arm Pull-up singles/clusters. Current demonstrated max is ${oap} strict reps, so do not regress to eccentrics as the main work.`);
    required.push('Advanced OAP exposure B: lightly assisted One-Arm Pull-up doubles/triples or another advanced unilateral-specific exposure.');
    forbidden.push('One-Arm Pull-up eccentric/negative as either of the two main OAP exposures.');
  } else if (oapGoal) required.push('One or two unilateral-specific OAP progression exposures matched to demonstrated level.');

  const ohpGoal = /overhead press|\bohp\b/i.test(secondary);
  if (ohpGoal) {
    required.push('OHP exposure A: meaningful strict Overhead Press strength work.');
    required.push('OHP exposure B on a separate day: strict OHP volume/technique or Push Press overload. This is progression, not token maintenance.');
  }

  const zone2Goal = /zone\s*2|aerobic|day.to.day energy|conditioning/i.test(`${secondary} ${maintenance} ${txt(intake.notes)}`);
  if (zone2Goal) {
    required.push('Two low-fatigue Zone 2 exposures, preferably bike, easy rower, or incline walk.');
    forbidden.push('Unrequested hard intervals, threshold, VO2, AMRAP, sprints, or hard running when BJJ/MMA already supplies high-intensity conditioning.');
  }

  if (/sciatica|lumbar|lower back|low back/i.test(pain)) {
    forbidden.push('Deep loaded squatting that reproduces lumbar flexion symptoms when the intake says it is provocative.');
    forbidden.push('Heavy RDL / good morning / back-extension loading unless the intake explicitly establishes tolerance and the row states a tolerance gate.');
  }
  if (/box squat/i.test(pain) && /tolerat/i.test(pain)) optional.push('Use the explicitly tolerated parallel box squat rather than forcing deeper squat ROM.');
  if (/hip thrust/i.test(pain) && /tolerat/i.test(pain)) optional.push('Hip thrust or glute bridge is a preferred low-spinal-fatigue posterior-chain assistance option.');

  if (/cable lateral/i.test(maintenance)) required.push('Retain direct Cable Lateral Raise at minimum useful dose.');
  if (/face pull/i.test(maintenance)) required.push('Retain Face Pull at minimum useful dose.');
  if (/explosive|jump|med ball|medicine ball/i.test(`${maintenance} ${txt(intake.notes)}`)) required.push('One or two very low-volume explosive primer exposures. Place throws/jumps after warm-up and before heavy strength. Stop before velocity loss.');

  // Deterministic session skeleton. We assign high-value exposures across the available days,
  // then the LLM calibrates exact sets/reps/load without being allowed to delete them.
  const exposureLabels = [];
  if (squatDual) exposureLabels.push('BOX_SQUAT_REP', 'BOX_SQUAT_HEAVY');
  else if (squatGoal) exposureLabels.push('SQUAT_SPECIFIC');
  if (oapGoal && oap != null && oap >= 2) exposureLabels.push('OAP_ASSISTED_ADVANCED', 'OAP_STRICT');
  else if (oapGoal) exposureLabels.push('OAP_SPECIFIC');
  if (ohpGoal) exposureLabels.push('OHP_HEAVY', 'OHP_SECOND');
  if (zone2Goal) exposureLabels.push('ZONE2_A', 'ZONE2_B');

  // Spread key exposures while keeping the last clean/no-sport day attractive for heavy strength.
  const sessions = distribute(days, exposureLabels);
  const cleanDays = days.filter(d => !sport[d]);
  if (squatDual && cleanDays.length) {
    const heavyDay = cleanDays[cleanDays.length - 1];
    for (const d of days) sessions[d] = sessions[d].filter(x => x !== 'BOX_SQUAT_HEAVY');
    sessions[heavyDay].unshift('BOX_SQUAT_HEAVY');
  }
  if (oapGoal && oap != null && oap >= 2 && cleanDays.length) {
    const strictDay = cleanDays[0];
    for (const d of days) sessions[d] = sessions[d].filter(x => x !== 'OAP_STRICT');
    sessions[strictDay].unshift('OAP_STRICT');
  }

  const dayLines = days.map(d => {
    const sportText = sport[d] ? `same-day sport=${sport[d]}` : 'no listed sport';
    const slots = sessions[d].length ? sessions[d].join(', ') : 'low-cost support/accessories only';
    return `${d}: ${slots}; ${sportText}.`;
  });

  return [
    '=== DETERMINISTIC PROGRAM SKELETON, DO NOT DELETE REQUIRED EXPOSURES ===',
    `Gym days (${days.length}): ${days.join(', ')}.`,
    limit ? `Hard session cap: ${limit} minutes INCLUDING warm-up, rests, transitions and any Zone 2 placed inside the session.` : 'Keep sessions realistically time-bounded.',
    'Required coaching constraints:',
    ...required.map(x => `* ${x}`),
    optional.length ? 'Preferred choices:' : '',
    ...optional.map(x => `* ${x}`),
    forbidden.length ? 'Forbidden / tolerance-gated choices:' : '',
    ...forbidden.map(x => `* ${x}`),
    'Session skeleton:',
    ...dayLines.map(x => `* ${x}`),
    'Model responsibility: choose realistic exact exercises, sets, reps, load ranges, RPE/RIR, rest, warm-up ramps, four-week progression and concise coaching notes around this skeleton. Do not move or delete a required exposure unless the intake makes it unsafe; if so state the substitution explicitly.',
  ].filter(Boolean).join('\n');
}
