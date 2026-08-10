// Security, privacy and commercial-access bootstrap for the existing server.
// It patches Express before server.js creates the app so launch hardening can remain
// isolated from the coaching engine while we validate the wrapper.

import express from "express";
import crypto from "node:crypto";
import { makeStorage } from "./storage.js";
import { makeEntitlementStore } from "./entitlements.js";

const TOKEN_RE = /^[a-f0-9]{32}$/i;
const JOB_RE = /^[a-f0-9]{32}$/i;
const PASS_RE = /^[a-f0-9]{32}$/i;
const NODE_ENV = process.env.NODE_ENV || "development";
const GENERATION_BUILDS_PER_HOUR = Number(process.env.GENERATION_BUILDS_PER_HOUR || 4);
const GENERATION_ADJUSTS_PER_HOUR = Number(process.env.GENERATION_ADJUSTS_PER_HOUR || 12);
const MAX_INTAKE_CHARS = Number(process.env.MAX_INTAKE_CHARS || 30000);
const MAX_FIELD_CHARS = Number(process.env.MAX_FIELD_CHARS || 5000);
const PROGRAM_PASS_ENFORCEMENT = process.env.PROGRAM_PASS_ENFORCEMENT === "1";
const PROGRAM_PASS_DAYS = Number(process.env.PROGRAM_PASS_DAYS || 56);
const PROGRAM_PASS_ADJUSTMENTS = Number(process.env.PROGRAM_PASS_ADJUSTMENTS || 6);
const ADMIN_PROVISION_KEY = process.env.ADMIN_PROVISION_KEY || "";

const privacyStore = await makeStorage();
const passStore = await makeEntitlementStore();
const counters = new Map();

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function rateKey(req, group) {
  return `${group}:${clientIp(req)}`;
}

function consumeHourly(req, group, max) {
  const key = rateKey(req, group);
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  let row = counters.get(key);
  if (!row || now - row.startedAt >= hour) {
    row = { startedAt: now, count: 0 };
    counters.set(key, row);
  }
  row.count += 1;
  return row.count <= max;
}

function tooLarge(value) {
  if (typeof value === "string") return value.length > MAX_FIELD_CHARS;
  if (Array.isArray(value)) return value.some(tooLarge);
  if (value && typeof value === "object") return Object.values(value).some(tooLarge);
  return false;
}

function validConsent(intake) {
  const c = intake?.privacy_consent;
  return Boolean(
    c && c.health_data === true &&
    typeof c.policy_version === "string" && c.policy_version.length > 0 &&
    typeof c.consented_at === "string" && !Number.isNaN(Date.parse(c.consented_at))
  );
}

function passExpired(pass) {
  return !pass || !pass.expires_at || Date.now() >= Number(pass.expires_at);
}

async function requireActivePassForToken(token) {
  const pass = await passStore.getPassForToken(token);
  if (!pass) return { error: "No active Program Pass is linked to this personal code.", status: 403 };
  if (pass.status !== "active" || passExpired(pass)) {
    return { error: "This Program Pass has expired. Purchase a new Program Pass to continue.", status: 403 };
  }
  return { pass };
}

async function guardProgramPass(req, res, next) {
  try {
    if (!PROGRAM_PASS_ENFORCEMENT) return next();

    if (req.method === "POST" && req.path === "/api/build") {
      let token = String(req.body?.token || "").trim();
      const passCode = String(req.body?.pass_code || "").trim();

      if (token) {
        const active = await requireActivePassForToken(token);
        if (active.error) return res.status(active.status).json({ error: active.error });
        if (active.pass.initial_build_completed_at) {
          return res.status(403).json({
            error: "This Program Pass has already created its training block. Use Adjust for changes, or purchase a new Program Pass for a completely new block.",
          });
        }
        // No successful first build has been recorded yet, so a failed/unfinished
        // generation can retry with the same token without consuming another pass.
        return next();
      }

      if (!PASS_RE.test(passCode)) {
        return res.status(403).json({ error: "Enter the Program Pass code from your purchase before building your program." });
      }
      const pass = await passStore.getPass(passCode);
      if (!pass) return res.status(403).json({ error: "That Program Pass code is not valid." });

      // Resilience: if activation already happened but the browser never received
      // the first 202 response (network/server failure), the same pass code can
      // recover its bound token until a successful initial block exists.
      if (pass.activated_token) {
        if (pass.status === "active" && !passExpired(pass) && !pass.initial_build_completed_at) {
          req.body.token = pass.activated_token;
          return next();
        }
        return res.status(403).json({
          error: "That Program Pass has already been activated. Use the personal code created with it to return to your program.",
        });
      }
      if (pass.status !== "issued") {
        return res.status(403).json({ error: "That Program Pass is not available for activation." });
      }

      token = crypto.randomBytes(16).toString("hex");
      await passStore.activatePass(passCode, token, Date.now(), PROGRAM_PASS_DAYS);
      req.body.token = token;
      return next();
    }

    const programMatch = req.path.match(/^\/api\/program\/([^/]+)$/);
    if (req.method === "GET" && programMatch) {
      const token = programMatch[1];
      const active = await requireActivePassForToken(token);
      if (active.error) return res.status(active.status).json({ error: active.error });
      return next();
    }

    if (req.method === "POST" && (req.path === "/api/adjust" || req.path === "/api/set-language")) {
      const token = String(req.body?.token || "").trim();
      const active = await requireActivePassForToken(token);
      if (active.error) return res.status(active.status).json({ error: active.error });

      if (req.path === "/api/adjust") {
        const used = Number(active.pass.adjustment_count || 0);
        const limit = Number(active.pass.adjustment_limit || PROGRAM_PASS_ADJUSTMENTS);
        if (used >= limit) {
          return res.status(403).json({
            error: `You've used all ${limit} included Program Pass adjustments. Purchase a new Program Pass for a new training block.`,
          });
        }
      }
      return next();
    }

    next();
  } catch (e) {
    console.error("program pass guard failed:", e && e.message);
    res.status(500).json({ error: "Could not verify Program Pass access. Please try again." });
  }
}

function securityMiddleware(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  );

  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
  }

  if (NODE_ENV === "production" && req.path === "/api/health") {
    const json = res.json.bind(res);
    res.json = () => json({ ok: true });
  }

  const bodyToken = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (bodyToken && !TOKEN_RE.test(bodyToken)) {
    return res.status(400).json({ error: "Invalid personal code." });
  }

  const programMatch = req.path.match(/^\/api\/program\/([^/]+)$/);
  if (programMatch && !TOKEN_RE.test(programMatch[1])) {
    return res.status(400).json({ error: "Invalid personal code." });
  }
  const jobMatch = req.path.match(/^\/api\/job\/([^/]+)$/);
  if (jobMatch && !JOB_RE.test(jobMatch[1])) {
    return res.status(400).json({ error: "Invalid job id." });
  }

  if (req.method === "POST" && req.path === "/api/build") {
    const intake = req.body?.intake;
    if (!intake || typeof intake !== "object") {
      return res.status(400).json({ error: "Missing intake." });
    }
    if (!validConsent(intake)) {
      return res.status(400).json({ error: "Privacy consent is required before program generation." });
    }
    let serialized = "";
    try { serialized = JSON.stringify(intake); } catch (_e) {}
    if (!serialized || serialized.length > MAX_INTAKE_CHARS || tooLarge(intake)) {
      return res.status(413).json({ error: "The intake contains too much text. Please shorten the entries and try again." });
    }
    if (!consumeHourly(req, "build", GENERATION_BUILDS_PER_HOUR)) {
      return res.status(429).json({ error: "Too many program generation requests from this connection. Please try again later." });
    }
  }

  if (req.method === "POST" && (req.path === "/api/adjust" || req.path === "/api/set-language")) {
    if (!consumeHourly(req, "adjust", GENERATION_ADJUSTS_PER_HOUR)) {
      return res.status(429).json({ error: "Too many adjustment requests from this connection. Please try again later." });
    }
    if (typeof req.body?.request === "string" && req.body.request.length > MAX_FIELD_CHARS) {
      return res.status(413).json({ error: "The adjustment request is too long." });
    }
  }

  return guardProgramPass(req, res, next);
}

const originalUse = express.application.use;
let middlewareInjected = false;
express.application.use = function (...args) {
  const result = originalUse.apply(this, args);
  if (!middlewareInjected) {
    middlewareInjected = true;
    originalUse.call(this, securityMiddleware);
  }
  return result;
};

const originalListen = express.application.listen;
express.application.listen = function (...args) {
  if (!this.__privacyRoutesInstalled) {
    this.__privacyRoutesInstalled = true;

    this.get("/api/program-pass-config", (_req, res) => {
      return res.json({
        enforced: PROGRAM_PASS_ENFORCEMENT,
        access_days: PROGRAM_PASS_DAYS,
        adjustments: PROGRAM_PASS_ADJUSTMENTS,
      });
    });

    this.post("/api/program-pass-status", async (req, res) => {
      try {
        const token = String(req.body?.token || "").trim();
        if (!TOKEN_RE.test(token)) return res.status(400).json({ error: "Invalid personal code." });
        const pass = await passStore.getPassForToken(token);
        if (!pass) return res.status(404).json({ error: "No Program Pass is linked to this code." });
        const used = Number(pass.adjustment_count || 0);
        const limit = Number(pass.adjustment_limit || PROGRAM_PASS_ADJUSTMENTS);
        return res.json({
          status: pass.status,
          expires_at: pass.expires_at,
          initial_build_completed: Boolean(pass.initial_build_completed_at),
          adjustments_used: used,
          adjustments_remaining: Math.max(0, limit - used),
          adjustment_limit: limit,
        });
      } catch (e) {
        console.error("program pass status failed:", e && e.message);
        return res.status(500).json({ error: "Could not load Program Pass status." });
      }
    });

    this.post("/api/admin/program-pass", async (req, res) => {
      try {
        if (!ADMIN_PROVISION_KEY || req.get("x-admin-provision-key") !== ADMIN_PROVISION_KEY) {
          return res.status(404).json({ error: "Not found." });
        }
        const count = Math.max(1, Math.min(20, Number(req.body?.count || 1)));
        const codes = [];
        for (let i = 0; i < count; i++) {
          const code = crypto.randomBytes(16).toString("hex");
          await passStore.issuePass(code, Date.now(), PROGRAM_PASS_ADJUSTMENTS);
          codes.push(code);
        }
        return res.json({ ok: true, codes, access_days: PROGRAM_PASS_DAYS, adjustments: PROGRAM_PASS_ADJUSTMENTS });
      } catch (e) {
        console.error("program pass provisioning failed:", e && e.message);
        return res.status(500).json({ error: "Could not issue Program Pass." });
      }
    });

    this.delete("/api/client-data", async (req, res) => {
      try {
        const token = String(req.body?.token || "").trim();
        if (!TOKEN_RE.test(token)) return res.status(400).json({ error: "Invalid personal code." });
        await privacyStore.deleteClientData(token);
        return res.json({ ok: true });
      } catch (e) {
        console.error("client data deletion failed:", e && e.message);
        return res.status(500).json({ error: "Could not delete the saved data." });
      }
    });
  }

  privacyStore.purgeExpiredOperationalData().catch((e) => {
    console.warn("retention cleanup failed:", e && e.message);
  });
  const cleanupTimer = setInterval(() => {
    privacyStore.purgeExpiredOperationalData().catch((e) => {
      console.warn("retention cleanup failed:", e && e.message);
    });
  }, 12 * 60 * 60 * 1000);
  cleanupTimer.unref?.();

  return originalListen.apply(this, args);
};

await import("./server.js");
