// Machina popup.
//
// Opening the popup (toolbar click or the keyboard shortcut) saves the current
// page straight away and shows what the server said. The service worker does
// the saving; this page only shows it. Not connected yet, it offers the
// one-click connect instead. The same page is the extension's options screen
// (popup.html?view=settings), where nothing is saved on open.
//
// No em dashes in any string a user reads.

const S = self.MachinaShared;
const api = typeof browser !== "undefined" && browser.runtime ? browser : chrome;

const params = new URLSearchParams(location.search);
const AS_OPTIONS = params.get("view") === "settings";
// Lets a test (or a tab-hosted copy of this page) aim the save at a given tab.
const TARGET_TAB = Number(params.get("tab")) || null;

const $ = (id) => document.getElementById(id);
const app = $("app");

const ICONS = {
  saved: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  waiting: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5.2l3.2 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.3" fill="currentColor"/></svg>',
};
const OK_STATES = new Set(["saved", "duplicate", "waiting"]);

const state = {
  token: "",
  account: "",
  stack: [],
  tab: null,
  port: null,
};

// ── Views ───────────────────────────────────────────────────────────────────

const VIEWS = {
  connect: { el: "viewConnect", heading: "Machina" },
  save: { el: "viewSave", heading: "Machina" },
  settings: { el: "viewSettings", heading: "Settings" },
  token: { el: "viewToken", heading: "Machina" },
};

function show(name, { push = true } = {}) {
  if (push) state.stack.push(name);
  for (const [key, v] of Object.entries(VIEWS)) $(v.el).hidden = key !== name;
  app.dataset.view = name;
  $("heading").textContent = VIEWS[name].heading;
  $("backBtn").hidden = state.stack.length < 2;
  // The gear sits on the main screens; settings and token have Back instead.
  $("settingsBtn").hidden = !(name === "save" || name === "connect");
  if (name === "settings") renderSettings();
  if (name === "token") prepareTokenView();
}

function back() {
  if (state.stack.length < 2) return;
  state.stack.pop();
  const target = state.stack[state.stack.length - 1];
  // Connected with a token since the connect screen was shown: the main
  // screen is now the save screen.
  if (target === "connect" && state.token) {
    state.stack = ["save"];
    show("save", { push: false });
    startSave();
    return;
  }
  show(target, { push: false });
}

// ── Opening Machina pages ───────────────────────────────────────────────────

function openTab(url) {
  api.tabs.create({ url }).catch(() => {});
  if (!AS_OPTIONS) window.close();
}
const openConnect = () => openTab(S.CONNECT_URL);

// ── Saving ──────────────────────────────────────────────────────────────────

async function currentTab() {
  try {
    if (TARGET_TAB) return await api.tabs.get(TARGET_TAB);
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch (_) {
    return null;
  }
}

function renderPage(tab) {
  const url = (tab && tab.url) || "";
  const host = S.hostOf(url);
  const title = (tab && tab.title) || "";
  $("pageTitle").textContent = title && title !== url ? title : host || "";
  $("pageHost").textContent = title && title !== url ? host : "";
  $("pageCard").hidden = !$("pageTitle").textContent;
}

function renderSaving() {
  const box = $("result");
  box.dataset.state = "saving";
  box.classList.remove("is-error");
  box.querySelector(".result-icon").innerHTML = "";
  $("resultTitle").textContent = "Saving";
  $("resultDetail").textContent = "";
  $("actionBtn").hidden = true;
  $("openBtn").hidden = true;
}

const ACTION_LABEL = { retry: "Try again", connect: "Reconnect", upgrade: "Get Pro" };

function renderResult(view) {
  const box = $("result");
  box.dataset.state = view.state;
  const ok = OK_STATES.has(view.state);
  box.classList.toggle("is-error", !ok);
  box.querySelector(".result-icon").innerHTML =
    view.state === "waiting" ? ICONS.waiting : ok ? ICONS.saved : ICONS.error;
  $("resultTitle").textContent = view.title;
  $("resultDetail").textContent = view.detail;

  const actionBtn = $("actionBtn");
  const label = view.state === "notoken" ? "Connect" : ACTION_LABEL[view.action];
  actionBtn.hidden = !label;
  actionBtn.textContent = label || "";
  actionBtn.dataset.action = view.action || "";
  // "Open Machina" fits every outcome where the library is worth a look.
  $("openBtn").hidden = !(ok || view.action === "open" || view.state === "timeout" || view.state === "unknown");
}

function ensurePort() {
  if (state.port) return state.port;
  const port = api.runtime.connect({ name: "machina-popup" });
  port.onMessage.addListener((msg) => {
    if (msg && msg.type === "result") renderResult(msg.view);
  });
  port.onDisconnect.addListener(() => {
    state.port = null;
  });
  state.port = port;
  return port;
}

async function startSave() {
  renderSaving();
  const tab = state.tab || (state.tab = await currentTab());
  renderPage(tab);
  const where = S.classifyUrl(tab && tab.url);
  if (!where.ok) {
    renderResult(S.describeResult({ ok: false, status: 0, error: "bad-url", reason: where.reason }));
    return;
  }
  ensurePort().postMessage({ type: "save", url: tab.url, title: tab.title || "", tabId: tab.id });
}

function onAction() {
  const action = $("actionBtn").dataset.action;
  if (action === "retry") startSave();
  else if (action === "connect") openConnect();
  else if (action === "upgrade") openTab(S.UPGRADE_URL);
}

// ── Settings ────────────────────────────────────────────────────────────────

function renderSettings() {
  const connected = !!state.token;
  const conn = $("conn");
  conn.className = "conn" + (connected ? " ok" : "");
  $("connText").textContent = connected ? "Connected" : "Not connected";
  $("accountLine").hidden = !(connected && state.account);
  $("accountLine").textContent = state.account ? `Saving to ${state.account}` : "";
  $("settingsConnectBtn").textContent = connected ? "Reconnect" : "Connect to Machina";
  $("settingsConnectBtn").className = connected ? "secondary" : "primary";
  $("settingsTokenBtn").textContent = connected ? "Use a different token" : "Use a token instead";
  $("disconnectBtn").hidden = !connected;
}

async function renderShortcut() {
  let keys = "";
  try {
    const cmds = await api.commands.getAll();
    const cmd = cmds.find((c) => c.name === "_execute_action");
    keys = (cmd && cmd.shortcut) || "";
  } catch (_) {
    // Safari before 16.4 has no commands API.
  }
  $("shortcutKeys").textContent = keys || "Not set";
  $("shortcutHint").textContent = keys
    ? `Tip: press ${keys} on any page to save it.`
    : "Tip: right click a link or selected text to save just that.";
}

// The browser's own shortcut settings page. Safari has none to open.
function shortcutsPage() {
  if (S.isSafariExtension()) return "";
  const ua = navigator.userAgent || "";
  if (/Edg\//.test(ua)) return "edge://extensions/shortcuts";
  return "chrome://extensions/shortcuts";
}

async function disconnect() {
  await new Promise((resolve) => api.runtime.sendMessage({ type: "disconnect" }, () => resolve()));
  state.token = "";
  state.account = "";
  renderSettings();
}

// ── Token fallback ──────────────────────────────────────────────────────────

function setTokenStatus(text, kind) {
  const el = $("tokenStatus");
  el.textContent = text || "";
  el.className = "status" + (kind ? " " + kind : "");
}

async function prepareTokenView() {
  const { baseUrl = "" } = await api.storage.local.get(["baseUrl"]);
  $("token").value = "";
  $("baseUrl").value = baseUrl;
  $("baseUrl").placeholder = S.API_ORIGIN;
  setTokenStatus("", "");
  $("token").focus();
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    api.runtime.sendMessage(msg, (resp) => {
      if (api.runtime.lastError) resolve({ ok: false, message: "The extension didn't answer. Try again." });
      else resolve(resp || { ok: false, message: "The extension didn't answer. Try again." });
    });
  });
}

// Same rule as the service worker: only an unpacked install may use a local server.
async function isDevInstall() {
  try {
    const self = api.management && api.management.getSelf ? await api.management.getSelf() : null;
    return Boolean(self && self.installType === "development");
  } catch (_) {
    return false;
  }
}

async function saveToken() {
  const token = S.cleanToken($("token").value);
  if (!token) {
    setTokenStatus("Paste your token first.", "err");
    $("token").focus();
    return;
  }
  if (!S.looksLikeToken(token)) {
    setTokenStatus("That doesn't look like a Machina token.", "err");
    return;
  }
  const baseUrl = $("baseUrl").value.trim().replace(/\/+$/, "");
  if (baseUrl && !S.isAllowedApiBase(baseUrl, await isDevInstall())) {
    setTokenStatus("Leave the server address empty, or use a Machina address.", "err");
    return;
  }
  await api.storage.local.set({ baseUrl });
  const btn = $("saveTokenBtn");
  btn.disabled = true;
  setTokenStatus("Checking your token", "");
  const resp = await sendMessage({ type: "connect-token", token });
  btn.disabled = false;
  if (!resp.ok) {
    setTokenStatus(resp.message || "That token doesn't work.", "err");
    return;
  }
  state.token = token;
  state.account = "";
  $("token").value = "";
  setTokenStatus("Connected. Click the Machina icon on any page to save it.", "ok");
}

function toggleReveal() {
  const input = $("token");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  $("reveal").textContent = showing ? "Show" : "Hide";
  $("reveal").setAttribute("aria-pressed", String(!showing));
}

// ── Boot ────────────────────────────────────────────────────────────────────

async function init() {
  // Opened as a full tab (Safari always shows the options page that way):
  // center the column instead of pinning a popup-width strip to the corner.
  if (AS_OPTIONS || window.innerWidth >= 560) document.documentElement.classList.add("in-tab");
  $("shortcutLink").hidden = !shortcutsPage();
  const { token = "", account = "" } = await api.storage.local.get(["token", "account"]);
  state.token = S.cleanToken(token);
  state.account = account || "";
  renderShortcut();
  if (AS_OPTIONS) {
    show("settings");
  } else if (!state.token) {
    show("connect");
  } else {
    show("save");
    startSave();
  }
}

// Connected from the web app while this page is open: catch up.
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.token) return;
  state.token = S.cleanToken(changes.token.newValue || "");
  if (changes.account) state.account = changes.account.newValue || "";
  if (app.dataset.view === "settings") renderSettings();
});

$("backBtn").addEventListener("click", back);
$("settingsBtn").addEventListener("click", () => show("settings"));
$("connectBtn").addEventListener("click", openConnect);
$("useTokenBtn").addEventListener("click", () => show("token"));
$("actionBtn").addEventListener("click", onAction);
$("openBtn").addEventListener("click", () => openTab(S.LIBRARY_URL));
$("settingsConnectBtn").addEventListener("click", openConnect);
$("settingsTokenBtn").addEventListener("click", () => show("token"));
$("disconnectBtn").addEventListener("click", disconnect);
$("shortcutLink").addEventListener("click", () => {
  if (shortcutsPage()) openTab(shortcutsPage());
});
$("saveTokenBtn").addEventListener("click", saveToken);
$("reveal").addEventListener("click", toggleReveal);
$("token").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveToken();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.stack.length > 1) {
    e.preventDefault();
    back();
  }
});

document.addEventListener("DOMContentLoaded", init);
