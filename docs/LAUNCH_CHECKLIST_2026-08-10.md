# RAZ AI Coaching Platform — Launch Checklist

Status date: 2026-08-11

## Completed / code-verified

- [x] WordPress landing page commercial copy updated from lifetime access to the Program Pass offer.
- [x] Newie product updated to A$30 one-time Program Pass positioning.
- [x] Privacy consent UI and customer-facing privacy policy added.
- [x] Personal code clearly treated as a password/capability credential.
- [x] Permanent client-data deletion control added.
- [x] API hardening wrapper added: security headers, no-store responses, token validation, input guards and IP generation limits.
- [x] OpenAI token-usage telemetry added without logging prompts or client content.
- [x] Program Pass entitlement layer implemented behind `PROGRAM_PASS_ENFORCEMENT=1`.
- [x] One Program Pass creates one initial 4-week block and expires 56 days after activation by default.
- [x] Six substantive adjustments are included by default; language changes do not consume the allowance.
- [x] Failed/unfinished first builds can retry on the same activated pass.
- [x] Activation recovery handles the case where a pass was bound but the browser never received the first build response.
- [x] Successful-block state and adjustment count are stored in the commercial entitlement record rather than inferred from coaching history.
- [x] Deleting coaching data cannot reset the one-block limit or six-adjustment allowance.
- [x] Paid usage is consumed only after a successful generated result is persisted. Failed AI/API attempts do not consume paid usage.
- [x] App only shows the Program Pass entry field when enforcement is enabled.
- [x] Loaded programs show Program Pass expiry and remaining substantive adjustments when enforcement is enabled.
- [x] Temporary admin provisioning endpoint added for early Newie sales.
- [x] Supabase migration supports Program Pass status, activation, expiry, adjustment counters and successful initial-block marker.
- [x] Expired Program Passes are discoverable for automatic coaching-data cleanup.
- [x] Sensitive coaching data is scheduled for automatic deletion after pass expiry plus a configurable grace period; commercial entitlement records remain separate.
- [x] First-party aggregate funnel analytics implemented with only UTC day + allowlisted event + count. No tokens, IPs, intake text, injury details or program content are stored.
- [x] Admin-only aggregate analytics summary endpoint added.
- [x] Mobile-only launch stylesheet added: iOS-safe input sizing, full-width mobile buttons, compact cards and touch-friendly tables.
- [x] Server-side deterministic intake preflight rejects incomplete/malformed payloads before Program Pass activation and before any AI call.
- [x] Privacy policy aligned with the fixed-term Program Pass, post-expiry cleanup and aggregate analytics model.
- [x] Program Pass, analytics and adversarial intake regression tests added.
- [x] Root launch reference layer syntax-checked in GitHub Actions.
- [x] Launch/security/privacy layer ported into the actual Render deployment root at `phase14/`; Render remains correctly rooted at `phase14`.
- [x] `phase14/package.json` builds the Phase 15 runtime, injects launch UI assets, and starts through `phase14/server_secure.js`.
- [x] Deployed `phase14` security/privacy regression tests cover secure startup, admin/pass routes, intake preflight, analytics allowlist, privacy policy, browser secret exclusion and entitlement persistence.
- [x] Phase 15 source-grounding regression fixture corrected without changing production coaching logic.
- [x] Production Supabase `supabase_program_passes.sql`, privacy/RLS hardening and analytics migrations applied successfully.
- [x] RLS verified `true` on `clients`, `history`, `usage`, `jobs`, `program_passes` and `analytics_daily`.
- [x] `anon` and `authenticated` verified to have no direct table privileges on the protected coaching/commercial tables.
- [x] Render environment values set for production mode, Program Pass duration/allowance/grace and generation rate limits.
- [x] Long random `ADMIN_PROVISION_KEY` set server-side in Render.
- [x] `PROGRAM_PASS_ENFORCEMENT=0` retained while Program Pass staging verification is incomplete.
- [x] Latest `privacy-security-hardening` wrapper confirmed live on Render via `/api/program-pass-config`.
- [x] Production health endpoint confirmed redacted under `NODE_ENV=production`.
- [x] Live privacy page confirmed loading with Program Pass, retention, deletion and analytics disclosures.
- [x] Live privacy-consent behavior confirmed: a build without consent is rejected before generation.
- [x] Live enforcement-OFF API journey completed against Render via a one-off GitHub Actions smoke test: build, job polling, personal-code return, substantive adjustment and Hebrew language switch all succeeded.
- [x] Live analytics verification passed: allowlisted aggregate event accepted; non-allowlisted content-bearing event rejected.
- [x] A live privacy defect was discovered where deleted coaching data remained available from the Phase 15 process-local mirror after Supabase deletion.
- [x] Privacy deletion defect fixed by invalidating process-local coaching mirrors after deletion.
- [x] Live deletion re-verification passed: program returned 200 before deletion, DELETE returned 200, and the same personal code returned 404 immediately afterwards.
- [x] One-off live-generation smoke steps removed from normal CI after verification so future commits do not create unnecessary paid AI generations.
- [x] Source-grounding hard contract remains active: authored RAZ coaching knowledge is authoritative and generic model memory must not invent programming principles, progressions, dose or exercise logic.
- [x] Avatar 3 / Warrior regression remains at elite-program quality (~9.1/10 live QA) after launch hardening and integrity-guardrail work.
- [x] Requested strength days are now preserved as meaningful resistance-training days, while allowing low-cost accessory/rehab strength sessions when concurrent sport load justifies them.
- [x] Named sport/endurance goals require direct modality-specific exposure; generic conditioning without a named modality remains engine-selected.
- [ ] Admin Program Pass provisioning route is live but current `ADMIN_PROVISION_KEY` requests return generic `Not found`; temporarily deferred so it does not block unrelated staging work.

## Live coaching-QA findings still open

The latest adversarial Render generations show that the core coaching engine still produces 9+ work on the established Warrior regression, but the annoying concurrent-strength + 5K avatar exposed a remaining knowledge-gap and validator issue:

- [x] `days_per_week=4` strength-day integrity issue resolved: the latest annoying-avatar program preserved four genuine resistance-training days while scaling their cost around MMA/BJJ recovery.
- [ ] The 5K goal now receives direct running exposure, but the authored coaching base is not yet deep enough to confidently prescribe event-specific endurance development such as 3K/5K pace improvement, marathon preparation, rowing performance, triathlon or Ironman preparation. Do not solve this by allowing GPT to invent endurance theory from generic model knowledge; build the dedicated Cardio / Endurance knowledge cluster below.
- [ ] The latest live programs still carry `QA_FORMULA_VIOLATION_COUNT: 1`; identify and fix the false-positive validator path so valid prescriptions are not marked as formula violations.
- [ ] Sprint/power intensity semantics need cleanup: prescriptions such as `90–95% sprint effort` must not be paired with a strength-style RPE value that appears contradictory. Use a source-supported speed/quality prescription and a non-applicable/clearly separated RPE representation for sprint work.

Specificity nuance confirmed during QA:

- [x] Exact-goal exercise specificity is not an absolute requirement when the intake identifies a pain mechanism or movement restriction and a close variation preserves the target quality while avoiding the aggravating feature. Example: a controlled box squat may appropriately preserve squat-strength specificity when deep/high-volume squatting aggravates the low back and box squatting is explicitly tolerated.
- [ ] Final QA should judge painful/restricted goal movements using the hierarchy: preserve the exact target movement when tolerated; otherwise use the closest source-supported variation that preserves the target quality and respects the stated pain mechanism/tolerated movements; do not penalize an appropriate substitution merely because the exercise name differs.

Positive findings from the live generations:

- [x] Primary strength goals receive direct exposure.
- [x] Hard lower-body work is placed around concurrent MMA/BJJ rather than ignoring sport interference.
- [x] Low-back irritation changes exercise selection and loading rather than being ignored.
- [x] Unbenchmarked exercise variations use autoregulated/conservative loading rather than inheriting aggressive fixed loads from a related benchmark.
- [x] No internal coaching labels from the launch leak-scan allowlist appeared in the client program.
- [x] Generated programs contain the required TSV machine structure and remain retrievable by personal code before deletion.

## Cardio / Endurance coaching-knowledge cluster — required expansion

Purpose: give the engine enough authored, source-grounded endurance knowledge to coach explicit performance outcomes rather than merely adding generic aerobic work. This is one coherent cluster, not an attempt to cover every endurance sport exhaustively.

- [ ] Build a Cardio / Endurance master article/cluster from supplied high-quality sources. GPT must route to this authored cluster and must not substitute generic model memory for missing endurance programming logic.
- [ ] Cover transferable endurance-programming principles: event demands, aerobic base, threshold/tempo concepts, interval purpose, long-session role, intensity distribution, progression, deload/taper logic, recovery cost and concurrent-training interference.
- [ ] Add running-specific routing for goals such as 3K, 5K, 10K, half marathon and marathon, including how current performance, target performance, training age, weekly frequency and concurrent sport constrain dose and progression.
- [ ] Add rowing-specific routing for distance/time/pace goals rather than treating rowing only as interchangeable Zone 2 equipment.
- [ ] Add cycling and swimming modality logic sufficient for single-sport endurance goals and for multisport integration.
- [ ] Add triathlon / Ironman routing that can coordinate swim-bike-run exposures, long-session placement, brick-session logic where source-supported, and overall recovery budget.
- [ ] Define when cross-training can supplement a named endurance goal and when it cannot replace direct modality exposure.
- [ ] Define event-specificity progression so a named goal receives more than token exposure, while still allowing the engine to deliberately hold that goal at maintenance/base level when higher-priority goals and recovery constraints make aggressive progression inappropriate.
- [ ] Define pace/intensity prescription language for each modality so the client receives coherent targets (pace/power/HR/RPE where source-supported) rather than conflicting intensity systems.
- [ ] Add deterministic QA tests for modality specificity, meaningful dose, recovery/concurrent-sport constraints and event-goal prioritisation without hard-coding coaching numbers that are not present in the authored sources.
- [ ] Stress-test at least: short-distance running pace avatar, marathon avatar, rowing performance avatar and triathlon/Ironman-style avatar, plus one concurrent strength/combat + endurance avatar.
- [ ] Require 9+/10 coaching-quality acceptance on the annoying concurrent avatar after the new cluster is integrated; passing validators alone is insufficient.

## Program Pass rollout — remaining environment / staging work

Do not enable commercial enforcement for customers until the remaining unchecked items are complete.

1. [x] Apply all three production Supabase migrations and verify RLS/browser-role restrictions.
2. [ ] Add the final privacy/support email address to the deployed `phase14/public/privacy.html` and reference copy.
3. [x] Set production/staging Render environment values and keep `PROGRAM_PASS_ENFORCEMENT=0` while baseline verification runs.
4. [x] Verify the live enforcement-OFF server journey: consent -> build -> personal-code return -> adjustment -> language switch -> delete.
5. [ ] Verify spreadsheet export in the real browser UI; this is client-side and was not exercised by the server/API smoke test.
6. [ ] Resolve the remaining live coaching-QA findings above, build the Cardio / Endurance cluster, and rerun the adversarial generation to 9+ coaching quality.
7. [ ] Resolve or replace temporary admin Program Pass provisioning before enabling paid Program Pass sales.
8. [ ] Run the Program Pass-specific acceptance matrix below with controlled enforcement enabled.
9. [ ] Add the final real-iPhone usability check.
10. [ ] Only after the Program Pass-specific tests pass, set `PROGRAM_PASS_ENFORCEMENT=1` for customer launch.

Recommended production environment values:

```text
NODE_ENV=production
PROGRAM_PASS_ENFORCEMENT=1
PROGRAM_PASS_DAYS=56
PROGRAM_PASS_ADJUSTMENTS=6
PROGRAM_PASS_DATA_GRACE_DAYS=7
GENERATION_BUILDS_PER_HOUR=4
GENERATION_ADJUSTS_PER_HOUR=12
```

## Temporary Newie fulfilment for first customers

Until Newie purchase completion is automated, issue one unique Program Pass after each confirmed Newie purchase. The current admin-key path must be resolved or replaced before relying on this operationally.

```bash
curl -X POST "https://YOUR-APP-HOST/api/admin/program-pass" \
  -H "Content-Type: application/json" \
  -H "x-admin-provision-key: YOUR_ADMIN_PROVISION_KEY" \
  -d '{"count":1}'
```

## Staging acceptance matrix

- [ ] Valid unused Program Pass creates a first program.
- [ ] Invalid Program Pass cannot create a program.
- [ ] A used Program Pass cannot activate a second personal code.
- [ ] Activated pass recovers correctly if the first browser response is lost.
- [ ] Failed first generation can retry without consuming another pass.
- [ ] A completed first program cannot call Build again with the same pass.
- [ ] Delete My Data does not create another block credit or reset adjustments.
- [ ] Returning personal code loads during the 56-day access window.
- [ ] Returning personal code is denied after expiry.
- [ ] Adjustments 1 through 6 succeed.
- [ ] Adjustment 7 is rejected before an AI call is made.
- [ ] Failed adjustment does not consume an adjustment.
- [ ] English/Hebrew language switching does not consume a substantive adjustment.
- [ ] Program Pass status UI reports expiry and remaining adjustments correctly.
- [ ] Spreadsheet export still works after adjustments.
- [x] With enforcement OFF, Delete My Data removes coaching data immediately and the deleted personal code no longer retrieves it.
- [ ] With enforcement ON, Delete My Data removes coaching data without resetting the separate commercial entitlement.
- [ ] Post-expiry grace cleanup removes coaching data but preserves the entitlement record.
- [x] Aggregate analytics endpoint accepts only the allowlisted non-content funnel events in live testing.
- [ ] Mobile intake and program tables remain usable on a real phone.

## Remaining launch workstreams

1. Build and integrate the Cardio / Endurance coaching-knowledge cluster, fix remaining coaching QA/validator issues, and rerun the annoying avatar to 9+.
2. Verify browser spreadsheet export and real-iPhone UX.
3. Add the final privacy/support email.
4. Resolve or replace the temporary admin provisioning path, then run Program Pass-specific staging acceptance.
5. Run the real purchase journey: Newie purchase -> Program Pass -> intake -> generation -> spreadsheet -> leave -> return -> adjust -> language -> delete.
6. Add landing-page CTA and Newie purchase/re-purchase attribution where those platforms expose a clean integration. App-side funnel analytics are implemented.
7. Final launch video and social campaign assets.
8. Launch validation: first 10 paying users, then review conversion, generation cost, adjustment usage and repurchase rate before changing price/allowances.

## CI status

Static and regression CI remains the normal default. Live Render QA is executed only as temporary one-off workflow steps so future commits do not create unnecessary paid AI generations. The source-grounding contract remains under regression test, and the established Warrior avatar remains the regression anchor for preserving 9+ coaching quality while new knowledge clusters and integrity rules are added.
