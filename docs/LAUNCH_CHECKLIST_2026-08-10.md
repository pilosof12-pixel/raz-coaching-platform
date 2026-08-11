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
- [ ] Admin Program Pass provisioning route is live but current `ADMIN_PROVISION_KEY` requests return generic `Not found`; temporarily deferred so it does not block unrelated staging work.

## Live coaching-QA findings still open

The first real adversarial Render generation exposed three coaching-quality issues that should be resolved before broad launch:

- [ ] `days_per_week=4` did not produce four genuine strength sessions. The output effectively used Tuesday and Sunday as strength sessions, with Wednesday and Thursday mostly conditioning/accessory work.
- [ ] The explicit secondary goal `5 km 25:00 -> 22:30` received Zone 2 cross-training on rower/bike but no run-specific exposure, so the output did not sufficiently respect task specificity for the stated performance target.
- [ ] The final translated program carried `QA_FORMULA_VIOLATION_COUNT: 1`; identify the triggering prescription and either correct the prescription or prove the validator is a false positive before launch.

Positive findings from the same live generation:

- [x] Both primary strength goals received direct exposure.
- [x] Hard lower-body work was placed away from Friday hard MMA.
- [x] Low-back irritation was handled with controlled box-squat work and conservative posterior-chain loading rather than ignoring the constraint.
- [x] No internal coaching labels from the launch leak-scan allowlist appeared in the client program.
- [x] Generated program contained the required TSV machine structure and remained retrievable by personal code before deletion.

## Program Pass rollout — remaining environment / staging work

Do not enable commercial enforcement for customers until the remaining unchecked items are complete.

1. [x] Apply all three production Supabase migrations and verify RLS/browser-role restrictions.
2. [ ] Add the final privacy/support email address to the deployed `phase14/public/privacy.html` and reference copy.
3. [x] Set production/staging Render environment values and keep `PROGRAM_PASS_ENFORCEMENT=0` while baseline verification runs.
4. [x] Verify the live enforcement-OFF server journey: consent -> build -> personal-code return -> adjustment -> language switch -> delete.
5. [ ] Verify spreadsheet export in the real browser UI; this is client-side and was not exercised by the server/API smoke test.
6. [ ] Resolve the three live coaching-QA findings above and rerun the adversarial generation.
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

1. Fix and retest the three live coaching-quality defects found by the adversarial generation.
2. Verify browser spreadsheet export and real-iPhone UX.
3. Add the final privacy/support email.
4. Resolve or replace the temporary admin provisioning path, then run Program Pass-specific staging acceptance.
5. Run the real purchase journey: Newie purchase -> Program Pass -> intake -> generation -> spreadsheet -> leave -> return -> adjust -> language -> delete.
6. Add landing-page CTA and Newie purchase/re-purchase attribution where those platforms expose a clean integration. App-side funnel analytics are implemented.
7. Final launch video and social campaign assets.
8. Launch validation: first 10 paying users, then review conversion, generation cost, adjustment usage and repurchase rate before changing price/allowances.

## CI status

Static and regression CI remains the normal default. The live Render QA was deliberately executed as temporary one-off workflow steps and then removed. The live tests confirmed the enforcement-OFF customer API path and caught the deletion-cache defect; the follow-up live deletion test confirmed the fix with a post-delete 404.
