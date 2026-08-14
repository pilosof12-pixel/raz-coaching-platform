# RAZ AI Coaching Platform — Launch Checklist

Status date: 2026-08-14

## Completed / code-verified

- [x] WordPress landing page and Newie offer aligned to the A$30 one-time Program Pass.
- [x] Privacy consent UI and customer-facing privacy policy added.
- [x] Personal code treated as a private credential.
- [x] Permanent Delete My Data control implemented.
- [x] Security headers, no-store API responses, token validation, input guards and generation-rate limits implemented.
- [x] Aggregate first-party funnel analytics implemented without storing intake/program/injury content.
- [x] Program Pass entitlement layer implemented behind `PROGRAM_PASS_ENFORCEMENT=1`.
- [x] One Program Pass creates one initial four-week block and defaults to 56 days access.
- [x] Six substantive adjustments included; language switching does not consume adjustment allowance.
- [x] Failed/unfinished first builds do not consume the paid block.
- [x] Successful-block state and adjustment count stored in the commercial entitlement record rather than inferred from coaching history.
- [x] Deleting coaching data does not reset commercial entitlement.
- [x] Expired coaching data cleanup architecture implemented with configurable grace period.
- [x] Supabase Program Pass, privacy/RLS and analytics migrations applied in production.
- [x] RLS verified on `clients`, `history`, `usage`, `jobs`, `program_passes` and `analytics_daily`.
- [x] `anon` and `authenticated` have no direct protected-table privileges.
- [x] Render remains correctly rooted at `phase14/`.
- [x] Production health endpoint redacted.
- [x] Live privacy-consent rejection verified before generation.
- [x] Live enforcement-OFF journey verified: build, job polling, personal-code return, adjustment, language switch, analytics and deletion.
- [x] Process-local cache deletion defect fixed; deleted personal code now returns 404 immediately.
- [x] Spreadsheet/export path accepted for launch unless a later regression exposes a defect.
- [x] Source-grounding hard contract remains active: authored RAZ coaching knowledge is authoritative and generic model memory must not invent programming principles, dose or progression.

## Coaching engine — COMPLETE

- [x] Requested strength-day integrity fixed while preserving low-cost support sessions when concurrent sport load is high.
- [x] Named endurance/sport goals require direct modality-specific exposure.
- [x] Pain-sensitive specificity implemented: exact goal movement when tolerated; otherwise the closest explicitly tolerated source-supported variation.
- [x] Unbenchmarked variations use autoregulated/conservative loading instead of inheriting unsupported fixed loads.
- [x] Sprint/power semantics fixed: near-max speed work uses speed/quality language, full recovery and `Target RPE = N/A` rather than a contradictory strength-style RPE.
- [x] False `QA_FORMULA_VIOLATION_COUNT` path fixed; valid accepted live programs return formula marker `0`.
- [x] Endurance pace semantics anchored to current demonstrated performance so race/goal pace is not mislabeled as low intensity.
- [x] Concurrent recovery-budget logic prevents redundant bike/row conditioning from being added without a source-supported purpose.
- [x] Marathon block logic anchored to current weekly volume, one-main-variable progression, stable support-strength dose and structural TSV validation.
- [x] Exact `Parallel Box Squat` wording exposed by ping-pong QA is now normalized to canonical `Box Squat to Parallel` through the durable normalization patch.

### Seven-step coaching-engine integration

- [x] Step 1 — Physiology-first endurance cluster integrated into the Phase 14 authored knowledge layer.
- [x] Step 2 — Source routing upgraded for running events, VO2max/threshold, rowing, cycling, swimming and multisport while preserving concurrent strength/combat sources.
- [x] Step 3 — Routing/integration regressions cover hybrid 5K + strength/combat, dedicated running, rowing and triathlon cases.
- [x] Step 4 — Sprint/power speed-quality semantics fixed.
- [x] Step 5 — False formula-marker path fixed.
- [x] Step 6 — Deterministic Adaptive Intake / Ping-Pong implemented before rate-limit / Program Pass / AI generation.
- [x] Step 7 — Live adversarial coaching QA completed across Warrior, concurrent strength/combat + 5K, dedicated 5K, 2K rowing, marathon and Olympic triathlon. Manual coaching review, not validator status alone, is the acceptance gate.

### Live coaching acceptance

- [x] Avatar 3 / Warrior remains 9+ quality after hardening.
- [x] Concurrent strength + MMA/BJJ + 5K avatar manually accepted at ~9.0/10 after recovery-budget and running-calibration fixes.
- [x] Dedicated 5K stress case passed.
- [x] 2K rowing stress case passed.
- [x] Olympic-distance triathlon stress case passed.
- [x] Marathon stress case manually accepted at ~9.1/10 after current-volume anchoring, single-lever progression and stable maintenance-strength fixes.

## Cardio / Endurance source cluster

### Authoritative source spine

1. [x] `Physiology of Sport and Exercise` — Kenney et al. — supplied and used.
2. [x] `Exercise Physiology: Nutrition, Energy, and Human Performance` — McArdle et al. — supplied and used.
3. [x] `Science and Application of High-Intensity Interval Training` — Laursen & Buchheit — supplied and used.
4. [ ] NSCA endurance textbook — future specialist enrichment; not required for the current approved cluster and must not be silently substituted with model memory.
5. [ ] `Physiological Tests for Elite Athletes` — Tanner & Gore — future testing/monitoring enrichment.

### Eleven consolidated articles

- [x] Article 1 — Bioenergetics and Energy-System Interaction.
- [x] Article 2 — Determinants of Aerobic Performance.
- [x] Article 3 — Intensity Domains and Threshold Physiology.
- [x] Article 4 — Low-Intensity / Aerobic-Base Training.
- [x] Article 5 — VO2max and Interval Training.
- [x] Article 6 — Anaerobic Capacity, Sprint and Repeated High-Intensity Performance.
- [x] Article 7 — Endurance Programming and Periodisation.
- [x] Article 8 — Concurrent Strength + Endurance Training.
- [x] Article 9 — Conditioning for Combat and Intermittent Sports.
- [x] Article 10 — Modality Translation: running, cycling, rowing, swimming and multisport.
- [x] Article 11 — Testing, Monitoring and Conditioning Decision System.

## Adaptive Intake / Ping-Pong — COMPLETE, with live stress QA

- [x] Missing strength/endurance/advanced-skill benchmarks detected deterministically.
- [x] Pain/injury ambiguity detected when ROM/exercise selection depends on client-reported tolerance.
- [x] Limited-equipment load ceiling detected when it materially changes progression.
- [x] Missing concurrent sport schedule detected.
- [x] Maximum four high-value questions in one round.
- [x] A second clarification round may reveal one remaining necessary ambiguity after the first four answers.
- [x] Answers are attached to the same intake and returned through the normal deterministic/source-grounded generation path.
- [x] Clarification occurs before generation-rate accounting and before Program Pass guard.
- [x] No OpenAI/Gemini call is used to decide clarification questions.
- [x] Live stress: running benchmark/exposure, low-back tolerance, limited-load ceiling, combat schedule and planche baseline all returned targeted HTTP `422` clarification responses with no job/token.
- [x] Live stress: overloaded intake returned exactly four first-round questions, then one remaining second-round question after those answers were supplied.
- [x] Live stress: seven clarification requests from the same runner did not consume the build-rate allowance; the fully answered intake still received HTTP `202` with a normal generation job/token.
- [x] Therefore ping-pong adds application/request overhead but **no separate clarification AI-generation cost**.
- [x] QA note saved at `docs/qa/PING_PONG_STRESS_2026-08-13.md`.

Note: the first end-to-end clarified build exposed the now-fixed `Parallel Box Squat` alias issue; an isolated rerun then entered generation normally but the model provider returned a temporary upstream `503 high demand`. Those are downstream/provider events, not failures of the clarification gate or zero-cost handoff.

## Program Pass rollout — PENDING

Do not enable commercial enforcement until these are complete.

- [ ] Add final privacy/support email to deployed privacy/support copy.
- [ ] Resolve or replace the temporary admin Program Pass provisioning path; current admin-key requests have returned generic `Not found`.
- [ ] Verify the server-side environment variable name `SUPABASE_SERVICE_ROLE_KEY` exists before enforcement goes live.
- [ ] Rotate the previously exposed admin provisioning secret before public launch.
- [ ] Run the full Program Pass acceptance matrix below with controlled enforcement enabled.
- [ ] Final real-iPhone usability check.
- [ ] Set `PROGRAM_PASS_ENFORCEMENT=1` only after the matrix passes.

### Program Pass staging acceptance matrix

- [ ] Valid unused Program Pass creates a first program.
- [ ] Invalid Program Pass cannot create a program.
- [ ] Used Program Pass cannot activate a second personal code.
- [ ] Activated pass recovers correctly if the first browser response is lost.
- [ ] Failed first generation retries without consuming another pass.
- [ ] Completed first program cannot call Build again with the same pass.
- [ ] Delete My Data does not create another block credit or reset adjustments.
- [ ] Returning personal code loads during the 56-day access window.
- [ ] Returning personal code is denied after expiry.
- [ ] Adjustments 1 through 6 succeed.
- [ ] Adjustment 7 is rejected before an AI call.
- [ ] Failed adjustment does not consume an adjustment.
- [ ] English/Hebrew switching does not consume an adjustment.
- [ ] Program Pass status UI reports expiry and remaining adjustments correctly.
- [ ] Spreadsheet export still works after adjustments.
- [x] With enforcement OFF, Delete My Data removes coaching data immediately and the deleted personal code no longer retrieves it.
- [ ] With enforcement ON, Delete My Data removes coaching data while preserving commercial entitlement.
- [ ] Post-expiry grace cleanup removes coaching data while preserving entitlement record.
- [x] Aggregate analytics accepts only allowlisted non-content events in live testing.
- [ ] Mobile intake/program tables remain usable on a real iPhone.

## Remaining launch workstreams

1. Add final privacy/support email.
2. Resolve/replace admin Program Pass provisioning.
3. Verify service-role environment-variable setup and rotate the admin secret.
4. Run Program Pass enforcement-ON staging acceptance matrix.
5. Run the real purchase journey: Newie purchase -> Program Pass -> intake -> clarification if needed -> generation -> spreadsheet -> leave -> return -> adjust -> language -> delete.
6. Final real-iPhone UX check.
7. Add clean landing/Newie attribution where available, finish launch video/social assets, then launch to first paying users.
8. Review conversion, generation cost, clarification frequency, adjustment usage and repurchase rate before changing price or allowances.

## CI / branch status

- Normal static/regression CI is the default; live Render QA should remain one-off so normal commits do not create paid AI generations.
- PR #15 remains intentionally open/draft and should not be merged until Program Pass staging is complete.
- Render deployment branch remains `privacy-security-hardening` with root directory `phase14/`.
