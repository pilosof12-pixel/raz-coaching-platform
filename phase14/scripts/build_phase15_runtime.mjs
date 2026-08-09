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
  'import { makeStorage } from "./storage.js";\nimport { phase15PromptRules, validatePhase15Program, repairPhase15Program } from "./engine/phase15_program_qa.js";',
  "import"
);

once(
  'const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";\nconst AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 110000);\nconst BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || 210000);',
  'const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";\nconst OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";\nconst OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";\nconst OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "medium";\nconst OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 24000);\nconst OPENAI_ENGINE_CHUNK_CHARS = Math.min(450000, Math.max(10000, Number(process.env.OPENAI_ENGINE_CHUNK_CHARS || 450000)));\nconst AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || (OPENAI_API_KEY ? 300000 : 110000));\nconst BUILD_JOB_TIMEOUT_MS = Number(process.env.BUILD_JOB_TIMEOUT_MS || (OPENAI_API_KEY ? 480000 : 210000));\nlet lastAIUsage = null;',
  "provider config"
);

const openAIProvider = `function openAIEngineMessages() {\n  const messages = [];\n  for (let i = 0; i < ENGINE.length; i += OPENAI_ENGINE_CHUNK_CHARS) {\n    messages.push({\n      role: "developer",\n      content: ENGINE.slice(i, i + OPENAI_ENGINE_CHUNK_CHARS)\n    });\n  }\n  return messages;\n}\n\nasync function runEngineRaw(userContent) {\n  if (OPENAI_API_KEY) {\n    const controller = new AbortController();\n    const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);\n    const started = Date.now();\n    try {\n      const engineMessages = openAIEngineMessages();\n      const maxChunkChars = engineMessages.reduce((m, x) => Math.max(m, String(x.content || "").length), 0);\n      if (maxChunkChars > 450000) throw new Error("OpenAI engine chunk guard failed: chunk exceeds 450000 characters.");\n      console.log("OpenAI prompt layout:", JSON.stringify({\n        engine_chars: ENGINE.length,\n        engine_chunks: engineMessages.length,\n        max_chunk_chars: maxChunkChars,\n        user_chars: String(userContent || "").length\n      }));\n      const r = await fetch("https://api.openai.com/v1/responses", {\n        method: "POST",\n        headers: {\n          "Authorization": "Bearer " + OPENAI_API_KEY,\n          "Content-Type": "application/json"\n        },\n        body: JSON.stringify({\n          model: OPENAI_MODEL,\n          input: [\n            ...engineMessages,\n            { role: "user", content: userContent }\n          ],\n          reasoning: { effort: OPENAI_REASONING_EFFORT },\n          max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS\n        }),\n        signal: controller.signal\n      });\n      const data = await r.json().catch(() => ({}));\n      if (!r.ok) {\n        const msg = data?.error?.message || ("OpenAI HTTP " + r.status);\n        throw new Error(msg);\n      }\n      const text = (data.output || [])\n        .flatMap(item => item?.content || [])\n        .filter(c => c?.type === "output_text" && typeof c.text === "string")\n        .map(c => c.text)\n        .join("");\n      const u = data.usage || {};\n      const input = Number(u.input_tokens || 0);\n      const output = Number(u.output_tokens || 0);\n      const cached = Number(u.input_tokens_details?.cached_tokens || 0);\n      const reasoning = Number(u.output_tokens_details?.reasoning_tokens || 0);\n      const longContext = input > 272000;\n      const inputRate = longContext ? 5.0 : 2.5;\n      const cachedRate = longContext ? 0.5 : 0.25;\n      const outputRate = longContext ? 22.5 : 15.0;\n      const estimatedCostUsd = ((Math.max(0, input - cached) * inputRate) + (cached * cachedRate) + (output * outputRate)) / 1000000;\n      lastAIUsage = {\n        provider: "openai", model: OPENAI_MODEL, reasoning_effort: OPENAI_REASONING_EFFORT,\n        input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_tokens: reasoning,\n        engine_chars: ENGINE.length, engine_chunks: engineMessages.length, max_engine_chunk_chars: maxChunkChars,\n        long_context_pricing: longContext, estimated_cost_usd: Number(estimatedCostUsd.toFixed(4)),\n        elapsed_ms: Date.now() - started\n      };\n      console.log("OpenAI generation usage:", JSON.stringify(lastAIUsage));\n      if (!text) throw new Error("OpenAI returned no output_text content.");\n      return text;\n    } finally {\n      clearTimeout(timer);\n    }\n  }\n  if (USE_PPLX_PROXY) {`;

once(
  'async function runEngineRaw(userContent) {\n  if (USE_PPLX_PROXY) {',
  openAIProvider,
  "OpenAI provider"
);

once(
  '    const aiConfigured = USE_PPLX_PROXY || Boolean(GEMINI_API_KEY);\n    const ok = Boolean(storageHealth?.ok) && aiConfigured;\n    res.status(ok ? 200 : 503).json({\n      ok,\n      mode: USE_PPLX_PROXY ? "pplx-proxy(dev)" : GEMINI_API_KEY ? "gemini" : "no-key",\n      model: USE_PPLX_PROXY ? process.env.PPLX_MODEL || "gemini_3_flash" : GEMINI_MODEL,',
  '    const aiConfigured = USE_PPLX_PROXY || Boolean(OPENAI_API_KEY) || Boolean(GEMINI_API_KEY);\n    const ok = Boolean(storageHealth?.ok) && aiConfigured;\n    res.status(ok ? 200 : 503).json({\n      ok,\n      mode: USE_PPLX_PROXY ? "pplx-proxy(dev)" : OPENAI_API_KEY ? "openai" : GEMINI_API_KEY ? "gemini" : "no-key",\n      model: USE_PPLX_PROXY ? process.env.PPLX_MODEL || "gemini_3_flash" : OPENAI_API_KEY ? OPENAI_MODEL : GEMINI_MODEL,\n      openai_engine_chars: OPENAI_API_KEY ? ENGINE.length : null,\n      openai_engine_chunks: OPENAI_API_KEY ? Math.ceil(ENGINE.length / OPENAI_ENGINE_CHUNK_CHARS) : null,\n      openai_engine_chunk_chars: OPENAI_API_KEY ? OPENAI_ENGINE_CHUNK_CHARS : null,\n      last_ai_usage: lastAIUsage,',
  "health provider"
);

once(
  '      ai_configured: USE_PPLX_PROXY || Boolean(GEMINI_API_KEY),',
  '      ai_configured: USE_PPLX_PROXY || Boolean(OPENAI_API_KEY) || Boolean(GEMINI_API_KEY),',
  "health catch"
);

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
  '      program = reformatWarmupCells(program);                   // step 9\n      program = repairPhase15Program(program);                    // step 10: safe ordering only\n      try {\n        validatePhase15Program(program, intake);                  // step 11\n      } catch (qerr) {\n        if (qerr && qerr.code === "PHASE15_QUALITY_VIOLATION") {\n          console.warn(`generateValidatedProgram: ${qerr.code} on attempt ${attempt}/${MAX_ATTEMPTS}: ${qerr.message}`);\n          await onProgress("refining", attempt, qerr.code);\n          if (attempt < MAX_ATTEMPTS) {\n            if (!amendments.includes(qerr.amendment)) amendments.push(qerr.amendment);\n            continue;\n          }\n          throw qerr;\n        } else throw qerr;\n      }\n      await onProgress("finalizing", attempt, "quality checks passed including Phase 15");\n      return program;',
  "validator pipeline"
);

fs.writeFileSync(outPath, s);
console.log("built server.phase15.js with chunked OpenAI developer-message engine + Phase 15 QA");
