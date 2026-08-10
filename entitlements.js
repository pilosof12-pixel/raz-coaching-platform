// Program Pass entitlement storage.
// Separate from coaching data so the commercial access model can be enforced
// without coupling payment logic to the coaching engine.

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const USING_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

function makeSupabaseEntitlements() {
  let client;
  async function sb() {
    if (client) return client;
    const { createClient } = await import("@supabase/supabase-js");
    const { default: WS } = await import("ws");
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WS },
    });
    return client;
  }

  return {
    backend: "supabase",

    async issuePass(code, now, adjustmentLimit = 6) {
      const s = await sb();
      const { error } = await s.from("program_passes").insert({
        code,
        status: "issued",
        activated_token: null,
        created_at: now,
        activated_at: null,
        expires_at: null,
        adjustment_limit: adjustmentLimit,
      });
      if (error) throw error;
      return this.getPass(code);
    },

    async getPass(code) {
      const s = await sb();
      const { data, error } = await s.from("program_passes").select("*").eq("code", code).maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async getPassForToken(token) {
      const s = await sb();
      const { data, error } = await s.from("program_passes").select("*").eq("activated_token", token).maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async activatePass(code, token, now, accessDays = 56) {
      const s = await sb();
      const pass = await this.getPass(code);
      if (!pass) return null;
      if (pass.activated_token && pass.activated_token !== token) return pass;
      const expiresAt = pass.expires_at || (now + accessDays * 24 * 60 * 60 * 1000);
      const { error } = await s.from("program_passes").update({
        status: "active",
        activated_token: token,
        activated_at: pass.activated_at || now,
        expires_at: expiresAt,
      }).eq("code", code);
      if (error) throw error;
      return this.getPass(code);
    },

    async successfulAdjustmentCount(token) {
      const s = await sb();
      const { data, error } = await s.from("history").select("request").eq("token", token).eq("kind", "adjust");
      if (error) throw error;
      return (data || []).filter((r) => !String(r.request || "").startsWith("[language:")).length;
    },
  };
}

async function makeSqliteEntitlements() {
  const { default: Database } = await import("better-sqlite3");
  const DB_PATH = path.join(__dirname, "data", "data.db");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS program_passes (
      code TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'issued',
      activated_token TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      expires_at INTEGER,
      adjustment_limit INTEGER NOT NULL DEFAULT 6
    );
  `);

  return {
    backend: "sqlite",

    async issuePass(code, now, adjustmentLimit = 6) {
      db.prepare(
        "INSERT INTO program_passes (code,status,activated_token,created_at,activated_at,expires_at,adjustment_limit) VALUES (?,'issued',NULL,?,NULL,NULL,?)"
      ).run(code, now, adjustmentLimit);
      return this.getPass(code);
    },

    async getPass(code) {
      return db.prepare("SELECT * FROM program_passes WHERE code=?").get(code) || null;
    },

    async getPassForToken(token) {
      return db.prepare("SELECT * FROM program_passes WHERE activated_token=?").get(token) || null;
    },

    async activatePass(code, token, now, accessDays = 56) {
      const pass = await this.getPass(code);
      if (!pass) return null;
      if (pass.activated_token && pass.activated_token !== token) return pass;
      const expiresAt = pass.expires_at || (now + accessDays * 24 * 60 * 60 * 1000);
      db.prepare(
        "UPDATE program_passes SET status='active', activated_token=?, activated_at=COALESCE(activated_at,?), expires_at=COALESCE(expires_at,?) WHERE code=?"
      ).run(token, now, expiresAt, code);
      return this.getPass(code);
    },

    async successfulAdjustmentCount(token) {
      const rows = db.prepare("SELECT request FROM history WHERE token=? AND kind='adjust'").all(token);
      return rows.filter((r) => !String(r.request || "").startsWith("[language:")).length;
    },
  };
}

export async function makeEntitlementStore() {
  return USING_SUPABASE ? makeSupabaseEntitlements() : makeSqliteEntitlements();
}
