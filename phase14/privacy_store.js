import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const USING_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

function cutoffs(now=Date.now()) {
  return { jobs: now - 7*86400000, history: now - 180*86400000, usageDay: new Date(now - 90*86400000).toISOString().slice(0,10) };
}

function makeSupabasePrivacyStore() {
  let client;
  async function sb(){
    if(client) return client;
    const {createClient}=await import("@supabase/supabase-js");
    const {default:WS}=await import("ws");
    client=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:WS}});
    return client;
  }
  return {
    backend:"supabase",
    async deleteClientData(token){
      const s=await sb();
      for(const table of ["jobs","history","usage","clients"]){ const {error}=await s.from(table).delete().eq("token",token); if(error) throw error; }
      return true;
    },
    async purgeExpiredOperationalData(now=Date.now()){
      const s=await sb(), c=cutoffs(now);
      let r=await s.from("jobs").delete().lt("created_at",c.jobs); if(r.error) throw r.error;
      r=await s.from("history").delete().lt("created_at",c.history); if(r.error) throw r.error;
      r=await s.from("usage").delete().lt("day",c.usageDay); if(r.error) throw r.error;
      return true;
    }
  };
}

async function makeSqlitePrivacyStore(){
  const {default:Database}=await import("better-sqlite3");
  const DB_PATH=path.join(__dirname,"data","data.db"); fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
  const db=new Database(DB_PATH); db.pragma("journal_mode = WAL");
  return {
    backend:"sqlite",
    async deleteClientData(token){ const tx=db.transaction(()=>{for(const t of ["jobs","history","usage","clients"]) db.prepare(`DELETE FROM ${t} WHERE token=?`).run(token);}); tx(); return true; },
    async purgeExpiredOperationalData(now=Date.now()){ const c=cutoffs(now); const tx=db.transaction(()=>{db.prepare("DELETE FROM jobs WHERE created_at < ?").run(c.jobs);db.prepare("DELETE FROM history WHERE created_at < ?").run(c.history);db.prepare("DELETE FROM usage WHERE day < ?").run(c.usageDay);}); tx(); return true; }
  };
}

export async function makePrivacyStore(){ return USING_SUPABASE ? makeSupabasePrivacyStore() : makeSqlitePrivacyStore(); }
