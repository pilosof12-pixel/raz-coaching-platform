// Deterministic pre-LLM planning layer for Phase 15.
// Converts intake constraints into a compact coaching skeleton BEFORE the model runs.
// The model calibrates exact prescriptions and language, but it may not erase the
// required goal exposures, schedule constraints, pain gates or fatigue priorities.

function txt(v) {
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

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
  const listed = Array.isArray(intake?.available_gym_days)
    ? intake.available_gym_days.filter(Boolean).map(x => String(x).slice(0,3))
    : [];
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
  return canonical
    .map((d,i) => ({ d, i, s: score(d) }))
    .sort((a,b) => a.s - b.s || a.i - b.i)
    .slice(0,n)
    .map(x => x.d)
    .sort((a,b) => canonical.indexOf(a) - canonical.indexOf(b));
}

function distribute(days, labels) {
  const out = Object.fromEntries(days.map(d => [d, []]));
  labels.forEach((label,i) => out[days[i % days.length]].push(label));
  return out;
}

function currentOap(intake) {
  const s = JSON.stringify(intake || {});
  const patterns = [
    /(?:one.?arm pull.?up|oap)[^\d]{0,60}(\d+)\s*(?:strict\s*)?(?:reps?|rep|maximum|max)/i,
    /(\d+)\s*strict\s*(?:one.?arm pull.?ups?|oaps?)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

function currentBoxSquatMax(intake) {
  const source = txt(intake.current_numbers || intake.performance_markers || intake.current_strength);
  const lines = source.split(/\n|\||;/).map(x => x.trim()).filter(Boolean);
  const relevant = lines.filter(x => /box squat/i.test(x) && !/speed box squat/i.test(x));
  const nums = relevant.flatMap(line => [...line.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)].map(m => Number(m[1])));
  return nums.length ? Math.max(...nums.filter(Number.isFinite)) : null;
}

function currentOhp(intake) {
  const source = txt(intake.current_numbers || intake.performance_markers || intake.current_strength);
  const lines = source.split(/\n|\|/).map(x => x.trim()).filter(Boolean);
  const line = lines.find(x => /strict overhead press|\bohp\b/i.test(x));
  if (!line) return null;
  const kg = Number((line.match(/(\d+(?:\.\d+)?)\s*kg/i) || [])[1]);
  const repsMatch = line.match(/(?:x|×)\s*(\d+)(?:\s*(?:to|-|–)\s*(\d+))?/i);
  const reps = repsMatch ? Number(repsMatch[1]) : null;
  return Number.isFinite(kg) ? { kg, reps } : null;
}

function ohpTarget(intake) {
  const s = txt(intake.secondary_goals || intake.primary_goals);
  const m = s.match(/(?:overhead press|ohp)[^\d]{0,80}(?:toward|towards|to|target)[^\d]{0,20}(\d+(?:\.\d+)?)\s*kg/i)
    || s.match(/(?:overhead press|ohp)[^\d]{0,80}(\d+(?:\.\d+)?)\s*kg/i);
  return m ? Number(m[1]) : null;
}

function weightedChin1rm(intake) {
  const source = txt(intake.current_numbers || intake.performance_markers || intake.current_strength);
  const m = source.match(/weighted chin.?up[^\n|]{0,80}\+(\d+(?:\.\d+)?)\s*kg[^\n|]{0,40}(?:1\s*rm|1rm|max)/i);
  return m ? Number(m[1]) : null;
}

function round25(x) { return Math.round(x / 2.5) * 2.5; }

export function buildDeterministicBrief(intake = {}) {
  const days = chooseDays(intake);
  const sport = sportMap(intake);
  const primary = txt(intake.primary_goals);
  const secondary = txt(intake.secondary_goals);
  const maintenance = txt(intake.maintenance_goals);
  const notes = txt(intake.notes);
  const pain = txt(intake.pain || intake.limitations);
  const limit = Number(intake.session_duration_minutes || intake.session_minutes || 0) || null;
  const oap = currentOap(intake);
  const boxMax = currentBoxSquatMax(intake);
  const ohpCurrent = currentOhp(intake);
  const ohpGoal = ohpTarget(intake);
  const chin1rm = weightedChin1rm(intake);

  const required = [];
  const optional = [];
  const forbidden = [];

  const squatGoal = /squat/i.test(primary);
  const squatDual = squatGoal
    && /(max|1\s*rm|exceed|over\s*\d+)/i.test(primary)
    && /(?:x|×)\s*(?:6|7|8|9|10|11|12)\b|(?:6|7|8|9|10|11|12)\s*reps?/i.test(primary);

  if (squatDual) {
    required.push('DUAL BOX-SQUAT GOAL: treat the high-rep target and the max target as two different performance outcomes. Do not use one generic squat prescription for both.');
    required.push('BOX_SQUAT_HEAVY: one specific max-strength exposure each week, normally 1-4 reps per work set, low-to-moderate set count, long rest, and no grinding. This exposure serves the >210 kg / 1RM side of the goal.');
    required.push('BOX_SQUAT_REP: a separate rep-strength exposure that actually develops the 10-rep outcome. Start with repeatable 6-8 rep work and progress the rep side across the block toward 8-10 quality reps before repeatedly adding load. Speed doubles and triples do not count as this exposure.');
    required.push('For the rep-strength exposure use a double-progression logic: earn more clean reps inside the prescribed RPE window first, then add 2.5-5 kg and rebuild the reps. The long-term 180 kg x 10 target is NOT the Week 1 working load.');
    required.push('For the max-strength exposure progress load or specificity conservatively while preserving bar speed and position. A heavy top set or low-rep work is distinct from the rep-strength day and must remain distinct.');
    if (boxMax) {
      const repLo = round25(boxMax * 0.72), repHi = round25(boxMax * 0.80);
      const heavyLo = round25(boxMax * 0.82), heavyHi = round25(boxMax * 0.90);
      required.push(`Current tolerated box-squat max anchor is about ${boxMax} kg. Initial 6-8 rep work should usually live around ${repLo}-${repHi} kg at honest RPE 7-8, while 2-4 rep max-strength work should usually live around ${heavyLo}-${heavyHi} kg at about RPE 7.5-8.5. Adjust from observed RPE, not from the distant goal number.`);
    }
  } else if (squatGoal) {
    required.push('One direct squat-specific progression exposure matching the stated squat goal.');
  }

  const oapGoal = /one.?arm pull|\boap\b/i.test(`${primary} ${secondary}`);
  if (oapGoal && oap != null && oap >= 2) {
    required.push(`OAP LEVEL: athlete already owns ${oap} strict One-Arm Pull-up reps. Program from this demonstrated level, not from a beginner progression ladder.`);
    required.push('OAP exposure A: strict One-Arm Pull-up singles or clusters on a fresh day. Use multiple high-quality singles per arm, normally stopping 1 rep or more before technical failure.');
    required.push('OAP exposure B: Assisted One-Arm Pull-up doubles or triples with the minimum assistance needed for clean symmetrical reps. Progress by reducing assistance or improving total clean reps, not by adding eccentrics.');
    forbidden.push('One-Arm Pull-up Eccentric/negative as either main OAP exposure for an athlete who already owns 2 or more strict reps.');
    forbidden.push('Archer Pull-up or generic two-arm pulling as a substitute for either required unilateral-specific OAP exposure.');
    if (chin1rm) {
      const lo = round25(chin1rm * 0.55), hi = round25(chin1rm * 0.72);
      optional.push(`Weighted Chin-up may be used once weekly as bilateral support, not as a replacement for OAP specificity. With current +${chin1rm} kg external-load 1RM, a sensible initial 4-6 rep support range is roughly +${lo} to +${hi} kg, autoregulated by RPE and elbow/grip freshness.`);
    }
  } else if (oapGoal) {
    required.push('One or two unilateral-specific OAP progression exposures matched to demonstrated level.');
  }

  const strictOhpGoal = /overhead press|\bohp\b/i.test(secondary);
  if (strictOhpGoal) {
    required.push('STRICT OHP IS A PROGRESSION GOAL, not maintenance. Use two meaningful strict Overhead Press exposures on separate days when the intake asks to move substantially above current performance.');
    required.push('OHP exposure A: strength-biased strict Overhead Press, usually 3-5 reps per work set around RPE 7.5-8.5.');
    required.push('OHP exposure B: volume/technique strict Overhead Press, usually 5-8 reps per set around RPE 6.5-8. Push Press may be an optional explosive overload, but it does not replace both strict OHP exposures for a strict-OHP goal.');
    if (ohpCurrent) {
      required.push(`Current strict OHP anchor is ${ohpCurrent.kg} kg${ohpCurrent.reps ? ` x about ${ohpCurrent.reps}+ reps` : ''}. Prescriptions must be plausible relative to this CURRENT performance. Do not use the historical PR or the target as the working max.`);
    }
    if (ohpGoal) required.push(`Long-term strict OHP target is about ${ohpGoal} kg. Progress toward it through repeatable submaximal exposures, not token maintenance volume or weekly grinders.`);
    forbidden.push('Freestanding HSPU volume that steals meaningful recovery or session time from the strict OHP goal when HSPU is explicitly only nice-to-have.');
  }

  const zone2Goal = /zone\s*2|aerobic|day.to.day energy|conditioning/i.test(`${secondary} ${maintenance} ${notes}`);
  if (zone2Goal) {
    required.push('Two meaningful low-fatigue Zone 2 exposures. Use canonical names Zone-2 Bike or Zone-2 Row. Target roughly 20-35 minutes each unless one is deliberately placed as a separate easy session. A 10-12 minute mini-dose does not satisfy a dedicated aerobic-base goal.');
    forbidden.push('Unrequested hard intervals, threshold, VO2, AMRAP, sprints, or hard running when BJJ/MMA already supplies high-intensity conditioning.');
  }

  if (/sciatica|lumbar|lower back|low back/i.test(pain)) {
    forbidden.push('Deep loaded squatting that reproduces lumbar flexion symptoms when the intake says it is provocative.');
    forbidden.push('Heavy Romanian Deadlift, Good Morning or Back Extension loading unless the intake explicitly establishes tolerance and the row states a tolerance gate.');
  }
  if (/box squat/i.test(pain) && /tolerat/i.test(pain)) optional.push('Use the explicitly tolerated Box Squat to Parallel rather than forcing deeper squat ROM.');
  if (/hip thrust/i.test(pain) && /tolerat/i.test(pain)) optional.push('Hip Thrust or Glute Bridge is a preferred low-spinal-fatigue posterior-chain assistance option.');

  if (/cable lateral/i.test(maintenance)) required.push('Retain direct Cable Lateral Raise at minimum useful dose.');
  if (/face pull/i.test(maintenance)) required.push('Retain Face Pull at minimum useful dose.');
  if (/explosive|jump|med ball|medicine ball/i.test(`${maintenance} ${notes}`)) {
    required.push('Retain one or two very low-volume explosive primer exposures. Use canonical Box Jump or Broad Jump unless an exact validated medicine-ball exercise exists. Place power after warm-up and before heavy strength, and stop before velocity loss.');
  }

  const strengthDaysRequested = Number(intake.days_per_week) >= 1
    && (/strength sessions?|strength days?|strength/i.test(`${notes} ${primary} ${secondary}`) || String(intake.split_preference || '').toLowerCase() === 'full_body');
  if (strengthDaysRequested) {
    required.push(`ALL ${days.length} listed gym days are genuine strength/full-body sessions. Zone 2 may be appended or separate, but no gym day may collapse into cardio-only. Each gym day must contain at least one real strength or advanced-skill working exposure, and for a full-body preference should normally contain meaningful upper and lower/support work when recovery allows.`);
  }

  const exposureLabels = [];
  if (squatDual) exposureLabels.push('BOX_SQUAT_REP', 'BOX_SQUAT_HEAVY');
  else if (squatGoal) exposureLabels.push('SQUAT_SPECIFIC');
  if (oapGoal && oap != null && oap >= 2) exposureLabels.push('OAP_ASSISTED_ADVANCED', 'OAP_STRICT');
  else if (oapGoal) exposureLabels.push('OAP_SPECIFIC');
  if (strictOhpGoal) exposureLabels.push('OHP_STRENGTH', 'OHP_VOLUME');
  if (zone2Goal) exposureLabels.push('ZONE2_A', 'ZONE2_B');

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

  // Never allow a requested gym/strength day to become a cardio-only placeholder.
  if (strengthDaysRequested) {
    for (const d of days) {
      const hasStrength = sessions[d].some(x => !/^ZONE2_/.test(x));
      if (!hasStrength) sessions[d].unshift('LOW_COST_STRENGTH_SUPPORT');
    }
  }

  const dayLines = days.map(d => {
    const sportText = sport[d] ? `same-day sport=${sport[d]}` : 'no listed sport';
    const slots = sessions[d].length ? sessions[d].join(', ') : 'low-cost strength/support only';
    return `${d}: ${slots}; ${sportText}.`;
  });

  return [
    '=== DETERMINISTIC PROGRAM SKELETON, DO NOT DELETE REQUIRED EXPOSURES ===',
    `Gym days (${days.length}): ${days.join(', ')}.`,
    limit ? `Hard session cap: ${limit} minutes INCLUDING warm-up, rests, transitions and any Zone 2 placed inside the session.` : 'Keep sessions realistically time-bounded.',
    'Required coaching constraints:',
    ...required.map(x => `* ${x}`),
    optional.length ? 'Preferred/support choices:' : '',
    ...optional.map(x => `* ${x}`),
    forbidden.length ? 'Forbidden / tolerance-gated choices:' : '',
    ...forbidden.map(x => `* ${x}`),
    'Session skeleton:',
    ...dayLines.map(x => `* ${x}`),
    'LOW_COST_STRENGTH_SUPPORT means a real low-fatigue strength slot selected from the athlete needs, such as Weighted Chin-up, Hip Thrust, a chest-supported row, or another specific tolerated strength exercise. It never means cardio-only filler.',
    'Exercise-name rule for this path: use exact canonical names such as Overhead Press, Standing Barbell Overhead Press, Assisted One-Arm Pull-up, One-Arm Pull-up, Box Squat to Parallel, Zone-2 Bike, Zone-2 Row, Cable Lateral Raise, Face Pull, Box Jump and Hip Thrust. Never output [REVIEW], support messages or placeholder exercise rows.',
    'Model responsibility: choose realistic exact sets, reps, loads, RPE/RIR, rest, compact warm-up ramps, four-week progression and concise coaching notes around this skeleton. Do not move or delete a required exposure unless the intake makes it unsafe. If a lower-priority item must be cut for time or recovery, cut that before primary specificity.',
  ].filter(Boolean).join('\n');
}
