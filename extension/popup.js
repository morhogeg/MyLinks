// Settings popup. Reads/writes chrome.storage.local and talks to the service
// worker for token validation / "Save this page now". No capture logic here.
//
// The token is checked, never just stored: the popup validates on open and
// again on every save, so the screen always says whether this browser is
// actually connected to Machina instead of looking saved and failing later.

const DEFAULT_BASE_URL = "https://secondbrain-app-94da2.web.app";
// Same as background.js: the web app's paywall for the monthly save wall.
const UPGRADE_URL = "https://mymachina.app/?paywall=saves";

const $ = (id) => document.getElementById(id);
const tokenInput = $("token");
const baseUrlInput = $("baseUrl");
const banner = $("banner");
const statusEl = $("status");
const connEl = $("conn");
const connTextEl = $("connText");
const saveBtn = $("save");

const PASTE_PROMPT = "Paste your Machina token to start saving.";

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function showBanner(text) {
  if (text) {
    banner.textContent = text;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

// The one line of truth about this browser's connection: hidden when no token
// is set (the banner is asking for one), otherwise checking / connected / the
// reason it failed.
function setConnection(kind, text) {
  if (!kind) {
    connEl.className = "conn hidden";
    connTextEl.textContent = "";
    return;
  }
  connEl.className = "conn " + kind;
  connTextEl.textContent = text;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, message: chrome.runtime.lastError.message });
      } else {
        resolve(resp || { ok: false, message: "No response." });
      }
    });
  });
}

// Validate the stored token against the backend. The check saves nothing (see
// validateToken in background.js) and is safe to run on every popup open.
async function checkConnection() {
  setConnection("checking", "Checking…");
  saveBtn.disabled = true;
  const resp = await sendMessage({ type: "test-connection" });
  saveBtn.disabled = false;
  if (resp.ok) {
    setConnection("ok", "Connected");
  } else {
    setConnection("err", resp.message || "Not connected.");
  }
  return resp.ok;
}

async function load() {
  const { token = "", baseUrl = "" } = await chrome.storage.local.get(["token", "baseUrl"]);
  tokenInput.value = token;
  baseUrlInput.value = baseUrl;
  if (!token) {
    showBanner(PASTE_PROMPT);
    setConnection(null);
  } else {
    showBanner("");
    await checkConnection();
  }
}

// Persist whatever is in the fields. Returns the trimmed token so callers can
// decide whether there is anything to validate.
async function saveSettings() {
  const token = tokenInput.value.trim();
  const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ token, baseUrl });
  return token;
}

async function saveAndConnect() {
  setStatus("", "");
  const token = await saveSettings();
  if (!token) {
    showBanner(PASTE_PROMPT);
    setConnection(null);
    setStatus("Paste your token first.", "err");
    return;
  }
  showBanner("");
  await checkConnection();
}

async function saveThisPage() {
  if (!tokenInput.value.trim()) {
    setStatus("Paste your token first.", "err");
    return;
  }
  setStatus("Saving…", "");
  const resp = await sendMessage({ type: "save-current-tab" });
  if (resp.ok && resp.body && resp.body.duplicate) {
    setStatus("Already saved ✓", "ok");
  } else if (resp.ok) {
    setStatus("Saved ✓", "ok");
  } else if (resp.error === "no-token") {
    setStatus("Paste your token first.", "err");
  } else if (resp.error === "bad-url") {
    setStatus("This page can't be saved.", "err");
  } else if (resp.status === 403) {
    setStatus("Invalid token.", "err");
    setConnection("err", "Invalid token, check it above.");
  } else if (resp.action === "upgrade") {
    // Free plan's monthly wall: the status line links to the upgrade sheet.
    setStatus(resp.message || "Free plan limit reached. Upgrade in Machina.", "err");
    const link = document.createElement("a");
    link.href = UPGRADE_URL;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = " Upgrade";
    statusEl.appendChild(link);
  } else {
    // background.js maps every failure to plain copy (rate limit, too large,
    // server busy, offline); fall back only if it sent none.
    setStatus(resp.message || "Couldn't save. Check your token and connection.", "err");
  }
}

saveBtn.addEventListener("click", saveAndConnect);
$("saveTab").addEventListener("click", saveThisPage);

$("reveal").addEventListener("click", () => {
  const showing = tokenInput.type === "text";
  tokenInput.type = showing ? "password" : "text";
  $("reveal").textContent = showing ? "Show" : "Hide";
});

// Enter in the token field is the same as clicking the primary button.
tokenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveAndConnect();
});

baseUrlInput.placeholder = DEFAULT_BASE_URL;

document.addEventListener("DOMContentLoaded", load);
