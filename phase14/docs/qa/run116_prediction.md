# Run #116 — dual_event_hyrox, prediction written before the program existed

Written at 2026-09-18T12:33Z, after the run was triggered and before any output
came back. The point of writing it first is that it can be wrong.

## What this run is for

The coach's standard is encoded in `engine/coach_standard.js` (his weights) and
`engine/coach_rules.js` (his findings). It reproduces all six scores he has
given to four decimal places, and 24 of the 27 findings he made. What it has
never done is grade a program he has not already seen.

So: a first-time avatar, graded here from the encoding, and graded independently
by the coach's own ChatGPT project. If the two land close, the encoding is
carrying his judgement rather than memorising his six answers.

## A limitation to state before the numbers, not after

`selectProgramType()` returns `unclassified` for this athlete. The coach has
scored weightlifting, tactical endurance, combat camp and in-season team sport,
and a hybrid racer is none of them. There are no dimension weights for it, and
`weightedScore()` deliberately returns nothing rather than a partial sum.

I will therefore score it against the **tactical_endurance** weights and say so
plainly. That set is the nearest honest fit -- its largest dimensions are
primary goal specificity, progression and overload, and concurrent training
structure, and concurrent training is what a Hyrox block is. But the weights are
borrowed, and if my score and the coach's diverge, this is the first place to
look before concluding anything about the rules.

## Prediction

### Should be clean, because a repair now guarantees it

- **BENCHMARK_UNEXPOSED.** The maintenance goal names squat and pulling
  strength and the intake carries Back Squat 150 kg and Deadlift 190 kg. Both
  must appear in every week. This is the defect the coach charges most (0.55 /
  0.40) and the one the briefs never fixed; if it appears here, the repair did
  not reach this avatar.
- **CONSECUTIVE_TRAINING_DAYS.** Four days a week, flexible availability, no
  fixed gym days. No run longer than three days.
- **Race week untouched by both repairs.** The Hyrox is in week 4, so week 4 is
  race week. Neither repair may add load to it or move its days.

### Where I expect the findings to be

1. **Station specificity.** Hyrox is eight stations, and the intake lists the
   equipment for all of them: sled, ski erg, rower, wall ball, sandbags. A block
   that trains running and general strength without sled push/pull, wall balls,
   burpee broad jumps, farmers carry and sandbag lunges has not trained the
   event. This is my highest-probability finding and the most expensive one --
   `PRIMARY_GOAL_OMITTED` caps the program at 6.5.
2. **The ski erg benchmark.** 1 km in 3:38 is a number the athlete gave us for
   a station they will race. I expect it trained and progressed; I would be
   unsurprised to find it absent.
3. **The B race.** The half marathon is two weeks after Hyrox and outside this
   block. The intake asks for it to be *named* and *not programmed*. Both
   failure directions are live: silence about it, or a block that quietly tries
   to peak for both.
4. **The achilles.** "Grumbles after back-to-back running days; settles with a
   day off." Running on consecutive days is a symptom-reproduction issue, and
   `CONSECUTIVE_LOWER_LEG_DAYS` should catch it if it happens.
5. **Taper shape.** Week 4 as a genuine race week, not a build week with the
   volume trimmed. `COMPETITION_WEEK_IS_A_BUILD_WEEK` caps at 7.0.

### The number

I expect **7.5 to 8.5** on borrowed tactical-endurance weights, with station
specificity as the deciding dimension. Below 7.5 would mean the block is a
generic hybrid program; above 8.5 would mean it actually trained the race.

A wrong prediction here is worth more than a right one. If the coach's project
scores it more than about 0.6 away from mine, the encoding is reproducing his
six answers rather than his reasoning, and the next job is finding which
dimension the gap sits in.
