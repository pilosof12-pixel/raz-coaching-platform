import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { validateLaunchIntake } from "../intake_validation.js";
import { isAllowedAnalyticsEvent } from "../analytics.js";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");

function validIntake(){return{primary_goals:["200 kg squat"],experience:"advanced",days_per_week:4,equipment:"barbell rack plates",training_location:"commercial_gym",language:"en",sport_schedule:[]};}

test("deployed package starts through pass preflight then secure wrapper",()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
  assert.match(pkg.scripts.start,/pass_preflight\.js/);
  assert.match(pkg.scripts.start,/phase15:build/);
  const preflight=fs.readFileSync(path.join(root,"pass_preflight.js"),"utf8");
  assert.ok(preflight.includes('await import("./server_secure.js")'));
  assert.ok(preflight.includes("/api/program-pass-check"));
});

test("secure wrapper exposes required launch routes and protections",()=>{
  const src=fs.readFileSync(path.join(root,"server_secure.js"),"utf8");
  for(const needle of ["/api/admin/program-pass","/api/admin/analytics-summary","/api/client-data","/api/program-pass-config","/api/program-pass-status","X-Content-Type-Options","Content-Security-Policy","PROGRAM_PASS_ENFORCEMENT","ADMIN_PROVISION_KEY"]) assert.ok(src.includes(needle),needle);
  assert.ok(!src.includes("console.log(req.body)"));
});

test("Program Pass usage finalizes only after a job reaches done",()=>{
  const src=fs.readFileSync(path.join(root,"server_secure.js"),"utf8");
  const start=src.indexOf("function finalizeCommercialJob");
  const end=src.indexOf("async function guardProgramPass");
  assert.ok(start>=0&&end>start);
  const block=src.slice(start,end);
  assert.match(block,/if\(body\?\.status!=="done"\) return original\(body\)/);
  assert.match(block,/meta\.kind==="build"\?passStore\.markInitialBuildCompleted\(meta\.token,Date\.now\(\)\):passStore\.incrementAdjustment\(meta\.token\)/);
  assert.doesNotMatch(block,/status==="error"[^\n]*markInitialBuildCompleted/);
  assert.doesNotMatch(block,/status==="error"[^\n]*incrementAdjustment/);
});

test("successful persistence precedes done status for build and adjustment jobs",()=>{
  const src=fs.readFileSync(path.join(root,"server.js"),"utf8");
  const buildStart=src.indexOf("async function runBuildJob");
  const adjustStart=src.indexOf("async function runAdjustJob");
  const routeStart=src.indexOf("app.post(\"/api/build\"");
  assert.ok(buildStart>=0&&adjustStart>buildStart&&routeStart>adjustStart);
  const build=src.slice(buildStart,adjustStart);
  const adjust=src.slice(adjustStart,routeStart);
  const buildDone=build.indexOf('await store.finishJob(jobId, "done",');
  const adjustDone=adjust.indexOf('await store.finishJob(jobId, "done",');
  assert.ok(buildDone>0);
  assert.ok(adjustDone>0);
  assert.ok(build.indexOf("await store.upsertClient") < buildDone);
  assert.ok(build.indexOf("await store.addHistory") < buildDone);
  assert.ok(build.indexOf("await store.bumpUsage") < buildDone);
  assert.ok(adjust.indexOf("await store.updateClientProgram") < adjustDone);
  assert.ok(adjust.indexOf("await store.addHistory") < adjustDone);
  assert.ok(adjust.indexOf("await store.bumpUsage") < adjustDone);
  assert.match(build,/catch \(e\)[\s\S]*finishJob\(jobId, "error"/);
  assert.match(adjust,/catch \(e\)[\s\S]*finishJob\(jobId, "error"/);
});

test("client delivery fails closed on review and support placeholders",()=>{
  const src=fs.readFileSync(path.join(root,"server.js"),"utf8");
  assert.match(src,/\[REVIEW\]|contact\s+support|could not be safely generated/i);
  assert.match(src,/UNRESOLVED_CLIENT_REVIEW/);
  assert.match(src,/Final client QA blocked unresolved review\/support text/);
});

test("intake preflight blocks malformed expensive requests",()=>{
  assert.match(validateLaunchIntake(null),/Missing intake/);
  assert.match(validateLaunchIntake({}),/primary goal/i);
  assert.equal(validateLaunchIntake(validIntake()),null);
});

test("Tactical live-QA fixture uses a launch-valid training location",()=>{
  const tactical=fs.readFileSync(path.join(root,"public","live-qa-tactical.js"),"utf8");
  assert.ok(tactical.includes("training_location: 'commercial_gym'"));
  assert.ok(!tactical.includes("training_location: 'full_gym'"));
});

test("analytics allowlist rejects customer content fields",()=>{
  assert.equal(isAllowedAnalyticsEvent("build_started"),true);
  for(const unsafe of ["intake","injury","program","token","ip","email"]) assert.equal(isAllowedAnalyticsEvent(unsafe),false);
});

test("privacy notice documents consent deletion retention and separate entitlement",()=>{
  const p=fs.readFileSync(path.join(root,"public","privacy.html"),"utf8").toLowerCase();
  for(const term of ["consent","delete my data","56-day","6 substantive","program pass entitlement records","aggregate","ip addresses"]) assert.ok(p.includes(term),term);
});

test("launch UI gates intake early, injects consent and deletion, and stores no admin secrets",()=>{
  const launch=fs.readFileSync(path.join(root,"public","launch-controls.js"),"utf8");
  const gate=fs.readFileSync(path.join(root,"public","program-pass-gate.js"),"utf8");
  const runtime=fs.readFileSync(path.join(root,"scripts","apply_launch_runtime.mjs"),"utf8");
  assert.ok(launch.includes("launch-privacy-consent"));
  assert.ok(launch.includes("launch-pass-code"));
  assert.ok(launch.includes("/api/client-data"));
  assert.ok(gate.includes("/api/program-pass-check"));
  assert.ok(gate.includes('intake.classList.add("hidden")'));
  assert.ok(gate.includes('passField.type = "hidden"'));
  assert.ok(runtime.includes("program-pass-gate.js"));
  for(const src of [launch,gate]) {
    assert.ok(!src.includes("ADMIN_PROVISION_KEY"));
    assert.ok(!src.includes("SUPABASE_SERVICE_ROLE_KEY"));
  }
});

test("sqlite entitlement record survives coaching-data deletion design",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"raz-pass-"));
  process.env.SUPABASE_URL="";process.env.SUPABASE_SERVICE_ROLE_KEY="";process.env.SUPABASE_ANON_KEY="";process.env.ENTITLEMENTS_SQLITE_DB_PATH=path.join(dir,"entitlements.db");
  const { makeEntitlementStore }=await import(`../entitlements.js?test=${Date.now()}`);
  const store=await makeEntitlementStore();
  const code="a".repeat(32),token="b".repeat(32),now=Date.now();
  await store.issuePass(code,now,6);await store.activatePass(code,token,now,56);await store.markInitialBuildCompleted(token,now+1);await store.incrementAdjustment(token);
  const pass=await store.getPassForToken(token);
  assert.equal(pass.adjustment_count,1);assert.ok(pass.initial_build_completed_at);assert.equal(pass.status,"active");
});
