import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'server.phase15.js');
let src = fs.readFileSync(target, 'utf8');
let changed = false;

// A semantically near-valid candidate must not be thrown away simply because it
// reached attempt 2. Fresh regeneration is reserved for structural corruption,
// where surgical editing of the current TSV is unsafe. This preserves converged
// coaching decisions while still giving malformed TSV/week structure a clean reset.
const convergenceMarker = 'STRUCTURAL-ONLY-FRESH-CANDIDATE';
if (!src.includes(convergenceMarker)) {
  const anchor = '        repairCandidate = attempt === 2 ? null : program; // HYBRID-QA-FRESH-REGEN';
  const count = src.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Repair convergence anchor expected once, found ${count}`);
  const replacement = [
    '        const structuralRepairCodes = new Set([',
    '          "TSV_PARSE_FAIL", "TSV_SCHEMA_VIOLATION", "TSV_WEEK_BLOCK_MISSING",',
    '          "TSV_ROW_COLUMN_COUNT_MISMATCH", "TSV_COLUMN_COUNT", "WEEK_MARKER_COUNT",',
    '          "WEEK_MARKER_ORDER", "MISSING_WEEK_BLOCK", "WEEK_BLOCK_MISSING", "HEADER_MISMATCH"',
    '        ]);',
    '        const requiresFreshCandidate = specificCodes.some((code) => structuralRepairCodes.has(String(code || "")));',
    `        repairCandidate = requiresFreshCandidate ? null : program; // ${convergenceMarker}`,
  ].join('\n');
  src = src.replace(anchor, replacement);
  changed = true;
}

// An event-progression failure should normally be solved by improving an existing
// target-modality row, not by stacking another session onto an almost-valid plan.
// Marathon gets a measurable long-run anchor. Tactical 3K gets an event-specific
// target on one of the already-required three runs while retaining baseline volume.
const eventMarker = 'MARATHON-EVENT-ANCHOR-SURGICAL-REPAIR';
const tacticalEventMarker = 'TACTICAL-3K-EVENT-ANCHOR-SURGICAL-REPAIR';
if (!src.includes(tacticalEventMarker)) {
  const anchor = '  const unknown = flags\n    .filter((flag) => flag?.code === "EXERCISE_HALLUCINATION")';
  const count = src.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Event repair anchor expected once, found ${count}`);
  const block = `  const eventProgression = flags.find((flag) => flag?.code === "EVENT_PROGRESSING_SESSION_MISSING");\n  if (eventProgression) {\n    const goals = [intake?.primary_goals, intake?.secondary_goals].flat().filter(Boolean).map(String).join(' | ');\n    const evidence = [intake?.current_numbers, intake?.performance_markers, intake?.clarification_answers, intake?.notes].map((v) => typeof v === 'string' ? v : JSON.stringify(v || '')).join(' ');\n    if (/\\bmarathon\\b/i.test(goals)) {\n      const kmMatches = [...evidence.matchAll(/\\b(\\d+(?:\\.\\d+)?)\\s*km\\b/ig)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0);\n      const baselineKm = kmMatches.length ? Math.max(...kmMatches) : null;\n      feedback += "\\nMARATHON-EVENT-ANCHOR-SURGICAL-REPAIR: Do not add another run day or hard conditioning. Preserve the existing direct run session and make it unmistakably the marathon progression anchor by identifying it in Notes as the Long run (or Long aerobic run) and prescribing a measurable distance or duration. Week 1 must stay at or below the supplied current running baseline" + (baselineKm != null ? (" of about " + baselineKm + " km") : "") + ". Across Weeks 1-3 progress only ONE variable for this same long-run pathway, normally a small distance/duration increase while easy effort stays unchanged; copy non-selected running categories unchanged. Week 4 must consolidate below Week 3 in this high-concurrency block. Do not add intervals, threshold work, extra run frequency, or a second progression category just to satisfy this validator. Preserve every already-valid strength, OAP, OHP, MMA and calendar decision."; // ${eventMarker}\n    } else if (/\\b3\\s*k(?:m)?\\b|\\b3\\s*km\\b/i.test(goals) && /\\b(?:tactical|combat[- ]?ready|special[- ]?operations|operator)\\b/i.test(evidence)) {\n      feedback += "\\nTACTICAL-3K-EVENT-ANCHOR-SURGICAL-REPAIR: Do NOT add another run, conditioning row, or training day. The athlete already requires three direct running exposures and currently tolerates about 18-20 km/week. Convert ONE EXISTING Week-1 Run row into the event-progression anchor by giving that same row a source-supported 3K-specific interval/pace target in Weight, Reps or Notes (for example the already-contextualized repeat structure), while keeping the other existing Run rows as the easy/long aerobic support. Preserve three run days, the established weekly running exposure, the ruck, strength and pull-up structure, shin-impact spacing, and the five-calendar-day budget. If the event-specific run shares a day with strength, shorten/remove low-priority accessories rather than exceeding the supplied 60-minute session ceiling. Across later weeks progress the existing 3K-specific row by one useful variable at a time and consolidate Week 4; never solve this validator by appending a fourth run or extra HIIT."; // ${tacticalEventMarker}\n    }\n  }\n\n`;
  // Replace the older marathon-only block if it is already present, otherwise
  // insert the combined event repair at the stable unknown-exercise anchor.
  if (src.includes(eventMarker)) {
    const start = src.indexOf('  const eventProgression = flags.find((flag) => flag?.code === "EVENT_PROGRESSING_SESSION_MISSING");');
    const end = src.indexOf(anchor, start);
    if (start < 0 || end < 0) throw new Error('Existing marathon event repair block could not be located');
    src = src.slice(0, start) + block + src.slice(end);
  } else {
    src = src.replace(anchor, block + anchor);
  }
  changed = true;
}

// The 45k character guard was an old transport/cost guard, not a model-context or
// coaching-safety rule. Youth gymnastics grounding can legitimately exceed it
// once the roadmap, canonical catalog and current candidate are included. Keep a
// bounded guard, but allow the complete source-grounded repair prompt to pass.
const promptBudgetMarker = 'OPENAI-COMPACT-PROMPT-BUDGET-70K';
if (!src.includes(promptBudgetMarker)) {
  const old = 'if (/A NEW CLIENT has submitted/i.test(String(userContent || "")) && sentUserChars > 45000) throw new Error("OpenAI compact build prompt exceeded 45000 characters.");';
  const count = src.split(old).length - 1;
  if (count !== 1) throw new Error(`OpenAI compact prompt budget anchor expected once, found ${count}`);
  const replacement = `if (/A NEW CLIENT has submitted/i.test(String(userContent || "")) && sentUserChars > 70000) throw new Error("OpenAI compact build prompt exceeded 70000 characters."); // ${promptBudgetMarker}`;
  src = src.replace(old, replacement);
  changed = true;
}

if (!src.includes(convergenceMarker) || !src.includes(eventMarker) || !src.includes(tacticalEventMarker) || !src.includes(promptBudgetMarker)) {
  throw new Error('Repair convergence policy did not install all required markers');
}

fs.writeFileSync(target, src);
console.log(`${target}: ${changed ? 'repair convergence policy applied' : 'already current'}`);
