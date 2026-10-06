// Machina browser extension: one-click connect, page side.
//
// Runs only on the Machina web app (see content_scripts in manifest.json). The
// web app asks with window.postMessage; this script relays to the service
// worker and posts the answer back. It works the same in Chrome, Edge, Brave
// and Safari, and needs no extension id.
//
// Only messages from this very window and this very origin are relayed, and
// answers go back to this origin only. The service worker re-checks the page
// address (root page of an allowed origin, top frame) before it trusts
// anything, checks a token with the server before storing it, and never sends
// a token back: the page gets a short one-way tag instead.

(function () {
  "use strict";
  if (window.top !== window) return;

  const api = typeof browser !== "undefined" && browser.runtime ? browser : chrome;
  const FROM_PAGE = "machina-web";
  const FROM_EXT = "machina-extension";
  const TYPES = {
    "machina-ping": "web-ping",
    "machina-connect": "web-connect",
    "machina-disconnect": "web-disconnect",
  };

  function post(payload) {
    window.postMessage(Object.assign({ source: FROM_EXT }, payload), window.location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object" || msg.source !== FROM_PAGE) return;
    if (typeof msg.id !== "string" || msg.id.length > 64 || !TYPES[msg.type]) return;

    const forward = { type: TYPES[msg.type] };
    if (msg.type === "machina-connect") {
      forward.token = typeof msg.token === "string" ? msg.token : "";
      forward.account = typeof msg.account === "string" ? msg.account : "";
    }
    if (msg.type === "machina-disconnect") {
      forward.tokenTag = typeof msg.tokenTag === "string" ? msg.tokenTag.slice(0, 64) : "";
    }
    try {
      api.runtime.sendMessage(forward, (resp) => {
        const failed = api.runtime.lastError || !resp;
        post({ id: msg.id, type: msg.type, reply: failed ? { ok: false, reason: "unavailable" } : resp });
      });
    } catch (_) {
      // The extension was reloaded or removed under this page.
      post({ id: msg.id, type: msg.type, reply: { ok: false, reason: "unavailable" } });
    }
  });

  // Tell an already-open Settings screen that the extension is here now.
  post({ type: "machina-ready" });
})();
