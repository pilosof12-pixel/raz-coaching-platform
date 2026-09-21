# The standard has five archetypes; the engine serves nine

This is the largest gap between what the engine builds and what it can judge, and
it is not a rule or a repair. It is that `selectProgramType` has five typed models
and falls through to `unclassified` for everyone else.

An unclassified athlete has no dimension weights, so their program is scored on
borrowed ones — which is exactly how the first HYROX block came back at 7.3
before you gave the multi-component weights.

## Measured, after fixing one of our own bugs

The corpus was routing every MMA program to `unclassified` because the offline
intake omitted `event_type: 'combat'` while production sets it. Four programs
were being graded against no model at all, and the combat weights you gave us
were never once used offline. That is fixed. Current state of 26 delivered
programs:

| model | programs | has weights |
|---|---|---|
| tactical_endurance | 7 | yes |
| weightlifting | 6 | yes |
| combat_camp | 4 | yes |
| in_season_team_sport | 4 | yes |
| hybrid_multi_component_event | 1 | yes |
| **unclassified** | **4** | **no** |

The four unclassified are the advanced hybrid athlete — one of the three original
avatars, which you scored 7.9 — and a new calisthenics athlete built to stress
the engine.

## What we need from you

**A skill-acquisition and relative-strength model.** The athlete is an advanced
calisthenics trainee with two primary goals that compete directly:

- strict ring muscle-up for 5 reps — a skill
- weighted pull-up with 40 kg for 3 — maximal strength
- both are bent-arm pulling, sharing one recovery budget
- straddle planche and freestanding handstand push-up are secondary, straight-arm,
  and his left elbow objects specifically to high-volume straight-arm work on
  consecutive days
- advanced tuck front lever is maintenance and should read identically across the
  four weeks
- calisthenics park only: a belt to 50 kg and bands, no barbell or machine

The same model would cover the youth gymnast, who has been unclassified since the
beginning.

What are the dimensions and weights, and do they sum to 1? For reference, the
five you have given so far carry six dimensions each except weightlifting, which
has five.

**A general strength and hypertrophy model**, for the advanced hybrid athlete and
the Hebrew-speaking lifter. Neither has an event; both have named strength goals
and a maintenance list.

**A guided return model**, or confirmation that tactical endurance is right for
it. The masters rower returning from a disc injury currently routes to
`tactical_endurance`, which was built for a timed run with a strength secondary.
It reaches a reasonable answer but for reasons that have nothing to do with a
graded return, and the postpartum runner is the same shape.

## Why this blocks the score

We can keep finding and repairing defects, and that has taken the HYROX block
from 7.3 to 8.3. But an athlete whose scoring model does not exist cannot be
reliably improved toward 9, because the number being improved is measured against
someone else's priorities. Two of the three avatars this project started with are
in that position.
