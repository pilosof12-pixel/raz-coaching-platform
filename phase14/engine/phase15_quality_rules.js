// Phase 15 coaching quality layer
// Deterministic helpers for the gaps found by the Raz benchmark QA.
// Dependency free so they can be unit tested before being wired into server.js.

const DAY_MINUTES = { mon:0,tue:0,wed:0,thu:0,fri:0,sat:0,sun:0 };

export function decomposePerformanceGoals(intake = {}) {
  const goals = [...(intake.primary_goals || []), ...(intake.secondary_goals || [])]
    .map(x => typeof x === "string" ? x : JSON.stringify(x));
  return goals.map(text => {
    const s = text.toLowerCase();
    const qualities = new Set();
    if (/1\s*rm|max\b|single|exceed|over\s*\d+\s*kg/.test(s)) qualities.add("max_strength");
    if (/\d+\s*(?:kg)?\s*[x×]\s*(?:6|7|8|9|10|11|12)\b|\b(?:6|7|8|9|10|11|12)\s*reps?\b/.test(s)) qualities.add("strength_endurance");
    if (/one.?arm pull|oap|planche|front lever|human flag|handstand|hspu|muscle.?up/.test(s)) qualities.add("skill_strength");
    if (/aerobic|zone\s*2|conditioning|energy|gas tank|cardio/.test(s)) qualities.add("aerobic");
    if (/hypertrophy|muscle mass|lateral delt|rear delt/.test(s)) qualities.add("hypertrophy");
    if (/power|explosive|jump|throw|speed/.test(s)) qualities.add("power");
    return { text, qualities: [...qualities] };
  });
}

export function estimateSessionMinutes(rows = []) {
  let total = 0;
  for (const row of rows) {
    const ex = String(row.exercise || row.Exercise || "").toLowerCase();
    const sets = Math.max(1, Number(row.sets || row.Sets || 1) || 1);
    const reps = String(row.reps || row.Reps || row.duration || "");
    const rest = String(row.rest || row.Rest || "");
    if (/zone\s*2|rower|bike|incline walk|run/.test(ex)) {
      const m = reps.match(/(\d+)\s*min/i);
      if (m) { total += Number(m[1]); continue; }
    }
    const restSec = (() => {
      const m = rest.match(/(\d+(?:\.\d+)?)\s*(min|s|sec)/i);
      if (!m) return 90;
      return /min/i.test(m[2]) ? Number(m[1]) * 60 : Number(m[1]);
    })();
    const workSec = /warmup|warm-up|\[warmup\]/.test(ex) ? 60 : 35;
    total += (sets * workSec + Math.max(0, sets - 1) * restSec) / 60;
    total += 0.5;
  }
  return Math.ceil(total);
}

export function validateSessionTimeBudget(rowsByDay = {}, maxMinutes = 70) {
  const flags = [];
  for (const [day, rows] of Object.entries(rowsByDay)) {
    const estimated = estimateSessionMinutes(rows);
    if (estimated > maxMinutes) flags.push({ day, estimated, maxMinutes, code:"SESSION_TIME_BUDGET_EXCEEDED" });
  }
  return flags;
}

export function classifyTotalDayStress({ gym = 0, sport = "none", sleep = "normal", recovery = "normal" } = {}) {
  const sportScore = /hard/i.test(sport) ? 3 : /moderate/i.test(sport) ? 2 : /light/i.test(sport) ? 1 : 0;
  const recoveryPenalty = /poor|low|bad/i.test(`${sleep} ${recovery}`) ? 1 : 0;
  const score = Number(gym || 0) + sportScore + recoveryPenalty;
  return score >= 6 ? "high" : score >= 3 ? "moderate" : "low";
}

export function advancedOapPrescription(currentStrictReps) {
  const n = Number(currentStrictReps || 0);
  if (n <= 0) return { stage:"first_rep", primary:["Assisted One-Arm Pull-up","One-Arm Pull-up Eccentric"] };
  if (n === 1) return { stage:"single_owned", primary:["One-Arm Pull-up","Assisted One-Arm Pull-up"], note:"Use clean singles plus assisted volume." };
  if (n <= 3) return { stage:"multi_rep", primary:["One-Arm Pull-up","Assisted One-Arm Pull-up"], note:"Prioritize strict submaximal singles or clusters and lightly assisted doubles/triples. Eccentrics are optional assistance, not a main weekly exposure." };
  return { stage:"rep_strength", primary:["One-Arm Pull-up","Weighted One-Arm Pull-up"], note:"Progress density, reps, or external load while preserving strict form." };
}

export function enforcePowerBeforeStrength(rows = []) {
  const power = /(med ball|medicine ball|jump|throw|slam|plyo|speed)/i;
  const heavy = /(heavy|max effort|box squat|back squat|front squat|deadlift|bench press|overhead press)/i;
  const firstHeavy = rows.findIndex(r => heavy.test(String(r.exercise || r.Exercise || "")) && !power.test(String(r.exercise || r.Exercise || "")));
  if (firstHeavy < 0) return rows;
  const before = [], after = [];
  rows.forEach((r,i) => (power.test(String(r.exercise || r.Exercise || "")) && i > firstHeavy ? before : after).push(r));
  if (!before.length) return rows;
  const warmups = after.filter(r => /warmup|warm-up|\[warmup\]/i.test(String(r.exercise || r.Exercise || "")));
  const work = after.filter(r => !/warmup|warm-up|\[warmup\]/i.test(String(r.exercise || r.Exercise || "")));
  return [...warmups, ...before, ...work];
}

export function painToleranceGate(exercise, intake = {}) {
  const ex = String(exercise || "").toLowerCase();
  const pain = JSON.stringify(intake.pain || intake.limitations || "").toLowerCase();
  if (!pain) return { allowed:true };
  if (/(sciatica|lumbar|lower back|low back)/.test(pain)) {
    if (/deep squat|ass to grass|atg squat/.test(ex)) return { allowed:false, code:"PAIN_TOLERANCE_CONFLICT", alternatives:["Box Squat to Parallel","Hip Thrust","Leg Curl"] };
    if (/back extension|romanian deadlift|good morning/.test(ex)) return { allowed:"tolerance_gate", code:"SPINAL_LOAD_REQUIRES_TOLERANCE_CHECK", alternatives:["Hip Thrust","Glute Bridge","Leg Curl","Machine Hamstring Curl"] };
  }
  return { allowed:true };
}

export function goalDoseFloor({ priority="secondary", distance="unknown", quality="strength" } = {}) {
  if (priority === "primary") return quality === "skill_strength" ? 2 : 2;
  if (priority === "secondary" && distance === "far" && /strength|skill/.test(quality)) return 2;
  if (priority === "secondary") return 1;
  return 1;
}

export function phase15QualitySummary(intake = {}) {
  return {
    decomposedGoals: decomposePerformanceGoals(intake),
    rules: {
      multiOutcomeGoalsMustReceiveDistinctSpecificExposure: true,
      farSecondaryStrengthGoalsNeedTwoExposuresWhenRecoveryAllows: true,
      sessionTimeIsHardConstraint: true,
      totalDayStressIncludesSportAndRecovery: true,
      powerPrecedesHeavyStrength: true,
      advancedSkillStageUsesCurrentPerformance: true,
      spinalLoadingAccessoriesRequireToleranceGate: true,
    },
  };
}
