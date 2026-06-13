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
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
export const USING_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Supabase backend
// ---------------------------------------------------------------------------
function makeSupabaseStorage() {
  let client;
  async function sb() {
    if (client) return client;
    const { createClient } = await import("@supabase/supabase-js");
    // We only use the Postgres REST API (no realtime). On Node < 22 the client
    // needs an explicit WebSocket transport or it throws at construction time,
    // so we supply the `ws` package. Render's free tier may also run Node 20.
    const { default: WS } = await import("ws");
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
      const s = await sb();
      let { data } = await s
        .from("usage")
        .select("*")
        .eq("token", token)
        .eq("day", day)
        .maybeSingle();
      if (!data) {
        await s.from("usage").insert({ token, day, builds: 0, adjusts: 0 });
        data = { token, day, builds: 0, adjusts: 0 };
      }
      return data;
    },

    async bumpUsage(token, kind) {
      const day = todayUTC();
      const s = await sb();
      const cur = await this.getUsage(token);
      const builds = cur.builds + (kind === "build" ? 1 : 0);
      const adjusts = cur.adjusts + (kind === "adjust" ? 1 : 0);
      await s
        .from("usage")
        .update({ builds, adjusts })
        .eq("token", token)
        .eq("day", day);
    },

    async upsertClient(token, intakeJSON, program, now) {
      const s = await sb();
      // Does it exist?
      const { data: existing } = await s
        .from("clients")
        .select("token")
        .eq("token", token)
        .maybeSingle();
      if (existing) {
        await s
          .from("clients")
          .update({ intake: intakeJSON, program, updated_at: now })
          .eq("token", token);
      } else {
        await s
          .from("clients")
          .insert({ token, intake: intakeJSON, program, created_at: now, updated_at: now });
      }
    },

    async updateClientProgram(token, program, now) {
      const s = await sb();
      await s.from("clients").update({ program, updated_at: now }).eq("token", token);
    },

    async getClient(token) {
      const s = await sb();
      const { data } = await s
        .from("clients")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      return data || null;
    },

    async addHistory(token, kind, request, program, now) {
      const s = await sb();
      await s
        .from("history")
        .insert({ token, kind, request, program, created_at: now });
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
  `);

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
  };
}

export async function makeStorage() {
  return USING_SUPABASE ? makeSupabaseStorage() : makeSqliteStorage();
}
