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
- [ ] The 5K goal now receives direct running exposure, but the authored coaching base is not yet deep enough to confidently prescribe event-specific endurance development. Do not solve this by allowing GPT to invent endurance theory from generic model knowledge; build the physiology-first Cardio / Endurance knowledge cluster below from the five authoritative books.
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

## Cardio / Endurance coaching-knowledge cluster — physiology-first architecture

Purpose: give the engine a compact, authoritative, source-grounded conditioning framework that can reason across running, rowing, cycling, swimming, combat and multisport goals without maintaining separate giant sport libraries.

### Authoritative five-book source spine

The endurance articles will be manufactured from these five books. They are the source layer; the final app consumes the consolidated RAZ articles rather than asking the model to reconcile full books at runtime.

1. [ ] `Physiology of Sport and Exercise` — Kenney et al.
2. [ ] `Exercise Physiology: Nutrition, Energy, and Human Performance` — McArdle et al.
3. [ ] `Science and Application of High-Intensity Interval Training` — Laursen & Buchheit.
4. [ ] NSCA endurance textbook — replaces the previously considered Mujika source in the core set.
5. [ ] `Physiological Tests for Elite Athletes` — Tanner & Gore.

Hard source rule: GPT must route to the authored RAZ endurance articles produced from this source spine and must not substitute generic model memory for missing endurance programming logic.

### Eleven consolidated endurance articles

- [ ] Article 1 — Bioenergetics and Energy-System Interaction: ATP-PC, glycolytic and oxidative metabolism; interaction across intensity and duration rather than false on/off energy-system thinking.
- [ ] Article 2 — Determinants of Aerobic Performance: VO2max, central/peripheral determinants, cardiac output, stroke volume, oxygen extraction, mitochondrial/capillary adaptations, blood volume and economy.
- [ ] Article 3 — Intensity Domains and Threshold Physiology: moderate/heavy/severe/extreme domains; threshold concepts and how related threshold terms should and should not be interpreted as interchangeable.
- [ ] Article 4 — Low-Intensity / Aerobic-Base Training: Zone 2/low-intensity work, adaptations, volume, frequency, duration, progression, limitations and prescription without blindly relying on arbitrary percentages.
- [ ] Article 5 — VO2max and Interval Training: long/short intervals, HIIT structures, work-rest manipulation, interval duration/intensity and accumulated high-oxygen-uptake work.
- [ ] Article 6 — Anaerobic Capacity, Sprint and Repeated High-Intensity Performance: repeated sprint ability, glycolytic contribution, phosphocreatine recovery, lactate-related concepts and intermittent-sport application.
- [ ] Article 7 — Endurance Programming and Periodisation: frequency, volume, intensity distribution, overload, progression, deloads, tapering, monitoring and block construction.
- [ ] Article 8 — Concurrent Strength + Endurance Training: interference, fatigue management, order, spacing, same-day versus separate-day work, modality selection and strength/hypertrophy preservation.
- [ ] Article 9 — Conditioning for Combat and Intermittent Sports: translate Articles 1-8 into BJJ/MMA/boxing/intermittent-sport demands without redundant conditioning that duplicates sport practice.
- [ ] Article 10 — Modality Translation: running, cycling, rowing, swimming and multisport/endurance events; preserve modality-specific mechanical/technical constraints while using the same underlying physiology.
- [ ] Article 11 — Testing, Monitoring and Conditioning Decision System: performance tests, pace/power/HR/RPE monitoring, critical speed/power where source-supported, time trials, recovery/monitoring and the practical decision tree from goal demands to prescription and progression.

### Integration and acceptance

- [ ] Define when cross-training can supplement a named endurance goal and when it cannot replace direct modality exposure.
- [ ] Define event-specificity progression so a named goal receives more than token exposure, while still allowing the engine to deliberately hold that goal at maintenance/base level when higher-priority goals and recovery constraints make aggressive progression inappropriate.
- [ ] Define coherent intensity prescription language for each modality (pace/power/HR/RPE only where supported by the authored sources).
- [ ] Add deterministic QA tests for modality specificity, meaningful dose, recovery/concurrent-sport constraints and event-goal prioritisation without hard-coding coaching numbers absent from the authored articles.
- [ ] Stress-test at least: short-distance running pace avatar, marathon-style avatar, rowing performance avatar, multisport/triathlon-style avatar, plus one concurrent strength/combat + endurance avatar.
- [ ] Require 9+/10 coaching-quality acceptance on the annoying concurrent avatar after the new cluster is integrated; passing validators alone is insufficient.

## Adaptive Intake / Ping-Pong clarification — required feature

Purpose: when missing information could materially change programming, stop before generation, ask only the necessary clarification questions, enrich the intake, then generate once.

- [ ] Detect missing high-value benchmarks deterministically before AI generation.
- [ ] Detect pain/injury ambiguity when exercise selection or ROM depends on whether the goal movement itself is tolerated.
- [ ] Example: for a back-squat goal with low-back irritation, clarify whether normal/deep ROM, high volume, heavy loading, fatigue/technique breakdown or all squatting aggravates symptoms; ask whether reduced-ROM/box squat or other close variations are tolerated.
- [ ] Detect unclear equipment/load ceilings, ambiguous skill level and unresolved sport/schedule/recovery conflicts when they materially affect prescription.
- [ ] Return one compact clarification round containing only high-value questions; permit a second round only if the first answer exposes another genuinely necessary ambiguity.
- [ ] Do not let GPT guess through unresolved ambiguity; feed clarified answers back into the deterministic/source-grounded coaching path.

### Ping-Pong API-cost protection

- [ ] Clarification detection should be deterministic/local application logic wherever possible.
- [ ] No OpenAI/Gemini generation call merely to decide which clarification question to ask.
- [ ] No Program Pass credit, adjustment allowance or generation rate-limit slot consumed during clarification.
- [ ] Client answers enrich the same intake; only when the intake is generation-ready does the normal program-generation call occur.
- [ ] Regression test: ambiguous intake -> clarification response -> AI call count remains `0`.
- [ ] Regression test: clarification answered -> final Build -> exactly one normal generation call.
- [ ] Verify staging telemetry confirms the ping-pong path does not materially increase AI cost.

## Program Pass rollout — remaining environment / staging work

Do not enable commercial enforcement for customers until the remaining unchecked items are complete.

1. [x] Apply all three production Supabase migrations and verify RLS/browser-role restrictions.
2. [ ] Add the final privacy/support email address to the deployed `phase14/public/privacy.html` and reference copy.
3. [x] Set production/staging Render environment values and keep `PROGRAM_PASS_ENFORCEMENT=0` while baseline verification runs.
4. [x] Verify the live enforcement-OFF server journey: consent -> build -> personal-code return -> adjustment -> language switch -> delete.
5. [x] Spreadsheet export accepted for launch based on code/path inspection; no additional manual browser QA required unless a later regression suggests an export defect.
6. [ ] Resolve the remaining live coaching-QA findings, build the physiology-first Cardio / Endurance cluster, implement Adaptive Intake / Ping-Pong, and rerun adversarial coaching QA to 9+.
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

1. Build and integrate the physiology-first Cardio / Endurance coaching-knowledge cluster from the five-book source spine.
2. Implement Adaptive Intake / Ping-Pong clarification with zero-extra-AI-call acceptance tests.
3. Fix remaining coaching QA/validator issues and rerun the annoying avatar to 9+ while preserving Avatar 3 at 9+.
4. Add the final privacy/support email.
5. Resolve or replace the temporary admin provisioning path, then run Program Pass-specific staging acceptance.
6. Run the real purchase journey: Newie purchase -> Program Pass -> intake -> clarification if needed -> generation -> spreadsheet -> leave -> return -> adjust -> language -> delete.
7. Add landing-page CTA and Newie purchase/re-purchase attribution where those platforms expose a clean integration. App-side funnel analytics are implemented.
8. Final real-iPhone UX check, launch video and social campaign assets.
9. Launch validation: first 10 paying users, then review conversion, generation cost, clarification frequency, adjustment usage and repurchase rate before changing price/allowances.

## CI status

Static and regression CI remains the normal default. Live Render QA is executed only as temporary one-off workflow steps so future commits do not create unnecessary paid AI generations. The source-grounding contract remains under regression test, and the established Warrior avatar remains the regression anchor for preserving 9+ coaching quality while new knowledge clusters and integrity rules are added.
