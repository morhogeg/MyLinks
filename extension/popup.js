// Settings popup. Reads/writes chrome.storage.sync and talks to the service
// worker for "Test connection" / "Save this page now". No capture logic here.

const DEFAULT_BASE_URL = "https://secondbrain-app-94da2.web.app";
// Keep in sync with background.js — the token may only be sent to these hosts.
const ALLOWED_HOSTS = ["secondbrain-app-94da2.web.app"];

function isAllowedBaseUrl(raw) {
  if (!raw) return true; // empty means "use the default", which is allowed
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && ALLOWED_HOSTS.includes(u.hostname);
  } catch (_) {
    return false;
  }
}

const $ = (id) => document.getElementById(id);
const tokenInput = $("token");
const baseUrlInput = $("baseUrl");
const banner = $("banner");
const statusEl = $("status");

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

async function load() {
  // Read from storage.local (where the token now lives); fall back to the legacy
  // storage.sync location for installs that predate the migration.
  let { token = "", baseUrl = "" } = await chrome.storage.local.get(["token", "baseUrl"]);
  if (!token && !baseUrl) {
    const legacy = await chrome.storage.sync.get(["token", "baseUrl"]);
    token = legacy.token || "";
    baseUrl = legacy.baseUrl || "";
  }
  tokenInput.value = token;
  baseUrlInput.value = baseUrl;
  if (!token) {
    showBanner("Paste your MyLinks token to start saving.");
  } else {
    showBanner("");
  }
}

async function saveSettings() {
  const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, "");
  if (!isAllowedBaseUrl(baseUrl)) {
    setStatus("That backend URL isn't allowed. Leave it blank to use the default.", "err");
    return;
  }
  const token = tokenInput.value.trim();
  // Store the token device-locally, never in synced storage, and purge any
  // legacy synced copy.
  await chrome.storage.local.set({ token, baseUrl });
  chrome.storage.sync.remove(["token", "baseUrl"]).catch(() => {});
  if (!token) {
    showBanner("Paste your MyLinks token to start saving.");
    setStatus("Token cleared.", "");
  } else {
    showBanner("");
    setStatus("Settings saved.", "ok");
  }
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

async function testConnection() {
  await saveSettings(); // persist before testing so the SW uses current values
  if (!tokenInput.value.trim()) {
    setStatus("Enter a token first.", "err");
    return;
  }
  setStatus("Testing…", "");
  const resp = await sendMessage({ type: "test-connection" });
  setStatus(resp.message || (resp.ok ? "Connected." : "Failed."), resp.ok ? "ok" : "err");
}

async function saveThisPage() {
  if (!tokenInput.value.trim()) {
    setStatus("Enter a token first.", "err");
    return;
  }
  setStatus("Saving…", "");
  const resp = await sendMessage({ type: "save-current-tab" });
  if (resp.ok && resp.body && resp.body.duplicate) {
    setStatus("Already saved ✓", "ok");
  } else if (resp.ok) {
    setStatus("Saved ✓", "ok");
  } else if (resp.error === "no-token") {
    setStatus("Enter a token first.", "err");
  } else if (resp.error === "bad-url") {
    setStatus("This page can't be saved.", "err");
  } else if (resp.status === 403) {
    setStatus("Invalid token.", "err");
  } else {
    setStatus("Couldn't save — check your token/connection.", "err");
  }
}

$("save").addEventListener("click", saveSettings);
$("test").addEventListener("click", testConnection);
$("saveTab").addEventListener("click", saveThisPage);

$("reveal").addEventListener("click", () => {
  const showing = tokenInput.type === "text";
  tokenInput.type = showing ? "password" : "text";
  $("reveal").textContent = showing ? "Show" : "Hide";
});

baseUrlInput.placeholder = DEFAULT_BASE_URL;

document.addEventListener("DOMContentLoaded", load);
