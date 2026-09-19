# Run #120: does the taper ship capped, and what does one fewer fighting repair cost?

Written before the run. Two predictions, one of which I got wrong last time and
want on the record either way.

## What changed since #119

One thing, and it is an ordering change rather than a new rule.
`repairTaperPowerSpike` moved from near the top of the v35 chain to immediately
before the competition-week budget, so it now runs after `repairBallisticShare`
instead of three hundred lines before it. Nothing else in the generation path
moved. The stress report, the severity ceilings and the corpus grader also
changed, and none of those three runs in production.

## Prediction 1: week 3 ships capped

**Week 3 carries at most 6 power sets, and the delivered program raises no
TAPER_INTRODUCES_POWER_VOLUME.**

This is the one I am confident about, because the interaction is reproduced in a
test that fires the real swap rather than asserting an order. The reconstructed
pre-swap fixture ends clean under the new ordering and dirty under the old.

What would falsify it: the finding appears again. That would mean a third
repair, one I have not found, also adds power volume after the cap -- and the
answer would be a late sweep rather than another single move.

## Prediction 2: attempts, which I got wrong last time

For #119 I predicted 1 attempt and roughly 250s, and got 3 and 638s. I do not
have a mechanism that explains the two extra calls, so I will not predict a
number I cannot justify. What I will commit to:

**Attempts will be 3 or fewer, and duration under 700s.**

That is deliberately weak. The taper cap and the ballistic swap were undoing
each other every build, and a repair that fights another repair can drive a
regeneration, so there is a reason this might improve. There is no reason it
must. If #120 comes back at 3 attempts again, the ordering fix was worth making
on its own merits and the attempt count has a separate cause I still have not
found -- and that becomes the next thing to chase, with instrumentation rather
than another guess.

## Prediction 3: nothing else regresses

**The delivered program raises no finding outside the known residual set**, and
specifically still covers all eight stations. The ordering change touches when a
repair runs, not what it does, so station coverage and the event-component rules
should be untouched. If coverage drops, the move had a side effect on the
repairs that spend accessory slots, and it comes back out.

## What I will report

Attempts, duration, week 3's power set count, station coverage, and every
finding on the delivered program graded against his standard -- including any
that contradicts the three predictions above.
