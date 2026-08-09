// Phase 15 integrated coaching QA.
// Runs after the existing validators. Prompt rules prevent errors, validation catches
// substantive misses, and deterministic repair is limited to safe row ordering.

import {
  decomposePerformanceGoals,
  advancedOapPrescription,
  painToleranceGate,
  estimateSessionMinutes,
} from "./phase15_quality_rules.js";

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
  const text = JSON.stringify(intake || {});
  const m = text.match(/(?:session|gym|training)[^\d]{0,30}(\d{2,3})\s*(?:min|minutes)/i);
  return m ? Number(m[1]) : null;
}

function currentOapReps(intake) {
  const text = JSON.stringify(intake || {});
  const patterns = [
    /(?:one.?arm pull.?up|oap)[^\d]{0,40}(\d+)\s*(?:strict\s*)?(?:reps?|x\b)/i,
    /(\d+)\s*(?:strict\s*)?(?:one.?arm pull.?ups?|oaps?)/i,
  ];
  for (const re of patterns) { const m = text.match(re); if (m) return Number(m[1]); }
  return null;
}

function rowsByDay(parsed) {
  const d = parsed.idx.day;
  const e = parsed.idx.exercise;
  const s = parsed.idx.sets;
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
  const e = parsed.idx.exercise;
  const notes = parsed.idx.notes;
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
  const nums = [...JSON.stringify(intake).matchAll(/(?:overhead press|ohp)[^\d]{0,40}(\d+(?:\.\d+)?)\s*kg/gi)].map(m => Number(m[1]));
  if (nums.length < 2) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return hi >= lo * 1.15 ? { current:lo, target:hi } : null;
}

function asksLowFatigueAerobicOnly(intake) {
  const text = JSON.stringify({secondary:intake.secondary_goals, maintenance:intake.maintenance_goals, notes:intake.notes}).toLowerCase();
  return /(zone\s*2|aerobic base|day to day energy|low fatigue)/.test(text) && /(do not add hard|without reducing|without compromising|2 to 3 zone|two to three zone)/.test(text);
}

export function phase15PromptRules(intake = {}) {
  const decomposed = decomposePerformanceGoals(intake);
  const oap = currentOapReps(intake);
  const limit = sessionLimit(intake);
  const pain = JSON.stringify(intake.pain || intake.limitations || "");
  const primary = goalText(intake, "primary_goals");
  const ohp = farOhpGoal(intake);
  const rules = [
    "=== PHASE 15 QUALITY GATE (MANDATORY) ===",
    "Treat one stated goal as multiple trainable outcomes when it contains materially different performance demands. A heavy single/max target and a high-rep target on the same lift require distinct specific exposures, not one generic strength row.",
    "Current demonstrated skill level controls skill programming. Do not regress an athlete who already owns multiple strict reps to eccentric work as a main weekly exposure. Eccentrics may remain optional assistance only.",
    "A secondary strength goal that is far from current performance normally needs two meaningful weekly exposures when recovery, sport load and session time allow it. Secondary does not mean token exposure.",
    "Session duration is a hard programming constraint. Estimate warm-up, work, rest and transitions before finalizing. Remove low-priority accessories or redundant volume before cutting specific primary work.",
    "Judge total day stress from gym plus sport plus recovery. Do not label a gym session low or medium merely because each individual exercise is low cost.",
    "When jumps, throws, med-ball work or speed work are prescribed for power, place them after preparation and BEFORE fatiguing heavy strength work.",
    "Pain history is a tolerance gate, not a diagnosis. For lumbar or sciatic history, spinal-loading accessories such as back extensions, good mornings and RDL variants require explicit evidence of tolerance or a conservative alternative.",
  ];

  if (/squat/i.test(primary) && /(max|1\s*rm|exceed|over\s*\d+)/i.test(primary) && /(?:x|×)\s*(?:6|7|8|9|10|11|12)\b|(?:6|7|8|9|10|11|12)\s*reps?/i.test(primary)) {
    rules.push("THIS INTAKE HAS A DUAL BOX-SQUAT OUTCOME. Week 1 MUST contain both: (A) a max-strength specific box-squat exposure at 1-5 reps, and (B) a separate box-squat rep-strength exposure of at least 6 reps per working set or an explicitly programmed back-off/density prescription that directly progresses the stated high-rep goal. Speed doubles alone do NOT satisfy the rep-strength exposure.");
  }
  if (oap != null && oap >= 2) {
    rules.push(`THIS ATHLETE ALREADY OWNS ${oap} STRICT ONE-ARM PULL-UPS. Week 1 MUST use two advanced specific unilateral exposures. At least one must contain strict One-Arm Pull-up reps. The other should use strict clusters/singles or Assisted One-Arm Pull-up doubles/triples with minimal assistance. One-Arm Pull-up Eccentric may NOT be one of the two main weekly exposures.`);
  }
  if (ohp) {
    rules.push(`STRICT OHP IS A REAL SECONDARY PROGRESSION GOAL, parsed current about ${ohp.current} kg and target ${ohp.target} kg. Week 1 MUST contain two meaningful overhead-strength exposures on separate days, with at least one strict Overhead Press exposure. The second may be strict OHP volume/technique or an explosive Push Press exposure. Do not describe OHP as maintenance or postpone progression to a later block.`);
  }
  if (asksLowFatigueAerobicOnly(intake)) {
    rules.push("CONDITIONING INTERFERENCE RULE FOR THIS INTAKE: prioritize 2-3 low-fatigue Zone 2 exposures. Do NOT add hard rowing intervals, threshold work, VO2 work, AMRAPs or other additional hard conditioning unless the athlete explicitly requested them. BJJ/MMA already supplies high-intensity conditioning stress.");
  }

  rules.push(`Derived goal qualities for this intake: ${JSON.stringify(decomposed)}.`);
  rules.push(oap == null ? "No reliable strict OAP rep benchmark was parsed; do not assume one." : `Parsed current strict OAP capacity: ${oap} reps. Stage guidance: ${JSON.stringify(advancedOapPrescription(oap))}.`);
  rules.push(limit == null ? "No explicit numeric session-time cap was parsed; keep the requested session structure realistic." : `Parsed hard session-time cap: ${limit} minutes.`);
  rules.push(pain ? `Pain/limitation context requiring tolerance-aware selection: ${pain}.` : "No pain context supplied.");
  return rules.join("\n");
}

export class Phase15QualityError extends Error {
  constructor(flags) {
    super(`Phase 15 quality gate failed: ${flags.map(x => x.code).join(", ")}`);
    this.name = "Phase15QualityError";
    this.code = "PHASE15_QUALITY_VIOLATION";
    this.flags = flags;
    this.amendment = [
      "PHASE 15 REGENERATION REQUIRED. Correct every item below without weakening primary-goal specificity:",
      ...flags.map(f => `* ${f.code}: ${f.message}`),
      "Recalculate the whole week after corrections, including session time, sport stress and conditioning interference.",
    ].join("\n");
  }
}

export function validatePhase15Program(program, intake = {}) {
  const parsed = parseBlock(program);
  if (!parsed) throw new Phase15QualityError([{ code:"TSV_PARSE_FAIL", message:"Week 1 TSV could not be parsed." }]);
  const flags = [];
  const limit = sessionLimit(intake);
  if (limit) {
    for (const [day, rows] of Object.entries(rowsByDay(parsed))) {
      const minutes = estimateSessionMinutes(rows);
      if (minutes > Math.ceil(limit * 1.10)) flags.push({ code:"SESSION_TIME_BUDGET_EXCEEDED", message:`${day} estimates to about ${minutes} min against a ${limit} min cap. Trim redundant or low-priority work first.` });
    }
  }

  const primary = goalText(intake, "primary_goals");
  const secondary = goalText(intake, "secondary_goals");
  const all = `${primary} | ${secondary}`;

  if (/squat/i.test(primary) && /(max|1\s*rm|over\s*\d+|exceed)/i.test(primary) && /(?:x|×)\s*(?:6|7|8|9|10|11|12)\b|(?:6|7|8|9|10|11|12)\s*reps?/i.test(primary)) {
    const ex = parsed.idx.exercise, reps = parsed.idx.reps, rpe = parsed.idx["target rpe"];
    let heavy = false, repStrength = false;
    for (const row of parsed.rows) {
      const exercise = row.cells[ex] || "";
      if (!/box squat/i.test(exercise) || /^\s*\[WARMUP\]/i.test(exercise)) continue;
      const rc = row.cells[reps] || "";
      const rp = row.cells[rpe] || "";
      const n = Number((rc.match(/\d+/) || [])[0]);
      if ((n && n <= 5) || /8\.5|9|heavy|top set/i.test(rp)) heavy = true;
      if ((n && n >= 6) || /rep.?strength|back.?off|high.?rep|density/i.test(`${exercise} ${rc} ${rp} ${row.cells[parsed.idx.notes] || ""}`)) repStrength = true;
    }
    if (!heavy || !repStrength) flags.push({ code:"MULTI_OUTCOME_GOAL_UNDERCOVERED", message:"The box-squat goal contains both max-strength and 180 x 10 outcomes. Week 1 needs a max-strength exposure and a distinct >=6-rep/back-off rep-strength exposure. Speed work alone is insufficient." });
  }

  const oap = currentOapReps(intake);
  if (oap != null && oap >= 2 && /one.?arm pull|oap/i.test(all)) {
    const strictDays = countExposure(parsed, /\bone.?arm (?:pull|chin).?up\b/i, /(eccentric|negative|assisted|partial|isometric)/i);
    const assistedDays = countExposure(parsed, /assisted one.?arm (?:pull|chin).?up/i);
    const eccentricDays = countExposure(parsed, /one.?arm (?:pull|chin).?up eccentric|one.?arm (?:pull|chin).?up negative/i);
    if (strictDays < 1 || strictDays + assistedDays < 2 || eccentricDays >= 1) flags.push({ code:"ADVANCED_SKILL_REGRESSION", message:`Current OAP benchmark is ${oap} strict reps. Require two advanced specific exposures with strict work present; eccentrics cannot be a main weekly exposure.` });
  }

  const ohp = farOhpGoal(intake);
  if (ohp && countExposure(parsed, /overhead press|standing barbell overhead press|push press/i) < 2) {
    flags.push({ code:"FAR_SECONDARY_STRENGTH_TOKEN_DOSE", message:`Secondary overhead-strength target is materially above current benchmark (${ohp.current} to ${ohp.target} kg) but receives fewer than two weekly exposures.` });
  }
  if (ohp && /overhead press[\s\S]{0,200}(maintain|maintained|later block|not progress)/i.test(program)) {
    flags.push({ code:"SECONDARY_GOAL_NARRATIVE_CONTRADICTION", message:"OHP is a progression goal but the client-facing narrative describes it as maintenance or postpones progression." });
  }

  const pain = JSON.stringify(intake.pain || intake.limitations || "");
  if (/(sciatica|lumbar|lower back|low back)/i.test(pain)) {
    const ex = parsed.idx.exercise, notes = parsed.idx.notes;
    for (const row of parsed.rows) {
      const exercise = row.cells[ex] || "";
      const gate = painToleranceGate(exercise, intake);
      if (gate.allowed === "tolerance_gate") {
        const note = notes >= 0 ? row.cells[notes] || "" : "";
        if (!/(toler|pain.?free|symptom|if comfortable|stop if|proven)/i.test(note)) flags.push({ code:"PAIN_TOLERANCE_NOT_ACKNOWLEDGED", message:`${exercise} requires an explicit tolerance condition or a lower-risk substitute for this pain history.` });
      }
    }
  }

  if (asksLowFatigueAerobicOnly(intake)) {
    const e = parsed.idx.exercise, n = parsed.idx.notes;
    for (const row of parsed.rows) {
      const ctx = `${row.cells[e] || ""} ${n >= 0 ? row.cells[n] || "" : ""}`;
      if (/(interval|threshold|vo2|amrap|hard conditioning|anaerobic|sprint)/i.test(ctx) && !/warmup/i.test(ctx)) {
        flags.push({ code:"UNREQUESTED_CONDITIONING_INTERFERENCE", message:`Additional hard conditioning '${row.cells[e] || ""}' conflicts with the requested low-fatigue aerobic emphasis and heavy BJJ/MMA schedule.` });
      }
    }
  }

  if (flags.length) throw new Phase15QualityError(flags);
  return { ok:true, flags:[] };
}

export function repairPhase15Program(program) {
  const parsed = parseBlock(program);
  if (!parsed) return program;
  const dayIdx = parsed.idx.day, exIdx = parsed.idx.exercise;
  const groups = [];
  let current = null;
  for (const row of parsed.rows) {
    const day = row.cells[dayIdx] || "";
    if (!current || current.day !== day) { current = { day, rows:[] }; groups.push(current); }
    current.rows.push(row);
  }
  const power = /(med.?ball|medicine ball|box jump|broad jump|vertical jump|throw|slam|plyo|speed squat|speed box squat|speed bench)/i;
  const heavy = /(box squat|back squat|front squat|deadlift|bench press|overhead press|weighted pull|weighted chin)/i;
  const rebuilt = [];
  for (const g of groups) {
    const warm = g.rows.filter(r => /^\s*\[WARMUP\]/i.test(r.cells[exIdx] || ""));
    const work = g.rows.filter(r => !/^\s*\[WARMUP\]/i.test(r.cells[exIdx] || ""));
    const firstHeavy = work.findIndex(r => heavy.test(r.cells[exIdx] || ""));
    if (firstHeavy >= 0) {
      const movedPower = work.filter((r,i) => i > firstHeavy && power.test(r.cells[exIdx] || ""));
      const rest = work.filter((r,i) => !(i > firstHeavy && power.test(r.cells[exIdx] || "")));
      rebuilt.push(...warm, ...movedPower, ...rest);
    } else rebuilt.push(...warm, ...work);
  }
  const newInner = [parsed.header.join(parsed.delim), ...rebuilt.map(r => r.cells.join(parsed.delim))].join("\n");
  return String(program).replace(/START_WEEK1_TSV\s*\n[\s\S]*?\nEND_WEEK1_TSV/i, `START_WEEK1_TSV\n${newInner}\nEND_WEEK1_TSV`);
}
