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

test("deployed package starts through secure wrapper",()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
  assert.match(pkg.scripts.start,/server_secure\.js/);
  assert.match(pkg.scripts.start,/phase15:build/);
});

test("secure wrapper exposes required launch routes and protections",()=>{
  const src=fs.readFileSync(path.join(root,"server_secure.js"),"utf8");
  for(const needle of ["/api/admin/program-pass","/api/admin/analytics-summary","/api/client-data","/api/program-pass-config","/api/program-pass-status","X-Content-Type-Options","Content-Security-Policy","PROGRAM_PASS_ENFORCEMENT","ADMIN_PROVISION_KEY"]) assert.ok(src.includes(needle),needle);
  assert.ok(!src.includes("console.log(req.body)"));
});

test("intake preflight blocks malformed expensive requests",()=>{
  assert.match(validateLaunchIntake(null),/Missing intake/);
  assert.match(validateLaunchIntake({}),/primary goal/i);
  assert.equal(validateLaunchIntake(validIntake()),null);
});

test("analytics allowlist rejects customer content fields",()=>{
  assert.equal(isAllowedAnalyticsEvent("build_started"),true);
  for(const unsafe of ["intake","injury","program","token","ip","email"]) assert.equal(isAllowedAnalyticsEvent(unsafe),false);
});

test("privacy notice documents consent deletion retention and separate entitlement",()=>{
  const p=fs.readFileSync(path.join(root,"public","privacy.html"),"utf8").toLowerCase();
  for(const term of ["consent","delete my data","56-day","6 substantive","program pass entitlement records","aggregate","ip addresses"]) assert.ok(p.includes(term),term);
});

test("launch UI injects consent, pass code and deletion without storing admin secrets",()=>{
  const js=fs.readFileSync(path.join(root,"public","launch-controls.js"),"utf8");
  assert.ok(js.includes("launch-privacy-consent"));
  assert.ok(js.includes("launch-pass-code"));
  assert.ok(js.includes("/api/client-data"));
  assert.ok(!js.includes("ADMIN_PROVISION_KEY"));
  assert.ok(!js.includes("SUPABASE_SERVICE_ROLE_KEY"));
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
