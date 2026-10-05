// Machina browser extension: logic shared by the service worker and the popup.
//
// Plain script (no modules) so it loads the same way everywhere: the service
// worker pulls it in with importScripts(), the popup with a <script> tag, and
// the Node test harness with vm. It touches no browser API at load time.
//
// House rule: no em dashes in any string a user reads.

(function (root) {
  "use strict";

  // The API origin share_ingest lives on (Firebase Hosting rewrite). The only
  // host this extension holds a permission for.
  const API_ORIGIN = "https://secondbrain-app-94da2.web.app";
  // The Machina web app. Links a person should land on go here.
  const WEB_URL = "https://mymachina.app";
  const CONNECT_URL = WEB_URL + "/?connect=extension";
  const UPGRADE_URL = WEB_URL + "/?paywall=saves";
  const LIBRARY_URL = WEB_URL + "/";

  // Same shape the server accepts (functions/main.py _INGEST_TOKEN_RE).
  const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

  // The only hosts that may ever hand this extension a token. The manifest's
  // externally_connectable list decides which of these are live in a given
  // build (the store package drops localhost); this list stops a manifest edit
  // alone from widening it.
  const CONNECT_HOSTS = ["mymachina.app", "localhost", "127.0.0.1"];

  const SAVE_TIMEOUT_MS = 20000;

  function cleanToken(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function looksLikeToken(value) {
    return TOKEN_RE.test(cleanToken(value));
  }

  // ── Which pages can be saved ──────────────────────────────────────────────
  // Machina saves a page by its web address; the server fetches it. So any
  // http(s) address works (a PDF on the web, a store listing), and anything
  // without one cannot be saved, whatever the browser shows.
  function classifyUrl(url) {
    if (!url || typeof url !== "string") return { ok: false, reason: "missing" };
    let scheme = "";
    try {
      scheme = new URL(url).protocol;
    } catch (_) {
      return { ok: false, reason: "other" };
    }
    if (scheme === "http:" || scheme === "https:") return { ok: true };
    if (scheme === "file:") return { ok: false, reason: "file" };
    if (/^(chrome|edge|brave|opera|vivaldi|about|chrome-search|chrome-untrusted|devtools|view-source|safari|favorites):$/.test(scheme)) {
      return { ok: false, reason: "browser" };
    }
    if (/^(chrome-extension|moz-extension|safari-web-extension|extension):$/.test(scheme)) {
      return { ok: false, reason: "extension" };
    }
    return { ok: false, reason: "other" };
  }

  const RESTRICTED_COPY = {
    missing: "Machina can't see this tab's address. Open a web page and try again.",
    browser: "Browser pages can't be saved. Open a web page and try again.",
    file: "Files on your computer can't be saved. Open the page from the web instead.",
    extension: "This page belongs to an extension, so it can't be saved.",
    other: "This page has no web address to save.",
  };

  // The server's own words, when it sent any, cleaned for one line. Strings a
  // user reads here never carry em dashes, so the server's become commas.
  const EM_DASH_RE = new RegExp("\\s*" + String.fromCharCode(0x2014) + "\\s*", "g");
  function serverText(body, key) {
    const raw = body && typeof body[key || "error"] === "string" ? body[key || "error"].trim() : "";
    return raw ? raw.replace(EM_DASH_RE, ", ") : "";
  }

  // ── What a save result means to the person ────────────────────────────────
  // `result` is { ok, status, body, error?, reason? } from the service worker.
  // Returns { state, title, detail, action } where action is one of
  // "", "retry", "connect", "upgrade", "open". Rules:
  //   - "Saved" only when the server said it has the page. Never on a guess.
  //   - A save kept past the monthly limit (200 + waiting) is a success, but it
  //     reads as "saved for later", not as done and not as an error.
  //   - An HTTP status means the server was reached: say what it said.
  function describeResult(result, opts) {
    const r = result || {};
    const body = r.body && typeof r.body === "object" ? r.body : null;
    const withNote = !!(opts && opts.withNote);
    const out = (state, title, detail, action) => ({ state, title, detail: detail || "", action: action || "" });

    if (r.error === "no-token") {
      return out("notoken", "Connect Machina first", "Connect this browser to your Machina account to start saving.", "connect");
    }
    if (r.error === "bad-url") {
      return out("restricted", "Can't save this page", RESTRICTED_COPY[r.reason] || RESTRICTED_COPY.other);
    }
    if (r.error === "offline") {
      return out("offline", "You're offline", "Connect to the internet and try again.", "retry");
    }
    if (r.error === "timeout") {
      return out("timeout", "No answer from Machina", "It may still have saved. Check your library before trying again.", "open");
    }
    if (!r.status) {
      return out("offline", "Couldn't reach Machina", "Check your connection and try again.", "retry");
    }

    if (r.ok) {
      if (!body) {
        return out("unknown", "Not sure it saved", "Machina sent an answer this extension doesn't understand. Check your library.", "open");
      }
      if (body.waiting === true) {
        const upgrade = body.upgrade === true;
        const detail = serverText(body, "message") ||
          (upgrade ? "Saved. Machina will read it on the 1st, or now with Pro." : "Saved. Machina will read it on the 1st.");
        return out("waiting", "Saved for later", detail, upgrade ? "upgrade" : "open");
      }
      if (body.duplicate === true) {
        return out("duplicate", "Already in your library", "You saved this page before.", "open");
      }
      if (body.success === true && (body.queued === true || body.saved === true || body.id)) {
        const detail = serverText(body, "message") ||
          (withNote
            ? "Saved with your selection. Machina is reading it now."
            : "Machina is reading it now. It will be in your library in a moment.");
        return out("saved", "Saved to Machina", detail, "open");
      }
      return out("unknown", "Not sure it saved", "Machina sent an answer this extension doesn't understand. Check your library.", "open");
    }

    const status = r.status;
    if (status === 401 || status === 403) {
      return out("auth", "Reconnect Machina", "This browser's connection was reset or no longer works. Reconnect to keep saving.", "connect");
    }
    if (status === 429) {
      // A monthly quota answer (older servers refused saves past the limit).
      if (body && body.kind) {
        const said = serverText(body);
        const detail = (said ? said.replace(/[.!]?$/, ". ") : "") + "This page was not saved.";
        return out("limit", "Monthly limit reached", detail, body.upgrade === true ? "upgrade" : "");
      }
      return out("rate", "Too many saves", "Wait a minute, then try again.", "retry");
    }
    if (status === 413) return out("error", "Too large to save", "This page is too large for Machina.");
    if (status === 400) return out("error", "Can't save this page", serverText(body) || "Machina couldn't use this address.");
    if (status >= 500) return out("busy", "Machina hit a problem", "Try again in a moment.", "retry");
    return out("error", "Couldn't save", (serverText(body) || "Something went wrong") + ` (${status}).`, "retry");
  }

  // Badge text and color per state. Neutral like the app; red only for a
  // failure that needs the person.
  const BADGES = {
    saved: { text: "✓", color: "#22222A" },
    duplicate: { text: "✓", color: "#6B7280" },
    waiting: { text: "✓", color: "#8A6A12" },
  };
  function badgeFor(state) {
    return BADGES[state] || { text: "!", color: "#DC2626" };
  }

  // ── Who may hand over a token ─────────────────────────────────────────────
  // Origins from manifest match patterns ("https://mymachina.app/*").
  function connectOriginsFromMatches(matches) {
    const out = [];
    for (const m of matches || []) {
      const hit = /^(https?):\/\/([^/:*]+)(?::\d+)?\/\*?$/.exec(String(m));
      if (!hit) continue;
      const host = hit[2].toLowerCase();
      if (!CONNECT_HOSTS.includes(host)) continue;
      out.push({ scheme: hit[1] + ":", host });
    }
    return out;
  }

  // True only for the top frame of the web app's root page on an allowed
  // origin. The public share pages (/s, /c) render other people's content on
  // the same hosts, so a path check keeps them out even if one of them were
  // ever to run script.
  function isTrustedConnectSender(sender, allowed) {
    if (!sender || typeof sender.url !== "string") return false;
    let u;
    try {
      u = new URL(sender.url);
    } catch (_) {
      return false;
    }
    if (sender.origin && sender.origin !== u.origin) return false;
    if (typeof sender.frameId === "number" && sender.frameId !== 0) return false;
    if (u.pathname !== "/") return false;
    const host = u.hostname.toLowerCase();
    return (allowed || []).some((a) => {
      if (a.scheme !== u.protocol || a.host !== host) return false;
      // Local development servers run on any port; the real site never does.
      if (a.scheme === "https:") return u.port === "";
      return a.host === "localhost" || a.host === "127.0.0.1";
    });
  }

  // A short, one-way tag of a token, so the web app can tell whether this
  // browser is connected to the account it has open without ever reading the
  // token back. Same function as web/lib/extension.ts.
  async function tokenTag(token, subtle) {
    const s = subtle || (root.crypto && root.crypto.subtle);
    if (!token || !s) return null;
    const bytes = new TextEncoder().encode("machina-ext:" + token);
    const digest = new Uint8Array(await s.digest("SHA-256", bytes));
    return Array.from(digest.slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (_) {
      return "";
    }
  }

  function shorten(text, max) {
    const t = (text || "").replace(/\s+/g, " ").trim();
    const m = max || 80;
    return t.length > m ? t.slice(0, m - 1) + "…" : t;
  }

  root.MachinaShared = {
    API_ORIGIN,
    WEB_URL,
    CONNECT_URL,
    UPGRADE_URL,
    LIBRARY_URL,
    SAVE_TIMEOUT_MS,
    CONNECT_HOSTS,
    cleanToken,
    looksLikeToken,
    classifyUrl,
    describeResult,
    badgeFor,
    connectOriginsFromMatches,
    isTrustedConnectSender,
    tokenTag,
    hostOf,
    shorten,
  };
})(typeof self !== "undefined" ? self : globalThis);
