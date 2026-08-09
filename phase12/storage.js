// Storage abstraction with two backends:
//   - Supabase (Postgres) when SUPABASE_URL + SUPABASE_ANON_KEY are set (production / persistent)
//   - SQLite (better-sqlite3) otherwise (local dev / fallback)
//
// All methods are async so routes work the same regardless of backend.
//
// Tables (Supabase schema lives in supabase_migration.sql):
//   clients (token PK, intake, program, created_at, updated_at)
//   history (id PK, token, kind, request, program, created_at)
//   usage   (token, day, builds, adjusts; PK = token+day)

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
// Prefer service_role (backend-only, bypasses RLS). Fall back to anon for local dev.
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
export const USING_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const SUPABASE_KEY_MODE = SUPABASE_SERVICE_ROLE_KEY ? "service_role" : (SUPABASE_ANON_KEY ? "anon" : "none");

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// Usage quotas are product protection, not a critical persistence path.
// If the Supabase usage table is unavailable or temporarily unreachable,
// fall back to process-local counters so program generation itself is never blocked.
const usageFallback = new Map();
function usageFallbackKey(token, day = todayUTC()) { return `${token}:${day}`; }
function getFallbackUsage(token) {
  const day = todayUTC();
  const key = usageFallbackKey(token, day);
  if (!usageFallback.has(key)) usageFallback.set(key, { token, day, builds: 0, adjusts: 0 });
  return usageFallback.get(key);
}

// ---------------------------------------------------------------------------
// Supabase backend
// ---------------------------------------------------------------------------
function makeSupabaseStorage() {
  let client;

  function assertSupabase(result, operation) {
    if (result?.error) {
      const err = new Error(`Supabase ${operation} failed: ${result.error.message}`);
      err.cause = result.error;
      throw err;
    }
    return result;
  }
  async function sb() {
    if (client) return client;
    const { createClient } = await import("@supabase/supabase-js");
    // We only use the Postgres REST API (no realtime). On Node < 22 the client
    // needs an explicit WebSocket transport or it throws at construction time,
    // so we supply the `ws` package. Render's free tier may also run Node 20.
    const { default: WS } = await import("ws");
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WS },
      global: { headers: { "X-Client-Info": "raz-coaching-platform" } },
    });
    return client;
  }

  return {
    backend: "supabase",

    async getUsage(token) {
      const day = todayUTC();
      try {
        const s = await sb();
        const usageResult = await s
          .from("usage")
          .select("*")
          .eq("token", token)
          .eq("day", day)
          .maybeSingle();
        assertSupabase(usageResult, "getUsage/select");
        let { data } = usageResult;
        if (!data) {
          const insertResult = await s.from("usage").insert({ token, day, builds: 0, adjusts: 0 });
          assertSupabase(insertResult, "getUsage/insert");
          data = { token, day, builds: 0, adjusts: 0 };
        }
        // Keep fallback synchronized in case a later usage write/read fails.
        usageFallback.set(usageFallbackKey(token, day), {
          token, day, builds: Number(data.builds || 0), adjusts: Number(data.adjusts || 0)
        });
        return { ...data, builds: Number(data.builds || 0), adjusts: Number(data.adjusts || 0) };
      } catch (err) {
        console.warn("usage tracking unavailable; using local fallback:", err && err.message);
        return { ...getFallbackUsage(token) };
      }
    },

    async bumpUsage(token, kind) {
      const day = todayUTC();
      const fallback = getFallbackUsage(token);
      if (kind === "build") fallback.builds += 1;
      if (kind === "adjust") fallback.adjusts += 1;
      try {
        const s = await sb();
        // Atomic-enough for current single-instance deployment: read current persisted
        // counters, then update. A failure here must not turn a successful program
        // generation into a failed job.
        const usageResult = await s
          .from("usage")
          .select("*")
          .eq("token", token)
          .eq("day", day)
          .maybeSingle();
        assertSupabase(usageResult, "bumpUsage/select");
        const cur = usageResult.data || { token, day, builds: 0, adjusts: 0 };
        const builds = Number(cur.builds || 0) + (kind === "build" ? 1 : 0);
        const adjusts = Number(cur.adjusts || 0) + (kind === "adjust" ? 1 : 0);
        if (usageResult.data) {
          assertSupabase(
            await s.from("usage").update({ builds, adjusts }).eq("token", token).eq("day", day),
            "bumpUsage/update"
          );
        } else {
          assertSupabase(
            await s.from("usage").insert({ token, day, builds, adjusts }),
            "bumpUsage/insert"
          );
        }
        usageFallback.set(usageFallbackKey(token, day), { token, day, builds, adjusts });
      } catch (err) {
        console.warn("usage increment not persisted; local fallback retained:", err && err.message);
      }
    },

    async upsertClient(token, intakeJSON, program, now) {
      const s = await sb();
      // Does it exist?
      const existingResult = await s
        .from("clients")
        .select("token")
        .eq("token", token)
        .maybeSingle();
      assertSupabase(existingResult, "upsertClient/select");
      const { data: existing } = existingResult;
      if (existing) {
        assertSupabase(
          await s
            .from("clients")
            .update({ intake: intakeJSON, program, updated_at: now })
            .eq("token", token),
          "upsertClient/update"
        );
      } else {
        assertSupabase(
          await s
            .from("clients")
            .insert({ token, intake: intakeJSON, program, created_at: now, updated_at: now }),
          "upsertClient/insert"
        );
      }
    },

    async updateClientProgram(token, program, now) {
      const s = await sb();
      assertSupabase(
        await s.from("clients").update({ program, updated_at: now }).eq("token", token),
        "updateClientProgram/update"
      );
    },

    async getClient(token) {
      const s = await sb();
      const result = await s
        .from("clients")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      assertSupabase(result, "getClient/select");
      return result.data || null;
    },

    async addHistory(token, kind, request, program, now) {
      const s = await sb();
      assertSupabase(
        await s
          .from("history")
          .insert({ token, kind, request, program, created_at: now }),
        "addHistory/insert"
      );
    },

    // ---- async job tracking ----
    async createJob(id, token, kind, now) {
      const s = await sb();
      assertSupabase(
        await s.from("jobs").insert({
          id, token, kind, status: "pending", stage: "queued", attempt: 0, detail: null,
          program: null, error: null, created_at: now, updated_at: now,
        }),
        "createJob/insert"
      );
    },
    async updateJobProgress(id, stage, attempt = 0, detail = null, now = Date.now()) {
      const s = await sb();
      assertSupabase(
        await s.from("jobs").update({ stage, attempt, detail, updated_at: now }).eq("id", id),
        "updateJobProgress/update"
      );
    },
    async finishJob(id, status, program, error, now) {
      const s = await sb();
      assertSupabase(
        await s
          .from("jobs")
          .update({ status, program: program || null, error: error || null, updated_at: now })
          .eq("id", id),
        "finishJob/update"
      );
    },
    async getJob(id) {
      const s = await sb();
      const result = await s.from("jobs").select("*").eq("id", id).maybeSingle();
      assertSupabase(result, "getJob/select");
      return result.data || null;
    },

    async healthCheck() {
      const s = await sb();
      const result = await s.from("clients").select("token", { head: true, count: "exact" }).limit(1);
      assertSupabase(result, "healthCheck");
      return { ok: true, backend: "supabase" };
    },
  };
}

// ---------------------------------------------------------------------------
// SQLite backend (local dev / fallback)
// ---------------------------------------------------------------------------
async function makeSqliteStorage() {
  const { default: Database } = await import("better-sqlite3");
  const DB_PATH = path.join(__dirname, "data", "data.db");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      token TEXT PRIMARY KEY, intake TEXT, program TEXT,
      created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT, kind TEXT,
      request TEXT, program TEXT, created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS usage (
      token TEXT, day TEXT, builds INTEGER DEFAULT 0, adjusts INTEGER DEFAULT 0,
      PRIMARY KEY (token, day)
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, token TEXT, kind TEXT, status TEXT,
      stage TEXT, attempt INTEGER DEFAULT 0, detail TEXT,
      program TEXT, error TEXT, created_at INTEGER, updated_at INTEGER
    );
  `);
  // Backward-compatible local migration for older SQLite files.
  for (const sql of [
    "ALTER TABLE jobs ADD COLUMN stage TEXT",
    "ALTER TABLE jobs ADD COLUMN attempt INTEGER DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN detail TEXT",
  ]) { try { db.exec(sql); } catch (_) {} }

  return {
    backend: "sqlite",

    async getUsage(token) {
      const day = todayUTC();
      let row = db.prepare("SELECT * FROM usage WHERE token=? AND day=?").get(token, day);
      if (!row) {
        db.prepare("INSERT INTO usage (token, day, builds, adjusts) VALUES (?,?,0,0)").run(token, day);
        row = { token, day, builds: 0, adjusts: 0 };
      }
      return row;
    },

    async bumpUsage(token, kind) {
      const day = todayUTC();
      const col = kind === "build" ? "builds" : "adjusts";
      db.prepare(`UPDATE usage SET ${col}=${col}+1 WHERE token=? AND day=?`).run(token, day);
    },

    async upsertClient(token, intakeJSON, program, now) {
      db.prepare(
        `INSERT INTO clients (token, intake, program, created_at, updated_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(token) DO UPDATE SET intake=excluded.intake, program=excluded.program, updated_at=excluded.updated_at`
      ).run(token, intakeJSON, program, now, now);
    },

    async updateClientProgram(token, program, now) {
      db.prepare("UPDATE clients SET program=?, updated_at=? WHERE token=?").run(program, now, token);
    },

    async getClient(token) {
      return db.prepare("SELECT * FROM clients WHERE token=?").get(token) || null;
    },

    async addHistory(token, kind, request, program, now) {
      db.prepare(
        "INSERT INTO history (token, kind, request, program, created_at) VALUES (?,?,?,?,?)"
      ).run(token, kind, request, program, now);
    },

    // ---- async job tracking ----
    async createJob(id, token, kind, now) {
      db.prepare(
        "INSERT INTO jobs (id, token, kind, status, stage, attempt, detail, program, error, created_at, updated_at) VALUES (?,?,?,?,?,0,NULL,NULL,NULL,?,?)"
      ).run(id, token, kind, "pending", "queued", now, now);
    },
    async updateJobProgress(id, stage, attempt = 0, detail = null, now = Date.now()) {
      db.prepare("UPDATE jobs SET stage=?, attempt=?, detail=?, updated_at=? WHERE id=?")
        .run(stage, attempt, detail, now, id);
    },
    async finishJob(id, status, program, error, now) {
      db.prepare(
        "UPDATE jobs SET status=?, program=?, error=?, updated_at=? WHERE id=?"
      ).run(status, program || null, error || null, now, id);
    },
    async getJob(id) {
      return db.prepare("SELECT * FROM jobs WHERE id=?").get(id) || null;
    },

    async healthCheck() {
      db.prepare("SELECT 1 AS ok").get();
      return { ok: true, backend: "sqlite" };
    },
  };
}

export async function makeStorage() {
  return USING_SUPABASE ? makeSupabaseStorage() : makeSqliteStorage();
}
