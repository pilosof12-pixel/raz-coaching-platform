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
- [x] Mobile-only launch stylesheet added: iOS-safe input sizing, full-width mobile buttons, compact cards, touch-friendly tables and sport controls.
- [x] Server-side deterministic intake preflight rejects incomplete/malformed payloads before Program Pass activation and before any AI call.
- [x] Privacy policy aligned with the fixed-term Program Pass, post-expiry cleanup and aggregate analytics model.
- [x] Program Pass, analytics and adversarial intake regression tests added.
- [x] `server_secure.js`, `storage.js`, `entitlements.js`, `analytics.js` and launch client scripts are syntax-checked in GitHub Actions.
- [x] Phase 15 source-grounding regression fixture corrected without changing production coaching logic.
- [x] Full GitHub Actions regression workflow passes with the combined privacy, Program Pass, analytics, retention, mobile and intake-preflight changes.

## Program Pass rollout — environment work still required

Do not enable commercial enforcement until the following are complete.

1. Apply `supabase_program_passes.sql` in production Supabase.
2. Apply `supabase_privacy_hardening.sql` and verify browser roles cannot directly read coaching tables.
3. Apply `supabase_analytics.sql` so anonymous aggregate funnel counters can persist in production.
4. Add the final privacy/support email address to `public/privacy.html`.
5. Set a long random `ADMIN_PROVISION_KEY` in Render. Never put this value in browser code, WordPress or Newie.
6. Keep `PROGRAM_PASS_ENFORCEMENT=0` while staging/testing.
7. Deploy the branch to staging and test the complete matrix below.
8. Only after the tests pass, set `PROGRAM_PASS_ENFORCEMENT=1`.

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

1. Finish staging/deployment checks for Supabase, RLS, analytics persistence and Program Pass enforcement.
2. Run the real adversarial customer journey: Newie purchase -> Program Pass -> intake -> generation -> spreadsheet -> leave -> return -> adjust -> language -> delete.
3. Review adaptive intake sufficiency on deliberately incomplete/contradictory real generation avatars. Deterministic malformed-input preflight is already implemented.
4. Add landing-page CTA and Newie purchase/re-purchase attribution where those platforms expose a clean integration. App-side funnel analytics are implemented.
5. Verify mobile UX on a real iPhone. Code-side mobile safeguards are implemented.
6. Final launch video and social campaign assets.
7. Launch validation: first 10 paying users, then review conversion, generation cost, adjustment usage and repurchase rate before changing price/allowances.

## CI status

The complete GitHub Actions regression workflow is green after the combined launch changes. This includes root tests, Program Pass tests, analytics tests, adversarial intake-preflight tests, launch-layer syntax checks and the full Phase 15 generated-runtime validation.
