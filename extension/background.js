// MyLinks — Save to Second Brain
// Service worker: all capture logic lives here. The popup only manages settings.

const DEFAULT_BASE_URL = "https://secondbrain-app-94da2.web.app";
const CONTEXT_MENU_ID = "mylinks-save";
const CONTEXT_SETTINGS_ID = "mylinks-settings";
const BADGE_RESET_MS = 2000;

// ── Settings ────────────────────────────────────────────────────────────────

async function getSettings() {
  const { token = "", baseUrl = "" } = await chrome.storage.sync.get(["token", "baseUrl"]);
  return {
    token: (token || "").trim(),
    baseUrl: (baseUrl || "").trim().replace(/\/+$/, "") || DEFAULT_BASE_URL,
  };
}

// ── Badge feedback ───────────────────────────────────────────────────────────

let badgeResetTimer = null;

async function setBadge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    if (badgeResetTimer) clearTimeout(badgeResetTimer);
    badgeResetTimer = setTimeout(() => {
      chrome.action.setBadgeText({ text: "" }).catch(() => {});
    }, BADGE_RESET_MS);
  } catch (_) {
    // setBadgeText can throw if the action is mid-teardown; ignore.
  }
}

const badgeSaved = () => setBadge("✓", "#7c3aed"); // ✓ purple
const badgeDuplicate = () => setBadge("✓", "#64748b"); // ✓ muted (already saved)
const badgeError = () => setBadge("✗", "#ef4444"); // ✗ red

// ── Notification feedback ────────────────────────────────────────────────────
// A persistent toast confirms the save with the page title — sturdier than the
// 2s badge. A stable id means each new save replaces the previous toast.

const NOTIF_ID = "mylinks-save";

function notify(title, message) {
  try {
    chrome.notifications.create(NOTIF_ID, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message: message || "",
      priority: 0,
    });
  } catch (_) {
    // notifications can be unavailable in some contexts; the badge still fired.
  }
}

// Trim a URL/title to something readable in a toast line.
function shorten(text, max = 80) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// ── Core: POST to the existing share_ingest endpoint ─────────────────────────

// Returns { ok, status, body } where body is the parsed JSON (or null).
async function postShare({ url, note }) {
  const { token, baseUrl } = await getSettings();
  if (!token) {
    return { ok: false, status: 0, error: "no-token" };
  }

  const payload = { url };
  if (note) payload.note = note;

  let res;
  try {
    res = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingest-Token": token,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }

  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

// Save and surface result via the badge + a notification. `label` is a
// human-friendly name for the saved item (page title, or the URL). Returns the
// postShare result.
async function saveAndReport({ url, note, label }) {
  const name = shorten(label || url);

  if (!url || !/^https?:\/\//i.test(url)) {
    await badgeError();
    notify("Can't save this page", "Only http(s) pages can be saved — not browser or store pages.");
    return { ok: false, status: 0, error: "bad-url" };
  }

  const result = await postShare({ url, note });

  if (result.error === "no-token") {
    await badgeError();
    notify("Set your token first", "Click to open MyLinks settings and paste your ingest token.");
    chrome.runtime.openOptionsPage().catch(() => {});
    return result;
  }
  if (result.ok && result.body) {
    if (result.body.duplicate) {
      await badgeDuplicate();
      notify("Already in MyLinks", name);
    } else {
      await badgeSaved();
      const extra = note ? " (with your selection)" : "";
      notify("Saved to MyLinks ✓", `${name}${extra} — analyzing now, it'll appear in your app shortly.`);
    }
  } else {
    await badgeError();
    const reason =
      result.status === 403 ? "Invalid token — check it in settings." :
      result.status === 401 ? "No token sent — check it in settings." :
      "Couldn't reach MyLinks. Check your connection.";
    notify("Couldn't save", reason);
  }
  return result;
}

// ── Toolbar click → save current tab ─────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  const { token } = await getSettings();
  if (!token) {
    chrome.runtime.openOptionsPage().catch(() => {});
    return;
  }
  if (tab && tab.url) {
    await saveAndReport({ url: tab.url, label: tab.title });
  } else {
    await badgeError();
  }
});

// ── Keyboard shortcut → save current tab ─────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-current-tab") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { token } = await getSettings();
  if (!token) {
    chrome.runtime.openOptionsPage().catch(() => {});
    return;
  }
  if (tab && tab.url) await saveAndReport({ url: tab.url, label: tab.title });
});

// ── Context menus ────────────────────────────────────────────────────────────

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Save to MyLinks",
      contexts: ["page", "link", "selection"],
    });
    chrome.contextMenus.create({
      id: CONTEXT_SETTINGS_ID,
      title: "MyLinks settings…",
      contexts: ["action"],
    });
  });
}

chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_SETTINGS_ID) {
    chrome.runtime.openOptionsPage().catch(() => {});
    return;
  }
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  // Priority: a clicked link → save the link itself.
  // Otherwise, if text is selected → save the page with the selection as the note.
  // Otherwise → save the page.
  if (info.linkUrl) {
    await saveAndReport({ url: info.linkUrl, label: info.linkUrl });
  } else if (info.selectionText && (info.pageUrl || (tab && tab.url))) {
    await saveAndReport({
      url: info.pageUrl || tab.url,
      note: info.selectionText,
      label: (tab && tab.title) || info.pageUrl || tab.url,
    });
  } else if (info.pageUrl || (tab && tab.url)) {
    await saveAndReport({ url: info.pageUrl || tab.url, label: (tab && tab.title) || info.pageUrl || tab.url });
  } else {
    await badgeError();
  }
});

// Harmless token check: POST with no URL. share_ingest validates the token
// BEFORE looking for a URL, so a valid token yields 400 "No URL found" while a
// bad/missing token yields 401/403. Nothing is ever saved.
async function validateToken() {
  const { token, baseUrl } = await getSettings();
  if (!token) return { ok: false, reason: "missing", message: "No token set." };

  let res;
  try {
    res = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ingest-Token": token },
      body: JSON.stringify({}),
    });
  } catch (e) {
    return { ok: false, reason: "network", message: "Could not reach the server. Check the backend URL." };
  }

  if (res.status === 400) return { ok: true, message: "Connected — your token works." };
  if (res.status === 401) return { ok: false, reason: "missing", message: "Server didn't see the token." };
  if (res.status === 403) return { ok: false, reason: "invalid", message: "Invalid token — double-check it." };
  return { ok: false, reason: "unexpected", message: `Unexpected response (${res.status}).` };
}

// ── Messages from the settings popup ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "test-connection") {
    validateToken()
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ ok: false, reason: "network", message: String(e) }));
    return true; // async response
  }
  if (msg && msg.type === "save-current-tab") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await saveAndReport({ url: tab && tab.url, label: tab && tab.title });
      sendResponse(result);
    })();
    return true;
  }
});
