// Program Pass entitlement storage for the deployed phase14/Phase15 runtime.
// Kept separate from coaching data so deleting coaching content cannot reset paid access.

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
      const { error } = await s.from("program_passes").insert({ code, status: "issued", activated_token: null, created_at: now, activated_at: null, expires_at: null, adjustment_limit: adjustmentLimit, adjustment_count: 0, initial_build_completed_at: null });
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
      const expiresAt = pass.expires_at || (now + accessDays * 86400000);
      const { error } = await s.from("program_passes").update({ status: "active", activated_token: token, activated_at: pass.activated_at || now, expires_at: expiresAt }).eq("code", code);
      if (error) throw error;
      return this.getPass(code);
    },
    async markInitialBuildCompleted(token, now) {
      const s = await sb();
      const { error } = await s.from("program_passes").update({ initial_build_completed_at: now }).eq("activated_token", token).is("initial_build_completed_at", null);
      if (error) throw error;
      return this.getPassForToken(token);
    },
    async incrementAdjustment(token) {
      const pass = await this.getPassForToken(token);
      if (!pass) return null;
      const s = await sb();
      const { error } = await s.from("program_passes").update({ adjustment_count: Number(pass.adjustment_count || 0) + 1 }).eq("code", pass.code);
      if (error) throw error;
      return this.getPass(pass.code);
    },
    async expiredTokens(beforeMs) {
      const s = await sb();
      const { data, error } = await s.from("program_passes").select("activated_token").eq("status", "active").not("activated_token", "is", null).lt("expires_at", Number(beforeMs));
      if (error) throw error;
      return (data || []).map((r) => r.activated_token).filter(Boolean);
    },
  };
}

async function makeSqliteEntitlements() {
  const { default: Database } = await import("better-sqlite3");
  const DB_PATH = process.env.ENTITLEMENTS_SQLITE_DB_PATH || path.join(__dirname, "data", "data.db");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS program_passes (code TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'issued',activated_token TEXT UNIQUE,created_at INTEGER NOT NULL,activated_at INTEGER,expires_at INTEGER,adjustment_limit INTEGER NOT NULL DEFAULT 6,adjustment_count INTEGER NOT NULL DEFAULT 0,initial_build_completed_at INTEGER);`);
  return {
    backend: "sqlite",
    async issuePass(code, now, adjustmentLimit = 6) { db.prepare("INSERT INTO program_passes (code,status,created_at,adjustment_limit,adjustment_count) VALUES (?,'issued',?,?,0)").run(code, now, adjustmentLimit); return this.getPass(code); },
    async getPass(code) { return db.prepare("SELECT * FROM program_passes WHERE code=?").get(code) || null; },
    async getPassForToken(token) { return db.prepare("SELECT * FROM program_passes WHERE activated_token=?").get(token) || null; },
    async activatePass(code, token, now, accessDays = 56) { const pass = await this.getPass(code); if (!pass) return null; if (pass.activated_token && pass.activated_token !== token) return pass; const expiresAt = pass.expires_at || now + accessDays * 86400000; db.prepare("UPDATE program_passes SET status='active',activated_token=?,activated_at=COALESCE(activated_at,?),expires_at=COALESCE(expires_at,?) WHERE code=?").run(token, now, expiresAt, code); return this.getPass(code); },
    async markInitialBuildCompleted(token, now) { db.prepare("UPDATE program_passes SET initial_build_completed_at=COALESCE(initial_build_completed_at,?) WHERE activated_token=?").run(now, token); return this.getPassForToken(token); },
    async incrementAdjustment(token) { db.prepare("UPDATE program_passes SET adjustment_count=adjustment_count+1 WHERE activated_token=?").run(token); return this.getPassForToken(token); },
    async expiredTokens(beforeMs) { return db.prepare("SELECT activated_token FROM program_passes WHERE status='active' AND activated_token IS NOT NULL AND expires_at < ?").all(Number(beforeMs)).map((r) => r.activated_token).filter(Boolean); },
  };
}

export async function makeEntitlementStore() { return USING_SUPABASE ? makeSupabaseEntitlements() : makeSqliteEntitlements(); }
