# Firestore locked-rules emulator tests

Verifies `../firestore.rules.locked` (the auth-cutover target ruleset) against
the app's **real** client access patterns before it is deployed
(`NATIVE_AUTH_SETUP.md` §6 step 4). Covers:

- Owner (Auth uid present in the doc's `authUids`) can read/write their
  `users/{uid}` doc and `links` / `chats` / `collections`; can **read** (not
  write) `syntheses` — those are written by Cloud Functions via the Admin SDK.
- The cutover-critical **workspace-resolve list query**
  (`collection('users').where('authUids','array-contains', authUid)` — what
  `AuthProvider.resolveDataDoc` runs) succeeds for the owner; the legacy
  unfiltered `limit(1)` query is denied.
- A different signed-in uid and an unauthenticated client can access nothing
  under `users/**`.
- `shared_cards` / `shared_collections` are publicly readable but writable only
  by the owner of the `ownerUid` workspace (forged `ownerUid` denied).
- `rate_limits`, `pending_processing`, `task_logs` are denied to every client.

## Prerequisites

- Node 18+ and **Java 11+** (the Firestore emulator is a JAR;
  `java -version` to check).
- No Firebase project/credentials needed — the tests run against the local
  emulator with the offline `demo-machina-rules` project id.

## Run

```bash
cd firestore-rules-test
npm install
npm test
```

`npm test` runs `firebase emulators:exec --only firestore --project
demo-machina-rules "node --test rules.test.mjs"` — it boots the Firestore
emulator (downloading the emulator JAR on first run), loads
`firestore.rules.locked`, runs the suite, and tears the emulator down.

If you already have a Firestore emulator running on `127.0.0.1:8080`
(e.g. `firebase emulators:start` from the repo root), run the suite directly:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:against-running-emulator
```

(The rules file is loaded programmatically by the tests, so it doesn't matter
which rules file the running emulator was started with.)

## Notes

- The fixture mirrors production shapes: the user doc id is a phone number
  (`+15551234567`) and the Firebase Auth uid is a separate random string linked
  via `authUids` (see `AUTH_SPEC.md` §2).
- The `users` read rule is deliberately `resource`-based
  (`request.auth.uid in resource.data.authUids`) rather than the `get()`-based
  `owns()` helper: list rules can't call `get()` with the unbound `{uid}`
  wildcard, so an `owns()`-based read rule would reject the workspace-resolve
  query and every sign-in would dead-end on the restricted screen. The list
  test here is what catches that class of regression.
- If the new-user onboarding path ever creates `users/{id}` **client-side**
  (instead of in `claim_workspace`), the rules need an `allow create` — today
  client-side create is denied and the test asserts that.
