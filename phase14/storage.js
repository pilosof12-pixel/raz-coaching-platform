// Storage abstraction for production Supabase and local SQLite.
// Phase 15 keeps client-visible job state in a process-local mirror so polling and
// progress updates are not held hostage by remote PostgREST latency. Durable client
// programs still persist to Supabase before a build is considered complete.

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

function todayUTC() { return new Date().toISOString().slice(0, 10); }
const usageFallback = new Map();
const coachingCacheInvalidators = new Set();
function usageFallbackKey(token, day=todayUTC()) { return `${token}:${day}`; }
function getFallbackUsage(token) {
  const day=todayUTC(), key=usageFallbackKey(token,day);
  if (!usageFallback.has(key)) usageFallback.set(key,{token,day,builds:0,adjusts:0});
  return usageFallback.get(key);
}

// Privacy deletion must invalidate the same process-local mirrors that make
// Phase 15 polling resilient. Otherwise Supabase can be empty while the server
// continues serving a deleted intake/program from memory until the next restart.
export function invalidateCoachingDataCache(token) {
  const prefix = `${String(token)}:`;
  for (const key of usageFallback.keys()) if (key.startsWith(prefix)) usageFallback.delete(key);
  for (const invalidate of coachingCacheInvalidators) {
    try { invalidate(String(token)); } catch (e) { console.warn("coaching cache invalidation failed:", e && e.message); }
  }
}

function makeSupabaseStorage() {
  let client;
  const clientFallback = new Map();
  const jobFallback = new Map();
  const historyFallback = [];
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  coachingCacheInvalidators.add((token) => {
    clientFallback.delete(token);
    for (const [id,row] of jobFallback.entries()) if (row?.token === token) jobFallback.delete(id);
    for (let i=historyFallback.length-1;i>=0;i--) if (historyFallback[i]?.token === token) historyFallback.splice(i,1);
  });

  function errorText(err) {
    return [err?.message,err?.details,err?.hint,err?.cause?.message,err?.cause?.code].filter(Boolean).join(" | ");
  }
  function isTransientSupabaseError(err) {
    const t=errorText(err).toLowerCase();
    return ["fetch failed","network","econnreset","econnrefused","etimedout","timeout","socket","terminated","und_err","temporary","connection"].some(x=>t.includes(x));
  }
  function toSupabaseError(result,operation) {
    const e=new Error(`Supabase ${operation} failed: ${result?.error?.message || "Unknown error"}`); e.cause=result?.error; return e;
  }
  async function runSupabase(operation,fn,{attempts=2}={}) {
    let last;
    for (let attempt=1; attempt<=attempts; attempt++) {
      try { const result=await fn(); if (result?.error) throw toSupabaseError(result,operation); return result; }
      catch(err) {
        last=err;
        if (!isTransientSupabaseError(err) || attempt===attempts) throw err;
        await sleep(attempt===1?200:650);
      }
    }
    throw last;
  }
  async function sb() {
    if (client) return client;
    const {createClient}=await import("@supabase/supabase-js");
    const {default:WS}=await import("ws");
    client=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:WS},global:{headers:{"X-Client-Info":"raz-coaching-platform"}}});
    return client;
  }
  function mirrorClient(token,intake,program,createdAt,updatedAt) {
    const prev=clientFallback.get(token);
    const row={token,intake:intake??prev?.intake??null,program:program??prev?.program??"",created_at:prev?.created_at??createdAt??updatedAt??Date.now(),updated_at:updatedAt??Date.now()};
    clientFallback.set(token,row); return row;
  }
  function mirrorJob(row) {
    const merged={...(jobFallback.get(row.id)||{}),...row}; jobFallback.set(row.id,merged); return merged;
  }
  function persistEventually(label,task) {
    Promise.resolve().then(task).catch(err=>console.warn(`${label} background persist failed:`,errorText(err)));
  }

  return {
    backend:"supabase",
    async getUsage(token) {
      const local=getFallbackUsage(token), day=todayUTC();
      try {
        const s=await sb();
        const result=await runSupabase("getUsage/select",()=>s.from("usage").select("*").eq("token",token).eq("day",day).maybeSingle(),{attempts:1});
        if (!result.data) return {...local};
        const row={...result.data,builds:Number(result.data.builds||0),adjusts:Number(result.data.adjusts||0)};
        usageFallback.set(usageFallbackKey(token,day),row); return row;
      } catch(err) { console.warn("usage tracking unavailable; using local fallback:",errorText(err)); return {...local}; }
    },
    async bumpUsage(token,kind) {
      const day=todayUTC(), local=getFallbackUsage(token);
      if (kind==="build") local.builds++; if (kind==="adjust") local.adjusts++;
      persistEventually("usage",async()=>{
        const s=await sb();
        await runSupabase("bumpUsage/upsert",()=>s.from("usage").upsert({token,day,builds:local.builds,adjusts:local.adjusts},{onConflict:"token,day"}),{attempts:1});
      });
    },
    async upsertClient(token,intakeJSON,program,now) {
      const row=mirrorClient(token,intakeJSON,program,now,now);
      try {
        const s=await sb();
        await runSupabase("upsertClient/upsert",()=>s.from("clients").upsert({token,intake:intakeJSON,program,created_at:row.created_at,updated_at:now},{onConflict:"token"}));
      } catch(err) {
        if (!isTransientSupabaseError(err)) throw err;
        console.warn("client upsert not persisted; local mirror retained:",errorText(err));
      }
    },
    async updateClientProgram(token,program,now) {
      const prev=clientFallback.get(token); mirrorClient(token,prev?.intake,program,prev?.created_at||now,now);
      try { const s=await sb(); await runSupabase("updateClientProgram/update",()=>s.from("clients").update({program,updated_at:now}).eq("token",token)); }
      catch(err) { if (!isTransientSupabaseError(err)) throw err; console.warn("client program not persisted; local mirror retained:",errorText(err)); }
    },
    async getClient(token) {
      if (clientFallback.has(token)) return clientFallback.get(token);
      try {
        const s=await sb(); const result=await runSupabase("getClient/select",()=>s.from("clients").select("*").eq("token",token).maybeSingle());
        if (result.data) clientFallback.set(token,result.data); return result.data||null;
      } catch(err) { if (!isTransientSupabaseError(err)) throw err; return clientFallback.get(token)||null; }
    },
    async addHistory(token,kind,request,program,now) {
      const row={token,kind,request,program,created_at:now}; historyFallback.push(row); if (historyFallback.length>200) historyFallback.shift();
      persistEventually("history",async()=>{ const s=await sb(); await runSupabase("addHistory/insert",()=>s.from("history").insert(row),{attempts:1}); });
    },
    async createJob(id,token,kind,now) {
      const row={id,token,kind,status:"pending",stage:"queued",attempt:0,detail:null,program:null,error:null,created_at:now,updated_at:now}; mirrorJob(row);
      persistEventually("job create",async()=>{ const s=await sb(); await runSupabase("createJob/upsert",()=>s.from("jobs").upsert(row,{onConflict:"id"}),{attempts:1}); });
    },
    async updateJobProgress(id,stage,attempt=0,detail=null,now=Date.now()) {
      mirrorJob({id,stage,attempt,detail,updated_at:now});
      persistEventually("job progress",async()=>{ const s=await sb(); await runSupabase("updateJobProgress/update",()=>s.from("jobs").update({stage,attempt,detail,updated_at:now}).eq("id",id),{attempts:1}); });
    },
    async finishJob(id,status,program,error,now) {
      mirrorJob({id,status,program:program||null,error:error||null,updated_at:now});
      persistEventually("job finish",async()=>{ const s=await sb(); await runSupabase("finishJob/update",()=>s.from("jobs").update({status,program:program||null,error:error||null,updated_at:now}).eq("id",id),{attempts:2}); });
    },
    async getJob(id) {
      if (jobFallback.has(id)) return jobFallback.get(id);
      try {
        const s=await sb(); const result=await runSupabase("getJob/select",()=>s.from("jobs").select("*").eq("id",id).maybeSingle(),{attempts:1});
        if (result.data) jobFallback.set(id,result.data); return result.data||null;
      } catch(err) { if (!isTransientSupabaseError(err)) throw err; return jobFallback.get(id)||null; }
    },
    async listRecentClients(limit=50) {
      const s=await sb(); const n=Math.max(1,Math.min(200,Number(limit)||50));
      const result=await runSupabase("listRecentClients/select",()=>s.from("clients").select("token,intake,program,created_at,updated_at").order("updated_at",{ascending:false}).limit(n));
      return result.data||[];
    },
    async healthCheck() {
      try { const s=await sb(); await runSupabase("healthCheck",()=>s.from("clients").select("token",{head:true,count:"exact"}).limit(1),{attempts:1}); return {ok:true,backend:"supabase",persistence:"connected",job_polling:"local-first"}; }
      catch(err) { if (!isTransientSupabaseError(err)) throw err; return {ok:true,backend:"supabase",persistence:"degraded",job_polling:"local-first",detail:"temporary Supabase transport issue"}; }
    }
  };
}

async function makeSqliteStorage() {
  const {default:Database}=await import("better-sqlite3");
  const DB_PATH=path.join(__dirname,"data","data.db"); fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
  const db=new Database(DB_PATH); db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (token TEXT PRIMARY KEY, intake TEXT, program TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT, kind TEXT, request TEXT, program TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS usage (token TEXT, day TEXT, builds INTEGER DEFAULT 0, adjusts INTEGER DEFAULT 0, PRIMARY KEY (token, day));
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, token TEXT, kind TEXT, status TEXT, stage TEXT, attempt INTEGER DEFAULT 0, detail TEXT, program TEXT, error TEXT, created_at INTEGER, updated_at INTEGER);
  `);
  return {
    backend:"sqlite",
    async getUsage(token){const day=todayUTC();let row=db.prepare("SELECT * FROM usage WHERE token=? AND day=?").get(token,day);if(!row){db.prepare("INSERT INTO usage (token,day,builds,adjusts) VALUES (?,?,0,0)").run(token,day);row={token,day,builds:0,adjusts:0};}return row;},
    async bumpUsage(token,kind){const day=todayUTC(),col=kind==="build"?"builds":"adjusts";db.prepare(`UPDATE usage SET ${col}=${col}+1 WHERE token=? AND day=?`).run(token,day);},
    async upsertClient(token,intakeJSON,program,now){db.prepare(`INSERT INTO clients (token,intake,program,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET intake=excluded.intake,program=excluded.program,updated_at=excluded.updated_at`).run(token,intakeJSON,program,now,now);},
    async updateClientProgram(token,program,now){db.prepare("UPDATE clients SET program=?,updated_at=? WHERE token=?").run(program,now,token);},
    async getClient(token){return db.prepare("SELECT * FROM clients WHERE token=?").get(token)||null;},
    async addHistory(token,kind,request,program,now){db.prepare("INSERT INTO history (token,kind,request,program,created_at) VALUES (?,?,?,?,?)").run(token,kind,request,program,now);},
    async createJob(id,token,kind,now){db.prepare("INSERT INTO jobs (id,token,kind,status,stage,attempt,detail,program,error,created_at,updated_at) VALUES (?,?,?,?,?,0,NULL,NULL,NULL,?,?)").run(id,token,kind,"pending","queued",now,now);},
    async updateJobProgress(id,stage,attempt=0,detail=null,now=Date.now()){db.prepare("UPDATE jobs SET stage=?,attempt=?,detail=?,updated_at=? WHERE id=?").run(stage,attempt,detail,now,id);},
    async finishJob(id,status,program,error,now){db.prepare("UPDATE jobs SET status=?,program=?,error=?,updated_at=? WHERE id=?").run(status,program||null,error||null,now,id);},
    async getJob(id){return db.prepare("SELECT * FROM jobs WHERE id=?").get(id)||null;},
    async listRecentClients(limit=50){return db.prepare("SELECT token,intake,program,created_at,updated_at FROM clients ORDER BY updated_at DESC LIMIT ?").all(Math.max(1,Math.min(200,Number(limit)||50)));},
    async healthCheck(){db.prepare("SELECT 1").get();return {ok:true,backend:"sqlite",job_polling:"local"};}
  };
}

export async function makeStorage(){return USING_SUPABASE?makeSupabaseStorage():makeSqliteStorage();}
