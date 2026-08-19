// Privacy-preserving launch analytics.
// Stores only aggregate event counts by UTC day. No client token, IP, intake,
// injury information, program text, user agent or other customer content is stored.

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const USING_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const ANALYTICS_EVENTS = new Set([
  "intake_started",
  "build_started",
  "build_succeeded",
  "build_failed",
  "return_succeeded",
  "return_failed",
  "adjust_started",
  "adjust_succeeded",
  "adjust_failed",
  "spreadsheet_downloaded",
  "language_switch_succeeded",
]);

export function isAllowedAnalyticsEvent(event) {
  return typeof event === "string" && ANALYTICS_EVENTS.has(event);
}

function dayUTC(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function makeSupabaseAnalytics() {
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

    async record(event, now = Date.now()) {
      if (!isAllowedAnalyticsEvent(event)) throw new Error("INVALID_ANALYTICS_EVENT");
      const day = dayUTC(now);
      const s = await sb();
      const { data, error } = await s
        .from("analytics_daily")
        .select("count")
        .eq("day", day)
        .eq("event", event)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const { error: updateError } = await s
          .from("analytics_daily")
          .update({ count: Number(data.count || 0) + 1 })
          .eq("day", day)
          .eq("event", event);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await s
          .from("analytics_daily")
          .insert({ day, event, count: 1 });
        if (insertError) throw insertError;
      }
      return true;
    },

    async summary(days = 30, now = Date.now()) {
      const n = Math.max(1, Math.min(365, Number(days || 30)));
      const since = new Date(now - (n - 1) * 86400000).toISOString().slice(0, 10);
      const s = await sb();
      const { data, error } = await s
        .from("analytics_daily")
        .select("day,event,count")
        .gte("day", since)
        .order("day", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  };
}

async function makeSqliteAnalytics() {
  const { default: Database } = await import("better-sqlite3");
  const DB_PATH = path.join(__dirname, "data", "data.db");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_daily (
      day TEXT NOT NULL,
      event TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, event)
    );
  `);

  return {
    backend: "sqlite",

    async record(event, now = Date.now()) {
      if (!isAllowedAnalyticsEvent(event)) throw new Error("INVALID_ANALYTICS_EVENT");
      const day = dayUTC(now);
      db.prepare(`
        INSERT INTO analytics_daily (day,event,count) VALUES (?,?,1)
        ON CONFLICT(day,event) DO UPDATE SET count=count+1
      `).run(day, event);
      return true;
    },

    async summary(days = 30, now = Date.now()) {
      const n = Math.max(1, Math.min(365, Number(days || 30)));
      const since = new Date(now - (n - 1) * 86400000).toISOString().slice(0, 10);
      return db.prepare(
        "SELECT day,event,count FROM analytics_daily WHERE day>=? ORDER BY day ASC,event ASC"
      ).all(since);
    },
  };
}

export async function makeAnalyticsStore() {
  return USING_SUPABASE ? makeSupabaseAnalytics() : makeSqliteAnalytics();
}
