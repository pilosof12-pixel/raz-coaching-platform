import fs from "node:fs";

const serverPath = new URL("../server.js", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);
let src = fs.readFileSync(serverPath, "utf8");

function mustInclude(needle) {
  if (!src.includes(needle)) throw new Error(`Patch anchor missing: ${needle.slice(0, 120)}`);
}

// 1) OpenAI provider import.
if (!src.includes('from "./engine/openai_provider.js"')) {
  const anchor = '} from "./engine/exercise_dictionary.js";';
  mustInclude(anchor);
  src = src.replace(anchor, anchor + '\nimport { runOpenAIResponse } from "./engine/openai_provider.js";');
}

// 2) Provider configuration. OpenAI is primary when its key is present; Gemini remains fallback.
if (!src.includes("const OPENAI_API_KEY")) {
  const anchor = 'const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";';
  mustInclude(anchor);
  src = src.replace(anchor, anchor + `\nconst OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";\nconst OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";\nconst OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "medium";\nconst AI_PROVIDER = (process.env.AI_PROVIDER || (OPENAI_API_KEY ? "openai" : "gemini")).toLowerCase();`);
}

// 3) Replace the raw provider function with OpenAI primary + Gemini fallback.
const rawStart = src.indexOf("async function runEngineRaw(userContent) {");
const rawEnd = src.indexOf("// Wrapper: call the engine", rawStart);
if (rawStart < 0 || rawEnd < 0) throw new Error("Could not locate runEngineRaw block");
const newRaw = `async function runEngineRaw(userContent) {
  if (USE_PPLX_PROXY) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: process.env.PPLX_MODEL || "gemini_3_flash",
      max_tokens: 8000,
      system: ENGINE,
      messages: [{ role: "user", content: userContent }],
    });
    return msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  }

  // Cost-aware quality path: OpenAI Luna first when configured, Gemini as automatic fallback.
  if (AI_PROVIDER === "openai" && OPENAI_API_KEY) {
    try {
      return await runOpenAIResponse({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_MODEL,
        systemInstruction: ENGINE,
        userContent,
        reasoningEffort: OPENAI_REASONING_EFFORT,
        maxOutputTokens: 49152,
      });
    } catch (e) {
      if (!GEMINI_API_KEY) throw e;
      console.warn(\`OpenAI generation failed, falling back to Gemini: \${e && e.message}\`);
    }
  }

  if (!GEMINI_API_KEY) {
    if (OPENAI_API_KEY) {
      return runOpenAIResponse({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_MODEL,
        systemInstruction: ENGINE,
        userContent,
        reasoningEffort: OPENAI_REASONING_EFFORT,
        maxOutputTokens: 49152,
      });
    }
    throw new Error("No AI provider key is configured. Set OPENAI_API_KEY or GEMINI_API_KEY.");
  }

  const ai = await getGenAI();
  const genParams = {
    temperature: 0.3,
    maxOutputTokens: 49152,
    thinkingConfig: { thinkingBudget: THINKING_BUDGET },
  };

  const cacheName = await getEngineCacheName();
  if (cacheName) {
    try {
      const resp = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: userContent,
        config: { ...genParams, cachedContent: cacheName },
      });
      return resp.text;
    } catch (e) {
      console.warn(\`cached generate failed, retrying inline: \${e && e.message}\`);
      cacheState = { name: null, expiresAt: 0 };
    }
  }

  const resp = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userContent,
    config: { ...genParams, systemInstruction: ENGINE },
  });
  return resp.text;
}

`;
src = src.slice(0, rawStart) + newRaw + src.slice(rawEnd);

// 4) Make build and adjust share one validator pipeline.
const validatedStart = src.indexOf("async function generateValidatedProgram(intake) {");
const validatedEnd = src.indexOf("async function runBuildJob", validatedStart);
if (validatedStart < 0 || validatedEnd < 0) throw new Error("Could not locate validated generation block");
const validatedBlock = `async function generateValidatedFromPrompt(basePrompt, intake) {
  const MAX_ATTEMPTS = 5;
  const amendments = [];
  const failCounts = Object.create(null);
  let lastValid = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const userContent = amendments.length
      ? basePrompt + "\\n\\n" + amendments.join("\\n\\n")
      : basePrompt;
    const raw = await runEngineRaw(userContent);
    if (!isValidProgram(raw)) {
      console.warn(
        \`generateValidatedFromPrompt: invalid/degenerate output attempt \${attempt}/\${MAX_ATTEMPTS} \` +
          \`(len=\${raw ? raw.trim().length : 0}); retrying\`
      );
      continue;
    }
    let program = fixInvalidExerciseNames(raw);
    try {
      const dict = validateExercisesAgainstDictionary(program, intake);
      program = dict.program;
      const skills = validateAndCalibrateSkills(program, intake);
      program = skills.program;
      validateEquipmentAgainstLocation(program, intake);
      enforceUnilateralIntensityFloor(program, intake);
      program = enforceIntradayConditioningOrder(program, intake);
      validateSportDayCoupling(program, intake);
      validateWeeklyVolumeBudget(program, intake);
      program = reformatWarmupCells(program);
      return program;
    } catch (err) {
      if (err && err.code && RETRIABLE_CODES.has(err.code)) {
        lastValid = program;
        failCounts[err.code] = (failCounts[err.code] || 0) + 1;
        console.warn(
          \`generateValidatedFromPrompt: \${err.code} on attempt \${attempt}/\${MAX_ATTEMPTS} \` +
            \`(count=\${failCounts[err.code]})\`
        );
        if (failCounts[err.code] >= 3) {
          console.warn(\`generateValidatedFromPrompt: downgrading to hard-substitute for \${err.code}\`);
          program = hardSubstitute(err.code, program, intake);
          return reformatWarmupCells(program);
        }
        if (!amendments.includes(err.amendment)) amendments.push(err.amendment);
        continue;
      }
      throw err;
    }
  }
  if (lastValid) {
    for (const code of Object.keys(failCounts)) lastValid = hardSubstitute(code, lastValid, intake);
    return reformatWarmupCells(lastValid);
  }
  throw new Error("The program generator returned an unusable result after multiple attempts. Please try again.");
}

async function generateValidatedProgram(intake) {
  return generateValidatedFromPrompt(buildPrompt(intake), intake);
}

async function generateValidatedAdjustment(intake, currentProgram, changeRequest) {
  return generateValidatedFromPrompt(adjustPrompt(intake, currentProgram, changeRequest), intake);
}

`;
src = src.slice(0, validatedStart) + validatedBlock + src.slice(validatedEnd);

// 5) Adjustments now pass the exact same validators as initial builds.
const oldAdjust = "const program = privacyScrub(await runEngine(adjustPrompt(intake, client.program, changeRequest)), intake);";
const newAdjust = "const program = privacyScrub(await generateValidatedAdjustment(intake, client.program, changeRequest), intake);";
if (src.includes(oldAdjust)) src = src.replace(oldAdjust, newAdjust);
if (!src.includes(newAdjust)) throw new Error("Adjust validation patch did not apply");

// 6) Health endpoint reports the actual selected provider/model.
src = src.replace(
  'mode: USE_PPLX_PROXY ? "pplx-proxy(dev)" : GEMINI_API_KEY ? "gemini" : "no-key",\n    model: USE_PPLX_PROXY ? process.env.PPLX_MODEL || "gemini_3_flash" : GEMINI_MODEL,',
  'mode: USE_PPLX_PROXY ? "pplx-proxy(dev)" : AI_PROVIDER === "openai" && OPENAI_API_KEY ? "openai" : GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : "no-key",\n    model: USE_PPLX_PROXY ? process.env.PPLX_MODEL || "gemini_3_flash" : AI_PROVIDER === "openai" && OPENAI_API_KEY ? OPENAI_MODEL : GEMINI_API_KEY ? GEMINI_MODEL : OPENAI_MODEL,'
);

src = src.replace(
  'console.log(`Coaching platform on :${PORT} (mode: ${USE_PPLX_PROXY ? "pplx-proxy" : GEMINI_API_KEY ? "gemini" : "no-key"})`);',
  'console.log(`Coaching platform on :${PORT} (mode: ${USE_PPLX_PROXY ? "pplx-proxy" : AI_PROVIDER === "openai" && OPENAI_API_KEY ? "openai" : GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : "no-key"})`);'
);

fs.writeFileSync(serverPath, src);

// 7) Real regression command.
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.scripts ||= {};
pkg.scripts.test = "node --test test/*.test.js";
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

console.log("QA patch applied successfully");
