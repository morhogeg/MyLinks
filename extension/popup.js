// Settings popup. Reads/writes chrome.storage.local (the token is a bearer
// credential — never storage.sync, which replicates across profiles) and talks
// to the service worker for "Test connection" / "Save this page now". No
// capture logic here.

const DEFAULT_BASE_URL = "https://secondbrain-app-94da2.web.app";

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
  let { token = "", baseUrl = "" } = await chrome.storage.local.get(["token", "baseUrl"]);
  if (!token) {
    // One-time migration from an older build that used storage.sync.
    const synced = await chrome.storage.sync.get(["token", "baseUrl"]);
    if (synced.token) {
      token = synced.token;
      baseUrl = baseUrl || synced.baseUrl || "";
      await chrome.storage.local.set({ token, baseUrl });
      await chrome.storage.sync.remove(["token", "baseUrl"]);
    }
  }
  tokenInput.value = token;
  baseUrlInput.value = baseUrl;
  if (!token) {
    showBanner("Paste your Machina token to start saving.");
  } else {
    showBanner("");
  }
}

async function saveSettings() {
  const token = tokenInput.value.trim();
  const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ token, baseUrl });
  if (!token) {
    showBanner("Paste your Machina token to start saving.");
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
