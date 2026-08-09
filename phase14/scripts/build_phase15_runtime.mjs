// Build the Phase 15 runtime from the readable Phase 14 server source.
import fs from "node:fs";

const sourcePath = new URL("../server.js", import.meta.url);
const outPath = new URL("../server.phase15.js", import.meta.url);
let s = fs.readFileSync(sourcePath, "utf8");

function once(find, replace, label) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error(`Phase15 runtime patch anchor '${label}' expected once, found ${n}`);
  s = s.replace(find, replace);
}

once(
  'import { makeStorage } from "./storage.js";',
  'import { makeStorage } from "./storage.js";\nimport { phase15PromptRules, validatePhase15Program, repairPhase15Program } from "./engine/phase15_program_qa.js";\nimport { buildDeterministicBrief } from "./engine/phase15_planner.js";',
  "import"
);

once(
  'const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";\nconst AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 110000);\nconst BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || 210000);',
  'const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";\nconst OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";\nconst OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";\nconst OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "low";\nconst OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 14000);\nconst AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || (OPENAI_API_KEY ? 120000 : 110000));\nconst BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || (OPENAI_API_KEY ? 180000 : 210000));\nlet lastAIUsage = null;',
  "provider config"
);

const openAIProvider = `const OPENAI_COMPACT_DEVELOPER = [\n  "You are the RAZ Performance coaching model inside a deterministic programming system.",\n  "The server has already extracted the athlete constraints and built the required weekly skeleton. Your job is NOT to redesign the skeleton. Your job is to calibrate exact exercises, sets, reps, load ranges, RPE/RIR, rest, warm-ups, four-week progression and concise client-facing coaching language.",\n  "Respect every item in DETERMINISTIC PROGRAM SKELETON and PHASE 15 QUALITY GATE as mandatory. Never delete a required exposure. Never add hard conditioning that conflicts with the supplied conditioning rule. Never regress a demonstrated advanced skill to a lower main progression stage.",\n  "Use realistic current-performance anchors. Goal numbers are targets, not current capacities. Prefer low fatigue and specificity when sport load is high.",\n  "STRUCTURE HARD CONTRACT: output exactly one START_WEEK1_TSV...END_WEEK1_TSV block, one START_WEEK2_TSV...END_WEEK2_TSV block, one START_WEEK3_TSV...END_WEEK3_TSV block, and one START_WEEK4_TSV...END_WEEK4_TSV block. Never restart a week block per day.",\n  "Every TSV block uses EXACTLY this header: Day\\tExercise\\tWeight\\tSets\\tReps\\tRest\\tTarget RPE\\tNotes\\tResults. Results stays blank. One physical row equals one TSV row. Never put literal newlines inside a TSV cell.",\n  "Do not emit [REVIEW], QA labels, internal scores, support messages, placeholders, or invented exercise names. [WARMUP] is the only permitted bracketed row prefix.",\n  "Power/throw/jump primers come after preparation and before heavy strength. Keep sessions within the supplied hard time cap. Narrative must match the final TSV exactly.",\n  "Return only a short client-ready intro, a short weeks 2-4 progression note, pain/substitution guidance relevant to this athlete, then the four TSV blocks."\n].join("\\n");\n\nfunction extractOpenAIIntake(userContent) {\n  const src = String(userContent || "");\n  const marker = "=== CLIENT INTAKE ===";\n  const start = src.indexOf(marker);\n  if (start < 0) return null;\n  const tail = src.slice(start + marker.length).trimStart();\n  const end = tail.indexOf("\\n===");\n  const jsonText = (end >= 0 ? tail.slice(0, end) : tail).trim();\n  try { return JSON.parse(jsonText); } catch (_e) { return null; }\n}\n\nfunction buildOpenAICompactUser(userContent) {\n  const src = String(userContent || "");\n  if (!/A NEW CLIENT has submitted/i.test(src)) return src;\n  const intake = extractOpenAIIntake(src);\n  if (!intake) throw new Error("OpenAI compact path could not parse intake JSON.");\n  const skeleton = buildDeterministicBrief(intake);\n  const quality = phase15PromptRules(intake);\n  return [\n    "=== CLIENT INTAKE ===",\n    JSON.stringify(intake),\n    "",\n    skeleton,\n    "",\n    quality,\n    "",\n    "=== COMPACT OUTPUT CONTRACT ===",\n    "Exactly the requested number of gym days must appear in every week block.",\n    "Keep direct cable lateral raises and face pulls when explicitly requested as maintenance.",\n    "Use canonical/common exercise names. Do not expose internal labels.",\n    "Warm-up rows use [WARMUP] and remain compact. Do not emit a fake Warm-up / Prep exercise row.",\n    "No markdown program table is needed. The TSV blocks are the source of truth.",\n    "All four weeks must preserve the same goal hierarchy while progressing load, reps, sets or assistance conservatively.",\n    "Week 4 is not automatically a deload. Consolidate or trim only when justified by the athlete constraints.",\n  ].join("\\n");\n}\n\nasync function runEngineRaw(userContent) {\n  if (OPENAI_API_KEY) {\n    const controller = new AbortController();\n    const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);\n    const started = Date.now();\n    try {\n      const compactUser = buildOpenAICompactUser(userContent);\n      const developerChars = OPENAI_COMPACT_DEVELOPER.length;\n      const sourceUserChars = String(userContent || "").length;\n      const sentUserChars = compactUser.length;\n      if (developerChars > 20000) throw new Error("OpenAI developer prompt unexpectedly large.");\n      if (/A NEW CLIENT has submitted/i.test(String(userContent || "")) && sentUserChars > 30000) throw new Error("OpenAI compact build prompt exceeded 30000 characters.");\n      console.log("OpenAI Phase15 prompt layout:", JSON.stringify({ developer_chars: developerChars, source_user_chars: sourceUserChars, sent_user_chars: sentUserChars, legacy_engine_chars_not_sent: ENGINE.length, execution_path: "deterministic-skeleton-v2" }));\n      const r = await fetch("https://api.openai.com/v1/responses", {\n        method: "POST",\n        headers: {\n          "Authorization": "Bearer " + OPENAI_API_KEY,\n          "Content-Type": "application/json"\n        },\n        body: JSON.stringify({\n          model: OPENAI_MODEL,\n          input: [\n            { role: "developer", content: OPENAI_COMPACT_DEVELOPER },\n            { role: "user", content: compactUser }\n          ],\n          reasoning: { effort: OPENAI_REASONING_EFFORT },\n          max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,\n          prompt_cache_key: "raz-phase15-deterministic-v2"\n        }),\n        signal: controller.signal\n      });\n      const data = await r.json().catch(() => ({}));\n      if (!r.ok) {\n        const msg = data?.error?.message || ("OpenAI HTTP " + r.status);\n        throw new Error(msg);\n      }\n      const text = (data.output || [])\n        .flatMap(item => item?.content || [])\n        .filter(c => c?.type === "output_text" && typeof c.text === "string")\n        .map(c => c.text)\n        .join("");\n      const u = data.usage || {};\n      const input = Number(u.input_tokens || 0);\n      const output = Number(u.output_tokens || 0);\n      const cached = Number(u.input_tokens_details?.cached_tokens || 0);\n      const reasoning = Number(u.output_tokens_details?.reasoning_tokens || 0);\n      lastAIUsage = {\n        provider: "openai", model: OPENAI_MODEL, reasoning_effort: OPENAI_REASONING_EFFORT,\n        input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_tokens: reasoning,\n        developer_chars: developerChars, source_user_prompt_chars: sourceUserChars, sent_user_prompt_chars: sentUserChars,\n        legacy_engine_chars_not_sent: ENGINE.length, execution_path: "deterministic-skeleton-v2",\n        elapsed_ms: Date.now() - started\n      };\n      console.log("OpenAI generation usage:", JSON.stringify(lastAIUsage));\n      if (!text) throw new Error("OpenAI returned no output_text content.");\n      return text;\n    } finally {\n      clearTimeout(timer);\n    }\n  }\n  if (USE_PPLX_PROXY) {`;

once(
  'async function runEngineRaw(userContent) {\n  if (USE_PPLX_PROXY) {',
  openAIProvider,
  "OpenAI provider"
);

once(
  '    const aiConfigured = USE_PPLX_PROXY || Boolean(GEMINI_API_KEY);\n    const ok = Boolean(storageHealth?.ok) && aiConfigured;\n    res.status(ok ? 200 : 503).json({\n      ok,\n      mode: USE_PPLX_PROXY ? "pplx-proxy(dev)" : GEMINI_API_KEY ? "gemini" : "no-key",\n      model: USE_PPLX_PROXY ? process.env.PPLX_MODEL || "gemini_3_flash" : GEMINI_MODEL,',
  '    const aiConfigured = USE_PPLX_PROXY || Boolean(OPENAI_API_KEY) || Boolean(GEMINI_API_KEY);\n    const ok = Boolean(storageHealth?.ok) && aiConfigured;\n    res.status(ok ? 200 : 503).json({\n      ok,\n      mode: USE_PPLX_PROXY ? "pplx-proxy(dev)" : OPENAI_API_KEY ? "openai" : GEMINI_API_KEY ? "gemini" : "no-key",\n      model: USE_PPLX_PROXY ? process.env.PPLX_MODEL || "gemini_3_flash" : OPENAI_API_KEY ? OPENAI_MODEL : GEMINI_MODEL,\n      openai_execution_path: OPENAI_API_KEY ? "deterministic-skeleton-v2" : null,\n      openai_legacy_engine_chars_not_sent: OPENAI_API_KEY ? ENGINE.length : null,\n      openai_compact_developer_chars: OPENAI_API_KEY ? OPENAI_COMPACT_DEVELOPER.length : null,\n      last_ai_usage: lastAIUsage,',
  "health provider"
);

once(
  '      ai_configured: USE_PPLX_PROXY || Boolean(GEMINI_API_KEY),',
  '      ai_configured: USE_PPLX_PROXY || Boolean(OPENAI_API_KEY) || Boolean(GEMINI_API_KEY),',
  "health catch"
);

// One paid generation pass. Deterministic planning happens before the model and QA happens after it.
// We do not silently double latency/cost with a second full regeneration inside a client request.
once(
  '  const MAX_ATTEMPTS = 3;',
  '  const MAX_ATTEMPTS = OPENAI_API_KEY ? 1 : 3;',
  "attempt budget"
);

const contractAnchor = '    CLIENT_OUTPUT_CONTRACT,';
const count = s.split(contractAnchor).length - 1;
if (count !== 2) throw new Error(`Phase15 prompt anchor expected twice, found ${count}`);
s = s.replaceAll(contractAnchor, '    phase15PromptRules(intake),\n    "",\n    CLIENT_OUTPUT_CONTRACT,');

once(
  '      program = reformatWarmupCells(program);                   // step 9\n      await onProgress("finalizing", attempt, "quality checks passed");\n      return program;',
  '      program = reformatWarmupCells(program);                   // step 9\n      program = repairPhase15Program(program);                    // step 10: safe ordering only\n      validatePhase15Program(program, intake);                   // step 11\n      await onProgress("finalizing", attempt, "quality checks passed including Phase 15");\n      return program;',
  "validator pipeline"
);

fs.writeFileSync(outPath, s);
console.log("built server.phase15.js with deterministic skeleton OpenAI execution path + Phase 15 QA");
