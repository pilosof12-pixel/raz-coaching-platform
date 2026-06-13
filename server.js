// Raz AI Coaching Platform — backend "brain"
// Portable Express server. Runs the v10.8 coaching engine via Gemini and stores
// each client's program privately (per-client token). Works on any Node host.
//
// Two ways to power the AI, auto-detected at startup:
//   1) PRODUCTION: your own Gemini API key  -> set GEMINI_API_KEY env var
//   2) LOCAL TEST: Perplexity sandbox proxy -> set USE_PPLX_PROXY=1 (dev only)
//
// Storage: SQLite file at data/data.db (named data.db so it persists on redeploy).

import express from "express";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8000;

// ---------- Load the v10.8 engine instructions (system prompt) ----------
const ENGINE = fs.readFileSync(
  path.join(__dirname, "engine", "engine_instructions.txt"),
  "utf8"
);

// ---------- Storage (SQLite, file named data.db for redeploy persistence) ----------
const DB_PATH = path.join(__dirname, "data", "data.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    token       TEXT PRIMARY KEY,
    intake      TEXT,
    program     TEXT,
    created_at  INTEGER,
    updated_at  INTEGER
  );
  CREATE TABLE IF NOT EXISTS history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT,
    kind        TEXT,        -- 'build' | 'adjust'
    request     TEXT,
    program     TEXT,
    created_at  INTEGER
  );
  CREATE TABLE IF NOT EXISTS usage (
    token       TEXT,
    day         TEXT,        -- YYYY-MM-DD (UTC)
    builds      INTEGER DEFAULT 0,
    adjusts     INTEGER DEFAULT 0,
    PRIMARY KEY (token, day)
  );
`);

// ---------- Rate limits (cost guard) ----------
const DAILY_BUILDS = Number(process.env.DAILY_BUILDS || 2);
const DAILY_ADJUSTS = Number(process.env.DAILY_ADJUSTS || 8);

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
function getUsage(token) {
  const day = todayUTC();
  let row = db.prepare("SELECT * FROM usage WHERE token=? AND day=?").get(token, day);
  if (!row) {
    db.prepare("INSERT INTO usage (token, day, builds, adjusts) VALUES (?,?,0,0)").run(token, day);
    row = { token, day, builds: 0, adjusts: 0 };
  }
  return row;
}
function bumpUsage(token, kind) {
  const day = todayUTC();
  const col = kind === "build" ? "builds" : "adjusts";
  db.prepare(`UPDATE usage SET ${col}=${col}+1 WHERE token=? AND day=?`).run(token, day);
}

// ---------- Gemini call (your key in prod; proxy in local dev) ----------
const USE_PPLX_PROXY = process.env.USE_PPLX_PROXY === "1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let genaiClient = null;
async function getGenAI() {
  if (genaiClient) return genaiClient;
  const { GoogleGenAI } = await import("@google/genai");
  genaiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return genaiClient;
}

// Calls the model with the engine as system instruction. Returns plain text.
async function runEngine(userContent) {
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
  const resp = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userContent,
    config: {
      systemInstruction: ENGINE,
      temperature: 0.4,
      maxOutputTokens: 8192,
    },
  });
  return resp.text;
}

// ---------- Prompt builders ----------
const CLIENT_OUTPUT_CONTRACT = [
  "OUTPUT CONTRACT (client-facing — this text is shown directly to the paying client):",
  "- Write ONLY the client-facing deliverable. Do NOT print your internal reasoning, planning sections, or coach-only analysis.",
  "- ABSOLUTELY FORBIDDEN anywhere in the output (these are internal labels the client must never see):",
  "  * weekly training-state names: Push, Maintain, Reduce, Deload (do not label the week or any block with these words)",
  "  * internal abbreviations: MEV, MAV, MRV, SQS, EVU, LTOS, VCS",
  "  * any 'Art. N' / article-number citation",
  "  * training-tier labels: T1, T2, T3, T4, novice/intermediate/advanced/elite used as a TIER label",
  "  * a 'Stress' column or any internal stress/exposure-routing label as a visible column (Stress, Main Goal Exposure, Maintenance, Support, Trunk as table columns)",
  "  * percentage-of-max-set figures, raw internal scores",
  "- ALLOWED and encouraged: RPE, RIR, Zone 2-5, rest times, plain coaching explanations in normal language.",
  "- Deliver, in this order and in plain client language:",
  "  1) A short, friendly intro: what this program is built to achieve for them and how it's structured (no jargon labels).",
  "  2) The Week 1 training table (Day, Exercise, Sets, Reps/Duration, Load or RPE/RIR, Rest, Notes).",
  "  3) A short 'How to progress weeks 2-4' note in plain language.",
  "  4) Pain/injury guidance and substitutions relevant to THIS client only.",
  "  5) The machine block: START_WEEK1_TSV ... END_WEEK1_TSV with columns Day, Exercise, Weight, Sets, Reps, Rest, Target RPE, Notes, Results (Results empty). Plain text only, no LaTeX.",
].join("\n");

function buildPrompt(intake) {
  return [
    "A NEW CLIENT has submitted their intake. Build their Week 1 program now.",
    "Use ONLY the data in this intake. Do not use any remembered profile, saved info, or in-instruction example.",
    "",
    "=== CLIENT INTAKE ===",
    JSON.stringify(intake, null, 2),
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
function privacyScrub(text) {
  if (!text) return text;
  // Split off the TSV machine block so we never alter it.
  const startIdx = text.indexOf("START_WEEK1_TSV");
  let prose = startIdx === -1 ? text : text.slice(0, startIdx);
  const tsv = startIdx === -1 ? "" : text.slice(startIdx);

  // Remove a 'Weekly State: ...' line entirely.
  prose = prose.replace(/^.*Weekly\s*State.*$/gim, "").trim();
  // Neutralize standalone weekly-state words used as block labels (word-boundary, capitalized usage).
  prose = prose.replace(/\b(Push|Maintain|Reduce|Deload)\b(?=\s+(?:for|block|week|phase|state|everything|on))/g, "focus");
  // Strip internal abbreviations if any slipped through.
  prose = prose.replace(/\b(MEV|MAV|MRV|SQS|EVU|LTOS|VCS)\b/g, "target volume");
  // Strip Art. N citations.
  prose = prose.replace(/\(?\bArt\.?\s?\d+[a-z]?\)?/gi, "").replace(/[ ]{2,}/g, " ");

  return tsv ? prose.trim() + "\n\n" + tsv : prose.trim();
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
  });
});

// Build a new program (new client OR re-build for a token)
app.post("/api/build", async (req, res) => {
  try {
    const intake = req.body?.intake;
    if (!intake || typeof intake !== "object") {
      return res.status(400).json({ error: "Missing intake." });
    }
    // token: reuse if client already has one, else create
    let token = (req.body?.token || "").trim();
    if (!token) token = crypto.randomBytes(16).toString("hex");

    const u = getUsage(token);
    if (u.builds >= DAILY_BUILDS) {
      return res.status(429).json({
        error: `You've reached today's program-build limit (${DAILY_BUILDS}). Try again tomorrow or use Adjust.`,
      });
    }

    const program = privacyScrub(await runEngine(buildPrompt(intake)));
    const now = Date.now();
    db.prepare(
      `INSERT INTO clients (token, intake, program, created_at, updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(token) DO UPDATE SET intake=excluded.intake, program=excluded.program, updated_at=excluded.updated_at`
    ).run(token, JSON.stringify(intake), program, now, now);
    db.prepare(
      "INSERT INTO history (token, kind, request, program, created_at) VALUES (?,?,?,?,?)"
    ).run(token, "build", JSON.stringify(intake), program, now);
    bumpUsage(token, "build");

    res.json({ token, program });
  } catch (e) {
    console.error("build error:", e);
    res.status(500).json({ error: e.message || "Engine error." });
  }
});

// Adjust an existing program (surgical diff)
app.post("/api/adjust", async (req, res) => {
  try {
    const token = (req.body?.token || "").trim();
    const changeRequest = (req.body?.request || "").trim();
    if (!token) return res.status(400).json({ error: "Missing client token." });
    if (!changeRequest) return res.status(400).json({ error: "Tell me what changed." });

    const client = db.prepare("SELECT * FROM clients WHERE token=?").get(token);
    if (!client) return res.status(404).json({ error: "No saved program for this client yet." });

    const u = getUsage(token);
    if (u.adjusts >= DAILY_ADJUSTS) {
      return res.status(429).json({
        error: `You've reached today's adjustment limit (${DAILY_ADJUSTS}). Try again tomorrow.`,
      });
    }

    const intake = JSON.parse(client.intake);
    const program = privacyScrub(await runEngine(adjustPrompt(intake, client.program, changeRequest)));
    const now = Date.now();
    db.prepare("UPDATE clients SET program=?, updated_at=? WHERE token=?").run(program, now, token);
    db.prepare(
      "INSERT INTO history (token, kind, request, program, created_at) VALUES (?,?,?,?,?)"
    ).run(token, "adjust", changeRequest, program, now);
    bumpUsage(token, "adjust");

    res.json({ token, program });
  } catch (e) {
    console.error("adjust error:", e);
    res.status(500).json({ error: e.message || "Engine error." });
  }
});

// Load a returning client's saved program
app.get("/api/program/:token", (req, res) => {
  const client = db.prepare("SELECT * FROM clients WHERE token=?").get(req.params.token);
  if (!client) return res.status(404).json({ error: "Not found." });
  res.json({
    token: client.token,
    intake: JSON.parse(client.intake),
    program: client.program,
    updated_at: client.updated_at,
  });
});

app.listen(PORT, () => {
  console.log(`Coaching platform on :${PORT} (mode: ${USE_PPLX_PROXY ? "pplx-proxy" : GEMINI_API_KEY ? "gemini" : "no-key"})`);
});
