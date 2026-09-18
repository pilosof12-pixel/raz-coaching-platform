# Five questions on multi-component events

Context for the coach's project, following the HYROX review (run #116, scored 7.3).

Two of your seven findings on that block could not be encoded, because they need
something the engine does not have: a definition of what an event is *made of*.
Everything else from that review is now checked automatically and fires on the
programs it should.

What is already encoded from your reviews, so you do not have to repeat it:

- a benchmarked movement that serves a goal and appears nowhere in the block
- training days stacked beyond three in a row, including inside competition week
- a taper that cuts total volume while multiplying a quality (your 2 to 17 power
  sets finding)
- coaching language borrowed from another sport
- a prescription whose number survives the movement changing (the ski erg split)
- accessory redundancy, unanchored loads, taper volume and frequency bands

The questions below are the gap. Please answer them as **rules with numbers**
rather than as comments on that one program: anything expressed as a threshold,
a count, or a week can be turned into a check that runs on every program from
now on. Anything expressed as judgement stays judgement, which is fine, but say
which is which.

---

## 1. Component coverage

A HYROX race has eight stations. That block trained four of them and omitted
SkiErg, sled pull, farmers carry and wall balls. You charged 0.60.

- In an arrival block of four weeks, **how many** of an event's named components
  must appear at all?
- What is the **minimum dose** that counts as having trained one — a set count,
  a distance, a proportion of race load?
- **By which week** must each have appeared, and how often after that?
- Does a component the athlete has a benchmark for (the 1 km SkiErg at 3:38)
  carry a higher requirement than one they do not?

## 2. Compromised work

You charged 0.45 for almost no training of running immediately after a station.

- What defines a compromised exposure — is it any station-then-run pair, or does
  the station have to reach some intensity or duration first?
- **How many per week**, and starting in which week of a four-week arrival
  block?
- At what proportion of race pace should the run segment be held?
- Is the reverse (station after run) the same quality, or a different one?

## 3. Race rehearsal

Your INSTEAD described a specific session: four 1000 m runs alternating with
sled push, sled pull, burpee broad jump and an erg dose.

- What makes something a **near-competition rehearsal** rather than just a hard
  session — a fraction of race distance, a minimum number of transitions, or
  something else?
- How many belong in a four-week block, and in which weeks?
- How close to the event may the last one sit?

## 4. How far this generalises

The engine has no concept of an event having required components. Before it
gains one, it is worth knowing how wide the concept is.

- Does the same rule apply to a triathlon, a tactical selection test, a strongman
  medley, a CrossFit competition — any event with named components?
- Where an event has no defined components (a 3 km time trial, a powerlifting
  meet), does the rule simply not apply, or does it become something else?

## 5. The scoring model for this athlete

`selectProgramType()` recognises weightlifting, tactical endurance, combat camp
and in-season team sport. A hybrid racer is none of them, so there were no
dimension weights and the program was scored on borrowed tactical-endurance
weights. That scored 7.72 against your 7.3 and the dimensions lined up closely,
which is reassuring but is not the same as being right.

Your dimensions for that review were: HYROX event specificity, conditioning
progression and race preparation, strength maintenance and interference
management, taper and competition week design, athlete specific constraint
management, execution rules and autoregulation.

- What **weights** do those six carry, and do they sum to 1?
- Is that set specific to HYROX, or is it the set for any hybrid/multi-component
  event?

One note on where our scores differed most, in case it is informative: execution
rules, where I scored 7.0 and you scored 8.7. I marked down the frequent
"RPE-selected load"; you credited the Achilles autoregulation. If unanchored
accessory loads are not a meaningful deduction in a race-prep block, that is a
calibration error worth correcting at the source.
