function authorized(req) {
  const expected = String(process.env.ADMIN_QA_KEY || "").trim();
  if (!expected) return false;
  const bearer = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const header = String(req.get("x-admin-key") || "").trim();
  return bearer === expected || header === expected;
}

function safeIntake(raw) {
  let value = raw;
  try { if (typeof value === "string") value = JSON.parse(value); } catch (_) {}
  if (!value || typeof value !== "object") return value;
  const blocked = /(^|_)(name|email|phone|mobile|address|contact|dob|birth)(_|$)/i;
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    return Object.fromEntries(Object.entries(v).filter(([k]) => !blocked.test(k)).map(([k,val]) => [k, walk(val)]));
  };
  return walk(value);
}

export function registerAdminQaRoutes(app, store) {
  app.get("/api/admin/qa/recent", async (req, res) => {
    if (!authorized(req)) return res.status(401).json({ ok:false, error:"unauthorized" });
    if (!store?.listRecentClients) return res.status(501).json({ ok:false, error:"recent-client listing unavailable" });
    try {
      const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
      const rows = await store.listRecentClients(limit);
      res.json({
        ok:true,
        count:rows.length,
        clients:rows.map((row) => ({
          client_code: row.token,
          intake: safeIntake(row.intake),
          program: row.program || "",
          created_at: row.created_at,
          updated_at: row.updated_at
        }))
      });
    } catch (err) {
      console.error("admin QA recent failed:", err);
      res.status(500).json({ ok:false, error:"qa review unavailable" });
    }
  });
}
