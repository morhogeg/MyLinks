# Implementation Spec — Real Authentication + Future iOS App

_Status: proposal / not yet implemented. Written 2026-06-29 as the follow-up to the
production security baseline (PR #5)._

## Why this exists

The security baseline closed the perimeter (rate limits, App Check, CORS, signature
verification, SSRF, headers, error/secret hygiene). The **one remaining structural gap** is
that there is **no real authentication**:

- `web/components/AuthProvider.tsx` just loads the *first* user document in Firestore and uses
  its ID as the "uid". There is no login.
- Every Cloud Function trusts a `uid` supplied by the client (request body, or callable
  `req.data` fallback) — it never verifies who the caller is.
- `firestore.rules` is `allow read, write: if true` on user data — anyone can read/write any
  user's documents directly, bypassing all the function-level hardening.

This is acceptable **only** while the app is single-user (just you). The moment a second real
person uses it, their data is fully exposed to anyone. This spec closes that gap and, in the
same stroke, sets up the architecture so a **native iOS app** is a thin client on top of the
same authenticated API.

---

## Guiding principle

> **The backend (Cloud Functions + Firestore rules) is the single source of truth for identity.**
> Clients (web today, iOS later) authenticate with Firebase Auth, obtain an ID token, and send it
> with every request. The server *derives* the uid from the verified token and never trusts a
> client-supplied uid again. Firestore rules enforce `request.auth.uid == uid` so even direct DB
> access is safe.

If Part A is built correctly, Part B (iOS) reuses the exact same backend contract — no
server changes needed for the second client.

---

## Current state inventory (what touches identity today)

| Area | File(s) | Today | After |
|---|---|---|---|
| Client auth | `web/components/AuthProvider.tsx` | loads first user doc | real Firebase Auth state |
| Firebase init | `web/lib/firebase.ts` | `getAuth(app)` exported, **unused** | drives sign-in/out + ID token |
| Direct DB access | `web/lib/storage.ts`, `web/lib/chats.ts` | client reads/writes `users/{uid}/**` by passed uid | unchanged code, but uid === auth uid + rules enforce it |
| HTTP endpoints | `functions/main.py` (`analyze_link`, `analyze_image`, `ask_brain`, `get_article`, `share_ingest`) | `uid = data.get('uid')` | `uid = verified_token.uid` |
| Callables | `functions/main.py` (`get_share_config`, `send_digest_now`), `functions/search.py` (`search_links`) | `req.auth.uid` **or** client `uid`/`test_uid` fallback | `req.auth.uid` only |
| WhatsApp | `functions/main.py` `whatsapp_webhook`, `link_service.find_user_by_phone` | phone → uid lookup | phone must be linked by an authed user |
| Share/Shortcut | `share_ingest` + `ensure_ingest_token` | per-user secret token | unchanged (token is the right model for headless capture) |
| Rules | `firestore.rules`, `storage.rules` | `users/**` open; storage already scoped | locked to `request.auth.uid` |

> ⚠️ **Latent bug to fix in passing:** `firestore.rules` covers `users/{uid}` and
> `users/{uid}/links/{linkId}` but **not** `users/{uid}/chats/{chatId}` (Firestore rules do not
> cascade). The new chat-history feature only works today because the parent rule is wide open.
> The locked rules below must explicitly cover `links`, `chats`, and any future subcollection.

---

# PART A — Real Authentication (web)

## A1. Choose providers

- **Google Sign-In** — primary (you already use a Google/Firebase account).
- **Sign in with Apple** — add now even for web, because it is **mandatory for App Store** once
  the iOS app offers Google sign-in (Apple Guideline 4.8). Building it into the shared
  auth layer now avoids rework later.
- Enable both in Firebase Console → Authentication → Sign-in method.

## A2. Client — replace the fake AuthProvider

Rewrite `web/components/AuthProvider.tsx` to use real Firebase Auth:

- Use `onAuthStateChanged(auth, …)` to track `user`/`uid`/`loading`.
- Expose `{ uid, user, loading, signInWithGoogle, signInWithApple, signOut }` via context.
- `uid` becomes `auth.currentUser.uid` (Google/Apple uid) — **not** a Firestore doc lookup.
- Keep the existing timezone-persist side effect, but write it to `users/{authUid}`.

Add a **login screen** (new `web/components/SignIn.tsx`): shown by `AuthProvider` (or the page
shell) when `!loading && !uid`. Buttons for Google + Apple. Add a **sign-out** control in
`SettingsModal.tsx`.

Everything downstream (`storage.ts`, `chats.ts`, `Feed.tsx`, `AddLinkForm.tsx`, `AskBrain.tsx`)
already takes `uid` as a parameter, so **no change to their logic** — they simply receive the
real uid. This is the payoff of the existing `useAuth()` indirection.

## A3. Attach the ID token to API calls

The `/api/*` calls currently send only `X-Firebase-AppCheck`. Add the Firebase **ID token**:

- In `web/lib/firebase.ts`, add `authHeaders()` mirroring the existing `appCheckHeaders()`:
  ```ts
  export async function authHeaders(): Promise<Record<string,string>> {
    const u = auth.currentUser;
    if (!u) return {};
    return { Authorization: `Bearer ${await u.getIdToken()}` };
  }
  ```
- At each call site (`AddLinkForm.tsx`, `AskBrain.tsx`, `ReadingView.tsx`), merge both:
  `headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) }`.
- Verify the rewrites (`web/vercel.json`, `firebase.json`) forward the `Authorization` header
  (they forward arbitrary headers today — App Check already relies on this).

## A4. Backend — verify the ID token, stop trusting client uid

Add a helper in `functions/main.py` (next to `_require_app_check`):

```python
from firebase_admin import auth as fb_auth

def _verified_uid(req):
    """Return the uid from a verified Firebase ID token, or None."""
    hdr = req.headers.get("Authorization", "")
    if not hdr.startswith("Bearer "):
        return None
    try:
        return fb_auth.verify_id_token(hdr.split(" ", 1)[1])["uid"]
    except Exception as e:
        logger.warning("ID token verification failed: %s", e)
        return None
```

In every HTTP endpoint that currently does `uid = data.get('uid')`
(`analyze_link`, `analyze_image`, `ask_brain`), replace with:

```python
uid = _verified_uid(req)
if not uid:
    return _error_response("Authentication required", 401, headers)
```

…and **delete** the `uid` field from the request bodies / client payloads (it's now derived,
not sent). `get_article` is read-only and stateless — it can stay unauthenticated, but keep
App Check + rate limit on it.

`process_link_background` already stores `uid` from the queued doc; that's fine because the
**producer** (`share_ingest`) now writes a verified/token-resolved uid.

## A5. Callables — remove the client-uid fallback

In `get_share_config` and `send_digest_now` (`main.py`) and `search_links` (`search.py`),
remove the `req.data.get("uid"|"test_uid")` fallback and require `req.auth`:

```python
if not req.auth:
    raise https_fn.HttpsError(code=UNAUTHENTICATED, message="Sign in required")
uid = req.auth.uid
```

The web client must call these via the Firebase Functions SDK (`httpsCallable`) so the SDK
attaches the auth context automatically (it largely does already).

## A6. Lock down the rules

`firestore.rules` — replace the open block with per-user ownership covering **all**
subcollections (note the explicit `chats` and a defensive recursive rule):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      // Covers links, chats, and any future per-user subcollection.
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
    match /pending_processing/{docId} { allow read, write: if false; }
    match /task_logs/{docId}         { allow read, write: if false; }
    match /rate_limits/{docId}       { allow read, write: if false; }
  }
}
```

`storage.rules` — already scoped to `request.auth.uid == uid` for screenshots; it starts
working correctly the moment the client is actually authenticated. No change required, but
re-verify after auth lands.

Deploy rules with `firebase deploy --only firestore:rules,storage`.

## A7. Data migration (critical — do not skip)

Existing data lives under `users/{oldPrototypeUid}` (the doc id the prototype picked). Your
Google/Apple sign-in mints a **different** uid. Without migration, your links/chats/settings
appear to vanish at first login.

**Recommended (one-time, you are effectively the only user):**

1. Sign in once with Google in a throwaway/locked deploy to learn your real `authUid` (read it
   from the Auth console or `console.log`).
2. Run a one-off admin script (new `functions/migrate_user.py`, run locally with the service
   account) that, inside a batch, copies:
   - `users/{oldUid}` doc fields → `users/{authUid}`
   - `users/{oldUid}/links/**` → `users/{authUid}/links/**`
   - `users/{oldUid}/chats/**` → `users/{authUid}/chats/**`
   - `screenshots/{oldUid}/**` in Storage → `screenshots/{authUid}/**`
   - any `ingestToken`, `phone_number`, `settings`, `email`, `timezone`.
3. Re-trigger embedding backfill if needed (`backfill_embeddings.py`) since new link docs may
   re-fire `sync_link_embedding`.
4. Verify, then delete the old doc tree.

**Alternative (general, if you ever onboard others before migrating):** keep a
`auth_links/{authUid} -> dataUid` mapping and resolve it server-side. More complex; only worth
it if multiple legacy users exist. For a single user, the copy approach is simpler and cleaner.

## A8. Ancillary flows under real auth

- **WhatsApp:** the inbound webhook is already authenticated by Twilio signature (baseline).
  The phone→uid link must now be **set by an authenticated user** — add a "verify my WhatsApp
  number" step in Settings that writes `phone_number` to `users/{authUid}` (ideally with an OTP
  echo to prevent claiming someone else's number). `find_user_by_phone` is unchanged.
- **Share ingest token:** unchanged model — `get_share_config` (now auth-required) issues a
  per-user secret; the iOS Shortcut / Share Extension posts it to `/api/share`. This is the
  correct pattern for *headless* capture where interactive sign-in isn't possible. Add a
  "regenerate token" button (revocation) while you're in there.
- **Digest email:** `send_digest_now` becomes auth-only; scheduled digests are unaffected
  (they run server-side over all users).

## A9. Rollout & rollback

Phased so the app never breaks:

1. **Backend accept-both (transitional):** deploy `_verified_uid` but, if no token present,
   temporarily fall back to the old behavior behind an env flag `REQUIRE_AUTH=false`. Deploy
   client auth. Confirm tokens arrive (logs).
2. **Migrate data** (A7) for your account.
3. **Flip `REQUIRE_AUTH=true`** — endpoints now reject unauthenticated calls.
4. **Deploy locked rules** (A6) last, once the client is reliably authenticated, so direct DB
   reads/writes keep working.
- **Rollback:** set `REQUIRE_AUTH=false` and re-deploy the previous open rules (keep them in
  git history) if something breaks. App Check stays soft until auth is proven.

## A10. Testing & verification

- Unauthenticated `curl` to `/api/analyze` → `401`.
- Authenticated call (paste a real ID token) → works and writes under the token's uid.
- Signed-in user A cannot read user B's `users/{B}/links` from the browser console (rules deny).
- Chats read/write still work (confirms the `chats` rule fix).
- Screenshots load in-app (confirms storage rules now that `request.auth` is non-null).
- Sign-out clears state and returns to the login screen.

---

# PART B — Native iOS app (future)

The whole point of Part A is that iOS becomes a **second client of the same authenticated API**.
If Part A ships, the server needs **zero** changes for iOS.

## B1. Architecture decision

| Option | Effort | When |
|---|---|---|
| **Keep the PWA** (current Firebase Hosting site, "Add to Home Screen") | ~0 | fine for personal use today |
| **Native SwiftUI app** hitting the same Cloud Functions API + Firestore via the Firebase iOS SDK | Medium | when you want share extension, push, App Store presence, native feel |
| Hybrid (WKWebView wrapper) | Low | quick App Store presence; weak native UX — not recommended long-term |

Recommended target: **native SwiftUI** reusing the existing API contract.

## B2. Shared backend contract (the payoff)

iOS uses the identical pattern: Firebase Auth → ID token → `Authorization: Bearer` + App Check
header → `/api/analyze|analyze-image|chat|article|share`. Firestore reads (links/chats) go
directly through the Firebase iOS SDK under the same locked rules. **No new endpoints.**

## B3. Firebase Auth on iOS

- Firebase Auth iOS SDK with **Google Sign-In** *and* **Sign in with Apple**.
- ⚠️ **App Store Guideline 4.8** requires offering Sign in with Apple if you offer Google —
  this is why A1 adds Apple now.
- Same ID token contract as web.

## B4. App Check on iOS

- iOS uses the **App Attest / DeviceCheck** provider (not reCAPTCHA).
- The backend `_require_app_check` already verifies *any* valid App Check token regardless of
  provider, so **no backend change** — just register the iOS app in Firebase Console → App Check
  with App Attest, and initialize it in the iOS app.

## B5. Capture: Share Extension

- An iOS **Share Extension** lets the user share a URL from any app into the brain.
- Reuse the existing `share_ingest` + per-user ingest token (B works headlessly, no interactive
  auth in the extension sandbox) — same flow the current iOS Shortcut uses.

## B6. Reminders / notifications

- Replace/augment WhatsApp reminders with **APNs push via FCM**. Store the device FCM token on
  `users/{uid}`; the existing `reminder_service` / scheduled functions send to FCM instead of
  (or in addition to) Twilio. WhatsApp capture can remain as an input channel.

## B7. App Store considerations

- **Privacy nutrition labels** + a **published privacy policy** (the deferred legal item — now
  required for submission). Declare: account info (email), user content (saved links/notes),
  identifiers.
- If you ever add tracking/analytics SDKs, **App Tracking Transparency** prompt.
- Account **deletion** in-app is required (Guideline 5.1.1(v)) — add a "delete my account +
  data" path (deletes `users/{uid}/**`, storage, auth user).

## B8. iOS phasing

1. SwiftUI shell + Firebase Auth (Google + Apple) → reads links/chats from Firestore.
2. Add link / ask-brain / reading view calling the existing `/api/*`.
3. App Check (App Attest) + App Store privacy/deletion requirements.
4. Share Extension (capture) + FCM push reminders.

---

## File-by-file change list (Part A)

- `web/components/AuthProvider.tsx` — real Firebase Auth state + sign-in/out methods.
- `web/components/SignIn.tsx` *(new)* — login screen (Google + Apple).
- `web/components/SettingsModal.tsx` — sign-out, regenerate ingest token, WhatsApp number verify.
- `web/lib/firebase.ts` — `authHeaders()` helper; ensure Apple provider available.
- `web/components/AddLinkForm.tsx`, `AskBrain.tsx`, `ReadingView.tsx` — add `...authHeaders()`;
  stop sending `uid` in bodies.
- `functions/main.py` — `_verified_uid` helper; swap `data.get('uid')` → verified uid in
  `analyze_link`, `analyze_image`, `ask_brain`; auth-require `get_share_config`, `send_digest_now`;
  `REQUIRE_AUTH` flag for phased rollout.
- `functions/search.py` — `search_links` require `req.auth`.
- `functions/migrate_user.py` *(new, run-once)* — re-home prototype data to the real auth uid.
- `firestore.rules` — lock to `request.auth.uid == uid`, cover `links`/`chats`/`{document=**}`,
  deny `rate_limits`.
- `storage.rules` — re-verify (no change expected).
- `docs/` / privacy policy — for App Store later.

## Risks & gotchas

- **Migration data loss** — the #1 risk. Back up (`gcloud firestore export`) before migrating.
- **Rules-before-client ordering** — deploy locked rules *after* the client reliably sends auth,
  or the app breaks. Use the phased `REQUIRE_AUTH` flag.
- **`chats` rule omission** — must be covered or chat history breaks under locked rules.
- **ID token forwarding through rewrites** — confirm Vercel/Hosting forward `Authorization`.
- **Apple sign-in setup** — needs an Apple Developer account + Service ID + key; lead time.
- **Token cost** — `getIdToken()` is cached/auto-refreshed; don't fetch per keystroke.

## Suggested sequence (checklist)

1. [ ] Enable Google + Apple providers in Firebase Console.
2. [ ] Build `AuthProvider` + `SignIn` + sign-out; keep `REQUIRE_AUTH=false`.
3. [ ] Add `authHeaders()` + attach to `/api/*`; deploy; confirm tokens in logs.
4. [ ] `gcloud firestore export` backup.
5. [ ] Write + run `migrate_user.py` to your real auth uid; verify data.
6. [ ] Add `_verified_uid`; switch endpoints + callables to verified uid.
7. [ ] Flip `REQUIRE_AUTH=true`; deploy functions.
8. [ ] Deploy locked `firestore.rules` (+ storage); run the A10 tests.
9. [ ] (Later) iOS: SwiftUI + Firebase Auth → reuse the API; App Attest; Share Extension; FCM;
   privacy policy + account deletion for App Store.
