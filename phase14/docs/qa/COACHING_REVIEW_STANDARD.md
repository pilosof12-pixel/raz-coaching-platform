# COACHING_REVIEW_STANDARD.md

Produced by the reviewing coach (a trained GPT project) in Phase 2, after
scoring three delivered programs in Phase 1. This file is the reference standard
the engine is measured against. It is the coach's content; the machine-evaluable
part is encoded in `engine/coach_standard.js`.

**Verified on arrival:** the dimension weights below reproduce all three Phase 1
overall scores exactly (8.2300 -> 8.2, 7.6380 -> 7.6, 8.9290 -> 8.9).
Subtracting the finding costs from 10 does not (error 0.15 / 0.80 / 0.15). The
weighted dimension model is the scoring method; finding costs are severity
markers that set a dimension's score, and must not be subtracted again.

## Dimensions

The program type selects the dimension set. Do not use all dimensions for every
athlete. A finding cost is an audit severity marker, not a second subtraction.
The overall score comes from the weighted dimension scores, then any automatic
cap is applied.

### Weightlifting / competition lift program

Use when all are true: `sport` is Olympic weightlifting or the primary goals are
named competition barbell lifts; at least one primary goal is a target Snatch or
Clean and Jerk load; the program contains at least two weekly exposures to one
of those lifts.

| Dimension | Weight | Definition |
|---|---:|---|
| Competition lift specificity and exercise selection | 30% | Whether exercises directly train the stated competition lifts and their named maintenance qualities rather than replacing them with generic assistance. |
| Loading progression and heavy lift exposure | 25% | Whether competition lift intensity progresses toward the required precompetition zone without turning the build block into a max out. |
| Fatigue management and weekly organization | 20% | Whether session placement, set volume and support work preserve technical quality across the week. |
| Athlete specific modification and constraint handling | 15% | Whether known symptoms, pain free alternatives, available equipment and stated priorities alter exercise selection correctly. |
| Execution rules and autoregulation | 10% | Whether the program states observable conditions for holding load, stopping sets, reducing volume or repeating a week. |

SOFT. Phase 1 evidence: Program 1. Source hierarchy: Articles 1-102 for general
coaching logic, Simmons *Special Strength Development for All Sports* for
special strength and Olympic pull selection, then the exercise library.

### Tactical endurance / run and ruck program

Use when all are true: the primary goal is a timed running or endurance
performance; at least one secondary goal is a ruck, pull up, strength or
tactical outcome; strength is not the primary performance outcome.

| Dimension | Weight | Definition |
|---|---:|---|
| Primary goal specificity and endurance prescription | 32% | Whether weekly running volume, quality work and pace exposure directly move the primary endurance performance. |
| Progression and overload logic | 20% | Whether pace, duration, distance, repetitions or load progress across the block when the goal is improvement rather than maintenance. |
| Concurrent training and weekly fatigue structure | 20% | Whether running, rucking and strength are arranged without unnecessary same tissue clustering. |
| Secondary goal integration | 10% | Whether rucking, pull ups and strength maintenance receive direct work without taking priority from the primary running goal. |
| Athlete specific constraint management | 10% | Whether previous impact sensitivity and current tolerated workload alter progression. |
| Execution rules and autoregulation | 8% | Whether the athlete receives objective stop, repeat and regression rules. |

SOFT. Phase 1 evidence: Program 2. Source hierarchy: Endurance / Conditioning
Knowledge Cluster, then Articles 1-102 for fatigue and progression logic, then
the exercise library.

### Combat fight camp program

Use when all are true: `event_type` is combat; the competition occurs within
four weeks; the athlete performs at least five sport sessions per week; the
stated goal is freshness, sharpness, maintenance or competition readiness rather
than building new gym qualities.

| Dimension | Weight | Definition |
|---|---:|---|
| Fight camp specificity and priority hierarchy | 15% | Whether combat preparation remains the first claimant on recovery and gym work remains subordinate. |
| Fatigue management and sport integration | 20% | Whether gym volume and exercise cost fit the actual sport schedule and decrease as the event approaches. |
| Strength and power maintenance prescription | 35% | Whether existing strength and power are maintained through the lowest useful direct dose rather than replaced by exercises with weaker transfer. |
| Injury and symptom modification | 10% | Whether movements known to worsen symptoms are removed and replaced with the closest tolerated high value option. |
| Taper and competition week design | 12% | Whether contact, gym volume and nonessential work decrease into fight week while speed exposure remains. |
| Execution rules and autoregulation | 8% | Whether poor sleep, weight cutting, sport session changes, speed loss or symptom changes trigger explicit modifications. |

SOFT. Phase 1 evidence: Program 3. Source hierarchy: Articles 52-102 (combat
stress cost, competition week, readiness layers), then Mujika for taper logic,
then Articles 1-52 for general strength maintenance.

### Universal dimension

**Execution rules and autoregulation appears in every program type.** Satisfied
when the program contains observable decision rules, such as: stop after the
first technically degraded repetition; reduce one set when RPE exceeds a stated
cap; repeat the previous week when symptoms exceed baseline; do not progress
load unless the prior week stayed within the stated RPE and technique target;
skip optional work when competition week recovery is poor.

"Adjust if fatigued" does not satisfy it, because a machine cannot determine
when the adjustment should occur. SOFT. All three programs were praised here.

## Score bands

**9.5+** — all of: every primary goal has direct weekly exposure; every named
maintenance benchmark that is relevant and symptom tolerant has at least one
direct or mechanically close exposure per week; improvement goals progress at
least one relevant variable unless the block is explicitly a taper or
maintenance block; no unsupported athlete facts; no description contradicting
the tables; no optional accessory without a stated goal, named constraint or
identified technical problem; flexible scheduling used to avoid unnecessary
clustering; competition week does not stack redundant primers; injury
substitutions preserve the closest available training quality before dropping to
a less specific low cost exercise; every major progression has a regression or
stop rule.

**9.0-9.4** — correct goal hierarchy; direct exposure to all primary goals; no
movement prescribed against a reported symptom pattern; progression toward the
target or an explicit maintenance rationale; a weekly structure within the
intake's recovery capacity; a taper when the event is in the block; explicit
execution rules. May still contain one material defect in the 0.15-0.40 range: a
less specific pain free maintenance lift when a better benchmarked option
exists; one unnecessary accessory pair; one avoidable competition week exposure;
an unstated assumption about a sport schedule. Anchor: Program 3 at 8.9 would
move to ~9.3 after replacing Hip Thrust with Trap Bar Deadlift.

**8.0-8.9** — correct overall structure while one or more stated qualities stay
undertrained. Phase 1 examples: competition lifts trained often but a named
pulling maintenance quality gets no Olympic pull; intensity progresses but does
not reach the intended intensification range; accessories individually
defensible but collectively spending recovery that could go to more specific
work; five sessions in five consecutive days despite flexible availability;
fight camp architecture correct but the lower body maintenance exercise less
specific than a pain free benchmarked option. Anchors: Programs 1 and 3.

**7.0-7.9** — good exercise choices and sound autoregulation while the primary
goal prescription itself is incomplete. Phase 1 examples: tolerated endurance
volume reduced and not rebuilt; interval pace materially below target direction
through the end of the block; goal specific ruck distance reduced despite
tolerance; a secondary improvement lift unchanged for four weeks; lower body
loading clustered across consecutive days despite flexible scheduling and
relevant impact history. Anchor: Program 2.

**Below 7.0** — not observed in Phase 1. Place a program here when at least one
occurs and no cap already produces a lower score: the primary goal has no direct
weekly exposure; the program repeatedly increases a maintenance quality while
the primary goal gets less than baseline; a symptom producing movement continues
despite a listed tolerated alternative; an event occurs inside the block but
build volume continues through competition week; the program cannot be executed
inside the stated available days or session duration without omitting priority
work.

## Automatic caps

Applied after the weighted score. If more than one applies, use the lowest.

| Cap | Trigger | Value |
|---|---|---:|
| Symptom reproduction ignored — HARD | Intake says a movement produces pain, soreness or next day stiffness; the symptom is active; the program prescribes it at working intensity; and the intake lists at least one symptom free alternative for the same broad quality. | 6.0 |
| Primary competition or performance goal omitted — HARD | A primary goal is a specific measurable movement or event and the block contains zero direct exposures to it. Snatch goal with no Snatch; 3 km goal with no running; fight camp with no sport specific training retained. | 6.5 |
| Competition week treated as a build week — HARD | Event in Week 4 and Week 4 has equal or greater total gym work sets than Week 3 with no intake supported reason. | 7.0 |
| ...with hard contact the program controls, when the goal is to arrive fresh | | 6.5 |
| Available day violation — HARD | `available_gym_days` is explicitly provided and the program places mandatory gym training on another day. | 7.0 |

All four are **not yet observed**. Program 1's missing pull does not trigger the
second, because pulling strength was a maintenance goal, not a primary one.

## Deduction table

Severity markers used when assigning dimension scores. Do not subtract again.

| Defect type | Typical | Range | Phase 1 findings |
|---|---:|---:|---|
| Goal relevant benchmarked movement receives no direct or sufficiently specific exposure | 0.48 | 0.40-0.55 | P1 F1, P3 F1 |
| Progression fails to approach required intensity or pace | 0.38 | 0.35-0.40 | P1 F2, P2 F2 |
| Tolerated baseline training volume reduced and not rebuilt | 0.50 | 0.50 | P2 F1 |
| Goal specific distance reduced despite established tolerance | 0.25 | 0.25 | P2 F3 |
| Avoidable consecutive day clustering with flexible availability | 0.20 | 0.20 | P1 F3, P2 F4 |
| Accessory redundancy or low marginal return | 0.18 | 0.15-0.20 | P1 F4, P3 F3 |
| Contingency creates an unintended duplicate exposure | 0.15 | 0.15 | P1 F5 |
| Program text contradicts its own table or schedule | 0.08 | 0.05-0.10 | P1 F6, P3 F5 |
| Program asserts an athlete fact not present in intake | 0.10 | 0.10 | P1 F7 |
| Improvement goal unchanged for all four weeks without a reason | 0.15 | 0.15 | P2 F5 |
| Intake field interpretation changes structure without being stated | 0.10 | 0.10 | P2 F6 |
| Redundant competition week neural or technical exposure | 0.20 | 0.20 | P3 F2 |
| Program silently changes the athlete's sport schedule | 0.15 | 0.15 | P3 F4 |

Anything else is **not yet observed** and belongs in Judgement, not rules.

## Exposure rules

**When a movement in `current_numbers` must appear.** Not automatic. Required
when ALL are true: the athlete is advanced or has at least three years of
training; the movement directly serves a primary, secondary or maintenance goal;
the movement is currently tolerated or a mechanically close tolerated variation
exists; and the quality is not intentionally being removed during competition
week. SOFT.

Phase 1 basis: Snatch Pull benchmarked and pulling was a maintenance goal, so
its absence was penalised. Trap Bar Deadlift benchmarked and pain free, so
replacing all direct heavy lower body strength with Hip Thrust was penalised.
Weighted Pull up benchmarked with pull up improvement secondary, so the pull up
family required direct work. Back Squat in Program 3 was benchmarked but
reproduced symptoms, so it was not required.

**Exact movement versus family.** For a **primary competition lift** the exact
movement must appear — a Snatch goal requires Snatch, a 3 km goal requires
running. SOFT, unless zero direct exposure triggers the cap.

For a **maintenance quality** the exact movement is not mandatory if another
satisfies all of: same primary force or movement quality; same sport relevant
loading direction or motor pattern to a reasonable degree; no greater symptom
cost; no greater recovery cost conflicting with the primary goal; and it is
closer to the original quality than another available tolerated benchmarked
option. SOFT.

So Program 1 did not require the exact Snatch Pull — a Clean Pull would have
satisfied pulling maintenance better than Hip Thrust plus rows. Program 3 did
not require Back Squat, but Trap Bar Deadlift was preferred over Hip Thrust
because it maintained a higher force loaded lower body pattern and was
explicitly pain free.

**Maintenance exposure frequency (advanced athlete).** At least 1 direct
exposure per week; at least 2 work sets or at least 4 total work repetitions for
a heavy strength movement; working RPE 6-8 unless in competition week; and, when
the exact movement is used, external load normally at least **75%** of the
benchmark load. SOFT.

Supporting: proposed Trap Bar 2x2 @ ~145-155 kg against a 190 kg x 3 benchmark;
Program 2's Weighted Pull up at +22.5 kg was 75% of +30 kg and was not penalised
for being too light; Program 1's Back Squat maintenance stayed at one or two
work sets. The 75% figure is a Phase 2 codification, not a physiological law.

**Primary Olympic lifting exposure frequency.** Advanced lifter, build or
prepeak block: Snatch at least 3x/week; Clean and Jerk at least 3x/week; at
least one exposure per week heavier than the others; the three need not share
set and rep structure. SOFT. Program 1 was praised for exactly this.

**Pull up improvement exposure frequency.** At least 2 direct pull up family
exposures per week; one may be weighted strength, one bodyweight volume. Rows do
not replace both. SOFT.

**Injury replacement order** (most specific first):
1. exact movement with a symptom eliminating setup change, if the intake says
   that version is tolerated
2. benchmarked movement from `current_numbers` that trains the same broad
   strength quality and is explicitly symptom free
3. unbenchmarked exercise from the same movement family, explicitly symptom free
4. lower cost general strength exercise preserving the main force quality
5. isolation or generic assistance work

Do not move to level 4 if a level 2 option exists and fits the recovery budget.
SOFT. This is the rule that produces Trap Bar Deadlift before Hip Thrust.

## Progression rules

**Running goal pace.** `goal_speed = goal_distance / goal_time`;
`interval_speed_percentage = interval_speed / goal_speed x 100`. In a four week
improvement block starting at demonstrated repeatable capacity: Week 1 may
remain at demonstrated capacity; by **Week 3** at least one quality session
contains work at **95%** or more of goal speed; by **Week 4**, **97%** or more.
Does not apply when symptoms, failed repetitions or a taper require repeating
the previous successful week. SOFT.

Program 2's goal pace was 4:00/km and the prescription stayed ~4:08-4:12/km
through Week 4. Codification from Program 2, not a universal running rule.

**Advanced weightlifting intensification.** Prepeak specificity block ending ~5
weeks before an A priority meet. By Week 3: at least one Snatch exposure at
88-90% of current demonstrated max; at least one Clean and Jerk exposure at
89-90%; only if the previous week's relevant exposure stayed inside the
technique and RPE cap. Repeated 90% work is not needed. SOFT. Program 1 topped
at 86% and 87%.

Where Simmons would imply more aggressive special strength use than the article
framework, the article framework governs, because the athlete is peaking for the
competition lifts rather than running a general conjugate cycle.

**Identical weeks.** Acceptable when ALL: the quality is explicitly labelled
maintenance; the primary goal lies elsewhere; the work stays below the stated
RPE cap; the block is not intended to improve that quality.

A defect when ALL: the quality is a primary or secondary improvement goal; the
athlete completes the work below the RPE cap; no symptom, taper or schedule
limitation is given; and load, reps, sets, duration and density all remain
unchanged for at least three consecutive weeks. Typical cost 0.15. Phase 1
basis: Program 2's Weighted Pull up, +22.5 kg 3x4 for four weeks against a +30
kg x 5 benchmark and a stated pull up goal.

**Session duration capped but ruck distance cannot grow.** If ruck load is goal
specific and already tolerated, duration is fixed, and more distance would
exceed it: keep load fixed, keep duration fixed, progress pace, and do not raise
load and pace together. SOFT.

**Tolerated baseline volume reduction.** A new block may initially reduce
running volume when a new interval demand is introduced. Relative to the lower
end of the tolerated baseline: Week 1 may sit up to **30%** below; Week 2 no
more than **20%** below; Week 3 no more than **10%** below; Week 4 may reduce
again only when intentionally an expression or taper week.

If the program stays more than 20% below baseline for two consecutive non taper
weeks without symptoms or another stated reason, deduct ~0.25-0.50 depending on
the primary goal. SOFT. Phase 2 codification, not a source quoted universal
limit.

## Scheduling rules

**Consecutive general training days (flexible availability).** For a five
session advanced weightlifting week: no more than **3** consecutive lifting days
unless the intake gives a logistical reason; if five sessions fit across six or
seven days, place at least one non lifting day before the final three session
sequence. SOFT.

**Consecutive same tissue loading days.** For an athlete with a documented
previous impact related lower leg problem, a day counts as lower leg loading
when it includes at least one of: running for 20 minutes or more; running
intervals; loaded rucking for 45 minutes or more; lower body resistance training
with at least one working set at RPE 6.5 or higher.

No more than **2** consecutive lower leg loading days when availability is
flexible. If three are unavoidable, one must be reduced below these thresholds.
SOFT. Tied to this athlete's shin history, not universal.

**Adjacent duplicate exposure created by a contingency.** If a substitution rule
creates the same main lift on two consecutive days and that second exposure was
not already planned, do not make the substitution; use omission or a
non competing substitute. Typical cost 0.15. SOFT.

## Claims and consistency

**Athlete facts.** A program may assert an athlete specific fact only when it is
explicitly in the intake, mathematically derivable from intake data, or
explicitly labelled as an assumption requiring confirmation. It may not convert
an unstated fact into a definite statement. Example: "routine 4 kg cut" with no
cut in the intake. Cost 0.10. SOFT.

**Program self description.** Every quantitative statement about the program
must match the actual tables. Check at minimum: weekly total work sets; number
of training days; number of direct goal exposures; whether volume rises, falls
or stays unchanged; whether sport sessions are hard, moderate, technical or
light; whether the program says an exercise was removed when it remains in the
table. If the text says support volume decreases in Week 2 and the set count is
identical, the wording must specify redistribution rather than total volume
reduction. Cost 0.05-0.10. SOFT.

**Changing the athlete's external sport schedule.** Allowed only when the change
is explicitly identified as a required recommendation rather than an existing
fact; the original intake schedule is named; and the program states what gym
adjustment occurs if the sport coach does not make the change. Otherwise ~0.15.
SOFT.

**Intake ambiguity.** If one intake field conflicts with another, the program
must state which interpretation governs — e.g. `days_per_week: 3` plus notes
saying the athlete can train across five calendar days. Cost 0.10. SOFT.

## Conflict resolution

In priority order:

1. **Active symptom constraint over exact lift specificity** (HARD before SOFT).
2. **Primary sport or competition goal over secondary gym progress.**
3. **Event freshness over progressive overload.**
4. **Direct goal exposure over generic assistance** — Olympic pull before a
   third or fourth row; direct pull up before extra horizontal pulling; Trap Bar
   Deadlift before Hip Thrust when maintaining benchmarked lower body strength.
5. **Tolerated established workload over unnecessary conservatism** — a
   temporary reduction is acceptable but must rebuild unless symptoms appear.
6. **Recovery spacing over calendar neatness.**
7. **Accessories lose before primary or maintenance work** — remove repeated
   trunk work, then redundant rows, then low marginal return assistance, then
   reduce direct maintenance volume; protect primary goal exposure last.

## Context modifiers

**Training age.** For advanced athletes (or 3+ years): expect direct goal
specificity, benchmark referenced loading, differentiated exposures, and less
tolerance for generic substitutions when a specific option exists. All three
Phase 1 athletes were advanced; novice and intermediate are **not yet
observed**.

**Injury history and active symptoms.** Active symptoms with a tolerated
alternative — use the replacement order. Previous history but currently
asymptomatic — retain the activity, progress one major stress variable at a
time, and use next day baseline as a progression gate where the intake gives
one. Program 2's shin history did not justify removing running, because 18-20 km
and one weekly ruck were currently tolerated.

**Event proximity.** 5-8 weeks away with no competition in the block: continue
build or intensification, do not taper prematurely, and advanced competition
lift work should approach the upper intensification range by Week 3. Event
inside Week 4: Week 4 is competition week, total gym work must decrease from
Week 3, progressive overload no longer governs, optional work may be removed
entirely, and sport contact should decrease if the program has authority to
recommend it.

**Concurrent goals.** Order goals exactly as the intake orders them. Primary
gets first claim on placement, direct exposure, and progression unless tapering.
Secondary gets direct exposure when feasible and progression only if it does not
compromise primary work. Maintenance gets a minimum direct dose and no weekly
progression requirement.

**Available days.** Flexible — scheduling efficiency is scored. Limited — do not
penalise clustering that cannot be moved.

**Equipment.** Do not penalise the absence of an exercise when the equipment is
unavailable. When it is available, prefer the more specific tolerated option.
Program 3 had a trap bar, so Hip Thrust could not be defended as the only knee
tolerant option.

**Weight cut.** Modifies training only when stated in the intake. For a
difficult final week cut: do not add conditioning to accelerate it; suspend
progressive overload; shorten competition week gym work; make Day -1 work
optional or integrate it into sport activation; poor sleep or poor cut response
can cancel the primer. If the cut is not stated, the program cannot invent one.

## What I do not score

1. **Number of different exercises by itself.** Four rows are not better than
   two if they serve the same function.
2. **Accessory complexity.** Pallof Press, Side Plank, Dead Bug and rows earn
   nothing for making a program look complete.
3. **Military or tactical appearance.** No credit for circuits, punishment work,
   loaded running or arbitrary suffering.
4. **Higher total volume.** Program 3 improved as gym volume fell.
5. **Exercise novelty**, where rotation reduces direct goal exposure.
6. **Equal progression of every quality.** Maintenance goals need not progress.
7. **Maximal intensity.** Program 1 was criticised for not reaching ~89-90%, not
   for failing to reach 95-100%.
8. **Symmetry between training days.** Differentiated exposures were praised.

## Judgement, not rules

Cannot yet be encoded reliably from three programs:

1. **Whether an exercise is mechanically "close enough."** The replacement order
   is checkable; deciding whether Clean Pull is close enough to Snatch Pull is
   not. Do not build a universal equivalence table from these reviews.
2. **Whether an accessory has enough marginal return.** The checkable part is
   redundancy and goal relevance; the final marginal value judgement is not.
3. **Exact optimal interval progression.** The 95% / 97% rules are a
   codification from Program 2, not proof for every runner.
4. **Exact optimal maintenance intensity.** The 75% rule is practical, not
   universal.
5. **Whether three consecutive technical sessions are actually excessive.**
6. **Whether a fight camp primer improves performance.** Program 3's primer was
   criticised for possible duplication, not for existing.
7. **Whether one row or two rows are optimal.**
8. **How much improvement should occur in four weeks.** The standard scores
   direction, not predicted outcome.

## The 9-to-9.5 gap

A program does not reach 9.5 by avoiding obvious mistakes. The gap is unresolved
opportunity cost. Program 3 scored 8.9; the Trap Bar change was worth ~+0.4 to
9.3, leaving ~0.2 more to 9.5.

1. **The replacement hierarchy is fully exhausted before a less specific
   exercise is used.** Back Squat causes symptoms; Trap Bar Deadlift is pain
   free and benchmarked at 190x3; the goal is maintaining existing strength;
   therefore Trap Bar receives the minimal direct exposure. It would not settle
   for Hip Thrust merely because Hip Thrust costs less fatigue. Worth ~0.40.
2. **Day -1 contains one primer source, not two.** "If MMA technical work
   already contains fast pad work, reactive movement, explosive entries or
   another short neural stimulus, that is the primer. Do not also perform the
   gym primer." Worth 0.20.
3. **Every accessory remaining in late camp is tied to a specific requirement.**
   Ask: does it maintain a stated goal, address a named constraint, replace a
   more costly necessary movement, or preserve a quality MMA does not already
   supply? If all four are no, remove it. Worth 0.15.
4. **The program distinguishes athlete schedule from recommended schedule.**
   State the current session, the required recommendation, and the fallback if
   the sport coach does not make the change. Worth 0.15.
5. **Every note matches the actual camp table.** Worth 0.05.
6. **No recovery expenditure without a stated return.** Every remaining gym item
   must directly maintain benchmarked strength, preserve explosive output,
   preserve a movement used in competition, or solve a stated symptom or
   tolerance problem. This is why a 9.5 program can contain fewer exercises than
   an 8.9 one.
7. **The final four weeks are internally conditional, not merely prewritten.**
   If hard contact remains at two sessions in Week 3, reduce gym further. If
   sleep falls below baseline during the cut, cancel optional Day -1 work. If
   knee stiffness exceeds usual next day baseline, remove the unilateral knee
   dominant exposure. If sport work supplies the planned speed stimulus, do not
   duplicate it. If the athlete already feels sharp in fight week, preserve that
   state rather than adding work.

The difference between 9.0 and 9.5 is not more advanced programming. It is fewer
unresolved mismatches between intake, goal hierarchy, exercise selection, weekly
schedule, competition proximity, symptom information, and the program's own
written explanation.

## Where I was inconsistent

**Program 1: earlier 9.2 versus current 8.2.** The standard tightened. The
earlier 9.2 was too generous if that version had the same substantive structure.
The current review treats three things more strictly: a named maintenance
benchmark with no specific exposure; failure to reach the intended prepeak
intensification range; and opportunity cost from generic assistance. **9.2 is
not preserved as a valid anchor for future scoring.** The Phase 1 score of 8.2
stands.

**Finding costs for future reviews.** Phase 1 costs all stand as recorded.

| Finding | Phase 1 | Future range | Note |
|---|---:|---|---|
| P1 F1 missing direct Olympic pull | 0.55 | 0.45-0.55 | keep 0.55 when the goal is named, benchmarked, equipped and unexposed |
| P1 F2 no 89-90% exposure | 0.35 | 0.25-0.35 | still ~5 weeks out and already at 86-87% |
| P2 F1 volume reduced, not rebuilt | 0.50 | 0.40-0.50 | no material change |
| P2 F2 intervals below target | 0.40 | 0.30-0.40 | thresholds replace "must reach goal pace" |
| P2 F4 three consecutive lower body days | 0.20 | 0.10-0.20 | 0.20 requires three qualifying days; lighter cases 0.10-0.15 |
| P3 F1 Hip Thrust instead of Trap Bar | 0.40 | 0.35-0.40 | still the largest flaw in Program 3 |

**Arithmetic inconsistency in Phase 1.** The finding costs do not reproduce the
overall scores: P1 1.65 -> 8.35 vs 8.2; P2 1.60 -> 8.40 vs 7.6; P3 0.95 -> 9.05
vs 8.9. Phase 1 used the costs as local severity estimates while the overall
score came from the dimension assessment. Encoding both as separate arithmetic
deductions would double count.

**The governing scoring method:**
1. select the program type
2. score the defined dimensions
3. apply the listed weights
4. use the Deduction table to calibrate how strongly each finding lowers the
   relevant dimension
5. do not subtract those finding costs again from the weighted score
6. apply Automatic caps last
