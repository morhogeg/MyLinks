// Machina browser extension: service worker.
//
// Every save goes through saveUrl() here, whichever way it started: the
// toolbar popup, the keyboard shortcut (which opens the popup), or a right
// click. The popup shows the result itself. A right click, or a popup closed
// before the answer came back, gets a system notification instead, or, where
// there are no notifications (Safari), a small toast on the page. A badge on
// the toolbar icon mirrors the result for a few seconds either way.
//
// It also answers the Machina web app's one-click connect, relayed by the
// connect.js content script.
//
// Every API that some browser lacks is feature-detected, so a missing one
// (contextMenus on iOS Safari, notifications on Safari) never throws at the
// top level and takes the worker down with it.

importScripts("shared.js");

const S = self.MachinaShared;
const api = typeof browser !== "undefined" && browser.runtime ? browser : chrome;

const MENU_PAGE = "machina-save-page";
const MENU_LINK = "machina-save-link";
const MENU_SELECTION = "machina-save-selection";
const NOTIF_ID = "machina-save";
const BADGE_RESET_MS = 4000;
const OK_STATES = ["saved", "duplicate", "waiting"];

const has = (obj, path) => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) !== undefined;

// ── Settings ────────────────────────────────────────────────────────────────

async function getSettings() {
  const { token = "", baseUrl = "" } = await api.storage.local.get(["token", "baseUrl"]);
  return {
    token: S.cleanToken(token),
    baseUrl: (baseUrl || "").trim().replace(/\/+$/, "") || S.API_ORIGIN,
  };
}

// ── Badge ───────────────────────────────────────────────────────────────────
// Safari ignores the badge color (webkit.org/b/267662), so the glyph alone
// has to tell success from failure: a check, or "!".

let badgeTimer = null;
async function showBadge(state) {
  const { text, color } = S.badgeFor(state);
  try {
    await api.action.setBadgeBackgroundColor({ color });
    if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ color: "#FFFFFF" });
    await api.action.setBadgeText({ text });
    if (badgeTimer) clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      api.action.setBadgeText({ text: "" }).catch(() => {});
    }, BADGE_RESET_MS);
  } catch (_) {
    // The action can be mid-teardown; the notification or popup still says it.
  }
}

// ── Telling the person (no popup open) ──────────────────────────────────────

const ACTION_URL = () => ({ upgrade: S.UPGRADE_URL, connect: S.CONNECT_URL, open: S.LIBRARY_URL });
const ACTION_TEXT = { upgrade: "Get Pro", connect: "Connect", open: "Open Machina" };

// A system notification. What a click does is kept in storage.session, so it
// still works after the worker has been suspended between toast and click.
async function systemNotify(view) {
  try {
    await api.storage.session.set({ notifAction: view.action || "" });
  } catch (_) {
    // No session storage (very old Chromium): the click just does nothing.
  }
  const opts = {
    type: "basic",
    iconUrl: api.runtime.getURL("icons/icon128.png"),
    title: view.title,
    message: view.detail || "",
    priority: 0,
  };
  if (view.action === "upgrade" || view.action === "connect") opts.buttons = [{ title: ACTION_TEXT[view.action] }];
  await api.notifications.create(NOTIF_ID, opts);
}

// Drawn into the page by scripting.executeScript, so it must be self-contained
// (it is serialized, not closed over). Inline styles only: a page's CSP can
// block a <style> element but not CSSOM writes. Text goes in as text.
function machinaToast(view, link) {
  const HOST_ID = "machina-extension-toast";
  const old = document.getElementById(HOST_ID);
  if (old) old.remove();
  const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  const set = (el, css) => { Object.assign(el.style, css); return el; };
  set(host, { all: "initial", position: "fixed", top: "16px", right: "16px", zIndex: "2147483647" });
  const box = set(document.createElement("div"), {
    width: "300px", boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px",
    font: "13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    background: dark ? "#1b1b20" : "#ffffff", color: dark ? "#e8e8ec" : "#111827",
    border: "1px solid " + (dark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.10)"),
    boxShadow: "0 12px 32px -8px rgba(0,0,0,.35)", direction: "ltr", textAlign: "left",
  });
  box.setAttribute("role", "status");
  const title = set(document.createElement("div"), { fontWeight: "650", fontSize: "14px", paddingRight: "20px" });
  title.textContent = (view.ok ? "✓ " : "! ") + view.title;
  if (!view.ok) title.style.color = dark ? "#f87171" : "#b91c1c";
  box.appendChild(title);
  if (view.detail) {
    const detail = set(document.createElement("div"), { marginTop: "3px", color: dark ? "#a8a8b3" : "#4b5563" });
    detail.textContent = view.detail;
    box.appendChild(detail);
  }
  if (link && link.url) {
    const a = set(document.createElement("a"), {
      display: "inline-block", marginTop: "8px", fontWeight: "600", color: "inherit", textDecoration: "underline",
    });
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = link.text;
    box.appendChild(a);
  }
  const close = set(document.createElement("button"), {
    position: "absolute", top: "8px", right: "8px", width: "24px", height: "24px", border: "0",
    background: "transparent", color: "inherit", cursor: "pointer", fontSize: "16px", lineHeight: "24px",
  });
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", () => host.remove());
  set(box, { position: "relative" });
  box.appendChild(close);
  root.appendChild(box);
  (document.body || document.documentElement).appendChild(host);
  setTimeout(() => host.remove(), 8000);
}

async function pageToast(view, tabId) {
  if (!tabId || !has(api, "scripting.executeScript")) return false;
  const url = ACTION_URL()[view.action];
  try {
    await api.scripting.executeScript({
      target: { tabId },
      func: machinaToast,
      args: [
        { ok: OK_STATES.includes(view.state), title: view.title, detail: view.detail || "" },
        url ? { url, text: ACTION_TEXT[view.action] } : null,
      ],
    });
    return true;
  } catch (_) {
    // No access to that tab (a browser page, or access not granted).
    return false;
  }
}

// System notification where there is one (Chrome, Edge, Brave); otherwise a
// toast on the page (Safari). The badge has already fired either way.
async function notify(view, tabId) {
  if (has(api, "notifications.create")) {
    try {
      await systemNotify(view);
      return;
    } catch (_) {
      // Fall through to the page toast.
    }
  }
  await pageToast(view, tabId);
}

async function runNotifAction(id) {
  if (id !== NOTIF_ID) return;
  let action = "";
  try {
    ({ notifAction: action = "" } = await api.storage.session.get("notifAction"));
  } catch (_) {
    // Nothing remembered.
  }
  const url = ACTION_URL()[action];
  if (url) api.tabs.create({ url }).catch(() => {});
  try {
    api.notifications.clear(NOTIF_ID, () => {});
  } catch (_) {
    // ignore
  }
}

if (has(api, "notifications.onClicked")) api.notifications.onClicked.addListener(runNotifAction);
if (has(api, "notifications.onButtonClicked")) api.notifications.onButtonClicked.addListener((id) => runNotifAction(id));

// ── Talking to share_ingest ─────────────────────────────────────────────────

async function postJson(baseUrl, token, payload, timeoutMs) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || S.SAVE_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ingest-Token": token },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined,
      credentials: "omit",
      cache: "no-store",
    });
  } catch (e) {
    if (timer) clearTimeout(timer);
    const aborted = e && e.name === "AbortError";
    return { ok: false, status: 0, error: aborted ? "timeout" : "network" };
  }
  if (timer) clearTimeout(timer);
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// Save one address. Never throws. Returns { ok, status, body, error?, reason? }.
async function postSave({ url, note }) {
  const where = S.classifyUrl(url);
  if (!where.ok) return { ok: false, status: 0, error: "bad-url", reason: where.reason };
  const { token, baseUrl } = await getSettings();
  if (!token) return { ok: false, status: 0, error: "no-token" };
  if (isOffline()) return { ok: false, status: 0, error: "offline" };

  const payload = { url };
  if (note) {
    payload.note = note;
    // The selection is a QUOTE from the page, not an instruction: the server
    // skips reminder parsing for it ("tomorrow" in a quote sets nothing).
    payload.noteKind = "quote";
  }
  return postJson(baseUrl, token, payload);
}

// Save and report. `reporter` is the popup's port when the popup asked; if the
// popup is gone by the time the answer comes back, a notification says it.
async function saveUrl({ url, note, label, tabId }, reporter) {
  const result = await postSave({ url, note });
  const view = S.describeResult(result, { withNote: !!note });
  await showBadge(view.state);
  const delivered = reporter ? reporter(result, view) : false;
  if (!delivered) {
    const name = S.shorten(label || url, 70);
    const detail = name && (view.state === "saved" || view.state === "duplicate")
      ? `${name}. ${view.detail}`
      : view.detail;
    await notify({ ...view, detail }, tabId);
  }
  return { result, view };
}

// Harmless token check: POST with no URL. share_ingest checks the token BEFORE
// it looks for content, so a good token gets 400 "No URL or text found" and a
// bad one 401/403. Nothing is saved and no save is counted.
async function checkToken(token) {
  const candidate = S.cleanToken(token);
  if (!S.looksLikeToken(candidate)) return { ok: false, reason: "bad-token", message: "That doesn't look like a Machina token." };
  if (isOffline()) return { ok: false, reason: "offline", message: "You're offline. Connect to the internet and try again." };
  const { baseUrl } = await getSettings();
  const r = await postJson(baseUrl, candidate, {}, 15000);
  if (r.status === 400) return { ok: true };
  if (r.status === 401 || r.status === 403) return { ok: false, reason: "invalid", message: "That token doesn't work. It may have been reset." };
  if (r.status === 429) return { ok: false, reason: "rate-limited", message: "Too many tries. Wait a minute, then try again." };
  if (r.status >= 500) return { ok: false, reason: "server", message: "Machina hit a problem. Try again in a moment." };
  if (!r.status) return { ok: false, reason: "network", message: "Couldn't reach Machina. Check your connection." };
  return { ok: false, reason: "unexpected", message: `Unexpected answer from Machina (${r.status}).` };
}

async function storeToken(token, account) {
  await api.storage.local.set({
    token: S.cleanToken(token),
    connectedAt: Date.now(),
    account: typeof account === "string" ? account.slice(0, 120) : "",
  });
}

// ── Context menus ───────────────────────────────────────────────────────────

function createMenus() {
  if (!has(api, "contextMenus.create")) return;
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({ id: MENU_PAGE, title: "Save page to Machina", contexts: ["page"] });
    api.contextMenus.create({ id: MENU_LINK, title: "Save link to Machina", contexts: ["link"] });
    api.contextMenus.create({ id: MENU_SELECTION, title: "Save selection to Machina", contexts: ["selection"] });
  });
}

async function handleMenuClick(info, tab) {
  const pageUrl = info.pageUrl || (tab && tab.url) || "";
  const title = (tab && tab.title) || "";
  const tabId = tab && typeof tab.id === "number" ? tab.id : null;
  if (info.menuItemId === MENU_LINK) {
    return saveUrl({ url: info.linkUrl, label: info.linkUrl, tabId });
  }
  if (info.menuItemId === MENU_SELECTION) {
    const note = (info.selectionText || "").trim();
    return saveUrl({ url: pageUrl, note, label: title || pageUrl, tabId });
  }
  if (info.menuItemId === MENU_PAGE) {
    return saveUrl({ url: pageUrl, label: title || pageUrl, tabId });
  }
  return null;
}

if (has(api, "contextMenus.onClicked")) {
  api.contextMenus.onClicked.addListener((info, tab) => {
    handleMenuClick(info, tab);
  });
}

api.runtime.onInstalled.addListener(async (details) => {
  createMenus();
  // First install: open the web app's connect page. Signed in there, the
  // extension is connected before the person has clicked anything else.
  if (details && details.reason === "install") {
    const { token } = await getSettings();
    if (!token) api.tabs.create({ url: S.CONNECT_URL }).catch(() => {});
  }
});
if (has(api, "runtime.onStartup")) api.runtime.onStartup.addListener(createMenus);

// ── Who is talking ──────────────────────────────────────────────────────────

// One of this extension's own pages (the popup or the options page).
function fromOwnPage(sender) {
  return !!sender && sender.id === api.runtime.id &&
    typeof sender.url === "string" && sender.url.startsWith(api.runtime.getURL(""));
}

// The connect content script on the Machina web app's root page.
function connectOrigins() {
  const scripts = api.runtime.getManifest().content_scripts || [];
  const matches = [];
  for (const cs of scripts) if ((cs.js || []).includes("connect.js")) matches.push(...(cs.matches || []));
  return S.connectOriginsFromMatches(matches);
}
function fromWebApp(sender) {
  return !!sender && sender.id === api.runtime.id && !!sender.tab &&
    S.isTrustedConnectSender(sender, connectOrigins());
}

// ── The popup ───────────────────────────────────────────────────────────────

api.runtime.onConnect.addListener((port) => {
  if (port.name !== "machina-popup" || (port.sender && !fromOwnPage(port.sender))) return;
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
  });
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== "save") return;
    const tabId = typeof msg.tabId === "number" ? msg.tabId : null;
    await saveUrl({ url: msg.url, label: msg.title, tabId }, (result, view) => {
      if (!open) return false;
      try {
        port.postMessage({ type: "result", result, view });
        return true;
      } catch (_) {
        return false;
      }
    });
  });
});

// ── One-click connect from the Machina web app ──────────────────────────────
// Only the web app's own root page, on a host listed in BOTH the content
// script's matches and shared.js CONNECT_HOSTS, gets an answer. The token is
// checked against the server before it is stored, and it is never sent back
// out: the web app gets a short one-way tag instead.

async function handleWeb(msg) {
  if (msg.type === "web-ping") {
    const { token } = await getSettings();
    return {
      ok: true,
      version: api.runtime.getManifest().version,
      connected: !!token,
      tokenTag: token ? await S.tokenTag(token) : null,
    };
  }
  const token = S.cleanToken(msg.token);
  if (!S.looksLikeToken(token)) return { ok: false, reason: "bad-token" };
  const check = await checkToken(token);
  if (!check.ok) return { ok: false, reason: check.reason };
  await storeToken(token, msg.account);
  await showBadge("saved");
  return { ok: true, tokenTag: await S.tokenTag(token) };
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const type = msg && msg.type;
  if (type === "web-ping" || type === "web-connect") {
    if (!fromWebApp(sender)) {
      sendResponse({ ok: false, reason: "untrusted" });
      return false;
    }
    handleWeb(msg).then(sendResponse, () => sendResponse({ ok: false, reason: "error" }));
    return true;
  }

  // Everything else is for this extension's own pages only.
  if (!fromOwnPage(sender)) return false;
  if (type === "check-token") {
    checkToken(msg.token).then(sendResponse, () => sendResponse({ ok: false, reason: "network", message: "Couldn't reach Machina." }));
    return true;
  }
  if (type === "connect-token") {
    // The popup's paste fallback: check first, store only a token that works.
    (async () => {
      const check = await checkToken(msg.token);
      if (check.ok) await storeToken(msg.token, "");
      sendResponse(check);
    })();
    return true;
  }
  if (type === "disconnect") {
    api.storage.local.remove(["token", "connectedAt", "account"]).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
