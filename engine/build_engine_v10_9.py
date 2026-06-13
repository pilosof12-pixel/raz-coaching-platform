#!/usr/bin/env python3
"""Build the v10.9 engine system prompt = master rulebook (paste) + expanded knowledge layer.

The master paste is the operational rulebook (modes, gates, output contract, QA checks).
The expanded knowledge layer (the article-grounded depth distilled from all 102 articles)
is appended as INTERNAL REFERENCE the engine may draw on for deeper programming detail.
"""
import os

WS = "/home/user/workspace"
master = open(os.path.join(WS, "GEM_INSTRUCTIONS_v10.5_PASTE.txt"), encoding="utf-8").read().rstrip()
core   = open(os.path.join(WS, "coaching_logic_core.md"), encoding="utf-8").read().rstrip()

# Extract ONLY the expanded knowledge layer (everything from the EXPANDED divider onward),
# because the OS layer's concepts are already encoded as hard rules in the master paste.
marker = "# EXPANDED KNOWLEDGE LAYER (v10.9)"
idx = core.find(marker)
if idx == -1:
    raise SystemExit("ABORT: expanded-layer marker not found in coaching_logic_core.md")
# back up to the divider line start
div_start = core.rfind("# ===", 0, idx)
expanded = core[div_start:].rstrip()

# Privacy guard: refuse to embed any owner-personal token.
banned = ["210kg", "210 kg", "brachioradialis", "De La Riva", "de la riva", "razpilosof"]
low = expanded.lower()
for b in banned:
    if b.lower() in low:
        raise SystemExit(f"ABORT: owner-personal token '{b}' found in expanded layer")

bridge = (
    "\n\n\n"
    "=== INTERNAL REFERENCE KNOWLEDGE LAYER (v10.9) — READ-ONLY DEPTH ===\n"
    "The rules ABOVE are the operational contract: they govern what you DO, how you decide, what you "
    "OUTPUT, the client-output privacy contract, and the QA self-checks. They WIN on any conflict.\n"
    "The material BELOW is a dense internal reference distilled from the full coaching knowledge base. "
    "Use it to deepen programming decisions (exercise-specific progressions, tendon/connective-tissue "
    "loading, stress-cost & volume-threshold reasoning, nutrition logic, sport-specific adjustments, "
    "peaking/competition models, and ongoing-coaching triage). It is INTERNAL ONLY — never surface its "
    "labels, module names, formulas, article numbers, scores, %-of-max, or training-state names in any "
    "client-facing output. Every example in it is an illustration only and is governed by the "
    "GOAL-AGNOSTIC PRINCIPLE: never import an example movement, load, or goal into a client's program "
    "unless that client named it.\n"
    "=== END BRIDGE ===\n\n"
)

# Update the master header version label v10.8 -> v10.9 in the combined output only.
master_v109 = master.replace(
    "=== RAZ CLIENT-FACING COACHING GEM — MASTER INSTRUCTIONS V10.8 ===",
    "=== RAZ CLIENT-FACING COACHING GEM — MASTER INSTRUCTIONS V10.9 ===",
    1,
)

combined = master_v109 + bridge + expanded + "\n"
out = os.path.join(WS, "coaching_platform", "engine", "engine_instructions.txt")
open(out, "w", encoding="utf-8").write(combined)
print("wrote", out)
print("master chars:", len(master), "expanded chars:", len(expanded), "combined chars:", len(combined))
print("approx tokens:", len(combined)//4)
