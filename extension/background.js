// Machina browser extension: service worker.
//
// Every save goes through saveUrl() here, whichever way it started: the
// toolbar popup, the keyboard shortcut (which opens the popup), or a right
// click. The popup shows the result itself; a right click, or a popup closed
// before the answer came back, gets a system notification instead. A badge on
// the toolbar icon mirrors the result for a few seconds either way.
//
// It also answers the Machina web app's one-click connect (onMessageExternal).

importScripts("shared.js");

const S = self.MachinaShared;
const api = typeof browser !== "undefined" && browser.runtime ? browser : chrome;

const MENU_PAGE = "machina-save-page";
const MENU_LINK = "machina-save-link";
const MENU_SELECTION = "machina-save-selection";
const NOTIF_ID = "machina-save";
const BADGE_RESET_MS = 4000;

// ── Settings ────────────────────────────────────────────────────────────────

async function getSettings() {
  const { token = "", baseUrl = "" } = await api.storage.local.get(["token", "baseUrl"]);
  return {
    token: S.cleanToken(token),
    baseUrl: (baseUrl || "").trim().replace(/\/+$/, "") || S.API_ORIGIN,
  };
}

// ── Badge ───────────────────────────────────────────────────────────────────

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

// ── Notifications (right-click saves, or a popup closed early) ──────────────
// What a click on the toast does is kept in storage.session, so it still works
// after the worker has been suspended between the toast and the click.

async function notify(view) {
  try {
    await api.storage.session.set({ notifAction: view.action || "" });
  } catch (_) {
    // No session storage (very old Chromium): the click just does nothing.
  }
  try {
    const opts = {
      type: "basic",
      iconUrl: api.runtime.getURL("icons/icon128.png"),
      title: view.title,
      message: view.detail || "",
      priority: 0,
    };
    if (view.action === "upgrade") opts.buttons = [{ title: "Get Pro" }];
    else if (view.action === "connect") opts.buttons = [{ title: "Connect" }];
    api.notifications.create(NOTIF_ID, opts);
  } catch (_) {
    // Safari has no notifications API; the badge already told the story.
  }
}

async function runNotifAction(id) {
  if (id !== NOTIF_ID) return;
  let action = "";
  try {
    ({ notifAction: action = "" } = await api.storage.session.get("notifAction"));
  } catch (_) {
    // Nothing remembered.
  }
  const url = { upgrade: S.UPGRADE_URL, connect: S.CONNECT_URL, open: S.LIBRARY_URL }[action];
  if (url) api.tabs.create({ url }).catch(() => {});
  try {
    api.notifications.clear(NOTIF_ID, () => {});
  } catch (_) {
    // ignore
  }
}

try {
  api.notifications.onClicked.addListener(runNotifAction);
  api.notifications.onButtonClicked.addListener((id) => runNotifAction(id));
} catch (_) {
  // Safari: no notification events.
}

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
async function saveUrl({ url, note, label }, reporter) {
  const result = await postSave({ url, note });
  const view = S.describeResult(result, { withNote: !!note });
  await showBadge(view.state);
  const delivered = reporter ? reporter(result, view) : false;
  if (!delivered) {
    const name = S.shorten(label || url, 70);
    const detail = name && (view.state === "saved" || view.state === "duplicate")
      ? `${name}. ${view.detail}`
      : view.detail;
    notify({ ...view, detail });
  }
  return { result, view };
}

// Harmless token check: POST with no URL. share_ingest checks the token BEFORE
// it looks for content, so a good token gets 400 "No URL or text found" and a
// bad one 401/403. Nothing is saved and no save is counted.
async function checkToken(token, baseUrlOverride) {
  const candidate = S.cleanToken(token);
  if (!S.looksLikeToken(candidate)) return { ok: false, reason: "bad-token", message: "That doesn't look like a Machina token." };
  if (isOffline()) return { ok: false, reason: "offline", message: "You're offline. Connect to the internet and try again." };
  const baseUrl = baseUrlOverride || (await getSettings()).baseUrl;
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
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({ id: MENU_PAGE, title: "Save page to Machina", contexts: ["page"] });
    api.contextMenus.create({ id: MENU_LINK, title: "Save link to Machina", contexts: ["link"] });
    api.contextMenus.create({ id: MENU_SELECTION, title: "Save selection to Machina", contexts: ["selection"] });
  });
}

async function handleMenuClick(info, tab) {
  const pageUrl = info.pageUrl || (tab && tab.url) || "";
  const title = (tab && tab.title) || "";
  if (info.menuItemId === MENU_LINK) {
    return saveUrl({ url: info.linkUrl, label: info.linkUrl });
  }
  if (info.menuItemId === MENU_SELECTION) {
    const note = (info.selectionText || "").trim();
    return saveUrl({ url: pageUrl, note, label: title || pageUrl });
  }
  if (info.menuItemId === MENU_PAGE) {
    return saveUrl({ url: pageUrl, label: title || pageUrl });
  }
  return null;
}

api.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab);
});

api.runtime.onInstalled.addListener(async (details) => {
  createMenus();
  // First install: open the web app's connect page. Signed in there, the
  // extension is connected before the person has clicked anything else.
  if (details && details.reason === "install") {
    const { token } = await getSettings();
    if (!token) api.tabs.create({ url: S.CONNECT_URL }).catch(() => {});
  }
});
if (api.runtime.onStartup) api.runtime.onStartup.addListener(createMenus);

// ── The popup ───────────────────────────────────────────────────────────────

api.runtime.onConnect.addListener((port) => {
  if (port.name !== "machina-popup") return;
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
  });
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== "save") return;
    await saveUrl({ url: msg.url, label: msg.title }, (result, view) => {
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

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only this extension's own pages talk on this channel.
  if (!sender || sender.id !== api.runtime.id) return false;
  if (msg && msg.type === "check-token") {
    checkToken(msg.token).then(sendResponse, () => sendResponse({ ok: false, reason: "network", message: "Couldn't reach Machina." }));
    return true;
  }
  if (msg && msg.type === "connect-token") {
    // The popup's paste fallback: check first, store only a token that works.
    (async () => {
      const check = await checkToken(msg.token);
      if (check.ok) await storeToken(msg.token, "");
      sendResponse(check);
    })();
    return true;
  }
  if (msg && msg.type === "disconnect") {
    api.storage.local.remove(["token", "connectedAt", "account"]).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// ── One-click connect from the Machina web app ──────────────────────────────
// Only the web app's own root page, on a host listed in BOTH the manifest's
// externally_connectable and shared.js CONNECT_HOSTS, gets an answer. The
// token is checked against the server before it is stored, and it is never
// sent back out: the web app gets a short one-way tag instead.

function connectOrigins() {
  const ec = api.runtime.getManifest().externally_connectable || {};
  return S.connectOriginsFromMatches(ec.matches);
}

async function handleExternal(msg, sender) {
  if (!S.isTrustedConnectSender(sender, connectOrigins())) return { ok: false, reason: "untrusted" };
  const type = msg && msg.type;
  if (type === "machina-ping") {
    const { token } = await getSettings();
    return {
      ok: true,
      version: api.runtime.getManifest().version,
      connected: !!token,
      tokenTag: token ? await S.tokenTag(token) : null,
    };
  }
  if (type === "machina-connect") {
    const token = S.cleanToken(msg.token);
    if (!S.looksLikeToken(token)) return { ok: false, reason: "bad-token" };
    const check = await checkToken(token);
    if (!check.ok) return { ok: false, reason: check.reason };
    await storeToken(token, msg.account);
    await showBadge("saved");
    return { ok: true, tokenTag: await S.tokenTag(token) };
  }
  return { ok: false, reason: "unknown" };
}

if (api.runtime.onMessageExternal) {
  api.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    handleExternal(msg, sender).then(sendResponse, () => sendResponse({ ok: false, reason: "error" }));
    return true;
  });
}
