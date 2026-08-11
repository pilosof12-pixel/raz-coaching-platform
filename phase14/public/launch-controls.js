(() => {
  const rawFetch = window.fetch.bind(window);
  let config = { enforced: false, access_days: 56, adjustments: 6 };

  function el(tag, attrs = {}, text = "") {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "for") n.htmlFor = v;
      else n.setAttribute(k, v);
    }
    if (text) n.textContent = text;
    return n;
  }

  function installControls() {
    const build = document.getElementById("build-btn");
    if (!build) return;
    const holder = build.parentElement;

    if (!document.getElementById("launch-privacy-consent")) {
      const box = el("div", { class: "launch-privacy-box" });
      const p = el("p", {}, "Your intake and program are stored so you can return and make adjustments. Health and injury information is used only to tailor training. ");
      const link = el("a", { href: "/privacy.html", target: "_blank", rel: "noopener" }, "Privacy Policy");
      p.appendChild(link); box.appendChild(p);
      const label = el("label", { class: "launch-consent-row", for: "launch-privacy-consent" });
      const cb = el("input", { type: "checkbox", id: "launch-privacy-consent" });
      label.appendChild(cb); label.appendChild(document.createTextNode(" I consent to the processing of the health, injury and training information I choose to provide for generating and adjusting my program."));
      box.appendChild(label); holder.parentElement.insertBefore(box, holder);
    }

    if (config.enforced && !document.getElementById("launch-pass-code")) {
      const wrap = el("div", { class: "launch-pass-box" });
      wrap.appendChild(el("label", { for: "launch-pass-code" }, "Program Pass code"));
      wrap.appendChild(el("input", { id: "launch-pass-code", type: "text", maxlength: "32", autocomplete: "off", spellcheck: "false", placeholder: "Paste the code from your purchase" }));
      wrap.appendChild(el("div", { class: "launch-help" }, `One pass includes one 4-week block, ${config.access_days} days of access and up to ${config.adjustments} substantive adjustments.`));
      holder.parentElement.insertBefore(wrap, holder);
    }

    const program = document.getElementById("program-card");
    if (program && !document.getElementById("launch-delete-data")) {
      const dz = el("div", { class: "launch-danger" });
      dz.appendChild(el("strong", {}, "Delete my stored coaching data"));
      dz.appendChild(el("p", {}, "Permanently deletes the saved intake, program, history, usage and jobs for this personal code. Your Program Pass entitlement is not reset."));
      const b = el("button", { id: "launch-delete-data", type: "button", class: "btn launch-danger-btn" }, "Delete my data");
      b.addEventListener("click", async () => {
        const token = (document.getElementById("token-display")?.textContent || document.getElementById("return-token")?.value || "").trim();
        if (!/^[a-f0-9]{32}$/i.test(token)) return alert("Load your program first.");
        if (!confirm("Permanently delete this saved coaching data? This cannot be undone.")) return;
        const r = await rawFetch("/api/client-data", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token}) });
        if (r.ok) { alert("Your stored coaching data was deleted."); location.reload(); }
        else { const j = await r.json().catch(()=>({})); alert(j.error || "Could not delete the saved data."); }
      });
      dz.appendChild(b); program.appendChild(dz);
    }
  }

  function record(event) {
    rawFetch("/api/analytics-event", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({event}), keepalive:true }).catch(()=>{});
  }

  window.fetch = async function(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();
    let nextInit = init;

    if (url.includes("/api/build") && method === "POST" && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        const checked = document.getElementById("launch-privacy-consent")?.checked === true;
        if (checked && body.intake) body.intake.privacy_consent = { health_data:true, policy_version:"2026-08-11", consented_at:new Date().toISOString() };
        if (config.enforced) body.pass_code = (document.getElementById("launch-pass-code")?.value || "").trim();
        nextInit = { ...init, body: JSON.stringify(body) };
        record("build_started");
      } catch {}
    } else if (url.includes("/api/adjust") && method === "POST") record("adjust_started");

    const response = await rawFetch(input, nextInit);
    try {
      if (url.includes("/api/program/") && method === "GET") record(response.ok ? "return_succeeded" : "return_failed");
      if (url.includes("/api/set-language") && response.ok) record("language_switch_succeeded");
      if (url.includes("/api/job/") && response.ok) {
        const clone = response.clone();
        clone.json().then(j => {
          if (j?.status === "done") record("build_succeeded");
          else if (j?.status === "error") record("build_failed");
        }).catch(()=>{});
      }
    } catch {}
    return response;
  };

  document.addEventListener("click", (e) => {
    const id = String(e.target?.id || "").toLowerCase();
    if (id.includes("spreadsheet") || id.includes("xlsx") || id.includes("excel")) record("spreadsheet_downloaded");
  }, true);

  rawFetch("/api/program-pass-config").then(r => r.json()).then(j => { config = { ...config, ...j }; installControls(); }).catch(() => installControls());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installControls); else installControls();
  setTimeout(installControls, 500);
})();
