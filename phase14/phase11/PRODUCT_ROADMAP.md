# RAZ Performance Product Optimization Checklist

Status key: DONE, IN PROGRESS, TODO, LATER

## Foundation and generation reliability

* DONE Production error handling and Supabase failure handling
* DONE Health and readiness checks
* DONE Render proxy and graceful shutdown hardening
* DONE Existing regression tests preserved
* DONE Build timeout added so a client cannot wait indefinitely
* DONE Retry count reduced and deterministic fallback introduced after repeated validator failures
* DONE Real job stages exposed: preparing, generating, validating, refining, finalizing
* TODO Move production hosting off a sleeping free instance before paid traffic
* TODO Add production monitoring and analytics

## Intake UX

* DONE Replace one long questionnaire with a five step wizard
* DONE Add progress indicator and step level validation
* DONE Replace strict #1/#2/#3 ranking with Primary / Secondary / Maintenance tiers
* DONE Allow two equal Primary goals
* DONE Add structured current performance markers
* DONE Make sport section conditional
* DONE Add optional gym-day availability so generated training days are actually feasible
* DONE Add same-day gym/sport spacing input and route it into scheduling logic
* DONE Add sport intensity explanations
* DONE Add structured pain/load-tolerance questions
* DONE Add optional goal-triggered mobility limitation input without forcing generic mobility work
* DONE Add sleep and current recovery fields
* DONE Add final intake summary before generation
* DONE Make generation wait state reflect real server stages
* TODO Full Hebrew intake-interface translation; Hebrew program/output support already exists
* TODO User test the wizard on real mobile Safari and Android
* TODO Add contextual sport intensity examples that change with sport type

## Spreadsheet

* DONE Preserve premium week-by-week layout and exercise hyperlinks
* DONE Force coaching cells to Text format to stop values such as 4-6 becoming Excel dates
* DONE Add RAZ Performance workbook identity in unused top canvas
* DONE Add Hebrew RTL workbook support and Hebrew display headers/readme
* DONE Improve Hebrew demo-link lookup by using bilingual English canonical names when present
* TODO Generate a fresh English and Hebrew workbook from production and visually inspect in Excel, Google Sheets and iPhone Numbers
* TODO Add automated workbook QA fixture once a representative engine output is saved in test data

## Coaching logic

* DONE Primary goals can both progress when compatible; removed arbitrary one-quality progression ceiling
* DONE Sport scheduling no longer treats hard sport + hard lifting on the same day as universally forbidden
* DONE Sport-aware validator now enforces actual gym-day availability and requested session count
* DONE 24–48h around hard sport is a review window, not a blanket ban; explicit <4h same-day hard collisions are caught
* DONE Pain score treated as a signal, not a mechanical-load formula
* DONE Preserve healthy-limb and tolerated lower-demand training when appropriate
* DONE Red-flag symptom routing separated from mild stable symptoms
* DONE Remove universal 65–85% density-set and 40–70% static-hold hard bands; dosing is method-specific
* IN PROGRESS Audit volume landmarks and stress-cost scores for false precision
* DONE Remove pain-number-only tendon bans and blanket eccentric prohibition from conflicting legacy rules
* IN PROGRESS Audit pain / return-to-loading logic against evidence and product-safety boundaries
* DONE Add goal-triggered mobility support architecture; full region-specific article layer awaits source-vault expansion
* TODO Audit spinal-load and CNS-fatigue rules
* TODO Audit exercise ordering, neural priming, cluster methods and conditioning methods
* TODO Build fixed persona benchmark suite and quality scoring

## Gymnastics and advanced bodyweight

* DONE Advanced skill goals use a dedicated deterministic skill-family layer
* DONE Hebrew goal-family routing tests added
* DONE Fabricated `90-Degree Wall Handstand Push-up` removed and hard rejected
* DONE Wall-supported / wall-assisted Human Flag inventions hard rejected
* DONE HSPU logic separated into base pressing strength, freestanding control and target-specific 90-degree exposure
* DONE Rule added: modifiers such as wall, assisted, banded, eccentric or partial cannot be invented unless the resulting exercise is verified in the library / graph
* IN PROGRESS Full planche progression QA
* IN PROGRESS Full front lever and back lever progression QA
* IN PROGRESS Human Flag progression QA
* IN PROGRESS Iron Cross / Maltese / Victorian ring-strength progression QA
* IN PROGRESS One-arm pull-up progression QA
* IN PROGRESS One-arm handstand / handstand-walk progression QA
* TODO Add muscle-up and other complex bodyweight families to the deterministic graph where missing
* IN PROGRESS Resolve every graph name that is not currently an exact Exercise Library entry; automated sweep completed: 73 unique graph names, 16 exact library matches, 57 unresolved after canonical-name cleanup. See SKILL_LIBRARY_AUDIT.md

## Hebrew QA

* DONE Engine accepts `language=he` and keeps structural TSV tokens stable
* DONE Hebrew program text no longer fails degenerate-output checks simply because it is non-Latin
* DONE Hebrew goal phrases route to advanced skill families in tests
* DONE Spreadsheet supports RTL display without changing parser column order
* DONE Hebrew exercise hyperlinks can resolve via English canonical name when bilingual text is present
* TODO Translate the complete intake UI, validation messages and returning-client UI to Hebrew
* TODO End-to-end Hebrew build test with a real generated program

## Positioning and pricing

* DONE Replace generic AI Coaching Engine positioning in app with RAZ Performance positioning
* DONE Communicate sport-aware scheduling, progression, fatigue constraints and goal prioritization
* IN PROGRESS Keep launch price at AUD 30 as Founding Member Lifetime Access for validation
* TODO Update the WordPress pricing wording when ready to launch validation traffic
* TODO Add proof / example output and conversion analytics before paid traffic
* LATER Revisit pricing only after real stranger-purchase and activation data

## Phase 5 — Advanced Bodyweight + Weighted Street Lifting
- [x] Add Cluster N internal article layer
- [x] Universal anti-hallucination rule for skill modifiers
- [x] Planche route aligned to coach feedback
- [x] Front lever + dragon-flag support logic documented
- [x] Human flag route + readiness base documented
- [x] HSPU separated into balance / pressing / 90-degree transition routes
- [x] OAP side-specific pain and skill-vs-strength logic documented
- [x] Weighted street lifting split into maximal-strength vs loaded-endurance tracks
- [x] Dynamic effort made limiter-driven, not mandatory
- [x] CNS freshness translated to observable performance/recovery proxies
- [x] Add automated tests for planche, human flag, HSPU graph
- [ ] Verify/add all canonical eccentric and assisted skill variants in Exercise Library
- [ ] Full Iron Cross graph QA
- [ ] Full Muscle-Up graph expansion
- [ ] Maltese / Victorian / Manna family-specific graph QA

## Phase 6 — Cross-system QA

* DONE Automated exact-name audit between skill graph and 538-entry Exercise Library
* DONE Canonicalized seven simple naming/case mismatches without changing exercise meaning
* DONE Re-ran full automated suite after canonical cleanup: 25/25 passing
* IN PROGRESS Classify the 57 unresolved graph names into: existing library alias, valid new entry, or remove
* IN PROGRESS Detailed OAP / Iron Cross / Muscle-Up QA
* TODO Add a build-time integrity test that fails if an unapproved skill-graph name is introduced

## Phase 7 — Scheduling, dose and mobility cleanup

* DONE Canonical sport_schedule now drives both workload estimation and day-coupling validation
* DONE Athlete-specific available gym days added to intake and enforced server-side
* DONE Same-day sport/gym spacing collected and used in hard-collision logic
* DONE Legacy universal 48-hour sport/lifting prohibition removed from active rules
* DONE Conflicting one-progression-quality-only rules rewritten to allow compatible primary goals
* DONE Legacy density/static fixed percentage bands removed from active hard gates
* DONE Legacy tendon pain >=3/10 automatic eccentric/plyometric ban removed
* DONE Fixed-calendar deload statements in key active articles rewritten as readiness/calendar-triggered decisions
* DONE Mobility support is opt-in/goal-triggered, prioritizes usable range and does not inject generic stretching
* DONE Regression suite after scheduling changes: 26/26 passing

## Phase 11 — Deployment Candidate QA
- [x] Dynamic fatigue model: neural, local, trunk-load, systemic
- [x] Sport-week scheduling is first-class and same-day hard+hard is conditional, not forbidden
- [x] Volume landmarks converted from fixed universal bands to dynamic heuristics
- [x] Pain routing converted from numeric cutoffs to symptom/function/load-response logic
- [x] Mobility operational layer: task-specific, trigger-only, test/retest
- [x] Plyometrics/power operational layer
- [x] Exercise-order / neural-primer rule finalized
- [ ] Fresh live generation on Render after deploy
- [ ] Open generated XLSX in Excel + Google Sheets + iPhone/Numbers
- [ ] Full Hebrew wizard translation polish
- [ ] Resolve remaining skill-graph/library naming gaps
