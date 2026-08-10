// Program Pass checkout handoff.
// A verified payment redirect should use a URL fragment, not a query string:
//   /#pass=<32-char-personal-code>
// Fragments are not sent to the server or in HTTP referrers. We remove it from
// browser history immediately and inject it only into the first /api/build call.
(function () {
  const TOKEN_RE = /^[a-f0-9]{32}$/i;
  const hash = String(window.location.hash || "");
  const match = hash.match(/(?:^#|[&#])pass=([a-f0-9]{32})(?:&|$)/i);
  let checkoutPass = match && TOKEN_RE.test(match[1]) ? match[1] : "";

  if (checkoutPass && window.history && window.history.replaceState) {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }

  window.__programPassFromCheckout = checkoutPass;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input && input.url;
      if (checkoutPass && url && String(url).includes("/api/build") && init && typeof init.body === "string") {
        const payload = JSON.parse(init.body);
        if (payload && !payload.token) {
          payload.token = checkoutPass;
          init = { ...init, body: JSON.stringify(payload) };
          // The app will receive and retain the same token from the build response.
          checkoutPass = "";
          window.__programPassFromCheckout = "";
        }
      }
    } catch (_e) {
      // Never break the app if a non-JSON fetch passes through this wrapper.
    }
    return nativeFetch(input, init);
  };
})();
