// Raz AI Coaching Platform — backend "brain"
// Portable Express server. Runs the v10.8 coaching engine via Gemini and stores
// each client's program privately (per-client token). Works on any Node host.
//
// Two ways to power the AI, auto-detected at startup:
//   1) PRODUCTION: your own Gemini API key  -> set GEMINI_API_KEY env var
//   2) LOCAL TEST: Perplexity sandbox proxy -> set USE_PPLX_PROXY=1 (dev only)
//
// Storage: Supabase (Postgres) when SUPABASE_URL + SUPABASE_ANON_KEY are set;
// otherwise SQLite at data/data.db for local dev. See storage.js.

import express from "express";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeStorage } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8000;

// ---------- Load the v10.8 engine instructions (system prompt) ----------
const ENGINE = fs.readFileSync(
  path.join(__dirname, "engine", "engine_instructions.txt"),
  "utf8"
);

// ---------- Storage (Supabase in prod when configured; SQLite for local dev) ----------
const store = await makeStorage();

// ---------- Rate limits (cost guard) ----------
const DAILY_BUILDS = Number(process.env.DAILY_BUILDS || 2);
const DAILY_ADJUSTS = Number(process.env.DAILY_ADJUSTS || 8);

// ---------- Gemini call (your key in prod; proxy in local dev) ----------
const USE_PPLX_PROXY = process.env.USE_PPLX_PROXY === "1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ---------- Reasoning budget (program QUALITY, env-switchable) ----------
// 2.5-flash is a thinking model. The engine's GOAL-COVERAGE PRE-FLIGHT GATE is
// genuine reasoning work: before writing any rows the model must build an internal
// goal table, apply the priority-frequency floor (top-2 goals get >=2 direct
// exposures), and kill near-empty filler days. With thinkingBudget:0 the model
// tends to write the rule-respecting prose but SKIP the gate computation, so it
// satisfies ">=1 exposure each" and pads the leftover day instead of giving the
// top goals their second exposure. Giving it a real budget lets it actually run
// the gate. Default 4096; set THINKING_BUDGET=0 to revert to the old fast/cheap
// behaviour. -1 lets the model decide dynamically.
const THINKING_BUDGET = Number(
  process.env.THINKING_BUDGET === undefined ? 8192 : process.env.THINKING_BUDGET
);

let genaiClient = null;
async function getGenAI() {
  if (genaiClient) return genaiClient;
  const { GoogleGenAI } = await import("@google/genai");
  genaiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return genaiClient;
}

// ---------- Context caching (cost optimization, ZERO quality change) ----------
// The ~360K-token engine is byte-for-byte identical on every request. Caching it
// lets Google bill the cached input at the lower cached rate instead of re-reading
// the full engine each time. CRITICAL: this does NOT change what the model sees or
// produces — the cache stores the EXACT same ENGINE text as the systemInstruction,
// same model, same generation params. It is purely a billing/storage feature.
//
// Safety design:
//  - Caching is OFF unless ENABLE_ENGINE_CACHE=1 (so it can be toggled with no deploy).
//  - The cache is created lazily and reused while valid; we refresh before TTL expiry.
//  - On ANY cache error (create/expire/reference) we fall back to the inline
//    systemInstruction path below, which is the exact behaviour we ship today.
//    The client never receives a different or degraded program because of caching.
const ENABLE_ENGINE_CACHE = process.env.ENABLE_ENGINE_CACHE === "1";
const CACHE_TTL_SECONDS = Number(process.env.ENGINE_CACHE_TTL || 1800); // 30 min default
let cacheState = { name: null, expiresAt: 0 };

async function getEngineCacheName() {
  if (!ENABLE_ENGINE_CACHE) return null;
  const now = Date.now();
  // Reuse the live cache if it still has comfortable headroom (>60s) before expiry.
  if (cacheState.name && now < cacheState.expiresAt - 60_000) return cacheState.name;
  try {
    const ai = await getGenAI();
    const cache = await ai.caches.create({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: ENGINE, // EXACT same engine text as the inline path
        ttl: `${CACHE_TTL_SECONDS}s`,
        displayName: "raz-engine-v11",
      },
    });
    cacheState = { name: cache.name, expiresAt: now + CACHE_TTL_SECONDS * 1000 };
    console.log(`engine cache created: ${cache.name} (ttl ${CACHE_TTL_SECONDS}s)`);
    return cacheState.name;
  } catch (e) {
    // Any failure -> disable cache for this request; the caller falls back to inline.
    console.warn(`engine cache create failed, using inline engine: ${e && e.message}`);
    cacheState = { name: null, expiresAt: 0 };
    return null;
  }
}

// Calls the model with the engine as system instruction. Returns plain text.
// A program is degenerate/invalid if it's too short, missing the machine TSV
// markers, or collapsed into a run of repeated punctuation (a rare large-prompt
// failure mode where the model emits e.g. a long line of dashes). We retry when
// this happens so a client never receives garbage.
function isValidProgram(p) {
  if (!p || typeof p !== "string") return false;
  const t = p.trim();
  if (t.length < 800) return false;
  // Collapsed/degenerate: a single dominant non-alphanumeric char (dashes, dots, etc.)
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters / t.length < 0.25) return false;
  // Whitespace-run collapse: a rare large-prompt MAX_TOKENS failure where the model
  // emits a single enormous run of spaces/newlines (seen as a 1M+ char blob). A real
  // program never contains a 400+ char unbroken whitespace run, so reject and retry.
  if (/[ \t]{400,}|\n{200,}/.test(p)) return false;
  // Must contain the machine block markers the rest of the app and the UI rely on.
  if (!t.includes("START_WEEK1_TSV") || !t.includes("END_WEEK1_TSV")) return false;
  return true;
}

async function runEngineRaw(userContent) {
  if (USE_PPLX_PROXY) {
    // LOCAL DEV ONLY: route through the Perplexity sandbox proxy (Anthropic SDK).
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
  // PRODUCTION: your own Gemini API key.
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Add your Google AI Studio key to run the engine.");
  }
  const ai = await getGenAI();

  // Shared generation params. These are IDENTICAL whether or not caching is used
  // — caching only changes HOW the engine is supplied (referenced vs. inline),
  // never the model, temperature, token ceiling, or thinking config. So the
  // produced program is the same quality either way.
  // 2.5-flash is a thinking model. We now give it a real thinking budget so it
  // actually RUNS the Goal-Coverage Pre-Flight Gate (forces 2nd exposures for the
  // top goals and kills near-empty filler days) instead of skipping that reasoning.
  // Thinking tokens count against maxOutputTokens, so the ceiling must comfortably
  // hold BOTH the thinking pass AND the long visible v11 program. With a 4k thinking
  // budget the old 32768 ceiling could clip a dense program, so we lift it to 40960.
  const genParams = {
    temperature: 0.3,
    maxOutputTokens: 49152,
    thinkingConfig: { thinkingBudget: THINKING_BUDGET },
  };

  // Try the cached-engine path first (cost saving). The cache holds the EXACT
  // same ENGINE text as systemInstruction, so when we reference it we must NOT
  // also pass systemInstruction inline (the engine would otherwise be supplied
  // twice). Same content reaches the model, just billed at the cached rate.
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
      // Cache may have expired or been evicted server-side between create and use.
      // Invalidate and fall through to the inline path so the request still succeeds
      // with the exact same engine and quality.
      console.warn(`cached generate failed, retrying inline: ${e && e.message}`);
      cacheState = { name: null, expiresAt: 0 };
    }
  }

  // INLINE path (today's exact behaviour): send the full engine as systemInstruction.
  const resp = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userContent,
    config: { ...genParams, systemInstruction: ENGINE },
  });
  return resp.text;
}

// Wrapper: call the engine, validate the result, and retry a couple of times if
// the model returned a degenerate/invalid program. Each attempt is independent,
// so an intermittent collapse is recovered transparently.
async function runEngine(userContent) {
  const MAX_ATTEMPTS = 5;
  let last = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await runEngineRaw(userContent);
    if (isValidProgram(last)) return last;
    console.warn(
      `runEngine: invalid/degenerate output on attempt ${attempt}/${MAX_ATTEMPTS} ` +
        `(len=${last ? last.trim().length : 0}); retrying`
    );
  }
  // All attempts failed validation — surface a clear error rather than garbage.
  throw new Error(
    "The program generator returned an unusable result after multiple attempts. Please try again."
  );
}

// ---------- Prompt builders ----------
const CLIENT_OUTPUT_CONTRACT = [
  "OUTPUT CONTRACT (client-facing — this text is shown directly to the paying client):",
  "- Write ONLY the client-facing deliverable. Do NOT print your internal reasoning, planning sections, or coach-only analysis.",
  "- ABSOLUTELY FORBIDDEN anywhere in the output (these are internal labels the client must never see):",
  "  * weekly training-state names: Push, Maintain, Reduce (do not label the week or any block with these words). NOTE: 'Deload' is allowed in client output as a normal recovery-week term.",
  "  * internal abbreviations: MEV, MAV, MRV, SQS, EVU, LTOS, VCS",
  "  * any 'Art. N' / article-number citation",
  "  * training-tier labels: T1, T2, T3, T4, novice/intermediate/advanced/elite used as a TIER label",
  "  * a 'Stress' column or any internal stress/exposure-routing label as a visible column (Stress, Main Goal Exposure, Session Focus, Intensity, Maintenance, Support, Trunk as table columns)",
  "  * percentage-of-max-set figures, raw internal scores",
  "- ALLOWED and encouraged: RPE, RIR, Zone 2-5, rest times, plain coaching explanations in normal language.",
  "- WRITE LIKE A REAL HUMAN COACH, NOT LIKE AI. Do NOT use em-dashes or en-dashes (— or –) anywhere. Use commas, full stops, or 'and' instead. Avoid the stock AI phrasing patterns (no 'it's not just X, it's Y', no 'let's dive in', no overuse of dashes for emphasis). Plain hyphens inside words (pull-up, one-arm) and inside number ranges (8-12) are fine.",
  "- THE WEEK 1 TABLE MUST HAVE EXACTLY THESE 7 COLUMNS, IN THIS ORDER, AND NO OTHERS: Day | Exercise | Sets | Reps/Duration | Load/RIR | Rest | Notes. Do NOT add a 'Session Focus', 'Stress', 'Main Goal Exposure', 'Intensity', 'Purpose', 'Modification', or any other extra column. If you want to convey a day's theme or the purpose of an exercise, put it in plain words inside the Notes cell or in the intro paragraph — never as its own column. A table with more than 7 columns, or with any internal-routing column, is a HARD FAIL.",
  "- Deliver, in this order and in plain client language:",
  "  1) A short, friendly intro: what this program is built to achieve for them and how it's structured (no jargon labels).",
  "  2) The Week 1 training table with EXACTLY the 7 columns above (Day, Exercise, Sets, Reps/Duration, Load or RPE/RIR, Rest, Notes) — no extra columns.",
  "  3) A short 'How to progress weeks 2-4' note in plain language.",
  "  4) Pain/injury guidance and substitutions relevant to THIS client only.",
  "  5) The machine block: START_WEEK1_TSV ... END_WEEK1_TSV with columns Day, Exercise, Weight, Sets, Reps, Rest, Target RPE, Notes, Results (Results empty). Plain text only, no LaTeX.",
].join("\n");

// Rules that tell the engine how to interpret the structured intake fields.
// These keep multi-goal, split, equipment and sport-schedule handling consistent
// regardless of which model runs.
const INTAKE_HANDLING_RULES = [
  "=== HOW TO READ THIS INTAKE ===",
  "- 'primary_goals' is an ARRAY. EVERY item in it is an EQUAL top priority. Do not rank them, do not pick a favourite, do not treat the first one as more important than the rest. Allocate the week so that ALL primary goals get meaningful, direct work. If two primaries compete for the same slot (e.g. heavy squat vs heavy press on a short week), interleave them across days and across the 4-week block so none is neglected — never drop a primary goal.",
  "- 'secondary_goals' is an ARRAY of lower-priority aims. Work them in only where they do not compromise the primary goals or recovery.",
  "- 'split_preference' tells you the client's preferred week structure: 'coach_decide' = you choose the optimal split for their goals and days; 'full_body' = full-body sessions; 'ppl' = push/pull/legs; 'upper_lower' = upper/lower. Honour the explicit choice unless it is clearly unsafe given their days_per_week, in which case pick the closest workable structure and explain why in plain language.",
  "- 'equipment' is the ONLY equipment they have. Select every exercise strictly from within it. Never program a movement that needs gear they did not list.",
  "- 'sport_schedule' is an ARRAY of { day, intensity } for their sport days (intensity = light | moderate | hard). 'sport' names the activity. On a HARD sport day, do NOT stack heavy/high-fatigue lifting (especially heavy lower-body or heavy spinal-loading work) on the same day — keep gym work light, technical, or skill-based, or schedule it as recovery/mobility; place the demanding lifting sessions on non-sport days or light sport days. Treat the sport sessions as real training stress when managing weekly fatigue and recovery. Respect the day-of-week placement they gave you.",
  "- 'days_per_week' is the number of GYM training days. Build exactly that many gym sessions. Never override it.",
].join("\n");

// =================================================================
// PERIODISATION + DENSITY + SPORT-DAY HARD PRESCRIPTION RULES (v11)
// =================================================================
// These are POSITIVE PRESCRIPTION GATES, not advisory text. The engine
// instructions describe the WHAT (models, methods); these rules describe
// the HOW for THIS request: the model must SELECT, COMMIT, and APPLY one
// periodisation model and the correct density/endurance methods, with
// session structure driven by the sport_schedule. The output contract
// still hides the labels from the client; these gates only force the
// model to ACTUALLY USE the knowledge layer instead of treating it as
// reference material.

const PERIODISATION_PRESCRIPTION_RULES = [
  "=== PERIODISATION MODEL SELECTION (MANDATORY) ===",
  "Before writing ANY rows, you MUST internally choose ONE periodisation model for this 4-week block and document the choice + rationale in your hidden reasoning. Selection is driven by athlete profile, NOT by default:",
  "",
  "  * BEGINNER (training_age < 1 yr OR low current_strength benchmarks): LINEAR PROGRESSION. Same lifts each week, add reps or small load weekly. Do NOT use DUP or conjugate, the athlete cannot recover from the variation.",
  "",
  "  * INTERMEDIATE (1-3 yr training_age, multiple primary goals, mixed strength + sport): DAILY UNDULATING PERIODISATION (DUP). Vary rep ranges across the week per movement pattern (e.g. squat heavy day, squat moderate day, squat speed day). DUP is the default for hybrid athletes balancing strength + a sport.",
  "",
  "  * ADVANCED + STRENGTH-DOMINANT GOAL (3+ yr, max strength is a primary goal, days_per_week >= 4): CONJUGATE (Westside ME/DE split). Maximal Effort day = work up to a heavy single or triple on a main lift variation (>=90% effort, RPE 8-9). Dynamic Effort day = speed-strength, 50-60% load moved with intent, short rests, multiple sets of low reps. Repeated Effort = hypertrophy assistance at 65-85% of max reps.",
  "",
  "  * ADVANCED + MULTIPLE COMPETING PRIORITIES (3+ yr, e.g. strength + grappling/MMA + endurance): BLOCK PERIODISATION inside the 4-week microcycle. Week 1-2 emphasises one quality, week 3 emphasises the second, week 4 is a deload OR a peak depending on phase.",
  "",
  "  * MASTERS (40+) OR RECOVERY-LIMITED (high-stress life, poor sleep flagged in intake): HIGH/LOW (Charlie Francis model). Strict separation of HIGH CNS days (heavy lifting, sprint, hard sport) from LOW CNS days (tempo, mobility, technique, Zone 2). Never two HIGH days back-to-back.",
  "",
  "Once selected, EVERY day's prescription must visibly reflect the model. If you picked DUP, the heavy/moderate/speed character of each squat or press day must be evident in the Sets/Reps/Load columns. If you picked Conjugate, the week must contain at least one ME-style row and one DE-style row per main movement pattern. The client never sees the model name (it lives in plain Notes language like 'heavy day', 'speed day', 'recovery focus'), but the structure must be present.",
  "",
  "If your selection conflicts with days_per_week (e.g. Conjugate needs 4 days minimum), drop to the next-best model and note WHY in your hidden reasoning.",
].join("\n");

const DENSITY_AND_ENDURANCE_RULES = [
  "=== DENSITY, ENDURANCE & SUBMAXIMAL METHOD ASSIGNMENT (MANDATORY) ===",
  "The intake will frequently contain endurance, work-capacity, calisthenics-volume, conditioning, or grappling-gas-tank goals. For EACH such goal, you MUST include AT LEAST ONE qualifying row per week in the Week 1 TSV. Qualifying methods:",
  "",
  "  * REP-ENDURANCE / DENSITY SETS: per-set reps in the 65-85% of current max reps band. Use for bodyweight strength-endurance goals (push-up, pull-up, dip volume; muscle-up volume; squat reps). Format: 'AMRAP at RPE 8' or '3 sets of N reps' where N sits in the band. The formula validator will flag rows outside 60-90%.",
  "",
  "  * EMOM (Every Minute On the Minute): for conditioning, work-capacity, sport-specific gas. Format: 'EMOM 10 min: 5 reps' or '10 rounds, on the minute'. Choose load/reps so the athlete finishes each round with 15-30s rest.",
  "",
  "  * AMRAP DENSITY BLOCK: 'As many rounds as possible in X minutes' with a fixed couplet/triplet. Use for grappling/MMA gas, hybrid-athlete conditioning.",
  "",
  "  * TEMPO INTERVALS / ZONE 2 / MAS WORK: for aerobic base, recovery, masters athletes, and any 'lose fat / improve cardio' goal. Format: 'Zone 2 30-45 min' or 'Tempo: 6x200m at 75% effort, 60s rest'. Place on LOW CNS days when High/Low model is in effect.",
  "",
  "  * THRESHOLD / VO2 INTERVALS: for athletes with measurable cardio goals (5k time, fight conditioning). 4-6 min hard / equal rest, 3-5 rounds.",
  "",
  "  * STATIC HOLD / TUT: for gymnastics holds (planche, lever, L-sit, handstand). Per-set hold seconds must sit in the 40-70% of current max hold band. The formula validator will flag rows above 90% of max hold.",
  "",
  "ASSIGNMENT LOGIC:",
  "  - Calisthenics-skill goal (muscle-up, OAP, HSPU) -> minimum 1 density row + 1 skill/strength row per week.",
  "  - Grappling/MMA/BJJ gas-tank goal -> minimum 1 EMOM or AMRAP density block per week, scheduled on a moderate or non-sport day.",
  "  - Hypertrophy goal -> Repeated Effort (8-15 reps at 65-80% intensity) is the bulk of work, with density rows as accessory finishers.",
  "  - Max strength goal -> ME or top-set work is primary; density/endurance rows are NOT the main driver here, but 1 sub-max accessory row per movement pattern is still appropriate.",
  "  - Endurance / fat loss / Zone 2 goal -> minimum 2 aerobic rows (Zone 2 OR threshold OR MAS) per week.",
  "",
  "If a primary goal would NORMALLY demand a density/endurance row and you omit it, that is a HARD FAIL of the goal-coverage gate. The validator runs server-side and will surface QA_FORMULA_VIOLATION markers in _meta.",
].join("\n");

const SPORT_DAY_COUPLING_RULES = [
  "=== SPORT-DAY COUPLING (MANDATORY POSITIVE RULES) ===",
  "The intake's sport_schedule is the SKELETON the gym week wraps around. Sport days are real training stress with measurable CNS, muscular, and joint cost. Apply these rules in ORDER:",
  "",
  "STEP 1: Classify each calendar day:",
  "  - HARD sport day: high-intensity sparring, hard rolling, competition prep, hard run, hard MMA. Treat as a HIGH CNS day.",
  "  - MODERATE sport day: technical drilling, positional sparring, moderate run, skill sport. Treat as MODERATE CNS.",
  "  - LIGHT sport day: flow rolling, mobility, light technique, easy aerobic. Treat as LOW CNS.",
  "  - NON-sport day: pure gym or rest.",
  "",
  "STEP 2: Place gym sessions by CNS demand:",
  "  - On a HARD sport day: gym session MUST be one of: (a) Dynamic Effort speed-strength work (low volume, high intent, sub-60% loads), (b) skill/technique only (gymnastic positions, Oly technique under 70%), (c) light upper-body accessory if sport was lower-body dominant, or (d) recovery/mobility. ABSOLUTELY NO heavy bilateral squat/deadlift, no ME-style top sets, no high-volume hypertrophy on the same day as a HARD sport session.",
  "  - On a MODERATE sport day: Repeated Effort hypertrophy or moderate-volume work is fine. Avoid ME on the same day.",
  "  - On a LIGHT sport day: any gym work is permissible, including ME if the model calls for it.",
  "  - On a NON-sport day: this is your primary slot for ME, heavy compound work, or the highest-density density block of the week.",
  "",
  "STEP 3: Manage weekly fatigue budget:",
  "  - Count HARD sport days as full training days for fatigue purposes.",
  "  - Total HIGH CNS exposures per week (HARD sport + ME gym + DE gym) should not exceed: 3 for masters/recovery-limited, 4 for intermediate hybrid, 5 for advanced strength-dominant.",
  "  - Never schedule two HARD sport days back-to-back AND a gym ME day in the same 72-hour window.",
  "  - If days_per_week (gym) + HARD sport days exceeds the weekly HIGH CNS budget, REDUCE gym intensity that week (more DE, less ME), do not drop days.",
  "",
  "STEP 4: Volume calibration against the FULL load:",
  "  - For athletes with 3+ sport days per week, total weekly hard sets per muscle group should sit at 8-14 (maintenance to slight growth), NOT 16-22 (which is for non-sport athletes).",
  "  - For athletes with 5+ sport days per week (e.g. competitive grappler training daily), drop to 6-10 hard sets per muscle group, prioritise compound movements only, drop most isolation work.",
  "  - For athletes with 0-1 sport days, full hypertrophy volume (12-20 hard sets per muscle group) is appropriate if hypertrophy is a primary goal.",
  "",
  "STEP 5: Document the rhythm:",
  "  - In the client-facing intro paragraph (plain language, NO labels), state which days are heavy/moderate/easy and WHY they are placed where they are relative to their sport days. Example acceptable wording: 'Tuesday is your heaviest lifting day because your BJJ session that day is lighter drilling; Thursday is light technique work in the gym because you have hard rolling Wednesday and Friday.'",
  "  - This sentence is the client-visible PROOF that the engine respected their sport schedule. If you cannot write it honestly, the schedule is broken and you must rebuild.",
].join("\n");

function buildPrompt(intake) {
  return [
    "A NEW CLIENT has submitted their intake. Build their Week 1 program now.",
    "Use ONLY the data in this intake. Do not use any remembered profile, saved info, or in-instruction example.",
    "",
    "=== CLIENT INTAKE ===",
    JSON.stringify(intake, null, 2),
    "",
        INTAKE_HANDLING_RULES,
    "",
    PERIODISATION_PRESCRIPTION_RULES,
    "",
    DENSITY_AND_ENDURANCE_RULES,
    "",
    SPORT_DAY_COUPLING_RULES,
    "",
    CLIENT_OUTPUT_CONTRACT,
  ].join("\n");
}

function adjustPrompt(intake, currentProgram, changeRequest) {
  return [
    "This is an ADJUSTMENT turn for an EXISTING client. Apply a SURGICAL DIFF —",
    "change ONLY what the client's request requires; keep everything else identical.",
    "Do NOT regenerate the whole program from scratch.",
    "",
    "=== CLIENT INTAKE (original) ===",
    JSON.stringify(intake, null, 2),
    "",
        INTAKE_HANDLING_RULES,
    "",
    PERIODISATION_PRESCRIPTION_RULES,
    "",
    DENSITY_AND_ENDURANCE_RULES,
    "",
    SPORT_DAY_COUPLING_RULES,
    "",
    "=== CURRENT PROGRAM (their existing plan) ===",
    currentProgram,
    "",
    "=== WHAT THE CLIENT SAYS CHANGED ===",
    changeRequest,
    "",
    "Return the updated program. Start with a short 'Changes this week:' note listing only",
    "what you changed and why, then the full updated program including a fresh",
    "START_WEEK1_TSV ... END_WEEK1_TSV block.",
    "",
    CLIENT_OUTPUT_CONTRACT,
  ].join("\n");
}

// ---------- Server-side privacy safety-net ----------
// Even with the output contract, a weaker model may slip an internal label through.
// This is a LAST-RESORT scrub of obvious banned tokens in the client-facing prose.
// It is conservative: it only neutralizes clear internal-label leaks, never touches
// exercise names, RPE/RIR, or the TSV machine block.
// Applies the forbidden-label substitutions that are SAFE to run anywhere,
// including inside the TSV machine block (single words -> client-safe synonyms).
// Deterministic exercise-name corrector. The engine instructs the model never to
// print a raw/loose goal phrase (e.g. "90-Degree Wall HSPU") as an exercise name,
// but a large prompt + a fast model can still leak one. This is a hard code-level
// safety net: it rewrites known-invalid or non-standard exercise names to the real
// progression name from the skill ladder, regardless of which model produced them.
// Order matters: most specific patterns first.
const EXERCISE_FIXES = [
  // --- HSPU family: "90-degree (wall) HSPU/handstand push-up" is NOT a real exercise. ---
  // A 90-degree HSPU is a GOAL (lower to 90 deg of elbow flexion); the real working
  // movement is a wall handstand push-up to that range. Map the invalid combos.
  [/\b(?:wall\s+)?90[-\s]?degree\s+wall\s+(hspu|handstand\s+push[-\s]?ups?)\b/gi, "Wall Handstand Push-up"],
  [/\bwall\s+90[-\s]?degree\s+(hspu|handstand\s+push[-\s]?ups?)\b/gi, "Wall Handstand Push-up"],
  [/\b90[-\s]?degree\s+(hspu|handstand\s+push[-\s]?ups?)\b/gi, "Wall Handstand Push-up"],
  // Bare "HSPU" acronym in a client-facing context -> spelled out, real name.
  [/\bwall\s+hspu\s+negatives?\b/gi, "Wall Handstand Push-up Negative"],
  [/\bdeficit\s+wall\s+hspu\b/gi, "Deficit Wall Handstand Push-up"],
  [/\bwall\s+hspu\b/gi, "Wall Handstand Push-up"],
  [/\bfreestanding\s+hspu\b/gi, "Freestanding Handstand Push-up"],
  [/\bhspu\b/gi, "Handstand Push-up"],
  // --- OAP family: "one-arm pull-up" goal printed as the raw goal, not a progression. ---
  // We only normalise the acronym; band/eccentric variants are valid as written.
  [/\boap\b/gi, "One-Arm Pull-up"],
];
function fixInvalidExerciseNames(s) {
  if (!s) return s;
  for (const [re, repl] of EXERCISE_FIXES) s = s.replace(re, repl);
  return s;
}

function scrubForbiddenWords(s) {
  if (!s) return s;
  // Weekly training-state names -> client-safe synonyms (any context/case).
  // 'Deload' is intentionally NOT scrubbed: it is standard, client-friendly
  // recovery-week language and athletes expect to see it.
  s = s.replace(/\b(Push|Maintain|Reduce)\b(?=\s+(?:for|block|week|phase|state|everything|on)\b)/g, "focus");
  // Spelled-out internal score/label names (catch BEFORE the abbreviation pass so the
  // parenthetical abbreviation is removed with its phrase). "Skill Quality Score (SQS)"
  // -> "movement quality"; drop any trailing numeric value too (e.g. "SQS 0.7").
  s = s.replace(/\bskill\s+quality\s+score\s*(?:\((?:SQS)\))?(?:\s*(?:below|under|of|=|:)?\s*[0-9.]+)?/gi, "movement quality");
  // Internal volume abbreviations.
  s = s.replace(/\b(MEV|MAV|MRV|SQS|EVU|LTOS|VCS)\b/g, "target volume");
  // Spinal Debt internal term.
  s = s.replace(/\bspinal\s+debt\b/gi, "lower-back fatigue");
  // Art. N citations.
  s = s.replace(/\(?\bArt\.?\s?\d+[a-z]?\)?/gi, "");
  return s;
}

// Remove forbidden internal-routing COLUMNS from any markdown table.
// The word-scrubber can't fix structure, so if the model emits a table with
// columns like 'Stress' / 'Main Goal Exposure' / 'Session Focus' / 'Intensity'
// / 'Purpose' / 'Modification', we drop those columns entirely and keep the rest.
const FORBIDDEN_COL = /^(stress|main goal exposure|session focus|intensity|exposure|maintenance|support|trunk|purpose|modification|focus|weekly state|training state)$/i;
function stripForbiddenColumns(md) {
  if (!md) return md;
  const lines = md.split("\n");
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const out = [];
  let i = 0;
  while (i < lines.length) {
    // Detect a table: a header row, then a separator row of dashes.
    if (isRow(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const header = cells(lines[i]);
      const dropIdx = header
        .map((h, idx) => (FORBIDDEN_COL.test(h.replace(/\*/g, "").trim()) ? idx : -1))
        .filter((x) => x >= 0);
      if (dropIdx.length === 0) { out.push(lines[i]); i++; continue; }
      const keep = (arr) => arr.filter((_, idx) => !dropIdx.includes(idx));
      // header + separator
      out.push("| " + keep(header).join(" | ") + " |");
      out.push("|" + keep(cells(lines[i + 1])).map(() => "---").join("|") + "|");
      i += 2;
      // body rows
      while (i < lines.length && isRow(lines[i]) && !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) {
        const row = cells(lines[i]);
        // pad short rows so column indices line up before dropping
        while (row.length < header.length) row.push("");
        out.push("| " + keep(row).join(" | ") + " |");
        i++;
      }
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
}

// Remove the em-dash / en-dash "AI tell" so the program reads like a human wrote it.
// This runs ONLY on prose (the TSV machine block is split off before this is called),
// and it is written to be SAFE around the things a dash is legitimately part of:
//   - markdown table separator rows  |---|---|  (left untouched)
//   - hyphenated words: pull-up, push-up, one-arm, 90-degree, Zone 2-5
//   - numeric ranges: 8-12 reps, 60-90s, RPE 7-8
// It only rewrites em/en dashes and a spaced hyphen used as a sentence connector.
function dehyphenateProse(s) {
  if (!s) return s;
  return s.split("\n").map((line) => {
    // Never touch a markdown table separator row (e.g. |---|:--:|---|).
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return line;
    // Inside table rows, only the dashes WITHIN cell text matter; the same
    // word-boundary rules below are safe there too, so we treat all lines alike.
    let l = line;
    // 1) Em/en dash used as a parenthetical or clause break, with spaces around it:
    //    "squats — they build..."  ->  "squats, they build..."
    l = l.replace(/\s+[\u2014\u2013]\s+/g, ", ");
    // 2) Em/en dash with NO spaces between words (rarer): "strength—power" -> "strength, power"
    l = l.replace(/([A-Za-z0-9])[\u2014\u2013]([A-Za-z0-9])/g, "$1, $2");
    // 3) A spaced ASCII hyphen used as a clause connector: " - " -> ", "
    //    (a real range like 8-12 has NO surrounding spaces, so it is untouched)
    l = l.replace(/\s+-\s+/g, ", ");
    // 4) Any leftover bare em/en dash -> comma+space, then tidy doubles.
    l = l.replace(/[\u2014\u2013]/g, ", ");
    // Cosmetic cleanup from the substitutions above.
    l = l.replace(/,\s*,/g, ",").replace(/,\s*\./g, ".").replace(/\(\s*,\s*/g, "(").replace(/\s+,/g, ",");
    return l;
  }).join("\n");
}

// Remove any markdown pipe table (and an immediately-preceding heading like
// "### Week 1 Training Schedule") from the PROSE body. The Week 1 program is
// rendered by the client from the START_WEEK1_TSV block only, so a second table
// in the narrative is redundant, breaks the layout, and the user explicitly
// asked for it gone. This is a deterministic belt-and-suspenders strip that runs
// regardless of whether the model obeyed the no-pipe-table prompt rule.
// Operates on PROSE ONLY (TSV is split off before this is called), so it can
// never damage the machine block.
function stripBodyProgramTable(s) {
  if (!s || s.indexOf("|") === -1) return s;
  const lines = s.split("\n");
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  // A heading that introduces the redundant week table; remove it with the table.
  const isTableHeading = (l) =>
    /^\s*#{1,6}\s*.*(week\s*1|training schedule|base microcycle|weekly schedule|microcycle).*$/i.test(l);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    // Detect the start of a pipe table: a header row followed by a separator row
    // (|---|---|) on the next non-empty line. Standard markdown table shape.
    if (isTableRow(lines[i])) {
      let j = i + 1;
      // allow the separator to be the immediate next line
      if (j < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[j])) {
        // This is a real markdown table. Consume all contiguous table rows.
        let k = j + 1;
        while (k < lines.length && isTableRow(lines[k])) k++;
        // Drop a heading line and blank lines that directly precede the table.
        while (out.length && out[out.length - 1].trim() === "") out.pop();
        if (out.length && isTableHeading(out[out.length - 1])) out.pop();
        while (out.length && out[out.length - 1].trim() === "") out.pop();
        // Skip blank lines and a lone "---" horizontal rule that often wraps the table.
        while (k < lines.length && (lines[k].trim() === "" || /^\s*-{3,}\s*$/.test(lines[k]))) k++;
        // Also drop a horizontal rule left immediately before the table.
        while (out.length && /^\s*-{3,}\s*$/.test(out[out.length - 1])) out.pop();
        while (out.length && out[out.length - 1].trim() === "") out.pop();
        i = k - 1; // continue after the table block
        continue;
      }
    }
    out.push(lines[i]);
  }
  // Collapse any triple+ blank lines left behind.
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------------------
// Formula validator (defense-in-depth for the two HARD INTENSITY RULES)
// ---------------------------------------------------------------------------
// The engine instructions are the primary lever; this is the server-side net.
// It parses the athlete intake for current-max benchmarks (reps per movement,
// hold seconds per static position) and checks each TSV density/static row's
// per-set load against the mandated bands:
//   - rep-endurance/density: per-set reps must be 65-85% of CURRENT max reps.
//       We flag below 60% (junk dose) or above 90% (over the band / unsafe).
//   - static hold (TUT): per-set hold must be 40-70% of CURRENT max hold sec.
//       We flag above 90% of current max (and above current max outright).
// When current-max for a row cannot be parsed, that row is SKIPPED (we never
// false-positive on missing data). It never deletes rows or touches the privacy
// scrub; it is detection-only and returns a structured violation count + flags.

const STATIC_TERMS = [
  "hold", "iron cross", "planche", "lever", "l-sit", "l sit", "lsit",
  "handstand", "tuck", "straddle", "maltese", "victorian", "manna",
];
const DENSITY_LABELS = ["density", "endurance", "submaximal", "submax"];

// Canonical movement buckets -> keyword aliases used to match an intake max to a row.
const MOVEMENT_ALIASES = {
  "push-up": ["push-up", "push up", "pushup", "press-up", "pressup"],
  "pull-up": ["pull-up", "pull up", "pullup", "chin-up", "chin up", "chinup"],
  "dip": ["dip"],
  "muscle-up": ["muscle-up", "muscle up", "muscleup"],
  "squat": ["squat"],
  "row": ["inverted row", "bodyweight row", " row"],
  "iron cross": ["iron cross"],
  "planche": ["planche"],
  "front lever": ["front lever"],
  "back lever": ["back lever"],
  "lever": ["lever"],
  "handstand": ["handstand", "hspu"],
  "l-sit": ["l-sit", "l sit", "lsit"],
};

// Pull every string field out of the (possibly nested) intake so we can scan
// it for "<N> <movement>" rep maxes and "<N>s <position>" hold maxes.
function collectIntakeStrings(intake) {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === "string") { out.push(v); return; }
    if (typeof v === "number") { out.push(String(v)); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") { Object.values(v).forEach(walk); return; }
  };
  // Prioritise the fields most likely to hold the current benchmark, but fall
  // back to scanning everything (current_strength / goal_specifics / etc.).
  const priority = [
    "current_strength", "current", "goal_specifics", "goal_primary",
    "primary_goals", "secondary_goals", "notes",
  ];
  for (const k of priority) if (intake && intake[k] != null) walk(intake[k]);
  walk(intake);
  return out;
}

// Find which canonical movement a piece of text refers to (first alias hit).
function matchMovement(text) {
  const lower = (text || "").toLowerCase();
  for (const [canon, aliases] of Object.entries(MOVEMENT_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) return canon;
  }
  return null;
}

// Parse current-max benchmarks from the intake.
//  - current_max_reps: { movement -> reps }  (largest stated number per movement)
//  - current_max_hold_sec: { position -> seconds } (largest stated hold per position)
function parseCurrentMax(intake) {
  const reps = {};
  const holdSec = {};
  if (!intake || typeof intake !== "object") return { reps, holdSec };
  const strings = collectIntakeStrings(intake);
  for (const raw of strings) {
    const text = String(raw);
    const lower = text.toLowerCase();

    // Hold seconds: "5s straddle", "2 sec iron cross", "20-second handstand".
    // The CURRENT max hold is the benchmark we want; a goal hold ("want 20s")
    // is larger and must NOT be taken as the max. Use the same current-vs-goal
    // disambiguation as reps: skip goal-phrased numbers, and when ambiguous keep
    // the SMALLER value (current ability is the lower of current vs goal).
    const holdRe = /(\d+(?:\.\d+)?)\s*(?:s\b|sec\b|secs\b|second[s]?\b|-second)/gi;
    let hm;
    while ((hm = holdRe.exec(lower)) !== null) {
      const val = parseFloat(hm[1]);
      if (!Number.isFinite(val) || val <= 0) continue;
      // Look at a window around the number for a static position name.
      const around = lower.slice(Math.max(0, hm.index - 40), hm.index + 40);
      if (!STATIC_TERMS.some((t) => around.includes(t))) continue;
      const isGoalish = /\b(want|goal|target|aim|reach|chasing|get to)\b/.test(around);
      const isCurrentish = /\b(max|current|now|currently|best|can hold|hold for|clean)\b/.test(around) || /\bmax\b/.test(lower);
      if (isGoalish && !isCurrentish) continue; // a pure goal number, not the max
      const mv = matchMovement(around) || STATIC_TERMS.find((t) => around.includes(t));
      if (!mv) continue;
      if (!(mv in holdSec)) holdSec[mv] = val;
      else holdSec[mv] = Math.min(holdSec[mv], val); // current max is the lower one
    }

    // Rep maxes: "20 push-ups max", "max 20 push-ups", "20 strict push-ups".
    // Only treat as a CURRENT max when the context reads like a current ability,
    // not a goal target (avoid "want 100 push-ups").
    const repRe = /(\d+)\s*(push-?ups?|pull-?ups?|chin-?ups?|dips?|muscle-?ups?|squats?|rows?|reps?)/gi;
    let rm;
    while ((rm = repRe.exec(lower)) !== null) {
      const val = parseInt(rm[1], 10);
      if (!Number.isFinite(val) || val <= 0) continue;
      const around = lower.slice(Math.max(0, rm.index - 30), rm.index + 30);
      // Skip obvious goal phrasing ("want", "goal", "target", "in one set" as a target).
      const isGoalish = /\b(want|goal|target|aim|reach|chasing|get to)\b/.test(around);
      const isCurrentish = /\b(max|current|now|currently|best|strict|can do|hit)\b/.test(around) || /max/.test(lower);
      const mv = matchMovement(around);
      if (!mv) continue;
      // Prefer current-context numbers; if both a current and a goal number exist
      // for the same movement, keep the SMALLER (current is the lower benchmark).
      if (isGoalish && !isCurrentish) continue;
      if (!(mv in reps)) reps[mv] = val;
      else reps[mv] = Math.min(reps[mv], val); // current max is the lower of the two
    }
  }
  return { reps, holdSec };
}

// Parse the TSV machine block into header + rows (tab- or comma-delimited).
function parseTsvBlock(block) {
  const inner = block
    .replace(/^[\s\S]*?START_WEEK1_TSV/i, "")
    .replace(/END_WEEK1_TSV[\s\S]*$/i, "")
    .trim();
  const lines = inner.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : null;
  if (!delim) return null;
  const cells = (l) => l.split(delim).map((c) => c.trim());
  const header = cells(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(cells);
  return { header, rows, delim };
}

// Pull the first per-set number from a cell like "13", "13-17", "3x15", "5s", "0.8-1.4s".
function firstNumber(str) {
  const m = String(str || "").match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function stripAndFlagFormulaViolations(s, intake) {
  if (!s || typeof s !== "string") return { violations: 0, flags: [] };
  const tsvMatch = s.match(/(START_WEEK1_TSV[\s\S]*?END_WEEK1_TSV)/);
  if (!tsvMatch) return { violations: 0, flags: [] };

  const { reps: maxReps, holdSec: maxHold } = parseCurrentMax(intake);
  const parsed = parseTsvBlock(tsvMatch[1]);
  if (!parsed) return { violations: 0, flags: [] };

  const idx = (name) => parsed.header.indexOf(name);
  const exIdx = idx("exercise");
  // Reps / hold can live under a few header names depending on the column set.
  const repsIdx = [idx("reps"), idx("reps/duration"), idx("duration")].find((i) => i >= 0);
  const notesIdx = idx("notes");

  const flags = [];
  for (const row of parsed.rows) {
    const exercise = (exIdx >= 0 ? row[exIdx] : row.join(" ")) || "";
    const notes = (notesIdx >= 0 ? row[notesIdx] : "") || "";
    const repsCell = repsIdx >= 0 ? row[repsIdx] : "";
    const ctx = (exercise + " " + notes + " " + repsCell).toLowerCase();

    const isStatic = STATIC_TERMS.some((t) => ctx.includes(t));
    const isDensityLabeled = DENSITY_LABELS.some((t) => ctx.includes(t));
    const movement = matchMovement(ctx);

    if (isStatic) {
      // Static-hold TUT check (only when we know the athlete's current max hold).
      let benchmark = movement && movement in maxHold ? maxHold[movement] : null;
      if (benchmark == null) {
        const term = STATIC_TERMS.find((t) => ctx.includes(t) && t in maxHold);
        if (term) benchmark = maxHold[term];
      }
      if (benchmark == null || benchmark <= 0) continue; // unparseable -> skip
      const holdVal = firstNumber(repsCell);
      if (holdVal == null) continue;
      if (holdVal > benchmark * 0.9 || holdVal > benchmark) {
        flags.push(
          `static-TUT-over-band: "${exercise.slice(0, 40)}" prescribes ${holdVal}s vs current max ${benchmark}s (band 40-70% = ${(benchmark * 0.4).toFixed(1)}-${(benchmark * 0.7).toFixed(1)}s)`
        );
      }
      continue;
    }

    // Rep-endurance / density check. Only run when the row is density/endurance
    // labeled OR the movement clearly has a current rep max we can anchor to.
    const repBenchmark = movement && movement in maxReps ? maxReps[movement] : null;
    if (repBenchmark == null || repBenchmark <= 0) continue; // unparseable -> skip
    if (!isDensityLabeled && !movement) continue;
    const repsVal = firstNumber(repsCell);
    if (repsVal == null || repsVal <= 0) continue;
    if (repsVal < 0.6 * repBenchmark || repsVal > 0.9 * repBenchmark) {
      flags.push(
        `density-reps-out-of-band: "${exercise.slice(0, 40)}" prescribes ${repsVal} reps vs current max ${repBenchmark} (band 65-85% = ${Math.round(repBenchmark * 0.65)}-${Math.round(repBenchmark * 0.85)})`
      );
    }
  }

    // -------------------------------------------------------------------
  // NEW: density/endurance ABSENCE check (Path Z mission 2 verification)
  // -------------------------------------------------------------------
  // If the intake declares an endurance/conditioning/calisthenics-volume
  // goal, the week MUST contain at least one density/EMOM/AMRAP/Zone 2
  // /threshold row. Absence is a goal-coverage HARD FAIL.
  try {
    const goalText = JSON.stringify({
      p: intake?.primary_goals, s: intake?.secondary_goals,
      g: intake?.goal_specifics, c: intake?.current_strength, n: intake?.notes,
    }).toLowerCase();
    const DENSITY_DEMANDING_GOAL = /(endurance|conditioning|gas tank|work capacity|cardio|fat loss|lose fat|zone\s*2|aerobic|muscle.?up volume|push.?up volume|pull.?up volume|emom|amrap|density|threshold|mas\b|vo2)/;
    const demandsDensity = DENSITY_DEMANDING_GOAL.test(goalText);
    if (demandsDensity) {
      const tsvLower = (tsvMatch[1] || "").toLowerCase();
      const HAS_DENSITY_ROW = /(emom|amrap|zone\s*2|threshold|tempo interval|mas\b|density|amrap|every minute|on the minute|max reps|reps to failure|rpe 9|rpe 10)/;
      if (!HAS_DENSITY_ROW.test(tsvLower)) {
        flags.push(
          "density-goal-coverage-fail: intake declares an endurance/conditioning/volume goal but the Week 1 TSV contains zero density/EMOM/AMRAP/Zone 2 rows"
        );
      }
    }
  } catch (e) {
    // Defensive: never let validator errors break the program return.
    console.warn("density-absence check failed:", e && e.message);
  }

  // -------------------------------------------------------------------
  // NEW: periodisation-structure check (Path Z mission 3 verification)
  // -------------------------------------------------------------------
  // For intermediate/advanced athletes with >=3 days_per_week, the week
  // should show INTRA-WEEK VARIATION in rep ranges per main movement
  // pattern (the signature of DUP / Conjugate / Block). If every squat
  // row in the week is e.g. "3x5" with identical loading, the engine
  // produced a flat linear week when a varied model was warranted.
  try {
    const days = Number(intake?.days_per_week) || 0;
    const trainingAge = String(intake?.training_age || intake?.experience || "").toLowerCase();
    const isLinearOnly = /\b(beginner|novice|new|0|under 1|first|starting)\b/.test(trainingAge);
    if (days >= 3 && !isLinearOnly) {
      const rowsByMovement = {};
      for (const row of parsed.rows) {
        const ex = ((exIdx >= 0 ? row[exIdx] : "") || "").toLowerCase();
        const repsCell = repsIdx >= 0 ? row[repsIdx] : "";
        const mv = matchMovement(ex);
        if (!mv) continue;
        if (!rowsByMovement[mv]) rowsByMovement[mv] = new Set();
        // bucket by first rep number to detect variation
        const n = firstNumber(repsCell);
        if (n != null) rowsByMovement[mv].add(Math.round(n));
      }
      // For any movement appearing 2+ times in the week, demand at least 2 distinct rep buckets.
      for (const [mv, buckets] of Object.entries(rowsByMovement)) {
        // Count occurrences of this movement in the week
        const occurrences = parsed.rows.filter((r) => {
          const ex = ((exIdx >= 0 ? r[exIdx] : "") || "").toLowerCase();
          return matchMovement(ex) === mv;
        }).length;
        if (occurrences >= 2 && buckets.size < 2) {
          flags.push(
            `periodisation-flat-week: "${mv}" appears ${occurrences}x in the week with identical rep prescription, expected intra-week variation (DUP/Conjugate/Block) for intermediate+ athletes`
          );
        }
      }
    }
  } catch (e) {
    console.warn("periodisation-structure check failed:", e && e.message);
  }

  // -------------------------------------------------------------------
  // NEW: sport-day coupling check (Path Z mission 3 verification)
  // -------------------------------------------------------------------
  // If a HARD sport day is declared, the SAME calendar day in the gym
  // schedule MUST NOT contain heavy bilateral squat/deadlift or ME-style
  // top sets. We inspect notes and exercise names for known heavy markers.
  try {
    const schedule = Array.isArray(intake?.sport_schedule) ? intake.sport_schedule : [];
    const hardDays = schedule
      .filter((s) => s && /hard/i.test(String(s.intensity || "")))
      .map((s) => String(s.day || "").toLowerCase().trim())
      .filter(Boolean);
    if (hardDays.length > 0) {
      const dayIdxLocal = idx("day");
      const HEAVY_MARKER = /(back squat|front squat|deadlift|conventional deadlift|sumo deadlift|bench press|overhead press|ohp|rpe\s*9|rpe\s*10|1rm|1\s*rep max|top set|max effort|me day|heavy single|heavy triple)/i;
      const LIGHT_OK = /(speed|dynamic|technique|mobility|recovery|zone\s*2|light|skill|drill)/i;
      for (const row of parsed.rows) {
        const dayCell = dayIdxLocal >= 0 ? String(row[dayIdxLocal] || "").toLowerCase().trim() : "";
        if (!dayCell) continue;
        const isHardSportDay = hardDays.some((hd) => dayCell.includes(hd) || hd.includes(dayCell));
        if (!isHardSportDay) continue;
        const ex = (exIdx >= 0 ? row[exIdx] : "") || "";
        const notes = (notesIdx >= 0 ? row[notesIdx] : "") || "";
        const repsCell = repsIdx >= 0 ? row[repsIdx] : "";
        const rowText = (ex + " " + notes + " " + repsCell);
        if (HEAVY_MARKER.test(rowText) && !LIGHT_OK.test(rowText)) {
          flags.push(
            `sport-day-coupling-fail: "${ex.slice(0, 40)}" prescribed on HARD sport day "${dayCell}" (heavy lifting on hard sport day is forbidden)`
          );
        }
      }
    }
  } catch (e) {
    console.warn("sport-day coupling check failed:", e && e.message);
  }

  // Detection only: never mutate the program here. privacyScrub owns final
  // output assembly and appends the hidden violation-count marker once.
  return { violations: flags.length, flags };
}

// Extract the violation count embedded by the validator (for _meta.violations).
function readViolationCount(program) {
  if (!program || typeof program !== "string") return 0;
  const m = program.match(/QA_FORMULA_VIOLATION_COUNT:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function privacyScrub(text, intake) {
  if (!text) return text;

  // Formula validator (defense-in-depth) runs on the FULL text first, because
  // it must inspect the START_WEEK1_TSV row block. It anchors per-set loads to
  // the athlete's current-max benchmarks parsed from the intake. It never edits
  // the program; it returns a violation count + flags, which we log server-side
  // and surface as a hidden marker on the output (read back into _meta.violations).
  const fv = stripAndFlagFormulaViolations(text, intake);
  if (fv.violations > 0) {
    console.warn(
      `[engine recalibration] ${fv.violations} formula-band violation(s) detected:\n  - ` +
        fv.flags.join("\n  - ")
    );
  }

  // Split off the TSV machine block so we never alter its STRUCTURE.
  const startIdx = text.indexOf("START_WEEK1_TSV");
  let prose = startIdx === -1 ? text : text.slice(0, startIdx);
  let tsv = startIdx === -1 ? "" : text.slice(startIdx);

  // Remove any redundant Week 1 program table from the narrative body (the
  // client renders the week from the TSV block only). Deterministic guarantee.
  prose = stripBodyProgramTable(prose);

  // Strip forbidden internal columns from the markdown table in the prose part.
  prose = stripForbiddenColumns(prose);

  // Correct any invalid/non-standard exercise names to real ladder names.
  prose = fixInvalidExerciseNames(prose);

  // Remove a 'Weekly State: ...' line entirely.
  prose = prose.replace(/^.*Weekly\s*State.*$/gim, "").trim();
  // Apply word substitutions to prose, then collapse double spaces.
  prose = scrubForbiddenWords(prose).replace(/[ ]{2,}/g, " ");
  // Strip the em-dash AI tell so it reads human-written (prose only, TSV untouched).
  prose = dehyphenateProse(prose);
  // Apply the SAME single-word substitutions to the TSV block (structure preserved:
  // these only swap whole words, never touch tabs, newlines, or column count).
  if (tsv) tsv = scrubForbiddenWords(fixInvalidExerciseNames(tsv));

  let out = tsv ? prose.trim() + "\n\n" + tsv : prose.trim();
  // Append the hidden violation-count marker so _meta.violations can be exposed
  // downstream without a DB schema change. Never rendered in the client UI.
  if (fv.violations > 0) {
    out += "\n<!-- QA_FORMULA_VIOLATION_COUNT: " + fv.violations + " -->";
  }
  return out;
}

// ---------- App ----------
const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// Health
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mode: USE_PPLX_PROXY ? "pplx-proxy(dev)" : GEMINI_API_KEY ? "gemini" : "no-key",
    model: USE_PPLX_PROXY ? process.env.PPLX_MODEL || "gemini_3_flash" : GEMINI_MODEL,
    storage: store.backend,
    thinking_budget: THINKING_BUDGET,
    cache: {
      enabled: ENABLE_ENGINE_CACHE,
      ttl_seconds: CACHE_TTL_SECONDS,
      active: Boolean(cacheState.name) && Date.now() < cacheState.expiresAt,
    },
  });
});

// ---------- Async job runner ----------
// Engine calls can take ~30-60s. On free hosts (e.g. Render free tier) a long
// synchronous request times out and the program comes back truncated. So we
// return a job id immediately and generate in the background; the client polls
// GET /api/job/:id until status is "done" (or "error").

async function runBuildJob(jobId, token, intake) {
  try {
    const program = privacyScrub(await runEngine(buildPrompt(intake)), intake);
    const now = Date.now();
    const intakeJSON = JSON.stringify(intake);
    await store.upsertClient(token, intakeJSON, program, now);
    await store.addHistory(token, "build", intakeJSON, program, now);
    await store.bumpUsage(token, "build");
    await store.finishJob(jobId, "done", program, null, now);
  } catch (e) {
    console.error("build job error:", e);
    await store.finishJob(jobId, "error", null, e.message || "Engine error.", Date.now());
  }
}

async function runAdjustJob(jobId, token, changeRequest) {
  try {
    const client = await store.getClient(token);
    if (!client) throw new Error("No saved program for this client yet.");
    const intake = JSON.parse(client.intake);
    const program = privacyScrub(await runEngine(adjustPrompt(intake, client.program, changeRequest)), intake);
    const now = Date.now();
    await store.updateClientProgram(token, program, now);
    await store.addHistory(token, "adjust", changeRequest, program, now);
    await store.bumpUsage(token, "adjust");
    await store.finishJob(jobId, "done", program, null, now);
  } catch (e) {
    console.error("adjust job error:", e);
    await store.finishJob(jobId, "error", null, e.message || "Engine error.", Date.now());
  }
}

// Build a new program (new client OR re-build for a token) -> returns a job id
app.post("/api/build", async (req, res) => {
  try {
    const intake = req.body?.intake;
    if (!intake || typeof intake !== "object") {
      return res.status(400).json({ error: "Missing intake." });
    }
    let token = (req.body?.token || "").trim();
    if (!token) token = crypto.randomBytes(16).toString("hex");

    const u = await store.getUsage(token);
    if (u.builds >= DAILY_BUILDS) {
      return res.status(429).json({
        error: `You've reached today's program-build limit (${DAILY_BUILDS}). Try again tomorrow or use Adjust.`,
      });
    }

    const jobId = crypto.randomBytes(16).toString("hex");
    await store.createJob(jobId, token, "build", Date.now());
    // fire-and-forget; do not await
    runBuildJob(jobId, token, intake);
    res.status(202).json({ job_id: jobId, token, status: "pending" });
  } catch (e) {
    console.error("build error:", e);
    res.status(500).json({ error: e.message || "Engine error." });
  }
});

// Adjust an existing program (surgical diff) -> returns a job id
app.post("/api/adjust", async (req, res) => {
  try {
    const token = (req.body?.token || "").trim();
    const changeRequest = (req.body?.request || "").trim();
    if (!token) return res.status(400).json({ error: "Missing client token." });
    if (!changeRequest) return res.status(400).json({ error: "Tell me what changed." });

    const client = await store.getClient(token);
    if (!client) return res.status(404).json({ error: "No saved program for this client yet." });

    const u = await store.getUsage(token);
    if (u.adjusts >= DAILY_ADJUSTS) {
      return res.status(429).json({
        error: `You've reached today's adjustment limit (${DAILY_ADJUSTS}). Try again tomorrow.`,
      });
    }

    const jobId = crypto.randomBytes(16).toString("hex");
    await store.createJob(jobId, token, "adjust", Date.now());
    runAdjustJob(jobId, token, changeRequest);
    res.status(202).json({ job_id: jobId, token, status: "pending" });
  } catch (e) {
    console.error("adjust error:", e);
    res.status(500).json({ error: e.message || "Engine error." });
  }
});

// Poll a job until it is done/error
app.get("/api/job/:id", async (req, res) => {
  const job = await store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json({
    job_id: job.id,
    token: job.token,
    kind: job.kind,
    status: job.status, // pending | done | error
    program: job.status === "done" ? job.program : undefined,
    error: job.status === "error" ? job.error : undefined,
    _meta: job.status === "done" ? { violations: readViolationCount(job.program) } : undefined,
  });
});

// Load a returning client's saved program
app.get("/api/program/:token", async (req, res) => {
  const client = await store.getClient(req.params.token);
  if (!client) return res.status(404).json({ error: "Not found." });
  res.json({
    token: client.token,
    intake: JSON.parse(client.intake),
    program: client.program,
    updated_at: client.updated_at,
    _meta: { violations: readViolationCount(client.program) },
  });
});

app.listen(PORT, () => {
  console.log(`Coaching platform on :${PORT} (mode: ${USE_PPLX_PROXY ? "pplx-proxy" : GEMINI_API_KEY ? "gemini" : "no-key"})`);
});
