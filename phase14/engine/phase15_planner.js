import { buildSpecialistRules } from './phase15_specialist_rules.js';

function txt(v) {
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' | ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v || '');
}

function sportMap(intake) {
  const out = {};
  for (const s of (intake?.sport_schedule || [])) if (s?.day) out[String(s.day).slice(0,3)] = String(s.intensity || 'moderate').toLowerCase();
  return out;
}

function chooseDays(intake) {
  const n = Math.max(1, Math.min(7, Number(intake?.days_per_week || 3)));
  const listed = Array.isArray(intake?.available_gym_days) ? intake.available_gym_days.filter(Boolean).map(x => String(x).slice(0,3)) : [];
  if (listed.length >= n) return listed.slice(0,n);
  const sport = sportMap(intake), canonical = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const score = d => !sport[d] ? 0 : sport[d] === 'light' ? 1 : sport[d] === 'moderate' ? 2 : 4;
  return canonical.map((d,i)=>({d,i,s:score(d)})).sort((a,b)=>a.s-b.s||a.i-b.i).slice(0,n).map(x=>x.d).sort((a,b)=>canonical.indexOf(a)-canonical.indexOf(b));
}

function distribute(days, labels) {
  const out = Object.fromEntries(days.map(d => [d, []]));
  labels.forEach((label,i) => out[days[i % days.length]].push(label));
  return out;
}

function sessionRange(intake) {
  const numeric = Number(intake?.session_duration_minutes || intake?.session_minutes || 0);
  if (Number.isFinite(numeric) && numeric > 0) return { min:null, max:numeric, label:`up to ${numeric} min` };
  const raw = String(intake?.session_length || intake?.time_per_session || '').trim();
  if (!raw) return null;
  const nums = [...raw.matchAll(/\d{2,3}/g)].map(m=>Number(m[0])).filter(Number.isFinite);
  if (!nums.length) return null;
  if (nums.length >= 2) return { min:Math.min(...nums), max:Math.max(...nums), label:`${Math.min(...nums)}-${Math.max(...nums)} min` };
  return { min:null, max:nums[0], label:`up to ${nums[0]} min` };
}

function currentOap(intake) {
  const s = JSON.stringify(intake || {});
  for (const re of [/(?:one.?arm pull.?up|oap)[^\d]{0,60}(\d+)\s*(?:strict\s*)?(?:reps?|rep|maximum|max)/i, /(\d+)\s*strict\s*(?:one.?arm pull.?ups?|oaps?)/i]) {
    const m = s.match(re); if (m) return Number(m[1]);
  }
  return null;
}

function currentBoxSquatMax(intake) {
  const lines = txt(intake.current_numbers || intake.performance_markers || intake.current_strength).split(/\n|\|/).map(x=>x.trim()).filter(Boolean);
  const relevant = lines.filter(x => /box squat/i.test(x) && !/speed box squat/i.test(x));
  const candidates = [];
  for (const line of relevant) {
    for (const m of line.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)) candidates.push(Number(m[1]));
    for (const re of [/(?:approximately|approx(?:imately)?|current|confirmed)[^\d]{0,25}(\d+(?:\.\d+)?)(?:\s*kg)?[^\n]{0,25}(?:max|1\s*rm|1rm)/i, /(\d+(?:\.\d+)?)(?:\s*kg)?\s*(?:current\s*)?(?:max|1\s*rm|1rm)/i]) {
      const m = line.match(re); if (m) candidates.push(Number(m[1]));
    }
  }
  const nums = candidates.filter(x => Number.isFinite(x) && x >= 20 && x <= 500);
  return nums.length ? Math.max(...nums) : null;
}

function currentOhp(intake) {
  const line = txt(intake.current_numbers || intake.performance_markers || intake.current_strength).split(/\n|\|/).find(x => /strict overhead press|\bohp\b/i.test(x));
  if (!line) return null;
  const kg = Number((line.match(/(\d+(?:\.\d+)?)\s*kg/i)||[])[1]);
  const repsMatch = line.match(/(?:x|×)\s*(\d+)(?:\s*(?:to|-|–)\s*(\d+))?/i);
  return Number.isFinite(kg) ? {kg, reps:repsMatch ? Number(repsMatch[1]) : null} : null;
}

function ohpTarget(intake) {
  const goals = [...(Array.isArray(intake.secondary_goals) ? intake.secondary_goals : [intake.secondary_goals]), ...(Array.isArray(intake.primary_goals) ? intake.primary_goals : [intake.primary_goals])]
    .filter(Boolean).map(String).filter(x => /overhead press|\bohp\b/i.test(x));
  for (const line of goals) {
    const explicit = line.match(/(?:toward|towards|target(?:ing)?|goal(?:\s+of)?|progress(?:ing)?\s+to)[^\d]{0,30}(\d+(?:\.\d+)?)\s*kg/i);
    if (explicit) return Number(explicit[1]);
    const nums = [...line.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
    if (nums.length >= 2) return Math.max(...nums);
    if (nums.length === 1 && !/current|from/i.test(line)) return nums[0];
  }
  return null;
}

function weightedChin1rm(intake) {
  const s = txt(intake.current_numbers || intake.performance_markers || intake.current_strength);
  const m = s.match(/weighted chin.?up[^\n|]{0,80}\+(\d+(?:\.\d+)?)\s*kg[^\n|]{0,40}(?:1\s*rm|1rm|max)/i);
  return m ? Number(m[1]) : null;
}
const round25 = x => Math.round(x/2.5)*2.5;

export function buildDeterministicBrief(intake = {}) {
  const days = chooseDays(intake), sport = sportMap(intake), time = sessionRange(intake);
  const primary = txt(intake.primary_goals), secondary = txt(intake.secondary_goals), maintenance = txt(intake.maintenance_goals), notes = txt(intake.notes);
  const pain = txt(intake.pain || intake.limitations), limit = time?.max || null;
  const oap = currentOap(intake), boxMax = currentBoxSquatMax(intake), ohpCurrent = currentOhp(intake), ohpGoal = ohpTarget(intake), chin1rm = weightedChin1rm(intake);
  const required = [], optional = [], forbidden = [];

  const squatGoal = /squat/i.test(primary);
  const squatDual = squatGoal && /(max|1\s*rm|exceed|over\s*\d+)/i.test(primary) && /(?:x|×)\s*(?:6|7|8|9|10|11|12)\b|(?:6|7|8|9|10|11|12)\s*reps?/i.test(primary);
  if (squatDual) {
    required.push('DUAL BOX-SQUAT GOAL: the high-rep target and max target are different outcomes and require different exposures.');
    required.push('BOX_SQUAT_HEAVY: one max-strength exposure each week, normally 1-4 reps per set, long rest, no grinding; this serves the 1RM/max side.');
    required.push('BOX_SQUAT_REP: separate rep-strength exposure for the 10-rep outcome. Start with repeatable 6-8 rep work and progress toward 8-10 quality reps. Speed doubles/triples do not count.');
    required.push('Rep-strength progression uses double-progression logic: earn clean reps inside the RPE window, then add 2.5-5 kg and rebuild reps. The distant 180 kg x 10 target is NOT the Week 1 working load.');
    if (boxMax) required.push(`Current tolerated box-squat max anchor is about ${boxMax} kg. Initial 6-8 rep work should usually sit around ${round25(boxMax*.72)}-${round25(boxMax*.80)} kg at RPE 7-8; 2-4 rep max-strength work around ${round25(boxMax*.82)}-${round25(boxMax*.90)} kg at roughly RPE 7.5-8.5. Adjust from observed RPE, never from the future target.`);
  } else if (squatGoal) required.push('One direct squat-specific progression exposure matching the stated squat goal.');

  const oapGoal = /one.?arm pull|\boap\b/i.test(`${primary} ${secondary}`);
  if (oapGoal && oap != null && oap >= 2) {
    required.push(`OAP LEVEL: athlete already owns ${oap} strict One-Arm Pull-up reps. Program from demonstrated advanced level.`);
    required.push('OAP exposure A: strict One-Arm Pull-up singles or clusters, multiple high-quality singles per arm, normally at least 1 rep from technical failure.');
    required.push('OAP exposure B: Assisted One-Arm Pull-up doubles or triples with the minimum assistance needed for clean symmetrical reps. Progress by less assistance or more clean reps.');
    required.push('OAP SPECIFICITY HIERARCHY: direct unilateral practice drives the skill. Weighted Chin-up or Weighted Pull-up is valuable base strength support, like wall HSPU supporting freestanding HSPU, but it never counts as either required direct OAP exposure.');
    forbidden.push('One-Arm Pull-up Eccentric/negative as either main OAP exposure for an athlete already owning 2+ strict reps.');
    forbidden.push('Archer Pull-up or generic bilateral pulling as a substitute for either required unilateral OAP exposure.');
    if (chin1rm) optional.push(`Weighted Chin-up may be used once weekly as bilateral support for OAP but never replace unilateral specificity. With current +${chin1rm} kg external-load 1RM, an initial 4-6 rep support range around +${round25(chin1rm*.55)} to +${round25(chin1rm*.72)} kg is plausible, autoregulated by RPE and elbow/grip freshness.`);
  } else if (oapGoal) required.push('One or two unilateral-specific OAP exposures matched to demonstrated level.');

  const strictOhpGoal = /overhead press|\bohp\b/i.test(secondary);
  if (strictOhpGoal) {
    required.push('STRICT OHP IS A PROGRESSION GOAL, not maintenance. Keep at least one direct strict Overhead Press exposure every week.');
    required.push('Use at least two meaningful vertical-press exposures on separate days. One should be direct strict Overhead Press. The second may deliberately vary the stimulus, for example a volume strict Overhead Press or Push Press overload, when that better manages fatigue and transfer.');
    required.push('Variation is a tool, not random exercise rotation. The secondary press must have a clear job: strength reserve, overload, power, technique or volume, and must not reduce direct strict-OHP practice below one meaningful weekly exposure.');
    required.push('OHP direct exposure: usually 3-6 reps per set around RPE 7-8.5. Secondary overhead exposure may use a different rep range or Push Press while staying submaximal enough to coexist with sport.');
    if (ohpCurrent) required.push(`Current strict OHP anchor is ${ohpCurrent.kg} kg${ohpCurrent.reps ? ` x about ${ohpCurrent.reps}+ reps` : ''}; prescribe from CURRENT performance, not historical PR or target.`);
    if (ohpGoal) required.push(`Long-term strict OHP target is about ${ohpGoal} kg; use repeatable submaximal progression, not token maintenance or weekly grinders.`);
    forbidden.push('Freestanding HSPU volume that steals recovery/session time from strict OHP when HSPU is explicitly nice-to-have.');
  }

  // Source-grounded aerobic-base routing. Do not infer a Zone-2 goal from a
  // restriction sentence such as "avoid hard conditioning", and do not hard-code
  // a universal two-session dose. The endurance knowledge layer owns frequency,
  // duration and modality selection.
  const zone2Goal = /zone\s*2|aerobic(?:\s+base)?|day.to.day energy/i.test(`${secondary} ${maintenance}`); // SOURCE-ROUTED-ZONE2-GOAL
  if (zone2Goal) {
    required.push('Explicit aerobic-base / Zone 2 goal: include meaningful low-intensity work, but choose frequency, duration and modality from the curated endurance sources and the athlete recovery budget rather than a universal fixed dose.');
    forbidden.push('Unrequested hard intervals, threshold, VO2, AMRAP, sprints or hard running when combat sport already supplies high-intensity conditioning.');
  }

  if (/sciatica|lumbar|lower back|low back/i.test(pain)) {
    forbidden.push('Deep loaded squatting that reproduces lumbar-flexion symptoms.');
    forbidden.push('Heavy Romanian Deadlift, Good Morning or Back Extension unless tolerance is explicitly established and the row states a tolerance gate.');
  }
  if (/box squat/i.test(pain) && /tolerat/i.test(pain)) optional.push('Use explicitly tolerated Box Squat to Parallel instead of forcing deeper ROM.');
  if (/hip thrust/i.test(pain) && /tolerat/i.test(pain)) optional.push('Hip Thrust or Glute Bridge is preferred low-spinal-fatigue posterior-chain assistance.');
  if (/cable lateral/i.test(maintenance)) required.push('Retain direct Cable Lateral Raise at minimum useful dose.');
  if (/face pull/i.test(maintenance)) required.push('Retain Face Pull at minimum useful dose.');
  if (/explosive|jump|med ball|medicine ball/i.test(`${maintenance} ${notes}`)) required.push('Retain one or two very low-volume explosive primers. For the current verified demo path use Box Jump. Place after warm-up and before heavy strength; stop before velocity loss.');

  const sportText = `${txt(intake.sport)} ${maintenance} ${notes}`.toLowerCase();
  optional.push('OPTIONAL GPP HEURISTIC: if primary/secondary work is fully covered and there is about 5-10 minutes of real time/recovery headroom, add at most 1-2 low-cost accessory micro-doses across the week. They are optional and first to be removed when session length, recovery or sport quality suffers.');
  if (/bjj|jiu.?jitsu|grappl|mma|wrestl/.test(sportText)) optional.push('Combat/grappling GPP menu when justified: Pallof Press or Side Plank for trunk stiffness, Suitcase/Farmer Carry for bracing/grip, Copenhagen/hip-adductor work when groin robustness is relevant, Neck Isometric for neck capacity, and a small curl/arm-hypertrophy dose when elbow-flexor strength or local robustness is useful. Choose needs-based items, not all of them.');
  else optional.push('General GPP menu when justified: Pallof Press/Side Plank, Suitcase or Farmer Carry, Glute Bridge, Neck Isometric, calves or a small local hypertrophy dose matched to the athlete and sport. Choose 1-2 needs-based items, not a checklist.');

  const strengthDaysRequested = Number(intake.days_per_week)>=1 && (/strength sessions?|strength days?|strength/i.test(`${notes} ${primary} ${secondary}`) || String(intake.split_preference||'').toLowerCase()==='full_body');
  if (strengthDaysRequested) required.push(`ALL ${days.length} listed gym days are genuine strength/full-body sessions. Zone 2 may be appended/separate, but no gym day may be cardio-only. Every gym day needs real strength or advanced-skill work; with full-body preference it should normally include meaningful upper and lower/support work when recovery allows.`);

  const labels=[];
  if (squatDual) labels.push('BOX_SQUAT_REP','BOX_SQUAT_HEAVY'); else if (squatGoal) labels.push('SQUAT_SPECIFIC');
  if (oapGoal && oap!=null && oap>=2) labels.push('OAP_ASSISTED_ADVANCED','OAP_STRICT'); else if (oapGoal) labels.push('OAP_SPECIFIC');
  if (strictOhpGoal) labels.push('OHP_DIRECT','OHP_SECONDARY_VARIATION');
  if (zone2Goal) labels.push('AEROBIC_BASE_SOURCE_SELECTED'); // no universal frequency floor
  const sessions=distribute(days,labels), cleanDays=days.filter(d=>!sport[d]);
  if (squatDual && cleanDays.length) { const d=cleanDays.at(-1); for (const x of days) sessions[x]=sessions[x].filter(v=>v!=='BOX_SQUAT_HEAVY'); sessions[d].unshift('BOX_SQUAT_HEAVY'); }
  if (oapGoal && oap!=null && oap>=2 && cleanDays.length) { const d=cleanDays[0]; for (const x of days) sessions[x]=sessions[x].filter(v=>v!=='OAP_STRICT'); sessions[d].unshift('OAP_STRICT'); }
  if (strengthDaysRequested) for (const d of days) if (!sessions[d].some(x=>!/^ZONE2_/.test(x))) sessions[d].unshift('LOW_COST_STRENGTH_SUPPORT');

  const specialist = buildSpecialistRules(intake);
  return [
    '=== DETERMINISTIC PROGRAM SKELETON, DO NOT DELETE REQUIRED EXPOSURES ===',
    `Gym days (${days.length}): ${days.join(', ')}.`,
    time ? `Session-time preference: ${time.label}. Treat ${limit} minutes as the ceiling, not a target to fill. A shorter excellent session inside the selected range is preferred to filler.` : 'Keep sessions realistically time-bounded.',
    'Required coaching constraints:', ...required.map(x=>`* ${x}`),
    optional.length ? 'Preferred/support choices:' : '', ...optional.map(x=>`* ${x}`),
    forbidden.length ? 'Forbidden/tolerance-gated choices:' : '', ...forbidden.map(x=>`* ${x}`),
    specialist,
    'Session skeleton:', ...days.map(d=>`* ${d}: ${sessions[d].length?sessions[d].join(', '):'low-cost strength/support only'}; ${sport[d]?`same-day sport=${sport[d]}`:'no listed sport'}.`),
    'LOW_COST_STRENGTH_SUPPORT means real low-fatigue strength selected from athlete needs, never cardio-only filler.',
    'Exercise-name rule: use exact verified canonical names. Never output [REVIEW], support messages or placeholder exercise rows. Never invent exercise variations.',
    'Model responsibility: choose realistic sets, reps, loads, RPE/RIR, rest, compact warm-up ramps, four-week progression and concise notes around this skeleton. Cut lower-priority work before primary specificity.'
  ].filter(Boolean).join('\n');
}
