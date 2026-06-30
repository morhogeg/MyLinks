# Authentication Spec — Google Sign-In (phased)

Status: **Phase 1 implemented** (web). Phases 2–3 are the documented follow-ups.

This is the design for adding real authentication to Machina AI (the MyLinks
app). It replaces the single-user "grab the first user doc" model with Google
Sign-In, while keeping the app shippable at every step and **never bricking the
already-deployed iOS app**.

---

## 1. Where we're starting from

- **Single-user prototype.** All data lives under `users/{uid}/…` where `uid` is
  the owner's **phone number** (e.g. `+16462440305`) — that's the Firestore
  document ID.
- **No login.** `AuthProvider` queries `users` and uses the *first* doc it finds.
  `request.auth` is always `null`.
- **Firestore rules are wide open** (`allow read, write: if true`) because
  requiring auth today would break every read/write.
- **Backend trusts the client.** The `/api/*` Cloud Functions read `uid` straight
  out of the request body. Share ingestion authenticates with a per-user
  **ingest token**; WhatsApp resolves the user by **phone number**. Both look the
  user up by *field query*, not by document ID — this matters below.
- **`firebase.ts` already initializes `auth`** but deliberately **omits the
  popup/redirect resolver**: `getAuth()` eagerly loads Google's `gapi` iframe,
  which throws under Capacitor's `capacitor://` WKWebView origin and aborts app
  startup. So any popup/redirect sign-in call must pass the resolver
  *explicitly*, and must only run on the web (never under Capacitor).

### The hard constraint

The **same web bundle** runs in three places:

1. Desktop browser (Vercel).
2. iPhone PWA / Firebase Hosting (a normal mobile Safari origin).
3. The **native iOS shell** (Capacitor, `capacitor://localhost`).

Popup/redirect Google Sign-In works in (1) and (2) but **not** in (3). Gating
the whole bundle behind Google login would therefore lock the user out of the
native app. The native shell needs a *native* Google auth plugin — that's
Phase 2 work and requires Xcode/native config that can't be done headlessly.

---

## 2. The key decision: how the Google account maps to existing data

The owner's data is keyed by **phone number**. A Google sign-in produces a
*different*, random Firebase Auth `uid`. Two options:

- **(A) Re-key the data to the Auth uid.** Cleanest rules
  (`request.auth.uid == uid`) but requires migrating every subcollection, and the
  Auth uid isn't known until the first sign-in. Risky, one-shot.
- **(B) Keep the phone-number doc ID; link the Google account to it.** ← chosen.
  Store an `authUids: string[]` array (and `email`) on the user doc. On sign-in
  we resolve the data doc by `authUids array-contains <auth uid>`. **No data
  migration**; WhatsApp (phone-field query) and ingest tokens (token-field query)
  keep working unchanged, because they never depended on the document ID.

The price of (B) is that Firestore rules can't be a bare `request.auth.uid == uid`
— they need a `get()` to check membership in `authUids` (see Phase 3). For a
low-traffic single-user app that extra read is negligible.

### First-time linking ("the claim")

The existing user doc has no `email`/`authUids` yet, so the owner's first
sign-in can't match by either. We bootstrap with a one-time, non-destructive
**claim**:

- On sign-in, if no doc matches `authUids array-contains uid`, find the unclaimed
  owner doc and write `authUids: [uid]` + `email` onto it.
- The claim is gated by an **owner allowlist**: `NEXT_PUBLIC_OWNER_EMAIL`. If set,
  only that email may claim. If unset, the sole unclaimed user doc is claimed
  (single-user convenience). Once a doc is claimed, a non-matching Google account
  resolves to *no* doc and sees an "access restricted" screen rather than someone
  else's data.

---

## 3. Phase 1 — Web Google Sign-In (implemented this session)

**Goal:** a real login gate on the web; the owner signs in with Google and sees
their existing data. The native app is untouched and keeps working.

- **`web/lib/auth.ts`** (new) — thin wrapper over Firebase Auth:
  - `signInWithGoogle()` — `signInWithPopup` with an explicit
    `browserPopupRedirectResolver`; on popup failure (blocked / unsupported, e.g.
    standalone iOS PWA) falls back to `signInWithRedirect`.
  - `completeRedirectSignIn()` — `getRedirectResult` to finish a redirect flow.
  - `signOutUser()`, `onAuthChange()`, `getIdToken()`.
  - Every call is **web-only** and guarded so it never runs under Capacitor (keeps
    `gapi` out of the native WebView).
- **`web/components/AuthProvider.tsx`** (rewritten) — auth-aware:
  - **Web:** subscribe to `onAuthStateChanged`. Signed out → render `LoginScreen`.
    Signed in → resolve/claim the data doc → expose its ID as `uid`. Signed in but
    no doc (non-owner) → "access restricted" screen with Sign out.
  - **Native (Capacitor):** unchanged legacy behavior — load the first user doc,
    no gate. (Phase 2 swaps this for native Google auth.)
  - Context now also exposes `email`, `authUid`, and `signOut()`.
- **`web/components/LoginScreen.tsx`** (new) — branded "Continue with Google"
  screen; also renders the restricted-access state.
- **`web/components/SettingsModal.tsx`** — an **Account** section showing the
  signed-in email and a **Sign out** button (web).
- **`firestore.rules`** — kept open, but the comments now document Phase 1 as live
  and spell out the exact Phase 3 lock.

**Not changed in Phase 1 (deliberately, to avoid a half-deployed break):** the
Cloud Functions still trust the client `uid`. The client now *additionally* has
`getIdToken()` available so Phase 2 can switch the backend over cleanly.

---

## 4. Phase 2 — Native iOS sign-in + backend token verification (follow-up)

Requires native/Xcode steps and a Functions deploy (only the user can do these).

- **Native Google Sign-In:** add `@capacitor-firebase/authentication` (or the
  Google Sign-In SDK), drop `GoogleService-Info.plist` into the iOS target, add
  the reversed-client-id URL scheme, and route the native path through the plugin
  → `signInWithCredential`. Then remove the legacy "first user doc" fallback in
  `AuthProvider` for Capacitor and gate the native app too.
- **Backend ID-token verification:** the `/api/*` endpoints stop trusting the body
  `uid`. The client sends `Authorization: Bearer <idToken>` (helper already in
  `auth.ts`); functions call `auth.verify_id_token(...)`, look up the data doc by
  `authUids array-contains decoded_uid`, and derive `uid` server-side.

---

## 5. Phase 3 — Lock Firestore rules (follow-up, after Phase 2 proven)

Replace the open rules with ownership checks. Because the doc ID is the phone
number (not the Auth uid), ownership is membership in `authUids`:

```
function owns(uid) {
  return request.auth != null
    && get(/databases/$(database)/documents/users/$(uid)).data.authUids
         .hasAny([request.auth.uid]);
}
match /users/{uid} {
  allow read, write: if owns(uid);
  match /links/{linkId}       { allow read, write: if owns(uid); }
  match /chats/{chatId}       { allow read, write: if owns(uid); }
  match /collections/{cid}    { allow read, write: if owns(uid); }
}
```

Also tighten `shared_collections` / `shared_cards` writes to
`request.auth.uid`-owned (reads stay public for share links). Only ship this once
**all** write paths (web, native, share ingest via Admin SDK which bypasses rules,
WhatsApp via Admin SDK) are confirmed working under auth — otherwise reads/writes
brick until the user redeploys.

---

## 6. Manual follow-ups for the owner

1. **Firebase Console → Authentication → Sign-in method → Google:** confirm
   enabled (the user reports it is). Add the production domains under
   **Authorized domains** (Vercel domain + `*.web.app` Firebase Hosting).
2. Optionally set **`NEXT_PUBLIC_OWNER_EMAIL`** (Vercel + `web/.env.local`) to lock
   the claim to a single Google account.
3. First sign-in on the live web app links the Google account to the existing
   data doc (writes `authUids` + `email`). Verify the cards appear.
4. Phases 2–3 when ready (native config + Functions deploy + rules lock).
