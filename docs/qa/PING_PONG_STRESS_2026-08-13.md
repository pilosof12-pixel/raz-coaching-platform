# Adaptive Intake / Ping-Pong — Live Stress QA

Date: 2026-08-13
Branch: `privacy-security-hardening`
Live service: Render deployment rooted at `phase14/`
Program Pass enforcement during QA: OFF

## What was stressed

The live `/api/build` clarification gate was exercised with multiple valid-but-ambiguous intakes before any generation was allowed:

1. Running goal missing current event benchmark and current weekly running exposure.
2. Back-squat goal with vague recurring low-back irritation and no movement-tolerance detail.
3. Weighted chin-up goal in a limited outdoor setup with no external-load ceiling.
4. BJJ/MMA concurrent athlete with no weekly sport schedule.
5. Quantified advanced planche goal with no current skill baseline.
6. An overloaded intake containing enough simultaneous ambiguities to exceed the four-question cap.
7. A second clarification round after answering the first four questions.

## Live results — clarification gate

All single-ambiguity cases returned HTTP `422` with `clarification_required=true` and no `job_id` or personal-code token:

- Running case -> `benchmark_running_event`, `running_current_exposure`.
- Low-back/squat case -> `lumbar_goal_movement_tolerance`.
- Limited weighted setup -> `equipment_load_ceiling`.
- Missing combat schedule -> `sport_week_structure`.
- Advanced planche goal -> `benchmark_planche`.

The overloaded case returned exactly four first-round questions, confirming the cap. After those four answers were supplied, the resubmission returned one second-round missing constraint (`equipment_load_ceiling`) rather than reopening already answered questions.

## Zero-cost / rate-limit proof

Seven clarification requests were sent from the same GitHub Actions runner before a generation-ready resubmission. The answered resubmission was still accepted with HTTP `202` and returned a normal `job_id` + token.

This is direct live evidence that clarification requests are not consuming the build-rate allowance before the normal generation path.

The code path also places clarification before `consumeHourly()` and before the Program Pass guard, so clarification remains outside Program Pass activation/usage accounting while enforcement is off for staging.

## Downstream findings exposed by the stress test

The clarification mechanism itself passed, but the two end-to-end post-clarification generation attempts did not both finish with a client program:

### Run 1

The fully answered overloaded intake entered generation successfully, but final QA failed closed because the model emitted `Parallel Box Squat`. The closed exercise-name layer did not recognize that phrase as the existing canonical `Box Squat to Parallel`, producing `[REVIEW]` placeholder rows. This is a separate exercise-alias/integration defect exposed by the ping-pong flow, not a clarification-gate failure.

### Run 2

A simpler two-question clarified 5K intake again entered the normal build path after seven prior clarification requests. The model provider then returned HTTP `503` (`high demand / UNAVAILABLE`) before a program was produced. The synthetic client data was deleted successfully (`DELETE 200`). This is an upstream availability failure, not a ping-pong logic failure.

## Verdict

**Ping-pong clarification gate and handoff: PASS.**

Verified live:

- correct targeted question selection across benchmark, injury tolerance, equipment, schedule and advanced-skill ambiguity;
- maximum four questions in one round;
- second-round clarification can reveal a remaining high-value constraint;
- answered questions are not repeated;
- clarification returns no generation job/token;
- seven clarification requests do not consume the build-rate allowance;
- an answered resubmission enters the normal generation path with HTTP `202`.

**Full post-clarification generation completion: not cleanly demonstrated in these two stress runs** because one run exposed the separate `Parallel Box Squat` alias defect and the isolated rerun hit an upstream model `503`.

## Follow-up

- Add/verify safe normalization of `Parallel Box Squat` to canonical `Box Squat to Parallel` (or otherwise prevent this exact tolerated-variation phrasing from becoming a review placeholder).
- Re-run one generation-ready clarified intake when the model provider is available to capture a fully completed end-to-end ping-pong build.
- Keep the clarification detector deterministic and before build-rate / Program Pass accounting.
