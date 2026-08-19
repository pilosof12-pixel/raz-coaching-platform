// Phase 15 integrated coaching QA.
// Runs after the existing validators. Prompt rules prevent errors, validation catches
// substantive misses, and deterministic repair is limited to safe row ordering.

import {
  decomposePerformanceGoals,
  advancedOapPrescription,
  painToleranceGate,
  estimateSessionMinutes,
} from "./phase15_quality_rules.js";
import {
  elitePromptRules,
  goalDoseFlags,
  unbenchmarkedVariationLoadFlags,
  strengthSessionAccountingFlags,
  endurancePerformanceIntegrityFlags,
  exactPrimaryMovementFlags,
} from "./phase15_elite_guardrails.js";

function norm(s) { return String(s || "").toLowerCase().trim(); }

function parseBlock(program) {
  const m = String(program || "").match(/START_WEEK1_TSV\s*\n([\s\S]*?)\nEND_WEEK1_TSV/i);
  if (!m) return null;
  const lines = m[1].split("\n").filter(x => x.trim());
  if (lines.length < 2) return null;
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].split(delim).map(x => x.trim());
  const idx = Object.fromEntries(header.map((x,i) => [norm(x), i]));
  const rows = lines.slice(1).map(line => ({ line, cells: line.split(delim), delim }));
  return { match:m, lines, header, idx, rows, delim };
}

function field(intake, names, fallback = null) {
  for (const n of names) if (intake?.[n] !== undefined && intake?.[n] !== null && intake?.[n] !== "") return intake[n];
  return fallback;
}

function sessionLimit(intake) {
  const raw = field(intake, ["session_duration_minutes","session_duration_min","session_minutes","time_per_session","available_minutes","session_length"]);
  if (Number.isFinite(Number(raw))) return Number(raw);
  const nums = [...String(raw || '').matchAll(/\d{2,3}/g)].map(m => Number(m[0])).filter(Number.isFinite);
  if (nums.length) return Math.max(...nums);
  const text = JSON.stringify(intake || {});
  const m = text.match(/(?:session|gym|training)[^\d]{0,30}(\d{2,3})(?:\s*(?:-|–|to)\s*(\d{2,3}))?\s*(?:min|minutes)/i);
  if (!m) return null;
  return Number(m[2] || m[1]);
}

function currentOapReps(intake) {
  const text = JSON.stringify(intake || {});
  const patterns = [
    /(?:one.?arm pull.?up|oap)[^\d]{0,60}(\d+)\s*(?:strict\s*)?(?:reps?|rep|maximum|max|x\b)/i,
    /(\d+)\s*(?:strict\s*)?(?:one.?arm pull.?ups?|oaps?)/i,
  ];
  for (const re of patterns) { const m = text.match(re); if (m) return Number(m[1]); }
  return null;
}

function rowsByDay(parsed) {
  const d = parsed.idx.day, e = parsed.idx.exercise, s = parsed.idx.sets;
  const r = parsed.idx.reps >= 0 ? parsed.idx.reps : parsed.idx["reps/duration"];
  const rest = parsed.idx.rest;
  const out = {};
  for (const row of parsed.rows) {
    const day = row.cells[d] || "Unknown";
    (out[day] ||= []).push({ exercise:row.cells[e]||"", sets:row.cells[s]||"1", reps:row.cells[r]||"", rest:row.cells[rest]||"", raw:row });
  }
  return out;
}

function countExposure(parsed, re, exclude = null) {
  const e = parsed.idx.exercise, notes = parsed.idx.notes;
  const days = new Set();
  for (const row of parsed.rows) {
    const ex = row.cells[e] || "";
    if (/^\s*\[WARMUP\]/i.test(ex)) continue;
    const ctx = `${ex} ${notes >= 0 ? row.cells[notes] || "" : ""}`;
    if (re.test(ctx) && !(exclude && exclude.test(ctx))) days.add(row.cells[parsed.idx.day] || "unknown");
  }
  return days.size;
}

function goalText(intake, key) {
  return (intake?.[key] || []).map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" | ");
}

function farOhpGoal(intake) {
  const secondary = goalText(intake, "secondary_goals");
  if (!/overhead press|\bohp\b/i.test(secondary)) return null;
  const nums = [...JSON.stringify(intake).matchAll(/(?:overhead press|ohp)[^\d]{0,50}(\d+(?:\.\d+)?)\s*kg/gi)].map(m => Number(m[1]));
  if (nums.length < 2) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return hi >= lo * 1.15 ? { current:lo, target:hi } : null;
}

function asksLowFatigueAerobicOnly(intake) {
  const text = JSON.stringify({secondary:intake.secondary_goals, maintenance:intake.maintenance_goals, notes:intake.notes}).toLowerCase();
  return /(zone\s*2|aerobic base|aerobic conditioning|day to day energy|low fatigue)/.test(text) && /(do not add hard|without reducing|without compromising|2 to 3 zone|two to three zone|low fatigue)/.test(text);
}

function asksStrengthDays(intake) {
  const text = JSON.stringify({p:intake.primary_goals,s:intake.secondary_goals,n:intake.notes,split:intake.split_preference}).toLowerCase();
  return /strength sessions?|strength days?|full[_\s-]?body|strength/.test(text);
}

export function specificModalityRequirement(intake = {}) {
  const goals = `${goalText(intake, "primary_goals")} | ${goalText(intake, "secondary_goals")}`.toLowerCase();
  const sport = String(intake?.sport || '').toLowerCase();
  const scheduled = Array.isArray(intake?.sport_schedule) && intake.sport_schedule.length > 0;
  const defs = [
    { key:'running', goal:/\b(?:5\s*k(?:m)?|10\s*k(?:m)?|half[- ]?marathon|marathon|running|run goal|sprint(?:ing)?|mile time)\b/i, exposure:/\b(?:run|running|jog|jogging|treadmill|sprint)\b/i, external:/\b(?:run|running|track|sprint)\b/i },
    { key:'swimming', goal:/\b(?:swim|swimming|freestyle|backstroke|breaststroke|butterfly|pool time)\b/i, exposure:/\b(?:swim|swimming|pool|freestyle|backstroke|breaststroke|butterfly)\b/i, external:/\b(?:swim|swimming)\b/i },
    { key:'rowing', goal:/\b(?:rowing|rower|erg(?:ometer)?|concept ?2|(?:2|5)\s*k\s*row|500\s*m\s*row|1000\s*m\s*row)\b/i, exposure:/\b(?:rower|rowing|erg|concept ?2)\b/i, external:/\b(?:rowing|rower|crew)\b/i },
    { key:'cycling', goal:/\b(?:cycling|cyclist|bike time trial|cycling time trial|road bike|criterium)\b/i, exposure:/\b(?:bike|cycling|cycle|airbike|assault bike|stationary bike)\b/i, external:/\b(?:cycling|cyclist|road bike)\b/i },
  ];
  const def = defs.find(x => x.goal.test(goals));
  if (!def) return null; // generic conditioning/aerobic goals remain engine-selected
  return { key:def.key, exposure:def.exposure, externalSatisfied: scheduled && def.external.test(sport) };
}

export function hasSpecificModalityExposure(program, intake = {}) {
  const req = specificModalityRequirement(intake);
  if (!req || req.externalSatisfied) return true;
  const parsed = parseBlock(program);
  if (!parsed) return false;
  const e = parsed.idx.exercise, notes = parsed.idx.notes, reps = parsed.idx.reps, weight = parsed.idx.weight, sets = parsed.idx.sets;
  return parsed.rows.some(row => {
    const ex = row.cells[e] || '';
    if (/^\s*\[WARMUP\]/i.test(ex)) return false;
    const note = notes >= 0 ? row.cells[notes] || '' : '';
    const ctx = `${ex} ${note}`;
    if (!req.exposure.test(ctx)) return false;
    const dose = `${reps >= 0 ? row.cells[reps] || "" : ""} ${weight >= 0 ? row.cells[weight] || "" : ""} ${note}`;
    const minuteValues = [...dose.matchAll(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/gi)].map(m => Number(m[1]));
    const setCount = Math.max(1, Number(sets >= 0 ? row.cells[sets] || 1 : 1) || 1);
    const continuousEnough = minuteValues.some(n => n >= 15 || n * setCount >= 15); // MEANINGFUL-SPECIFIC-SETS-DURATION
    const distanceOrIntervals = /\b\d+(?:\.\d+)?\s*(?:km|m)\b/i.test(dose) || /\b\d+\s*(?:x|×)\s*\d+(?:\.\d+)?\s*(?:m|km|min|minutes?)\b/i.test(dose);
    return continuousEnough || distanceOrIntervals; // MEANINGFUL-SPECIFIC-DOSE
  });
}

function firstNumber(s) {
  const m = String(s || "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function phase15PromptRules(intake = {}) {
  const decomposed = decomposePerformanceGoals(intake), oap = currentOapReps(intake), limit = sessionLimit(intake);
  const pain = JSON.stringify(intake.pain || intake.limitations || ""), primary = goalText(intake, "primary_goals"), ohp = farOhpGoal(intake);
  const rules = [
    "=== PHASE 15 QUALITY GATE (MANDATORY) ===",
    "Treat materially different performance outcomes as distinct trainable qualities. A max/1RM target and a high-rep target on the same lift need distinct specific exposures.",
    "Current demonstrated skill level controls skill programming. Do not regress an athlete who already owns multiple strict reps to eccentric work as a main weekly exposure.",
    "A real secondary strength progression goal needs meaningful weekly dose rather than token maintenance when recovery permits.",
    "Session duration is a ceiling, not a target to fill. Remove low-priority accessories before cutting primary specificity.",
    "Judge total day stress from gym plus sport plus recovery.",
    "SPORT-SPECIFICITY RULE: when a client names a specific sport modality or event as a performance goal, preserve at least one direct exposure to that modality. Cross-training may supplement it but must not completely replace it. Generic conditioning/aerobic goals with no stated modality remain coach-selected.",
    "Power work goes after preparation and before fatigue-producing heavy strength when power quality is the intent.",
    "Pain history is a tolerance gate, not a diagnosis. Preserve tolerated training and gate provocative spinal-loading accessories.",
    "CLIENT CLEANLINESS HARD RULE: never output [REVIEW], contact-support text, placeholder rows, QA labels or unresolved internal language. Such output is rejected and never saved to a client.",
  ];
  rules.push(...elitePromptRules(intake)); // ELITE-GUARDRAILS-PROMPT-WIRED
  if (/squat/i.test(primary) && /(max|1\s*rm|exceed|over\s*\d+)/i.test(primary) && /(?:x|×)\s*(?:6|7|8|9|10|11|12)\b|(?:6|7|8|9|10|11|12)\s*reps?/i.test(primary)) {
    rules.push("DUAL BOX-SQUAT HARD RULE: Week 1 needs (A) max-strength box-squat work at 1-5 reps and (B) separate rep-strength box-squat work at >=6 reps or explicit high-rep back-off progression. Speed doubles do not satisfy the rep target.");
  }
  if (oap != null && oap >= 2) rules.push(`ADVANCED OAP HARD RULE: athlete owns ${oap} strict reps. Week 1 needs two advanced unilateral-specific exposures with strict OAP present; assisted doubles/triples may be the second. Eccentrics cannot be a main exposure.`);
  if (ohp) rules.push(`OHP HARD RULE: current about ${ohp.current} kg, target ${ohp.target} kg. Use at least one direct strict Overhead Press exposure plus a second meaningful vertical-press exposure. Purposeful Push Press or another verified press variation may provide overload/power/volume; variation must have a clear job and may not remove direct strict-OHP practice.`);
  if (asksLowFatigueAerobicOnly(intake)) rules.push("AEROBIC HARD RULE: use 2-3 low-fatigue Zone 2 exposures, normally >=20 min for a meaningful dedicated exposure. No unrequested intervals, threshold, VO2, AMRAP or sprint conditioning.");
  const modalityReq = specificModalityRequirement(intake);
  if (modalityReq && !modalityReq.externalSatisfied) rules.push(`MODALITY-SPECIFIC HARD RULE: ${modalityReq.key} is an explicit performance goal. Include at least one meaningful direct ${modalityReq.key} exposure in Week 1, not merely a warm-up or token micro-dose, and preserve modality-specific practice across the block. Cross-training may supplement it but cannot replace the named modality.`);
  if (asksStrengthDays(intake) && Number(intake.days_per_week) > 0) rules.push(`STRENGTH-DAY RULE: ${Number(intake.days_per_week)} is the requested/available gym-session count, not a demand that every day be heavy. Low-cost accessory, rehab-oriented resistance, or advanced-skill work can be appropriate when sport load is high. A cardio-only day does not count as a strength day, and the program must not silently replace requested strength work with conditioning; if recovery requires a deliberate reduction, explain that tradeoff plainly.`);
  rules.push(`Derived goal qualities: ${JSON.stringify(decomposed)}.`);
  rules.push(oap == null ? "No reliable strict OAP benchmark parsed." : `Parsed strict OAP capacity: ${oap}. Stage guidance: ${JSON.stringify(advancedOapPrescription(oap))}.`);
  rules.push(limit == null ? "No numeric session ceiling parsed." : `Session ceiling: ${limit} minutes.`);
  rules.push(pain ? `Pain/limitation context: ${pain}.` : "No pain context supplied.");
  return rules.join("\n");
}

export class Phase15QualityError extends Error {
  constructor(flags) {
    super(`Phase 15 quality gate failed: ${flags.map(x => x.code).join(", ")}`);
    this.name = "Phase15QualityError";
    this.code = "PHASE15_QUALITY_VIOLATION";
    this.flags = flags;
    this.amendment = ["PHASE 15 REGENERATION REQUIRED. Correct every item below:", ...flags.map(f => `* ${f.code}: ${f.message}`)].join("\n");
  }
}

export function validatePhase15Program(program, intake = {}) {
  const raw = String(program || "");
  const parsed = parseBlock(raw);
  if (!parsed) throw new Phase15QualityError([{ code:"TSV_PARSE_FAIL", message:"Week 1 TSV could not be parsed." }]);
  const flags = [];

  // Avatar-agnostic integrity floor. Coaching dose itself remains source-authored.
  flags.push(...goalDoseFlags(raw, intake, parsed));
  flags.push(...unbenchmarkedVariationLoadFlags(intake, parsed));
  flags.push(...strengthSessionAccountingFlags(raw, intake, parsed)); // ELITE-GUARDRAILS-FINAL-QA-WIRED
  flags.push(...endurancePerformanceIntegrityFlags(raw, intake, parsed)); // ENDURANCE-PRESERVATION-FINAL-QA-WIRED
  flags.push(...exactPrimaryMovementFlags(raw, intake, parsed)); // EXACT-PRIMARY-MOVEMENT-FINAL-QA-WIRED

  if (/\[REVIEW\]|contact\s+support|placeholder(?:\s+exercise|\s+row)?|could not be safely generated/i.test(raw)) {
    flags.push({ code:"CLIENT_OUTPUT_NOT_READY", message:"Program contains unresolved review/support/placeholder text. Reject rather than exposing it to a client." });
  }

  for (let w=1; w<=4; w++) {
    const starts = (raw.match(new RegExp(`START_WEEK${w}_TSV`, "g")) || []).length;
    const ends = (raw.match(new RegExp(`END_WEEK${w}_TSV`, "g")) || []).length;
    if (starts !== 1 || ends !== 1) flags.push({ code:"WEEK_BLOCK_STRUCTURE_INVALID", message:`Week ${w} has ${starts} start marker(s) and ${ends} end marker(s); require exactly one of each.` });
  }

  const limit = sessionLimit(intake);
  if (limit) for (const [day, rows] of Object.entries(rowsByDay(parsed))) {
    const minutes = estimateSessionMinutes(rows);
    if (minutes > Math.ceil(limit * 1.10)) flags.push({ code:"SESSION_TIME_BUDGET_EXCEEDED", message:`${day} estimates to about ${minutes} min against ${limit} min ceiling.` });
  }

  const primary = goalText(intake, "primary_goals"), secondary = goalText(intake, "secondary_goals"), all = `${primary} | ${secondary}`;

  const modalityReq = specificModalityRequirement(intake);
  if (modalityReq && !hasSpecificModalityExposure(raw, intake)) {
    flags.push({ code:"SPORT_MODALITY_SPECIFICITY_MISSING", message:`${modalityReq.key} is an explicit performance goal but Week 1 contains no meaningful direct ${modalityReq.key} exposure. Cross-training cannot fully replace the named modality.` });
  }

  if (/squat/i.test(primary) && /(max|1\s*rm|over\s*\d+|exceed)/i.test(primary) && /(?:x|×)\s*(?:6|7|8|9|10|11|12)\b|(?:6|7|8|9|10|11|12)\s*reps?/i.test(primary)) {
    const ex = parsed.idx.exercise, reps = parsed.idx.reps, rpe = parsed.idx["target rpe"];
    let heavy=false, repStrength=false;
    for (const row of parsed.rows) {
      const exercise=row.cells[ex]||""; if (!/box squat/i.test(exercise)||/^\s*\[WARMUP\]/i.test(exercise)) continue;
      const rc=row.cells[reps]||"", rp=row.cells[rpe]||"", n=firstNumber(rc);
      if ((n && n<=5)||/8\.5|9|heavy|top set/i.test(rp)) heavy=true;
      if ((n && n>=6)||/rep.?strength|back.?off|high.?rep|density/i.test(`${exercise} ${rc} ${rp} ${row.cells[parsed.idx.notes]||""}`)) repStrength=true;
    }
    if (!heavy||!repStrength) flags.push({ code:"MULTI_OUTCOME_GOAL_UNDERCOVERED", message:"Box squat goal needs distinct max-strength and >=6-rep/high-rep-specific exposures." });
  }

  const oap=currentOapReps(intake);
  if (oap!=null&&oap>=2&&/one.?arm pull|oap/i.test(all)) {
    const strictDays=countExposure(parsed,/\bone.?arm (?:pull|chin).?up\b/i,/(eccentric|negative|assisted|partial|isometric|archer)/i);
    const assistedDays=countExposure(parsed,/assisted one.?arm (?:pull|chin).?up/i);
    const eccentricDays=countExposure(parsed,/one.?arm (?:pull|chin).?up eccentric|one.?arm (?:pull|chin).?up negative/i);
    if (strictDays<1||strictDays+assistedDays<2||eccentricDays>=1) flags.push({ code:"ADVANCED_SKILL_REGRESSION", message:`Current OAP benchmark is ${oap} strict reps. Require strict work plus a second advanced unilateral-specific exposure; no eccentric main exposure.` });
  }

  const ohp=farOhpGoal(intake);
  if (ohp) {
    const overheadDays=countExposure(parsed,/overhead press|standing barbell overhead press|push press|z press|dumbbell shoulder press/i);
    const strictDays=countExposure(parsed,/\b(overhead press|standing barbell overhead press)\b/i,/push press/i);
    if (overheadDays<2) flags.push({ code:"FAR_SECONDARY_STRENGTH_TOKEN_DOSE", message:`OHP target ${ohp.current} -> ${ohp.target} kg receives fewer than two meaningful vertical-press exposures.` });
    if (/strict overhead press/i.test(secondary) && strictDays<1) flags.push({ code:"STRICT_OHP_SPECIFICITY_UNDERDOSED", message:"Strict OHP is the stated goal but no direct strict Overhead Press exposure is programmed." });
  }
  if (ohp&&/overhead press[\s\S]{0,200}(maintain|maintained|later block|not progress)/i.test(raw)) flags.push({ code:"SECONDARY_GOAL_NARRATIVE_CONTRADICTION", message:"OHP is a progression goal but narrative describes maintenance/postponement." });

  if (asksStrengthDays(intake) && Number(intake.days_per_week)>0) {
    const e=parsed.idx.exercise, d=parsed.idx.day;
    const allDays=new Set(parsed.rows.map(r=>r.cells[d]).filter(Boolean));
    const strengthDays=new Set();
    for (const row of parsed.rows) {
      const ex=row.cells[e]||"";
      if (/^\s*\[WARMUP\]/i.test(ex)||/zone.?2|easy bike|easy row/i.test(ex)) continue;
      strengthDays.add(row.cells[d]);
    }
    if (allDays.size < Number(intake.days_per_week) || [...allDays].some(day=>!strengthDays.has(day))) flags.push({ code:"CARDIO_ONLY_STRENGTH_DAY", message:`Requested ${Number(intake.days_per_week)} strength days; each listed gym day must contain actual strength/skill work.` });
  }

  const pain=JSON.stringify(intake.pain||intake.limitations||"");
  if (/(sciatica|lumbar|lower back|low back)/i.test(pain)) {
    const ex=parsed.idx.exercise,notes=parsed.idx.notes;
    for (const row of parsed.rows) {
      const exercise=row.cells[ex]||"",gate=painToleranceGate(exercise,intake);
      if (gate.allowed==="tolerance_gate") {
        const note=notes>=0?row.cells[notes]||"":"";
        if (!/(toler|pain.?free|symptom|if comfortable|stop if|proven)/i.test(note)) flags.push({ code:"PAIN_TOLERANCE_NOT_ACKNOWLEDGED", message:`${exercise} needs an explicit tolerance condition or lower-risk substitute.` });
      }
    }
  }

  if (asksLowFatigueAerobicOnly(intake)) {
    const e=parsed.idx.exercise,n=parsed.idx.notes,reps=parsed.idx.reps;
    let meaningful=0;
    for (const row of parsed.rows) {
      const ctx=`${row.cells[e]||""} ${n>=0?row.cells[n]||"":""}`;
      if (/(interval|threshold|vo2|amrap|hard conditioning|anaerobic|sprint)/i.test(ctx)&&!/warmup/i.test(ctx)) flags.push({ code:"UNREQUESTED_CONDITIONING_INTERFERENCE", message:`Hard conditioning '${row.cells[e]||""}' conflicts with requested low-fatigue aerobic work.` });
      if (/zone.?2/i.test(ctx)) {
        const mins=firstNumber(row.cells[reps]||"");
        if (mins!=null&&mins>=20) meaningful++;
      }
    }
    if (meaningful<2) flags.push({ code:"ZONE2_DOSE_TOO_SMALL", message:"Aerobic goal requires at least two meaningful Zone 2 exposures of roughly 20+ minutes, not warm-up-sized mini-doses." });
  }

  if (flags.length) throw new Phase15QualityError(flags);
  return { ok:true, flags:[] };
}

export function repairPhase15Program(program) {
  const parsed=parseBlock(program); if (!parsed) return program;
  const dayIdx=parsed.idx.day,exIdx=parsed.idx.exercise,groups=[]; let current=null;
  for (const row of parsed.rows) { const day=row.cells[dayIdx]||""; if(!current||current.day!==day){current={day,rows:[]};groups.push(current);} current.rows.push(row); }
  const power=/(med.?ball|medicine ball|box jump|broad jump|vertical jump|throw|slam|plyo|speed squat|speed box squat|speed bench)/i;
  const heavy=/(box squat|back squat|front squat|deadlift|bench press|overhead press|weighted pull|weighted chin)/i;
  const rebuilt=[];
  for (const g of groups) {
    const warm=g.rows.filter(r=>/^\s*\[WARMUP\]/i.test(r.cells[exIdx]||""));
    const work=g.rows.filter(r=>!/^\s*\[WARMUP\]/i.test(r.cells[exIdx]||""));
    const firstHeavy=work.findIndex(r=>heavy.test(r.cells[exIdx]||""));
    if(firstHeavy>=0){const moved=work.filter((r,i)=>i>firstHeavy&&power.test(r.cells[exIdx]||""));const rest=work.filter((r,i)=>!(i>firstHeavy&&power.test(r.cells[exIdx]||"")));rebuilt.push(...warm,...moved,...rest);} else rebuilt.push(...warm,...work);
  }
  const newInner=[parsed.header.join(parsed.delim),...rebuilt.map(r=>r.cells.join(parsed.delim))].join("\n");
  return String(program).replace(/START_WEEK1_TSV\s*\n[\s\S]*?\nEND_WEEK1_TSV/i,`START_WEEK1_TSV\n${newInner}\nEND_WEEK1_TSV`);
}
