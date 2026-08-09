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

  // Process-local mirrors keep the current user flow alive if PostgREST has a
  // short transport outage. Supabase remains the source of truth whenever it
  // is reachable. These mirrors are intentionally bounded by process lifetime.
  const clientFallback = new Map();
  const jobFallback = new Map();
  const historyFallback = [];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function errorText(err) {
    return [err?.message, err?.details, err?.hint, err?.cause?.message, err?.cause?.code]
      .filter(Boolean).join(' | ');
  }

  function isTransientSupabaseError(err) {
    const text = errorText(err).toLowerCase();
    return (
      text.includes('fetch failed') ||
      text.includes('network') ||
      text.includes('econnreset') ||
      text.includes('econnrefused') ||
      text.includes('etimedout') ||
      text.includes('timeout') ||
      text.includes('socket') ||
      text.includes('terminated') ||
      text.includes('und_err') ||
      text.includes('temporary') ||
      text.includes('connection')
    );
  }

  function toSupabaseError(result, operation) {
    const err = new Error(`Supabase ${operation} failed: ${result?.error?.message || 'Unknown error'}`);
    err.cause = result?.error;
    return err;
  }

  async function runSupabase(operation, fn, { attempts = 4 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await fn();
        if (result?.error) throw toSupabaseError(result, operation);
        return result;
      } catch (err) {
        lastError = err;
        // SQL/schema/RLS/validation errors are deterministic. Only retry
        // transport-like failures.
        if (!isTransientSupabaseError(err) || attempt === attempts) throw err;
        const delays = [250, 700, 1500, 2500];
        await sleep(delays[Math.min(attempt - 1, delays.length - 1)]);
      }
    }
    throw lastError;
  }

  async function sb() {
    if (client) return client;
    const { createClient } = await import("@supabase/supabase-js");
    const { default: WS } = await import("ws");

    // Retry the transport itself as a first layer. Supabase-js can sometimes
    // convert a failed fetch into result.error instead of throwing, therefore
    // every database operation is ALSO wrapped by runSupabase above.
    const retryFetch = async (input, init) => {
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await fetch(input, init);
        } catch (err) {
          lastError = err;
          if (attempt === 2) break;
          await sleep(attempt === 0 ? 200 : 600);
        }
      }
      throw lastError;
    };

    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WS },
      global: {
        fetch: retryFetch,
        headers: { "X-Client-Info": "raz-coaching-platform" },
      },
    });
    return client;
  }

  function mirrorClient(token, intake, program, createdAt, updatedAt) {
    const prev = clientFallback.get(token);
    const row = {
      token,
      intake: intake ?? prev?.intake ?? null,
      program: program ?? prev?.program ?? '',
      created_at: prev?.created_at ?? createdAt ?? updatedAt ?? Date.now(),
      updated_at: updatedAt ?? Date.now(),
    };
    clientFallback.set(token, row);
    return row;
  }

  function mirrorJob(row) {
    const prev = jobFallback.get(row.id) || {};
    const merged = { ...prev, ...row };
    jobFallback.set(row.id, merged);
    return merged;
  }

  return {
    backend: "supabase",

    async getUsage(token) {
      const day = todayUTC();
      try {
        const s = await sb();
        const usageResult = await runSupabase("getUsage/select", () => s
          .from("usage")
          .select("*")
          .eq("token", token)
          .eq("day", day)
          .maybeSingle());
        let { data } = usageResult;
        if (!data) {
          await runSupabase("getUsage/insert", () => s.from("usage").insert({ token, day, builds: 0, adjusts: 0 }));
          data = { token, day, builds: 0, adjusts: 0 };
        }
        usageFallback.set(usageFallbackKey(token, day), {
          token, day, builds: Number(data.builds || 0), adjusts: Number(data.adjusts || 0)
        });
        return { ...data, builds: Number(data.builds || 0), adjusts: Number(data.adjusts || 0) };
      } catch (err) {
        console.warn("usage tracking unavailable; using local fallback:", errorText(err));
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
        const usageResult = await runSupabase("bumpUsage/select", () => s
          .from("usage").select("*").eq("token", token).eq("day", day).maybeSingle());
        const cur = usageResult.data || { token, day, builds: 0, adjusts: 0 };
        const builds = Number(cur.builds || 0) + (kind === "build" ? 1 : 0);
        const adjusts = Number(cur.adjusts || 0) + (kind === "adjust" ? 1 : 0);
        if (usageResult.data) {
          await runSupabase("bumpUsage/update", () => s.from("usage").update({ builds, adjusts }).eq("token", token).eq("day", day));
        } else {
          await runSupabase("bumpUsage/insert", () => s.from("usage").insert({ token, day, builds, adjusts }));
        }
        usageFallback.set(usageFallbackKey(token, day), { token, day, builds, adjusts });
      } catch (err) {
        console.warn("usage increment not persisted; local fallback retained:", errorText(err));
      }
    },

    async upsertClient(token, intakeJSON, program, now) {
      mirrorClient(token, intakeJSON, program, now, now);
      try {
        const s = await sb();
        const existingResult = await runSupabase("upsertClient/select", () => s
          .from("clients").select("token").eq("token", token).maybeSingle());
        if (existingResult.data) {
          await runSupabase("upsertClient/update", () => s.from("clients")
            .update({ intake: intakeJSON, program, updated_at: now }).eq("token", token));
        } else {
          await runSupabase("upsertClient/insert", () => s.from("clients")
            .insert({ token, intake: intakeJSON, program, created_at: now, updated_at: now }));
        }
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("client upsert not persisted; local mirror retained:", errorText(err));
      }
    },

    async updateClientProgram(token, program, now) {
      const prev = clientFallback.get(token);
      mirrorClient(token, prev?.intake, program, prev?.created_at || now, now);
      try {
        const s = await sb();
        await runSupabase("updateClientProgram/update", () => s.from("clients")
          .update({ program, updated_at: now }).eq("token", token));
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("client program not persisted; local mirror retained:", errorText(err));
      }
    },

    async getClient(token) {
      try {
        const s = await sb();
        const result = await runSupabase("getClient/select", () => s.from("clients")
          .select("*").eq("token", token).maybeSingle());
        if (result.data) {
          clientFallback.set(token, result.data);
          return result.data;
        }
        return clientFallback.get(token) || null;
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("client read unavailable; using local mirror:", errorText(err));
        return clientFallback.get(token) || null;
      }
    },

    async addHistory(token, kind, request, program, now) {
      const localRow = { token, kind, request, program, created_at: now };
      historyFallback.push(localRow);
      if (historyFallback.length > 200) historyFallback.shift();
      try {
        const s = await sb();
        await runSupabase("addHistory/insert", () => s.from("history").insert(localRow));
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("history not persisted; local mirror retained:", errorText(err));
      }
    },

    // ---- async job tracking ----
    async createJob(id, token, kind, now) {
      const row = {
        id, token, kind, status: "pending", stage: "queued", attempt: 0, detail: null,
        program: null, error: null, created_at: now, updated_at: now,
      };
      mirrorJob(row);
      try {
        const s = await sb();
        await runSupabase("createJob/insert", () => s.from("jobs").insert(row));
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("job create not persisted; local mirror retained:", errorText(err));
      }
    },

    async updateJobProgress(id, stage, attempt = 0, detail = null, now = Date.now()) {
      mirrorJob({ id, stage, attempt, detail, updated_at: now });
      try {
        const s = await sb();
        await runSupabase("updateJobProgress/update", () => s.from("jobs")
          .update({ stage, attempt, detail, updated_at: now }).eq("id", id));
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("job progress not persisted; local mirror retained:", errorText(err));
      }
    },

    async finishJob(id, status, program, error, now) {
      mirrorJob({ id, status, program: program || null, error: error || null, updated_at: now });
      try {
        const s = await sb();
        await runSupabase("finishJob/update", () => s.from("jobs")
          .update({ status, program: program || null, error: error || null, updated_at: now }).eq("id", id));
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("job finish not persisted; local mirror retained:", errorText(err));
      }
    },

    async getJob(id) {
      try {
        const s = await sb();
        const result = await runSupabase("getJob/select", () => s.from("jobs")
          .select("*").eq("id", id).maybeSingle());
        if (result.data) {
          jobFallback.set(id, result.data);
          return result.data;
        }
        return jobFallback.get(id) || null;
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("job read unavailable; using local mirror:", errorText(err));
        return jobFallback.get(id) || null;
      }
    },

    async healthCheck() {
      try {
        const s = await sb();
        await runSupabase("healthCheck", () => s.from("clients")
          .select("token", { head: true, count: "exact" }).limit(1), { attempts: 2 });
        return { ok: true, backend: "supabase", persistence: "connected" };
      } catch (err) {
        if (!isTransientSupabaseError(err)) throw err;
        return { ok: true, backend: "supabase", persistence: "degraded", detail: "temporary Supabase transport issue" };
      }
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
