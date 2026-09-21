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

## Run #130 makes the conflict arithmetic rather than a judgement call

The same athlete came back with competition week as Day -7, -6, -5, -4 and
Day -3, -2, -1 completely empty. That shape suggested an answer your review
does not ask for and your frequency rule does not forbid: keep all four
sessions and spread them, say Day -7, -6, -4, -3. Frequency stays at four, the
run of four breaks, and nothing is consolidated or removed.

Your INSTEAD rules it out. It ends at Day -4 and puts nothing closer to the
race, so a session may not move toward the event to break the run. With that
held, three of your rules close the window completely:

- competition-week frequency is at least four days (70% of five base days)
- the last session is Day -4 or earlier
- no more than three consecutive training days

Four sessions, no more than three in a row, all inside Day -7 to Day -4. That
window is four days wide, so four sessions fill it exactly and they are
necessarily consecutive. There is no legal layout. One of the three has to
give, and which one is yours to choose:

1. **Frequency.** Three sessions in competition week, as your INSTEAD shows. I
   scope the frequency floor to the taper week and ship the consolidation.
2. **The last session's position.** Four sessions, and one may sit at Day -3.
   I extend the spread repair into competition week with a floor at Day -3.
3. **The consecutive-day limit.** It does not apply in competition week, where
   sessions are short and race-specific. Your 0.20 was then about those
   particular sessions rather than the day count, and I encode nothing.

I am not guessing between these. Until you pick one the engine leaves
competition week alone, which is what it does today.
