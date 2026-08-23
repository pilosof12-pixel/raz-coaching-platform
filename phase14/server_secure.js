// Security, privacy, Program Pass and launch analytics wrapper for the deployed phase14/Phase15 runtime.
// The Phase15 coaching server remains unchanged; this file patches Express before it is imported.

import express from "express";
import crypto from "node:crypto";
import { makeEntitlementStore } from "./entitlements.js";
import { makeAnalyticsStore, isAllowedAnalyticsEvent } from "./analytics.js";
import { makePrivacyStore } from "./privacy_store.js";
import { validateLaunchIntake } from "./intake_validation.js";
import { detectIntakeClarifications, addOptionalQuestions, requiredClarifications } from "./intake_clarification.js";

const TOKEN_RE=/^[a-f0-9]{32}$/i, JOB_RE=/^[a-f0-9]{32}$/i, PASS_RE=/^[a-f0-9]{32}$/i;
const NODE_ENV=process.env.NODE_ENV||"development";
const PROGRAM_PASS_ENFORCEMENT=process.env.PROGRAM_PASS_ENFORCEMENT==="1";
const PROGRAM_PASS_DAYS=Number(process.env.PROGRAM_PASS_DAYS||56);
const PROGRAM_PASS_ADJUSTMENTS=Number(process.env.PROGRAM_PASS_ADJUSTMENTS||6);
const PROGRAM_PASS_DATA_GRACE_DAYS=Number(process.env.PROGRAM_PASS_DATA_GRACE_DAYS||7);
const GENERATION_BUILDS_PER_HOUR=Number(process.env.GENERATION_BUILDS_PER_HOUR||4);
const GENERATION_ADJUSTS_PER_HOUR=Number(process.env.GENERATION_ADJUSTS_PER_HOUR||12);
const MAX_INTAKE_CHARS=Number(process.env.MAX_INTAKE_CHARS||30000);
const MAX_FIELD_CHARS=Number(process.env.MAX_FIELD_CHARS||5000);
const ADMIN_PROVISION_KEY=process.env.ADMIN_PROVISION_KEY||"";
const COACHING_QUALITY_GATE_VERSION="advanced-hybrid-v2";

const passStore=await makeEntitlementStore();
const analyticsStore=await makeAnalyticsStore();
const privacyStore=await makePrivacyStore();
const counters=new Map();
const commercialJobs=new Map();

function clientIp(req){const f=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim();return f||req.socket?.remoteAddress||"unknown";}
function consumeHourly(req,group,max){const key=`${group}:${clientIp(req)}`,now=Date.now(),hour=3600000;let row=counters.get(key);if(!row||now-row.startedAt>=hour){row={startedAt:now,count:0};counters.set(key,row);}row.count++;return row.count<=max;}
function tooLarge(v){if(typeof v==="string")return v.length>MAX_FIELD_CHARS;if(Array.isArray(v))return v.some(tooLarge);if(v&&typeof v==="object")return Object.values(v).some(tooLarge);return false;}
function validConsent(intake){const c=intake?.privacy_consent;return Boolean(c&&c.health_data===true&&typeof c.policy_version==="string"&&c.policy_version&&typeof c.consented_at==="string"&&!Number.isNaN(Date.parse(c.consented_at)));}
function passExpired(pass){return !pass||!pass.expires_at||Date.now()>=Number(pass.expires_at);}
async function activePass(token){const pass=await passStore.getPassForToken(token);if(!pass)return{error:"No active Program Pass is linked to this personal code.",status:403};if(pass.status!=="active"||passExpired(pass))return{error:"This Program Pass has expired. Purchase a new Program Pass to continue.",status:403};return{pass};}

function captureCommercialJob(req,res,kind,token){
  const original=res.json.bind(res);
  res.json=(body)=>{if(res.statusCode<400&&body?.job_id){commercialJobs.set(String(body.job_id),{kind,token:String(body.token||token||req.body?.token||"")});}return original(body);};
}
function finalizeCommercialJob(req,res,jobId){
  const meta=commercialJobs.get(jobId); if(!meta) return;
  const original=res.json.bind(res);
  res.json=(body)=>{
    if(body?.status!=="done") return original(body);
    if(!meta.finalizePromise){
      meta.finalizePromise=(meta.kind==="build"?passStore.markInitialBuildCompleted(meta.token,Date.now()):passStore.incrementAdjustment(meta.token));
    }
    meta.finalizePromise.then(()=>{commercialJobs.delete(jobId);original(body);}).catch((e)=>{console.error("commercial usage finalize failed:",e&&e.message);original.call(res,{error:"The program was generated but paid-access state could not be finalized. Please retry shortly."});});
    return res;
  };
}

async function guardProgramPass(req,res,next){
  try{
    if(!PROGRAM_PASS_ENFORCEMENT)return next();
    if(req.method==="POST"&&req.path==="/api/build"){
      let token=String(req.body?.token||"").trim();const passCode=String(req.body?.pass_code||"").trim();
      if(token){const active=await activePass(token);if(active.error)return res.status(active.status).json({error:active.error});if(active.pass.initial_build_completed_at)return res.status(403).json({error:"This Program Pass has already created its training block. Use Adjust for changes, or purchase a new Program Pass for a completely new block."});captureCommercialJob(req,res,"build",token);return next();}
      if(!PASS_RE.test(passCode))return res.status(403).json({error:"Enter the Program Pass code from your purchase before building your program."});
      const pass=await passStore.getPass(passCode);if(!pass)return res.status(403).json({error:"That Program Pass code is not valid."});
      if(pass.activated_token){if(pass.status==="active"&&!passExpired(pass)&&!pass.initial_build_completed_at){req.body.token=pass.activated_token;captureCommercialJob(req,res,"build",pass.activated_token);return next();}return res.status(403).json({error:"That Program Pass has already been activated. Use the personal code created with it to return to your program."});}
      if(pass.status!=="issued")return res.status(403).json({error:"That Program Pass is not available for activation."});
      token=crypto.randomBytes(16).toString("hex");await passStore.activatePass(passCode,token,Date.now(),PROGRAM_PASS_DAYS);req.body.token=token;captureCommercialJob(req,res,"build",token);return next();
    }
    const pm=req.path.match(/^\/api\/program\/([^/]+)$/);if(req.method==="GET"&&pm){const a=await activePass(pm[1]);if(a.error)return res.status(a.status).json({error:a.error});return next();}
    if(req.method==="POST"&&(req.path==="/api/adjust"||req.path==="/api/set-language")){
      const token=String(req.body?.token||"").trim();const a=await activePass(token);if(a.error)return res.status(a.status).json({error:a.error});
      if(req.path==="/api/adjust"){const used=Number(a.pass.adjustment_count||0),limit=Number(a.pass.adjustment_limit||PROGRAM_PASS_ADJUSTMENTS);if(used>=limit)return res.status(403).json({error:`You've used all ${limit} included Program Pass adjustments. Purchase a new Program Pass for a new training block.`});captureCommercialJob(req,res,"adjust",token);}
      return next();
    }
    next();
  }catch(e){console.error("program pass guard failed:",e&&e.message);res.status(500).json({error:"Could not verify Program Pass access. Please try again."});}
}

function securityMiddleware(req,res,next){
  res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","no-referrer");res.setHeader("X-Frame-Options","DENY");res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(req.path.startsWith("/api/")){res.setHeader("Cache-Control","no-store, max-age=0");res.setHeader("Pragma","no-cache");}
  if(NODE_ENV==="production"&&req.path==="/api/health"){const json=res.json.bind(res);res.json=()=>json({ok:true});}
  const bodyToken=typeof req.body?.token==="string"?req.body.token.trim():"";if(bodyToken&&!TOKEN_RE.test(bodyToken))return res.status(400).json({error:"Invalid personal code."});
  const pm=req.path.match(/^\/api\/program\/([^/]+)$/);if(pm&&!TOKEN_RE.test(pm[1]))return res.status(400).json({error:"Invalid personal code."});
  const jm=req.path.match(/^\/api\/job\/([^/]+)$/);if(jm&&!JOB_RE.test(jm[1]))return res.status(400).json({error:"Invalid job id."});if(jm&&PROGRAM_PASS_ENFORCEMENT)finalizeCommercialJob(req,res,jm[1]);
  if(req.method==="POST"&&req.path==="/api/build"){
    const intake=req.body?.intake,validation=validateLaunchIntake(intake);if(validation)return res.status(400).json({error:validation});if(!validConsent(intake))return res.status(400).json({error:"Privacy consent is required before program generation."});
    let serialized="";try{serialized=JSON.stringify(intake);}catch{}if(!serialized||serialized.length>MAX_INTAKE_CHARS||tooLarge(intake))return res.status(413).json({error:"The intake contains too much text. Please shorten the entries and try again."});
    // ZERO-COST PING-PONG GATE: deterministic/local only. It MUST stay before
    // consumeHourly() and guardProgramPass(), so clarification neither consumes a
    // generation slot nor activates/uses Program Pass access and no AI call starts.
    const clarifications=addOptionalQuestions(detectIntakeClarifications(intake),intake);
    if(requiredClarifications(clarifications).length)return res.status(422).json({error:"A few details are needed before I can build this accurately.",clarification_required:true,clarifications});
    if(!consumeHourly(req,"build",GENERATION_BUILDS_PER_HOUR))return res.status(429).json({error:"Too many program generation requests from this connection. Please try again later."});
  }
  if(req.method==="POST"&&(req.path==="/api/adjust"||req.path==="/api/set-language")){
    if(!consumeHourly(req,"adjust",GENERATION_ADJUSTS_PER_HOUR))return res.status(429).json({error:"Too many adjustment requests from this connection. Please try again later."});
    if(typeof req.body?.request==="string"&&req.body.request.length>MAX_FIELD_CHARS)return res.status(413).json({error:"The adjustment request is too long."});
  }
  return guardProgramPass(req,res,next);
}

const originalUse=express.application.use;let injected=false;
express.application.use=function(...args){const result=originalUse.apply(this,args);if(!injected){injected=true;originalUse.call(this,securityMiddleware);}return result;};

async function cleanup(){await privacyStore.purgeExpiredOperationalData();if(!PROGRAM_PASS_ENFORCEMENT)return;const expired=await passStore.expiredTokens(Date.now()-Math.max(0,PROGRAM_PASS_DATA_GRACE_DAYS)*86400000);for(const token of expired){try{await privacyStore.deleteClientData(token);}catch(e){console.warn("expired coaching-data deletion failed:",e&&e.message);}}}

const originalListen=express.application.listen;
express.application.listen=function(...args){
  if(!this.__launchRoutesInstalled){this.__launchRoutesInstalled=true;
    this.get("/api/program-pass-config",(_req,res)=>res.json({enforced:PROGRAM_PASS_ENFORCEMENT,access_days:PROGRAM_PASS_DAYS,adjustments:PROGRAM_PASS_ADJUSTMENTS,quality_gate_version:COACHING_QUALITY_GATE_VERSION}));
    this.post("/api/program-pass-status",async(req,res)=>{try{const token=String(req.body?.token||"").trim();if(!TOKEN_RE.test(token))return res.status(400).json({error:"Invalid personal code."});const pass=await passStore.getPassForToken(token);if(!pass)return res.status(404).json({error:"No Program Pass is linked to this code."});const used=Number(pass.adjustment_count||0),limit=Number(pass.adjustment_limit||PROGRAM_PASS_ADJUSTMENTS);res.json({status:pass.status,expires_at:pass.expires_at,initial_build_completed:Boolean(pass.initial_build_completed_at),adjustments_used:used,adjustments_remaining:Math.max(0,limit-used),adjustment_limit:limit});}catch(e){console.error("program pass status failed:",e&&e.message);res.status(500).json({error:"Could not load Program Pass status."});}});
    this.post("/api/analytics-event",async(req,res)=>{try{const event=String(req.body?.event||"").trim();if(!isAllowedAnalyticsEvent(event))return res.status(400).json({error:"Invalid analytics event."});await analyticsStore.record(event);res.status(204).end();}catch(e){console.warn("analytics event failed:",e&&e.message);res.status(204).end();}});
    this.get("/api/admin/analytics-summary",async(req,res)=>{try{if(!ADMIN_PROVISION_KEY||req.get("x-admin-provision-key")!==ADMIN_PROVISION_KEY)return res.status(404).json({error:"Not found."});const days=Math.max(1,Math.min(365,Number(req.query?.days||30)));res.json({days,rows:await analyticsStore.summary(days)});}catch(e){res.status(500).json({error:"Could not load analytics summary."});}});
    this.post("/api/admin/program-pass",async(req,res)=>{try{if(!ADMIN_PROVISION_KEY||req.get("x-admin-provision-key")!==ADMIN_PROVISION_KEY)return res.status(404).json({error:"Not found."});const count=Math.max(1,Math.min(20,Number(req.body?.count||1))),codes=[];for(let i=0;i<count;i++){const code=crypto.randomBytes(16).toString("hex");await passStore.issuePass(code,Date.now(),PROGRAM_PASS_ADJUSTMENTS);codes.push(code);}res.json({ok:true,codes,access_days:PROGRAM_PASS_DAYS,adjustments:PROGRAM_PASS_ADJUSTMENTS});}catch(e){console.error("program pass provisioning failed:",e&&e.message);res.status(500).json({error:"Could not issue Program Pass."});}});
    this.delete("/api/client-data",async(req,res)=>{try{const token=String(req.body?.token||"").trim();if(!TOKEN_RE.test(token))return res.status(400).json({error:"Invalid personal code."});await privacyStore.deleteClientData(token);res.json({ok:true});}catch(e){console.error("client data deletion failed:",e&&e.message);res.status(500).json({error:"Could not delete the saved data."});}});
  }
  cleanup().catch(e=>console.warn("retention cleanup failed:",e&&e.message));const timer=setInterval(()=>cleanup().catch(e=>console.warn("retention cleanup failed:",e&&e.message)),12*3600000);timer.unref?.();
  return originalListen.apply(this,args);
};

await import("./server.phase15.js");
