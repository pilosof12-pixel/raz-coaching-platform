# Your finding 4 conflicts with your taper rule, and I could not resolve it

Reviewing run #124 you charged 0.20 for competition week carrying four straight
training days, and said there is no clear performance benefit to preserving them
when the same useful exposures can be consolidated into three.

I built that repair. It works: on run #124 and run #126 it dissolves Day -6 into
Day -7, keeps every prescription, and leaves Day -7, Day -5, Day -4 with a rest
day in the middle. `CONSECUTIVE_TRAINING_DAYS` clears.

It also immediately raises `TAPER_CUTS_FREQUENCY_NOT_VOLUME`, which is encoded
from your earlier guidance:

> Frequency is held through a taper more than volume is — the athlete keeps
> turning up, and the sessions get shorter.

That rule holds competition-week frequency at 70% of the athlete's base training
days. This athlete has five, so the floor is four days. Your review asks for
three. The two disagree, and the disagreement is exact rather than approximate.

So the repair declines. It checks whether consolidating would raise one of your
own findings and backs out when it would, which means on these programs it does
nothing at all — it fired on **0 of 26** corpus programs. I have removed it
rather than ship something that has never run, because dead code in a repair
chain is worse than an open question.

**What I need from you: which applies in competition week for a
multi-component race athlete?**

1. The frequency floor holds and four days is correct, in which case your 0.20 on
   run #124 was a judgement about those particular sessions rather than about the
   day count, and I should encode nothing.
2. Three days is correct for this athlete and the frequency floor is a taper-week
   rule that should not extend into competition week.
3. The floor should be computed against something other than base training days
   — for example against the taper week rather than the building weeks.

If it is 2, I will scope the frequency floor to the taper week and ship the
consolidation. If it is 1, the finding stays as a known residual and the engine
stops trying to fix it.

For reference, the shape your INSTEAD described was:

    Day -7  station rhythm
    Day -6  squat singles
    Day -5  off
    Day -4  short race feel primer

which is three sessions across four calendar days. The repair produced the same
count with the rest day one slot earlier, because it chose the interior day with
the least race-specific content rather than a fixed position.
