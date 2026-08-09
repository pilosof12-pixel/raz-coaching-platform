#!/usr/bin/env python3
import json, urllib.request, re, time

BASE = "http://localhost:8000"

# 4 diverse NON-AVATAR clients across goal classes.
CLIENTS = {
  "powerlifter_deadlift": {
    "primary_goal": "200 kg conventional deadlift (currently 170 kg)",
    "secondary_goal": "keep bench around bodyweight",
    "experience": "advanced", "days": "4", "session_length": "75",
    "bodyweight": "92 kg", "equipment": "full commercial gym",
    "current_numbers": "DL 170x1, squat 160x3, bench 95x5",
    "injuries": "none", "sport_load": "none", "notes": "wants a strength block, no conditioning priority",
  },
  "runner_10k": {
    "primary_goal": "sub-45 minute 10k (current 49 min)",
    "secondary_goal": "maintain general strength",
    "experience": "intermediate", "days": "5", "session_length": "60",
    "bodyweight": "70 kg", "equipment": "treadmill, dumbbells, pull-up bar",
    "current_numbers": "10k in 49:00, runs 3x/week",
    "injuries": "mild shin splints when mileage jumps", "sport_load": "running 3x/week",
    "notes": "endurance is the priority, do not over-fatigue legs with heavy lifting",
  },
  "hypertrophy_upper": {
    "primary_goal": "add visible upper-body muscle (chest, back, arms)",
    "secondary_goal": "general fitness",
    "experience": "intermediate", "days": "4", "session_length": "60",
    "bodyweight": "75 kg", "equipment": "full gym",
    "current_numbers": "bench 70x8, row 60x10, OHP 45x8",
    "injuries": "none", "sport_load": "none", "notes": "aesthetics focus, fine with higher reps",
  },
  "return_from_shoulder": {
    "primary_goal": "rebuild pressing strength after a shoulder strain (cleared by physio)",
    "secondary_goal": "get back to full push-ups",
    "experience": "intermediate", "days": "3", "session_length": "45",
    "bodyweight": "80 kg", "equipment": "dumbbells, bands, bench",
    "current_numbers": "can do 5 incline push-ups pain-free, no overhead yet",
    "injuries": "right shoulder strain 6 weeks ago, cleared for light loading, still cautious overhead",
    "sport_load": "none", "notes": "ease back in, avoid anything that aggravates the shoulder",
  },
}

# Forbidden client-facing leaks (internal labels) — exclude legitimate exercise/cue false positives.
LEAK_PATTERNS = [
  (r"\bArt\.?\s*\d+", "article number"),
  (r"\bMEV\b", "MEV"), (r"\bMAV\b", "MAV"), (r"\bMRV\b", "MRV"),
  (r"\bSQS\b","SQS"), (r"\bEVU\b","EVU"), (r"\bLTOS\b","LTOS"), (r"\bVCS\b","VCS"),
  (r"\bCFS\b","CFS"), (r"\bTSC\b","TSC"), (r"\bSD_week\b","SD_week"),
  (r"\bT[1-4]\b","training tier"),
  (r"% of max", "%-of-max"), (r"\bpercent of max", "%-of-max"),
  (r"(?<![A-Za-z])Deload(?![A-Za-z])", "deload label"),
  (r"\bResensiti", "resensitization label"),
  (r"\bPush\s*\(week", "training-state"),
  (r"\bMaintain\s*\(week", "training-state"),
  (r"\bModule\s*\d", "module ref"),
  (r"Spinal Debt", "spinal debt label"),
  (r"\bovercoming isometric", None),  # allowed term actually; keep informational
]
OWNER = [r"210\s?kg", r"brachioradialis", r"de la riva", r"172\s?cm"]

def post(path, body):
    req = urllib.request.Request(BASE+path, data=json.dumps(body).encode(),
        headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())

def scan(name, prog):
    issues = []
    for pat, label in LEAK_PATTERNS:
        if label is None: continue
        m = re.search(pat, prog, re.IGNORECASE)
        if m: issues.append(f"{label}:'{m.group(0)}'")
    for pat in OWNER:
        if re.search(pat, prog, re.IGNORECASE):
            issues.append(f"OWNER-LEAK:{pat}")
    checks = {
      "has_tsv": "START_WEEK1_TSV" in prog and "END_WEEK1_TSV" in prog,
      "nonempty": len(prog) > 800,
      "has_rpe_or_rir": bool(re.search(r"\bRPE\b|\bRIR\b", prog)),
    }
    return issues, checks

results = {}
for name, intake in CLIENTS.items():
    t0 = time.time()
    try:
        resp = post("/api/build", {"intake": intake})
    except Exception as e:
        results[name] = {"error": str(e)}; print(name, "ERROR", e); continue
    prog = resp.get("program","")
    issues, checks = scan(name, prog)
    open(f"/tmp/stress_{name}.txt","w").write(prog)
    results[name] = {"token": resp.get("token"), "len": len(prog),
                     "leaks": issues, "checks": checks, "secs": round(time.time()-t0,1)}
    print(f"=== {name} === {round(time.time()-t0,1)}s len={len(prog)} leaks={issues} checks={checks}")

open("/tmp/stress_results.json","w").write(json.dumps(results, indent=2))
print("\nSaved /tmp/stress_results.json")
