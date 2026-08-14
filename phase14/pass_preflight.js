// Read-only Program Pass validation gate used before the intake wizard.
// This does not activate, consume, or mutate a pass. server_secure.js remains
// the authoritative enforcement layer when Build is submitted.

import express from "express";
import { makeEntitlementStore } from "./entitlements.js";

const PASS_RE = /^[a-f0-9]{32}$/i;
const PROGRAM_PASS_ENFORCEMENT = process.env.PROGRAM_PASS_ENFORCEMENT === "1";
const passStore = await makeEntitlementStore();

function expired(pass) {
  return !pass?.expires_at || Date.now() >= Number(pass.expires_at);
}

const previousListen = express.application.listen;
express.application.listen = function (...args) {
  if (!this.__programPassPreflightInstalled) {
    this.__programPassPreflightInstalled = true;

    this.post("/api/program-pass-check", async (req, res) => {
      try {
        if (!PROGRAM_PASS_ENFORCEMENT) {
          return res.json({ enforced: false, valid: true });
        }

        const passCode = String(req.body?.pass_code || "").trim();
        if (!PASS_RE.test(passCode)) {
          return res.status(403).json({ valid: false, error: "Enter the 32-character Program Pass code from your purchase." });
        }

        const pass = await passStore.getPass(passCode);
        if (!pass) {
          return res.status(403).json({ valid: false, error: "That Program Pass code is not valid." });
        }

        if (!pass.activated_token) {
          if (pass.status !== "issued") {
            return res.status(403).json({ valid: false, error: "That Program Pass is not available for activation." });
          }
          return res.json({ valid: true, state: "available" });
        }

        if (pass.status === "active" && !expired(pass) && !pass.initial_build_completed_at) {
          return res.json({ valid: true, state: "recoverable" });
        }

        if (expired(pass)) {
          return res.status(403).json({ valid: false, error: "That Program Pass has expired." });
        }

        return res.status(403).json({
          valid: false,
          error: "That Program Pass has already created its training block. Use your personal code to return to the program."
        });
      } catch (e) {
        console.error("program pass preflight failed:", e && e.message);
        return res.status(500).json({ valid: false, error: "Could not verify the Program Pass. Please try again." });
      }
    });
  }

  return previousListen.apply(this, args);
};

await import("./server_secure.js");
