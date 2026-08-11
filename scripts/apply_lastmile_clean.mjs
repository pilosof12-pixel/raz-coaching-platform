import fs from 'node:fs';

function replaceOnce(text, find, replacement, label) {
  const count = text.split(find).length - 1;
  if (count === 0 && text.includes(replacement)) return text;
  if (count !== 1) throw new Error(`${label}: expected exactly one patch anchor, found ${count}`);
  return text.replace(find, replacement);
}

const builderPath = 'phase14/scripts/build_phase15_runtime.mjs';
let b = fs.readFileSync(builderPath, 'utf8');
const originalBuilder = b;

b = b.replaceAll('sentUserChars > 30000', 'sentUserChars > 45000');
b = b.replaceAll('exceeded 30000 characters', 'exceeded 45000 characters');
b = b.replaceAll('deterministic-skeleton-v5.2.9-source-grounded', 'deterministic-skeleton-v5.2.10-source-grounded');
b = b.replaceAll('raz-phase15-source-grounded-v5-2-9', 'raz-phase15-source-grounded-v5-2-10');

const oldFinalQa = '      validatePhase15FinalProgram(program, intake);              // step 11: variation-aware final QA\\\n      await onProgress("finalizing", attempt, "quality checks passed including Phase 15 v5");';
const newFinalQa = '      validatePhase15FinalProgram(program, intake);              // step 11: variation-aware final QA\\\n      const formulaQa = stripAndFlagFormulaViolations(program, intake); // step 12: legacy formula guard, now hard-fail\\\n      if (formulaQa.violations > 0) {\\\n        const formulaErr = new Error("Formula QA violation: " + formulaQa.flags.join(" | "));\\\n        formulaErr.code = "FORMULA_QA_VIOLATION";\\\n        formulaErr.amendment = "FORMULA QA REGENERATION REQUIRED. Correct every item below:\\n* " + formulaQa.flags.join("\\n* ");\\\n        throw formulaErr;\\\n      }\\\n      await onProgress("finalizing", attempt, "quality checks passed including Phase 15 v5");';
b = replaceOnce(b, oldFinalQa, newFinalQa, 'builder formula hard-fail');

if (b !== originalBuilder) fs.writeFileSync(builderPath, b);
console.log(`${builderPath}: ${b !== originalBuilder ? 'updated v5.2.10 + formula hard-fail' : 'already current'}`);

const qaPath = 'phase14/engine/phase15_program_qa.js';
let q = fs.readFileSync(qaPath, 'utf8');
const originalQa = q;

const strengthAnchor = `function asksStrengthDays(intake) {\n  const text = JSON.stringify({p:intake.primary_goals,s:intake.secondary_goals,n:intake.notes,split:intake.split_preference}).toLowerCase();\n  return /strength sessions?|strength days?|full[_\\s-]?body|strength/.test(text);\n}\n`;
const modalityHelpers = `function asksStrengthDays(intake) {\n  const text = JSON.stringify({p:intake.primary_goals,s:intake.secondary_goals,n:intake.notes,split:intake.split_preference}).toLowerCase();\n  return /strength sessions?|strength days?|full[_\\s-]?body|strength/.test(text);\n}\n\nexport function specificModalityRequirement(intake = {}) {\n  const goals = \`${'${goalText(intake, "primary_goals")} | ${goalText(intake, "secondary_goals")}' }\`.toLowerCase();\n  const sport = String(intake?.sport || '').toLowerCase();\n  const scheduled = Array.isArray(intake?.sport_schedule) && intake.sport_schedule.length > 0;\n  const defs = [\n    { key:'running', goal:/\\b(?:5\\s*k(?:m)?|10\\s*k(?:m)?|half[- ]?marathon|marathon|running|run goal|sprint(?:ing)?|mile time)\\b/i, exposure:/\\b(?:run|running|jog|jogging|treadmill|sprint)\\b/i, external:/\\b(?:run|running|track|sprint)\\b/i },\n    { key:'swimming', goal:/\\b(?:swim|swimming|freestyle|backstroke|breaststroke|butterfly|pool time)\\b/i, exposure:/\\b(?:swim|swimming|pool|freestyle|backstroke|breaststroke|butterfly)\\b/i, external:/\\b(?:swim|swimming)\\b/i },\n    { key:'rowing', goal:/\\b(?:rowing|rower|erg(?:ometer)?|concept ?2|(?:2|5)\\s*k\\s*row|500\\s*m\\s*row|1000\\s*m\\s*row)\\b/i, exposure:/\\b(?:rower|rowing|erg|concept ?2)\\b/i, external:/\\b(?:rowing|rower|crew)\\b/i },\n    { key:'cycling', goal:/\\b(?:cycling|cyclist|bike time trial|cycling time trial|road bike|criterium)\\b/i, exposure:/\\b(?:bike|cycling|cycle|airbike|assault bike|stationary bike)\\b/i, external:/\\b(?:cycling|cyclist|road bike)\\b/i },\n  ];\n  const def = defs.find(x => x.goal.test(goals));\n  if (!def) return null; // generic conditioning/aerobic goals remain engine-selected\n  return { key:def.key, exposure:def.exposure, externalSatisfied: scheduled && def.external.test(sport) };\n}\n\nexport function hasSpecificModalityExposure(program, intake = {}) {\n  const req = specificModalityRequirement(intake);\n  if (!req || req.externalSatisfied) return true;\n  const parsed = parseBlock(program);\n  if (!parsed) return false;\n  const e = parsed.idx.exercise, notes = parsed.idx.notes;\n  return parsed.rows.some(row => {\n    const ex = row.cells[e] || '';\n    if (/^\\s*\\[WARMUP\\]/i.test(ex)) return false;\n    const ctx = \`${'${ex} ${notes >= 0 ? row.cells[notes] || "" : ""}' }\`;\n    return req.exposure.test(ctx);\n  });\n}\n`;
q = replaceOnce(q, strengthAnchor, modalityHelpers, 'specific modality helpers');

const baseRule = '    "Judge total day stress from gym plus sport plus recovery.",';
const modalityBaseRule = '    "Judge total day stress from gym plus sport plus recovery.",\n    "SPORT-SPECIFICITY RULE: when a client names a specific sport modality or event as a performance goal, preserve at least one direct exposure to that modality. Cross-training may supplement it but must not completely replace it. Generic conditioning/aerobic goals with no stated modality remain coach-selected.",';
q = replaceOnce(q, baseRule, modalityBaseRule, 'modality prompt base rule');

const aerobicAnchor = '  if (asksLowFatigueAerobicOnly(intake)) rules.push("AEROBIC HARD RULE: use 2-3 low-fatigue Zone 2 exposures, normally >=20 min for a meaningful dedicated exposure. No unrequested intervals, threshold, VO2, AMRAP or sprint conditioning.");';
const aerobicWithSpecificity = '  if (asksLowFatigueAerobicOnly(intake)) rules.push("AEROBIC HARD RULE: use 2-3 low-fatigue Zone 2 exposures, normally >=20 min for a meaningful dedicated exposure. No unrequested intervals, threshold, VO2, AMRAP or sprint conditioning.");\n  const modalityReq = specificModalityRequirement(intake);\n  if (modalityReq && !modalityReq.externalSatisfied) rules.push(`MODALITY-SPECIFIC HARD RULE: ${modalityReq.key} is an explicit performance goal. Include at least one direct ${modalityReq.key} exposure in Week 1 and preserve modality-specific practice across the block. Bike/row/swim/run cross-training may supplement but cannot replace the named modality.`);';
q = replaceOnce(q, aerobicAnchor, aerobicWithSpecificity, 'specific modality prompt');

const oldStrengthPrompt = '  if (asksStrengthDays(intake) && Number(intake.days_per_week) > 0) rules.push(`STRENGTH-DAY HARD RULE: all ${Number(intake.days_per_week)} requested gym days must contain real strength or advanced-skill work. A cardio-only gym day does not count.`);';
const newStrengthPrompt = '  if (asksStrengthDays(intake) && Number(intake.days_per_week) > 0) rules.push(`STRENGTH-DAY RULE: ${Number(intake.days_per_week)} is the requested/available gym-session count, not a demand that every day be heavy. Low-cost accessory, rehab-oriented resistance, or advanced-skill work can be appropriate when sport load is high. A cardio-only day does not count as a strength day, and the program must not silently replace requested strength work with conditioning; if recovery requires a deliberate reduction, explain that tradeoff plainly.`);';
q = replaceOnce(q, oldStrengthPrompt, newStrengthPrompt, 'strength-day nuance');

const validatorAnchor = '  const primary = goalText(intake, "primary_goals"), secondary = goalText(intake, "secondary_goals"), all = `${primary} | ${secondary}`;';
const validatorSpecificity = '  const primary = goalText(intake, "primary_goals"), secondary = goalText(intake, "secondary_goals"), all = `${primary} | ${secondary}`;\n\n  const modalityReq = specificModalityRequirement(intake);\n  if (modalityReq && !hasSpecificModalityExposure(raw, intake)) {\n    flags.push({ code:"SPORT_MODALITY_SPECIFICITY_MISSING", message:`${modalityReq.key} is an explicit performance goal but Week 1 contains no direct ${modalityReq.key} exposure. Cross-training cannot fully replace the named modality.` });\n  }';
q = replaceOnce(q, validatorAnchor, validatorSpecificity, 'specific modality validator');

if (q !== originalQa) fs.writeFileSync(qaPath, q);
console.log(`${qaPath}: ${q !== originalQa ? 'added modality specificity + nuanced strength-day rule' : 'already current'}`);

const serverPath = 'phase14/server.js';
let s = fs.readFileSync(serverPath, 'utf8');
const originalServer = s;
s = replaceOnce(
  s,
  '    if (!isDensityLabeled && !movement) continue;',
  '    if (!isDensityLabeled) continue; // ordinary lower-load strength sets may exceed a current rep benchmark; only density/endurance rows use this ceiling',
  'density false-positive guard'
);
s = replaceOnce(
  s,
  '      if (err && err.code && RETRIABLE_CODES.has(err.code)) {',
  '      if (err && err.code && (RETRIABLE_CODES.has(err.code) || err.code === "PHASE15_QUALITY_VIOLATION" || err.code === "FORMULA_QA_VIOLATION")) {',
  'phase15/formula retry codes'
);
s = replaceOnce(
  s,
  '        if (failCounts[err.code] >= 2 || attempt === MAX_ATTEMPTS) {',
  '        if ((failCounts[err.code] >= 2 || attempt === MAX_ATTEMPTS) && err.code !== "PHASE15_QUALITY_VIOLATION" && err.code !== "FORMULA_QA_VIOLATION") {',
  'prevent unsafe hard-substitute for quality failures'
);
s = replaceOnce(
  s,
  '  if (lastValid) {\n    for (const code of Object.keys(failCounts)) lastValid = hardSubstitute(code, lastValid, intake);',
  '  if (failCounts.PHASE15_QUALITY_VIOLATION || failCounts.FORMULA_QA_VIOLATION) {\n    throw new Error("Program failed the final coaching quality gate after multiple regeneration attempts. Please retry the build.");\n  }\n  if (lastValid) {\n    for (const code of Object.keys(failCounts)) lastValid = hardSubstitute(code, lastValid, intake);',
  'quality failure must not fall through to delivery'
);
if (s !== originalServer) fs.writeFileSync(serverPath, s);
console.log(`${serverPath}: ${s !== originalServer ? 'fixed density false-positive + quality retry behavior' : 'already current'}`);
