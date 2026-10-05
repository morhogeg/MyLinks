# E2E user journeys

Playwright walks the real web app through what a user does in their first
sessions: sign up, consent, first save, search, Ask, collections, delete a
card, export, delete the account. It runs at iPhone size, with a desktop pass
for the core paths.

```bash
cd e2e && npm ci && npx playwright install chromium
npm test        # starts the emulators, the dev server on :3100, runs everything
```

**What's real:** the Next.js app, Firebase Auth + Firestore (local emulators),
and the **live `firestore.rules`**: every client write goes through them.

**What's faked:** the Cloud Functions. `helpers.ts` `installBackend` stubs
`/api/*` and the callables. To play the pipeline, tests write the
Admin-SDK-shaped documents directly (`adminUpdate` flips a card to `ready`).
So these tests don't check Gemini output or scraping. Those live in
`functions/tests/`.

**What's not covered at all:** the native iOS shell. That means the share
extension, WKWebView quirks, haptics, the keyboard, StoreKit purchases, push,
and real Apple/Google sign-in popups (tests sign in with an emulator email
account through a hook that exists only on the localhost emulator origin; see
`web/lib/firebase.ts`). That still takes a manual pass on a phone
(SOURCE_OF_TRUTH §4 task 11).

**Known bugs** are written as `test.fail()` with a reason. They pass while the
bug exists. Once the bug is fixed, Playwright reports an unexpected pass, and
you delete the `test.fail` line.

Debug one test: `npx firebase emulators:start --only auth,firestore --project demo-machina`
in one terminal, then `npm run test:against-running-emulators -- -g "offline" --headed`.
