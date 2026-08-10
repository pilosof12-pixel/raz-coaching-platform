// Storage abstraction with two backends:
//   - Supabase (Postgres) in production
//   - SQLite otherwise for local development
//
// Program Pass defaults are enforced by the server wrapper. Storage owns the
// durable entitlement record and records successful program/adjustment usage.

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
export const USING_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const SUPABASE_KEY_MODE = SUPABASE_SERVICE_ROLE_KEY ? "service_role" : (SUPABASE_ANON_KEY ? "anon" : "none");

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function retentionCutoffs(now = Date.now()) {
  const DAY = 24 * 60 * 60 * 1000;
  return {
    jobs: now - 7 * DAY,
    history: now - 180 * DAY,
    usageDay: new Date(now - 90 * DAY).toISOString().slice(0, 10),
  };
}

function normalizePass(row) {
  if (!row) return null;
  const now = Date.now();
  const expired = Number(row.expires_at || 0) <= now;
  const status = expired && row.status === "active" ? "expired" : row.status;
  return {
    ...row,
    status,
    active: status === "active" && !expired,
    programs_remaining: Math.max(0, Number(row.program_credits || 0) - Number(row.programs_used || 0)),
    adjustments_remaining: Math.max(0, Number(row.adjustments_total || 0) - Number(row.adjustments_used || 0)),
  };
}

// ---------------------------------------------------------------------------
// Supabase backend
// ---------------------------------------------------------------------------
function makeSupabaseStorage() {
  let client;
  async function sb() {
    if (client) return client;
    const { createClient } = await import("@supabase/supabase-js");
    const { default: WS } = await import("ws");
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WS },
      global: { headers: { "X-Client-Info": "raz-coaching-platform" } },
    });
    return client;
  }

  async function recordPassUse(token, kind, now) {
    const s = await sb();
    const { data } = await s.from("program_passes").select("*").eq("token", token).maybeSingle();
    if (!data) return;
    const pass = normalizePass(data);
    if (!pass?.active) return;
    if (kind === "build") {
      if (pass.programs_remaining <= 0) return;
      await s.from("program_passes")
        .update({ programs_used: Number(pass.programs_used || 0) + 1, updated_at: now })
        .eq("token", token);
    } else if (kind === "adjust") {
      if (pass.adjustments_remaining <= 0) return;
      await s.from("program_passes")
        .update({ adjustments_used: Number(pass.adjustments_used || 0) + 1, updated_at: now })
        .eq("token", token);
    }
  }

  return {
    backend: "supabase",

    async getUsage(token) {
      const day = todayUTC();
      const s = await sb();
      let { data } = await s.from("usage").select("*").eq("token", token).eq("day", day).maybeSingle();
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
      await s.from("usage").update({ builds, adjusts }).eq("token", token).eq("day", day);
    },

    async upsertClient(token, intakeJSON, program, now) {
      const s = await sb();
      const { data: existing } = await s.from("clients").select("token").eq("token", token).maybeSingle();
      if (existing) {
        await s.from("clients").update({ intake: intakeJSON, program, updated_at: now }).eq("token", token);
      } else {
        await s.from("clients").insert({ token, intake: intakeJSON, program, created_at: now, updated_at: now });
      }
    },

    async updateClientProgram(token, program, now) {
      const s = await sb();
      await s.from("clients").update({ program, updated_at: now }).eq("token", token);
    },

    async getClient(token) {
      const s = await sb();
      const { data } = await s.from("clients").select("*").eq("token", token).maybeSingle();
      return data || null;
    },

    async addHistory(token, kind, request, program, now) {
      const s = await sb();
      await s.from("history").insert({ token, kind, request, program, created_at: now });
      await recordPassUse(token, kind, now);
    },

    async createJob(id, token, kind, now) {
      const s = await sb();
      await s.from("jobs").insert({
        id, token, kind, status: "pending", program: null, error: null,
        created_at: now, updated_at: now,
      });
    },

    async finishJob(id, status, program, error, now) {
      const s = await sb();
      await s.from("jobs").update({
        status, program: program || null, error: error || null, updated_at: now,
      }).eq("id", id);
    },

    async getJob(id) {
      const s = await sb();
      const { data } = await s.from("jobs").select("*").eq("id", id).maybeSingle();
      return data || null;
    },

    async hasPendingJob(token, kind) {
      const s = await sb();
      const { data } = await s.from("jobs")
        .select("id")
        .eq("token", token)
        .eq("kind", kind)
        .eq("status", "pending")
        .limit(1);
      return Boolean(data && data.length);
    },

    async getProgramPass(token) {
      const s = await sb();
      const { data } = await s.from("program_passes").select("*").eq("token", token).maybeSingle();
      if (!data) return null;
      const pass = normalizePass(data);
      if (pass.status === "expired" && data.status === "active") {
        await s.from("program_passes").update({ status: "expired", updated_at: Date.now() }).eq("token", token);
      }
      return pass;
    },

    async createProgramPass({ token, paymentRef, purchasedAt, expiresAt, programCredits = 1, adjustmentsTotal = 6 }) {
      const s = await sb();
      const now = Date.now();
      const row = {
        token,
        payment_ref: paymentRef || null,
        status: "active",
        purchased_at: purchasedAt,
        expires_at: expiresAt,
        program_credits: programCredits,
        programs_used: 0,
        adjustments_total: adjustmentsTotal,
        adjustments_used: 0,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await s.from("program_passes").insert(row).select("*").single();
      if (error) throw error;
      return normalizePass(data);
    },

    async deleteClientData(token) {
      const s = await sb();
      await s.from("jobs").delete().eq("token", token);
      await s.from("history").delete().eq("token", token);
      await s.from("usage").delete().eq("token", token);
      await s.from("clients").delete().eq("token", token);
      await s.from("program_passes").delete().eq("token", token);
      return true;
    },

    async purgeExpiredOperationalData(now = Date.now()) {
      const s = await sb();
      const c = retentionCutoffs(now);
      await s.from("jobs").delete().lt("created_at", c.jobs);
      await s.from("history").delete().lt("created_at", c.history);
      await s.from("usage").delete().lt("day", c.usageDay);
      try { await s.rpc("expire_program_passes"); } catch (_e) {}
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// SQLite backend
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
      program TEXT, error TEXT, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS program_passes (
      token TEXT PRIMARY KEY,
      payment_ref TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      purchased_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      program_credits INTEGER NOT NULL DEFAULT 1,
      programs_used INTEGER NOT NULL DEFAULT 0,
      adjustments_total INTEGER NOT NULL DEFAULT 6,
      adjustments_used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  function getPass(token) {
    const row = db.prepare("SELECT * FROM program_passes WHERE token=?").get(token);
    if (!row) return null;
    const pass = normalizePass(row);
    if (pass.status === "expired" && row.status === "active") {
      db.prepare("UPDATE program_passes SET status='expired', updated_at=? WHERE token=?").run(Date.now(), token);
    }
    return pass;
  }

  function recordPassUse(token, kind, now) {
    const pass = getPass(token);
    if (!pass?.active) return;
    if (kind === "build" && pass.programs_remaining > 0) {
      db.prepare("UPDATE program_passes SET programs_used=programs_used+1, updated_at=? WHERE token=?").run(now, token);
    } else if (kind === "adjust" && pass.adjustments_remaining > 0) {
      db.prepare("UPDATE program_passes SET adjustments_used=adjustments_used+1, updated_at=? WHERE token=?").run(now, token);
    }
  }

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
      const tx = db.transaction(() => {
        db.prepare("INSERT INTO history (token, kind, request, program, created_at) VALUES (?,?,?,?,?)")
          .run(token, kind, request, program, now);
        recordPassUse(token, kind, now);
      });
      tx();
    },

    async createJob(id, token, kind, now) {
      db.prepare(
        "INSERT INTO jobs (id, token, kind, status, program, error, created_at, updated_at) VALUES (?,?,?,?,NULL,NULL,?,?)"
      ).run(id, token, kind, "pending", now, now);
    },

    async finishJob(id, status, program, error, now) {
      db.prepare("UPDATE jobs SET status=?, program=?, error=?, updated_at=? WHERE id=?")
        .run(status, program || null, error || null, now, id);
    },

    async getJob(id) {
      return db.prepare("SELECT * FROM jobs WHERE id=?").get(id) || null;
    },

    async hasPendingJob(token, kind) {
      return Boolean(db.prepare("SELECT id FROM jobs WHERE token=? AND kind=? AND status='pending' LIMIT 1").get(token, kind));
    },

    async getProgramPass(token) {
      return getPass(token);
    },

    async createProgramPass({ token, paymentRef, purchasedAt, expiresAt, programCredits = 1, adjustmentsTotal = 6 }) {
      const now = Date.now();
      db.prepare(
        `INSERT INTO program_passes
         (token, payment_ref, status, purchased_at, expires_at, program_credits, programs_used, adjustments_total, adjustments_used, created_at, updated_at)
         VALUES (?,?,'active',?,?,?,0,?,0,?,?)`
      ).run(token, paymentRef || null, purchasedAt, expiresAt, programCredits, adjustmentsTotal, now, now);
      return getPass(token);
    },

    async deleteClientData(token) {
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM jobs WHERE token=?").run(token);
        db.prepare("DELETE FROM history WHERE token=?").run(token);
        db.prepare("DELETE FROM usage WHERE token=?").run(token);
        db.prepare("DELETE FROM clients WHERE token=?").run(token);
        db.prepare("DELETE FROM program_passes WHERE token=?").run(token);
      });
      tx();
      return true;
    },

    async purgeExpiredOperationalData(now = Date.now()) {
      const c = retentionCutoffs(now);
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM jobs WHERE created_at < ?").run(c.jobs);
        db.prepare("DELETE FROM history WHERE created_at < ?").run(c.history);
        db.prepare("DELETE FROM usage WHERE day < ?").run(c.usageDay);
        db.prepare("UPDATE program_passes SET status='expired', updated_at=? WHERE status='active' AND expires_at <= ?")
          .run(now, now);
      });
      tx();
      return true;
    },
  };
}

export async function makeStorage() {
  return USING_SUPABASE ? makeSupabaseStorage() : makeSqliteStorage();
}
