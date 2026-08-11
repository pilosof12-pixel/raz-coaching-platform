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
- [x] `phase14/package.json` now builds the Phase 15 runtime, injects launch UI assets, and starts through `phase14/server_secure.js`.
- [x] Deployed `phase14` security/privacy regression tests cover secure startup, admin/pass routes, intake preflight, analytics allowlist, privacy policy, browser secret exclusion and entitlement persistence.
- [x] Phase 15 source-grounding regression fixture corrected without changing production coaching logic.
- [x] Latest GitHub Actions regression job passes with the deployed Phase 15 runtime plus privacy, Program Pass, analytics, retention, mobile and intake-preflight changes.
- [x] Production Supabase `supabase_program_passes.sql` migration applied successfully.
- [x] Production Supabase privacy/RLS hardening migration applied successfully.
- [x] Production Supabase analytics migration applied successfully.
- [x] RLS verified `true` on `clients`, `history`, `usage`, `jobs`, `program_passes` and `analytics_daily`.
- [x] `anon` and `authenticated` verified to have no direct table privileges on the protected coaching/commercial tables.
- [x] Render environment values set for production mode, Program Pass duration/allowance/grace and generation rate limits.
- [x] Long random `ADMIN_PROVISION_KEY` set server-side in Render.
- [x] `PROGRAM_PASS_ENFORCEMENT=0` retained while staging verification is incomplete.
- [x] Latest `privacy-security-hardening` wrapper confirmed live on Render via `/api/program-pass-config`.
- [x] Production health endpoint confirmed redacted under `NODE_ENV=production`.
- [x] Live privacy page confirmed loading with Program Pass, retention, deletion and analytics disclosures.
- [x] Live privacy-consent behavior confirmed working before generation.
- [ ] Admin Program Pass provisioning route is live but current `ADMIN_PROVISION_KEY` requests return generic `Not found`; temporarily deferred so it does not block the rest of staging.

## Program Pass rollout — remaining environment / staging work

Do not enable commercial enforcement for customers until the remaining unchecked items are complete.

1. [x] Apply `supabase_program_passes.sql` in production Supabase.
2. [x] Apply `supabase_privacy_hardening.sql` and verify browser roles cannot directly read coaching tables.
3. [x] Apply `supabase_analytics.sql` so aggregate funnel counters can persist in production.
4. [ ] Add the final privacy/support email address to the deployed `phase14/public/privacy.html` and reference copy.
5. [x] Set a long random `ADMIN_PROVISION_KEY` in Render; keep it server-side only.
6. [x] Keep `PROGRAM_PASS_ENFORCEMENT=0` while staging/testing.
7. [x] Confirm Render has deployed the latest `privacy-security-hardening` commit containing the `phase14` launch wrapper.
8. [ ] Run the normal customer journey with enforcement OFF: intake -> generation -> personal code -> spreadsheet -> return -> adjustment -> language switch -> deletion.
9. [ ] Resolve or replace temporary admin Program Pass provisioning before enabling paid Program Pass sales.
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

During staging verification, keep `PROGRAM_PASS_ENFORCEMENT=0` until the baseline customer journey is verified. Enable it only for controlled Program Pass acceptance checks, then leave it enabled only when the full matrix passes.

## Temporary Newie fulfilment for first customers

Until Newie purchase completion is automated, issue one unique Program Pass after each confirmed Newie purchase.

```bash
curl -X POST "https://YOUR-APP-HOST/api/admin/program-pass" \
  -H "Content-Type: application/json" \
  -H "x-admin-provision-key: YOUR_ADMIN_PROVISION_KEY" \
  -d '{"count":1}'
```

The response returns one 32-character code. Send that code to the buyer with the coaching-engine app link. Do not reuse a code for another buyer.

Customer message:

```text
Your RAZ AI Coaching Program Pass is ready.

Open the coaching engine and paste this Program Pass code when you build your first program:

[PROGRAM PASS CODE]

Your pass includes one personalised 4-week training block, 8 weeks of access and up to 6 substantive program adjustments. Language switching does not use an adjustment. Keep both this Program Pass code and the personal code generated by the app private.
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
- [ ] Delete My Data removes coaching data without exposing whether another token exists.
- [ ] Post-expiry grace cleanup removes coaching data but preserves the entitlement record.
- [ ] Aggregate analytics counters increment without storing customer data.
- [ ] Mobile intake and program tables remain usable on a real phone.

## Remaining launch workstreams

1. Finish the enforcement-OFF real customer journey and record any UX/runtime defects.
2. Resolve or replace the temporary admin provisioning path, then run Program Pass-specific staging acceptance.
3. Run the real adversarial customer journey: Newie purchase -> Program Pass -> intake -> generation -> spreadsheet -> leave -> return -> adjust -> language -> delete.
4. Review adaptive intake sufficiency on deliberately incomplete/contradictory real generation avatars. Deterministic malformed-input preflight is already implemented.
5. Add landing-page CTA and Newie purchase/re-purchase attribution where those platforms expose a clean integration. App-side funnel analytics are implemented.
6. Verify mobile UX on a real iPhone. Code-side mobile safeguards are implemented.
7. Final launch video and social campaign assets.
8. Launch validation: first 10 paying users, then review conversion, generation cost, adjustment usage and repurchase rate before changing price/allowances.

## CI status

Latest deployed-runtime regression job is green. It validates the root reference layer and, critically, the actual Render deployment tree under `phase14/`: generated Phase 15 runtime, secure wrapper, Program Pass store, analytics store, privacy deletion/retention store, intake preflight, launch UI injection and privacy/security tests, plus the existing Phase 15 coaching-engine regression suite.
