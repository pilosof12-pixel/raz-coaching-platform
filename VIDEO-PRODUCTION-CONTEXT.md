# VIDEO-PRODUCTION-CONTEXT.md

Technical and product handoff for a Claude Code agent producing a launch/promotional
video for this application.

This is a factual handoff. It is not marketing copy. Where something is incomplete,
it says so. **Do not demonstrate or narrate anything this document lists as not
working.**

- **Repository:** `pilosof12-pixel/raz-coaching-platform`
- **Branch:** `privacy-security-hardening`
- **Application root:** `phase14/` (the repository root holds `docs/`, `.github/`,
  and this file; the running application is entirely inside `phase14/`)
- **Written:** 2026-09-30

---

## 1. What the application is

A web application that turns a structured intake questionnaire into an
individualised **4-week strength and conditioning training block**, delivered as a
formatted, downloadable Excel workbook.

The flow is: questionnaire → AI generation → deterministic validation and repair →
program text → client-facing spreadsheet.

It is a single-shot program builder, not an ongoing coaching app. One purchase
produces one block. There is an "adjust" path that regenerates a block from a
modification request (`POST /api/adjust`), but there is no training log, no
week-to-week check-in, and no progress tracking over time.

### Who it is for

Athletes with **specific, named performance goals** and real constraints, where a
generic template would be wrong. The system is built and tested against cases like:

- a 30-year-old chasing a 220 kg squat and 4 one-arm pull-ups while training MMA
  five times a week
- a 27-year-old tactical athlete taking a 3 km run from 13:30 toward sub-12:00
  while also rucking and holding strength
- a 13-year-old gymnast working toward a first bar muscle-up and a freestanding
  handstand
- a 54-year-old returning to competitive masters rowing nine months after an
  L4/L5 disc herniation

The common thread is **concurrency and constraint**: multiple goals competing for
one recovery budget, plus injuries, equipment limits, fixed training days and
sport load that the block has to work around.

---

## 2. Core product philosophy

These are the principles the engine actually enforces in code. They are the
honest basis for any claim made in a video.

1. **The program must serve the goals the athlete actually stated.** Named goals
   are matched to direct exposures in the program, and a block that omits work for
   a named goal is rejected.

2. **A goal is either developed or deliberately maintained, and the block says
   which.** Holding a secondary goal flat is often correct when higher-priority
   goals and sport load own the recovery budget — but the program must state that
   in writing rather than leave an unchanging dose looking like an oversight.

3. **Every prescription must be executable.** A load the athlete cannot choose
   ("RPE-selected load" with no selection rule), a rep range so wide it describes
   two different sessions, an RPE that the prescribed load makes impossible — each
   of these is detected and corrected.

4. **Notes must agree with the table beside them.** A note claiming a reduction
   the numbers do not make, or scoping an instruction to "only this week" when a
   later week repeats it, is a defect.

5. **A blocking rule must have a deterministic repair.** A validator that can
   refuse a program with no mechanical way to answer it burns paid model calls and
   delivers nothing. This is enforced by a test (`test/gate_repair_debt.test.js`)
   that fails when a new blocking code appears without a repair, a test, or a
   recorded reason.

6. **Safety rules are not traded for latency.** For example, youth programs are
   refused outright if they contain failure/grinding language, even though that
   refusal costs a regeneration.

---

## 3. End-to-end user journey (as currently implemented)

1. **Landing page** (`phase14/public/index.html`) — a multi-step questionnaire.
2. Athlete fills in goals, training days, equipment, experience, injuries/pain,
   concurrent sport, and current performance numbers.
3. On submit, the browser POSTs the intake to `/api/build`.
4. **Clarification gate** — if required information is missing or ambiguous, the
   server responds `422` with a list of follow-up questions instead of building.
   The athlete answers them inline and resubmits. This does **not** consume a
   Program Pass or a rate-limit slot.
5. Once the intake is complete, the server starts an asynchronous build job and
   returns a job id.
6. The browser polls `GET /api/job/:id` until the job completes. Generation is
   genuinely slow — see §13.
7. The finished program is fetched via `GET /api/program/:token` and rendered as a
   table plus narrative guidance in the browser.
8. The athlete clicks to download the **Excel workbook**, which is generated
   client-side from the program text.
9. An optional **adjust** step (`POST /api/adjust`) regenerates the block from a
   free-text modification request.

The intake draft and the program token are stored in `localStorage` so a refresh
or failed build does not force a re-fill.

---

## 4. How the questionnaire works

Implemented in `phase14/public/index.html` and `phase14/public/app.js`.

It is a stepped form, not a single long page. Fields that exist today include:

- Goals: `goal_primary`, `goal_secondary`, `goal_maintenance`
- Training: `days`, `session_length`, `split_pref`, `gym_availability_mode`,
  `same_day_gap`
- Context: `experience`, `bodyweight`, `training_location`, `equipment`,
  `equipment_type`
- Sport: `has_sport`, `sport`, plus competition fields (`competition_date`,
  `event_type`, `event_priority`, `weight_class_status`)
- Health: `has_pain`, `pain_description`, `pain_severity`, `pain_character`,
  `pain_next_day`, `tolerated_movements`, `injuries`, `has_mobility_limit`,
  `mobility_limit`
- Recovery: `sleep_hours`, `recovery_rating`
- Baselines: `current_numbers`, and free-text `notes`

There is **no user account system**. There is no login, no email capture, and no
saved athlete profile across sessions beyond `localStorage`.

---

## 5. Athlete / avatar / profile creation

Be careful with wording here, because it is easy to overstate.

- There is **no persistent athlete profile or account**. "Avatar" in this codebase
  means a **test fixture** — a stored intake used for automated acceptance runs,
  not a user-facing feature.
- The athlete's identity for a given program is the **intake object** plus a
  **program token** returned by the server. That token is how the browser retrieves
  the program again.
- Stored avatars live in `phase14/test/fixtures/hard_avatars.json`
  (`inseason_footballer`, `masters_return`) and inline in
  `.github/workflows/live-three-avatar-acceptance.yml` (advanced hybrid, youth
  gymnastics, tactical 3K, weightlifter, MMA fight camp, and others).

**Do not present avatar selection as a user-facing product feature.** It is test
infrastructure.

---

## 6. Missing-information detection and follow-up questions

Implemented in `phase14/intake_clarification.js`, wired in
`phase14/server_secure.js`.

This is a genuine, working feature and is one of the more demonstrable parts of
the product.

- `detectIntakeClarifications(intake)` inspects goals, current numbers, pain text
  and sport context, and returns up to **four** questions.
- `addOptionalQuestions()` appends lower-priority ones.
- If any question is `required`, the build is refused with HTTP **422** and the
  message: *"A few details are needed before I can build this accurately."*

Examples of what it catches:

- A named strength goal with **no current baseline** — e.g. a squat goal with no
  squat number. It asks for the baseline for that specific movement.
- **Skill goals always require a baseline** (`always_baseline: true`): one-arm
  pull-up, planche, front lever, handstand push-up, bar muscle-up, freestanding
  handstand, muscle-up.
- An **endurance event goal** with no current pace/time.
- A **combat-sport athlete near competition** — asks whether a weight cut is
  planned (`weight_class_plan`).
- **Pain/injury** present — asks which goal movements are tolerated
  (`lumbar_goal_movement_tolerance`, `knee_...`, `upper_body_...`).
- Equipment with an unstated **load ceiling**.

**Important:** this gate is strict enough that an incomplete intake genuinely
cannot build. In a video, that is a feature worth showing — but show it honestly:
it is a form validation step, not a conversation.

---

## 7. How program generation works

1. `POST /api/build` → validated intake → an async job.
2. The runtime sends a **source-grounded prompt** to the AI provider.
3. The returned program text passes through a long **deterministic validation and
   repair chain** (`phase14/engine/repairable_validation_bundle.js`).
4. Failures that have a deterministic repair are fixed in place. Failures that do
   not are sent back to the model as a targeted amendment, and the program is
   regenerated (up to four attempts).
5. The final program is saved and a token returned.

### Provider configuration (important)

The runtime selects a provider by environment variable, in this order:

1. `USE_PPLX_PROXY=1` → development proxy
2. `OPENAI_API_KEY` → OpenAI path (this is the production path; the live
   acceptance runs use it)
3. `GEMINI_API_KEY` → Gemini path
4. none → `no-key` mode; `/api/health` reports not ready and **builds will not
   work**

`phase14/server.phase15.js` is a **generated file**. It is built from `server.js`
by the `scripts/apply_*.mjs` patch scripts via `npm run phase15:build`. **Do not
edit it directly** and do not commit changes to it.

---

## 8. What makes the programming individualised

This is the substance of the product. All of the following are implemented and
enforced in code, and all are visible in a delivered program:

- **Benchmark-anchored loads.** Where the athlete supplies a benchmark, direct work
  on that lift must be prescribed in kilograms or percentages, not vague RPE
  targets.
- **No invented numbers.** Where the athlete has *no* benchmark for a variation,
  the engine deliberately refuses to fabricate a load and writes a self-selected
  load instead — but then requires the row to state how to choose it (reps in
  reserve derived from that row's own target RPE, and an instruction to record
  the load used).
- **Fixed training days are respected.** The block must use the athlete's actual
  available days, not invent new ones.
- **Sport load is accounted for.** A program for someone training MMA five times
  a week is constrained differently from one for a person who only lifts.
- **Injury mechanism avoidance.** The movement the athlete says reproduces their
  symptoms stays out of the block. For the masters rower, loaded lumbar flexion
  under fatigue appears nowhere in four weeks.
- **Goal hierarchy.** When several goals compete, primaries are developed and
  secondaries may be held — with the hold declared in writing.
- **Week 4 consolidation.** Total work sets, peak RPE and endurance distance must
  come down in week 4 relative to week 3.
- **Per-week coaching standards.** Where a prescription holds steady, each build
  week states what the athlete is trying to beat, in that movement's own terms —
  depth and bracing for a squat, a controlled lockout for a hinge, posture and
  grip over the distance for a carry.

---

## 9. The final output (spreadsheet)

Generated **client-side** in the browser by
`phase14/public/spreadsheet-parity.js`, using a bundled ExcelJS
(`phase14/public/exceljs.lib.js`). The download is a real `.xlsx` file, typically
34–38 KB.

**Six sheets:** `Overview`, `Warm-Up`, `Week 1`, `Week 2`, `Week 3`, `Week 4`.

- **Overview** — athlete profile (age, bodyweight, goals, benchmarks), training
  frequency, equipment, concurrent sport, pain/injury, plus the block's narrative
  guidance and a session-structure summary.
- **Warm-Up** — the prescribed preparation work.
- **Week sheets** — day-banded tables with columns:
  `Exercise | Load / Target | Sets | Reps / Duration | Rest | Effort | Coaching Note | Log`

The **Log** column is intentionally left blank for the athlete to fill in.

Branding is black and turquoise, with the logo embedded from
`phase14/public/data/brand-logo.png`. The layout is designed to be readable on a
phone.

**English only.** Hebrew support was deliberately removed (see §11).

---

## 10. Exercise hyperlinks / YouTube demonstrations

Implemented in `phase14/public/exerciseDemos.js` with data in
`phase14/public/data/exercise_demos.json` and
`phase14/public/data/exercise_demo_overrides.json`.

Every exercise title cell in the week sheets is a hyperlink. **How that link is
produced matters, and a video must not overstate it:**

- The demo table has **173 entries**, of which **39 currently carry a specific,
  chosen `demo_url`** (a real YouTube video).
- Every other exercise falls back to a **YouTube search link** built from the
  exercise name (`https://www.youtube.com/results?search_query=...`).

So the accurate claim is: **every exercise is linked to a demonstration**. The
inaccurate claim would be: *"every exercise links to a hand-picked video."* Most
resolve to a search. The fallback exists because an earlier version returned no
link at all for uncurated exercises — of fifteen exercises in one reviewed
program, only four resolved.

`phase14/demo-videos-to-fill.json` lists entries still awaiting a curated video.

---

## 11. Important product decisions made during development

- **Hebrew was removed entirely.** The product is English-only. Exercise names are
  structurally English. Do not show or mention Hebrew.
- **Payment and email are external.** Purchase runs through Nui and email through
  Zapier. Neither is part of this codebase. There is no checkout flow to
  demonstrate.
- **Program Pass enforcement is off by default.** It only activates when
  `PROGRAM_PASS_ENFORCEMENT=1`. With it off, no pass code is required — which is
  what you want for a demo.
- **A gate without a repair is a dead build.** Enforced by test.
- **Self-selected loads are legitimate; unexplained ones are not.** The engine
  refuses to invent a kilogram figure but requires the row to say how to pick one.
- **Safety refusals are not traded for speed.** A deterministic repair for the
  youth failure-language rule was written, worked, and was deliberately reverted,
  because silently deleting one sentence would hide a model that had misread a
  13-year-old athlete.

---

## 12. Features that currently work

- Multi-step intake questionnaire with draft persistence
- Missing-information detection with inline follow-up questions (HTTP 422)
- Asynchronous program generation with job polling
- Deterministic validation and repair chain (1,652 automated tests passing)
- Program rendering in-browser (table + narrative)
- Excel workbook download, six sheets, branded, mobile-readable
- Exercise hyperlinks on every exercise (39 curated videos, rest search links)
- Adjust/regenerate from a free-text modification request
- Program Pass entitlement system (optional, off by default)
- Rate limiting and privacy/data-retention plumbing

## 13. Incomplete — do NOT present these as working

- **No user accounts, login, or saved athlete profiles.** Nothing persists across
  browsers beyond `localStorage`.
- **No payment flow in this application.** Do not film a purchase.
- **No training log, check-ins, or week-to-week progress tracking.**
- **No mobile app.** It is a responsive web page.
- **Curated demo videos are ~39 of 173 entries.** Do not imply a complete
  hand-curated video library.
- **Generation is slow and variable.** Recent live runs: masters 232s, youth 211s,
  advanced hybrid 588s, tactical 3K 677s. Two of four exceeded the 300-second
  target. **Do not film an unedited real-time build and imply it is fast.** Either
  cut away, use a pre-generated program via its token, or state the wait honestly.
- **Program quality is good but not uniformly at target.** A domain coach scored
  the four reference programs 9.0 (advanced hybrid), 8.7 (tactical 3K), 8.5
  (youth), 8.4 (masters) out of 10 against a 9.0 bar. Fixes have landed since, but
  **the post-fix programs have not been re-scored by that coach.** Do not claim a
  verified quality rating.
- **Accessory-budget balancing is advisory only** — it is detected and stated in
  the prompt, but not automatically corrected.
- **No multi-block periodisation.** One four-week block at a time.

---

## 14. Best demo athlete for a launch video

**Recommended: `masters_return`** — the 54-year-old returning rower.

Full intake is in `phase14/test/fixtures/hard_avatars.json`.

Why it is the strongest demo:

- The story is immediately legible to a non-technical viewer: someone coming back
  from a serious injury who wants to *race again*, not just be pain-free.
- It shows the product doing something a template cannot. Her primary goal (the
  2 km erg) is also the movement that loads her injured tissue.
- The constraints are visible in the output: no loaded lumbar flexion anywhere,
  every movement drawn from her stated tolerated list, symptom-tied stop rules.
- It demonstrates the clarification gate naturally — her intake has a deadlift
  listed as "not attempted since the injury".
- The delivered block explains itself: *"Deadlift is deliberately not in this
  block: squat, lunge, hip thrust, leg press, and graded rowing are doing the
  rebuilding first."*
- It is also the **fastest** of the four recent runs (232s, single model call),
  which matters if you film a real build.

**Second choice: `tactical_3k`** — clean 3K interval progression and a ruck that
builds to event distance. Visually obvious progression. But it was the slowest
recent run (677s).

**Avoid for a first demo:** advanced hybrid (588s, most complex to explain) and
youth (a 13-year-old raises presentational sensitivities).

---

## 15. How to run the application

```bash
git clone https://github.com/pilosof12-pixel/raz-coaching-platform.git
cd raz-coaching-platform
git checkout privacy-security-hardening
cd phase14
npm install
```

Node **>=20 <23** is required (see `engines` in `package.json`).

### Running

```bash
# from phase14/
OPENAI_API_KEY=sk-... npm start
```

`npm start` runs `phase15:build` (regenerates `server.phase15.js` from the patch
scripts), then `launch:prepare`, then boots `pass_preflight.js`.

- **Local URL:** `http://localhost:8000`
- **Port:** `8000` by default, override with `PORT`

### Required setup

- **An AI API key is mandatory for generation.** Without `OPENAI_API_KEY` (or
  `GEMINI_API_KEY`, or `USE_PPLX_PROXY=1`) the server boots and serves the
  questionnaire, but `/api/health` reports not ready and **no program will
  build**. Check with `curl http://localhost:8000/api/health`.
- **No login is required.** There is no auth.
- **No Program Pass is required** unless you set `PROGRAM_PASS_ENFORCEMENT=1`.
  Leave it unset for a demo.
- Storage falls back to local SQLite/in-memory; Supabase variables are optional.

### Verifying before filming

```bash
# from phase14/
npm run check     # full test suite — expect 1652 tests, 0 failures
npm run stress    # expect VERDICT: PASS (14/14)
```

---

## 16. Files and directories worth inspecting

| Path | What it is |
|---|---|
| `phase14/public/index.html` | The questionnaire markup |
| `phase14/public/app.js` | Front-end controller: questionnaire → build → program → adjust |
| `phase14/public/spreadsheet-parity.js` | Builds the Excel workbook (sheets, branding, hyperlinks) |
| `phase14/public/exerciseDemos.js` | Exercise → demo link resolution |
| `phase14/public/data/exercise_demos.json` | Curated demo table (173 entries, 39 with URLs) |
| `phase14/intake_clarification.js` | Missing-information detection and follow-up questions |
| `phase14/server.js` | Source server; **`server.phase15.js` is generated from it** |
| `phase14/server_secure.js` | Security/entitlement wrapper, clarification gate |
| `phase14/pass_preflight.js` | Process entry point |
| `phase14/engine/repairable_validation_bundle.js` | The validation and repair chain |
| `phase14/engine/` | ~140 validators and deterministic repairs |
| `phase14/test/fixtures/hard_avatars.json` | `masters_return`, `inseason_footballer` intakes |
| `.github/workflows/live-three-avatar-acceptance.yml` | Live acceptance harness and all avatar intakes |
| `docs/qa/live-three-avatar/latest/` | Most recent live-run programs and `result.json` |
| `phase14/client-workbooks/` | Locally rendered demo workbooks (gitignored) |

---

## 17. Recommended demo flow for the video

A flow that is accurate and shows real capability:

1. **Open `http://localhost:8000`.** Show the landing page and the opening line
   of the questionnaire.
2. **Fill the intake as the masters rower.** Use the real values from
   `hard_avatars.json`: 54 years old, 68 kg, goal to return to competitive masters
   rowing and race a 2 km erg, four days a week, L4/L5 disc herniation nine months
   ago, discharged from physio, tolerated movements listed, 2 km erg 8:58 nine
   months ago.
3. **Deliberately omit a baseline** and submit, to trigger the clarification gate.
   Show the 422 response rendered as follow-up questions. Answer one inline. This
   is a genuine differentiator and takes seconds.
4. **Submit the completed intake.** *Cut away here.* Generation takes ~230
   seconds for this avatar. Do not film the wait in real time.
5. **Return to the finished program.** Show the narrative guidance, then the
   week-by-week table. Point out the deadlift paragraph — the block explaining a
   movement it deliberately left out.
6. **Download the workbook.** Open it. Walk the six tabs.
7. **Show a week sheet in detail:** day bands, loads anchored to her benchmark,
   the Log column left blank for her, and a coaching note that names what she is
   trying to beat that week.
8. **Click one exercise title** to show the demonstration link opening. Prefer a
   curated one — `Back Squat` resolves to a specific video — so the click lands on
   a real demonstration rather than a search page.
9. **Optionally** show the same block on a phone-width viewport.

### Things to avoid on camera

- Any purchase, login, or account screen (none exist)
- Real-time generation presented as fast
- Claiming a verified coach rating on the current output
- Hebrew, or any multi-language claim
- The admin and QA pages (`admin-pass.html`, `admin-qa.html`, `live-*-qa.html`) —
  these are internal tools
- `phase14/server.phase15.js` shown as hand-written source (it is generated)

---

## 18. Known risks when running locally

- If you edit `server.phase15.js` directly, the next `npm start` overwrites it.
- Running `npm run check` leaves `server.phase15.js` modified in the working tree.
  Run `git checkout -- phase14/server.phase15.js` before committing anything.
- Pushing to this branch triggers a Render auto-deploy and a GitHub Actions
  acceptance workflow. **Pushing while a live generation is in flight kills that
  generation.** Avoid pushing during a filmed build.
- Generation calls a paid API. Each build costs money.
