# Paste-ready: three things we need from the coach

Everything below is outstanding. The earlier five questions on multi-component
events were answered and are encoded; this does not repeat them.

---

## Message to paste

Three follow-ups, all of them about numbers rather than about one program. Each
one is currently either guessed or left blank in the engine, and I would rather
have your answer than my assumption.

**1. Your weights or your 7.3 — which is authoritative?**

You gave six dimensions and weights for a multi-component event:

| dimension | weight | your score |
|---|---|---|
| event specificity and component coverage | 0.30 | 6.4 |
| conditioning progression and race preparation | 0.20 | 7.1 |
| strength maintenance and interference | 0.15 | 8.5 |
| taper and competition week | 0.15 | 7.6 |
| athlete-specific constraints | 0.10 | 8.4 |
| execution rules and autoregulation | 0.10 | 8.7 |

Those weights against those scores give **7.4650**. You published **7.3**.

Your other four weight sets — weightlifting, tactical endurance, combat, youth —
reproduce your published scores to four decimal places. This is the only set
that does not. Three explanations, and they lead to different code:

- the weights are right and the 7.3 carries a separate holistic deduction of 0.165
- the 7.3 is right and the weights are approximate (reaching 7.3 needs about 0.07
  of weight moved off execution onto event specificity — roughly 0.37 and 0.03,
  and a 3% weight on execution rules seems unlikely to be what you meant)
- the 7.3 was the judgement and the dimension scores were reconstructed after it

We have recorded the discrepancy rather than tuning the weights to close it,
because fitting six weights to one observation would make us agree with you once
and mean nothing on the next program. Which of the three is it?

**2. Do the HYROX thresholds generalise?**

You flagged these as your codification rather than quoted rule:

- a component counts as trained at **25% of race dose**
- **50% of an event's named components** must appear by the end of week 1
- **two exposures** across weeks 1 to 3 for each named component

Two cases where I suspect they should not carry over unchanged:

- **An event with few components.** A duathlon, or a three-event strongman
  medley: "50% by week 1" means something very different, and 25% of race dose is
  reachable with a token set. Should there be a floor in absolute exposures
  rather than a proportion?
- **An event with a dominant component.** If 70% of race time is running, is
  running's 25% threshold the same as a sled pull's, or should the dose scale
  with the component's share of the race?

If these are HYROX numbers and should not generalise, say so and we will scope
them to HYROX and leave other events uncovered until you define them.

**3. Four findings with no price on them**

An audit found six rules that fire, report a defect, and deduct nothing. Two were
already yours and had simply never been wired up — accessory redundancy onto your
ACCESSORY_LOW_MARGINAL_RETURN at 0.18, and an unanchored load on an event
component onto the unanchored-load line at 0.15. Those are connected now.

These four have no line in your table. For each: does it deserve a deduction, and
how much? "Detection only, no deduction" is a perfectly good answer and will be
recorded as such.

- **The taper is compressed into the final week.** 4 of 26 programs. Volume drops,
  but only in the last week, so there is no progressive unload. Distinct from a
  taper that introduces a new emphasis, which you price at 0.45.
- **Recovery days below the minimum.** 4 of 26. Related to your avoidable
  consecutive-day clustering at 0.20, but not the same: a week can space its
  sessions properly and still leave too few full rest days.
- **A movement promised in the prose that never appears in the table.** 1 of 26.
  Arguably your text-contradicts-table at 0.08, but a broken promise about what
  the athlete will train may be worth more to you than a wording slip.
- **Heavy lower-body work within 48 hours of a speed session.** 1 of 26. An
  interference defect with no current line.

---

## Why these three and nothing else

Everything else he has told us is encoded and tested. These are the only places
where the engine is currently running on a number we invented or a blank.

## A four-week block whose event falls in week 3

The fight-camp athlete's bout is nineteen days out, so the competition week is
week 3 and week 4 sits entirely after it.

Two of your rules now disagree about what week 4 is. V91 says "anything after
the event is not part of this block", so the camp calendar renders week 4 as
nothing at all. The week table still prescribes five training days in it,
because the block is four weeks by construction. The gate refuses the build for
the disagreement, and it is right that they disagree -- I do not know which of
them should give.

Three readings, and this is a coaching call rather than an engineering one:

1. **Week 4 is a return-to-training week.** The athlete has just fought; the
   week is light, general, and explicitly post-fight. The calendar should say
   so instead of going blank, and V91 should permit it.
2. **Week 4 is not part of the block.** A camp ends at Day 0. The table should
   be emptied and the block delivered as three weeks plus the fight.
3. **The block should never have been four weeks.** An event nineteen days out
   gets a three-week camp, and the fourth week is an artefact of assuming every
   block is four weeks long.

Until you pick one the engine leaves it, which means this athlete's build is
refused. That is the honest state rather than a guess shipped quietly.

Fixed on the way to finding this, and not in question: the calendar was
prescribing MMA on fight day and the day after it, and was writing more hard
contact into fight week than into any other week of the camp -- the contact
target ran 2, 1, 0, then 3. The generator assumed the bout was always in week 4
and treated week 3 as an ordinary build week.
