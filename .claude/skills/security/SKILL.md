---
name: security
description: Code-level security pass on Machina AI (repo MyLinks). Finds and FIXES vulnerabilities that live in the repo — auth/token verification on endpoints, per-uid tenant isolation, the staged Firestore ruleset, SSRF in the scraper, prompt injection, PII in logs and world-readable docs, CORS, rate limits, client token storage. Strictly excludes owner-only console/config work (flipping REQUIRE_AUTH, deploying rules, setting env vars, rotating keys) — those are collected into an owner-action list and handed back, never attempted. Use when the user says security, harden, vulnerability, audit the code, "check X for security", or names an area (/security functions, /security share, /security rules, /security scraper).
---

# Security — code-level hardening pass on Machina AI

The argument names the target area (`functions`, `share`, `rules`, `scraper`,
`ask`, `auth`, `ios`, `web`). With no argument, pick the highest-value target
from `SOURCE_OF_TRUTH.md` §4 (security items are ranked there) and say which you
picked before starting.

## The boundary — read this first

**You do CODE. The owner does CONSOLE.** This skill exists because the biggest
levers in this project (task 2 cutover, task 5 key hygiene) are owner steps, and
a security session that stalls waiting on them delivers nothing.

**IN scope — do it, fix it, verify it:**
- Anything in `functions/`, `web/`, `extension/`, `safari/`, `web/ios/`
- `firestore.rules.locked`, `storage.rules`, `firestore.indexes.json` — the
  **staged files** are code. Editing them is yours; deploying them is not.
- `firestore-rules-test/rules.test.mjs`, `functions/tests/**` — new regression
  tests proving a fix holds
- `.github/workflows/**` — permissions scoping, secret handling in CI *config*

**OUT of scope — never attempt, always hand back:**
- Flipping `REQUIRE_AUTH` / `NEXT_PUBLIC_REQUIRE_AUTH` (the §3 cutover)
- `firebase deploy --only firestore:rules` (the point of no return in §4 task 2)
- Setting `ADMIN_TOKEN`, `APPCHECK_ENFORCE`, `OWNER_EMAIL`, or any functions env
- Rotating the Gemini key or the App Store Connect `.p8` (§4 task 5)
- Anything in the Firebase / Vercel / App Store Connect / GitHub-secrets consoles
- Emulator runs that need owner credentials

When you find one of these, **do not stop and do not ask**. Write it to the
owner-action list (step 6), keep working on the code half, and hand the list back
at the end. Where a fix has a code half and an owner half, ship the code half.

## Steps

### 1. Onboard (silent)

Run the `/onboard` reading steps: `CLAUDE.md`, `SOURCE_OF_TRUTH.md` §1–§3 (§3 is
the auth state — every finding's severity depends on it), §4 (the ranked
backlog, where security items already live), and the newest §9 entries. Then
`AUDIT.md` for the existing finding-ID scheme (`H-1`, `S-2`, `S-6`, `N-2a`) —
**reuse those IDs**, don't invent a parallel numbering. No narration.

### 2. Establish the flag state

Every judgement here is conditional on the cutover. Confirm from §3, not memory:
pre-cutover, `_authed_uid` falls back to the client-supplied `uid` and live rules
are `allow read, write: if true`. So:

- **Do not report "the client can forge a uid" as a new finding.** It is the
  known, documented pre-cutover posture (§3), and the fix is an owner step.
- **Do** report any code path that would still be broken *after* the flag flips.
  That is the real work: the cutover must be a config change, not a code change.
- Trace both branches of every `_authed_uid` / `REQUIRE_AUTH` call site.

### 3. Sweep the target through every lens

`/security-review` is a reasonable first sweep to seed candidates, but you own
the triage — it doesn't know this codebase's flag state or its accepted
trade-offs. Walk the target through all eight lenses:

1. **Auth on the edge.** Every `@https_fn.on_request` in `functions/main.py` that
   touches user data must reach `_verify_bearer` or `_authed_uid` before any
   read/write. Admin paths (`backfill_related_links`) must be admin-gated.
   Callables vs HTTP twins must enforce *identically* — the twins exist because
   of the `capacitor://localhost` CORS bug, and it is easy for one to drift.
2. **Tenant isolation / IDOR.** Every Firestore query scoped to the caller's uid.
   Collection-group queries (reminders, digests) are the classic leak. A doc ID
   supplied by the client is never trusted as proof of ownership.
3. **The staged ruleset.** Read `firestore.rules.locked` as the spec it is: any
   collection the code writes must have a matching rule, deny-by-default. Every
   change gets a case in `firestore-rules-test/rules.test.mjs`.
4. **SSRF in the scraper.** `functions/scraper.py` fetches user-supplied URLs —
   this is the app's core function and its sharpest edge. Check redirect
   following, internal/link-local address ranges, response size and time caps,
   and what a redirect to a metadata endpoint would return to the caller.
5. **Prompt injection & AI surface.** Scraped page content reaches `ai_service.py`
   and `ask_brain`. Untrusted text must not be able to redirect the model into
   tool/DB behavior or exfiltrate other users' context. Check input caps and
   history windows.
6. **Secrets & PII.** No key material in the repo. Nothing world-readable that
   carries identity — `ownerUid` (= a phone number) in `shared_*` docs was a real
   leak (§4 5a); check that the pattern hasn't recurred. Same for log lines.
7. **CORS & transport.** `_allowed_origins()` in `functions/main.py` is the one
   allowlist — no wildcards, no reflected `Origin`, capacitor origins present.
8. **Client-side.** Token storage on iOS (audit `H-1`: App Group UserDefaults →
   Keychain), `dangerouslySetInnerHTML` / `innerHTML` in `web/`, and XSS on the
   public `/s` and `/c` share pages, which render untrusted scraped content.

### 4. Verify before reporting

A finding is only real if you can point at the code path. State it as
`file.py:line` plus the concrete sequence that reaches it. **Kill anything you
can't trace** — a false positive here costs the owner a cutover-day panic. If a
protection exists elsewhere in the chain, say so and drop the finding.

Rank what survives: exploitable-today > exploitable-after-cutover > defence in
depth. Check each against `AUDIT.md` — several mediums are already accepted
trade-offs (e.g. `S-6` fail-closed-on-Firestore-outage). Don't relitigate them.

### 5. Fix, then prove it

Fix in ranked order. Keep each fix scoped to one finding — no drive-by
refactors in a security diff, they make review impossible.

Verify, and paste real output:
```bash
cd functions && python -m py_compile *.py          # backend
cd functions && python -m pytest tests/ -q          # 389 tests; see §4 11b re: the 4 known-red mocks
cd web && ./node_modules/.bin/tsc --noEmit          # frontend, must exit 0
cd firestore-rules-test && npm test                 # rules — needs the emulator; owner machine if it can't run here
```
Every fix gets a regression test. A rules change that isn't covered in
`rules.test.mjs` is not done.

### 6. Hand back the owner actions

End with a section titled **Owner actions (not done by me)**. For each: the one
concrete step, where it's performed, and what it unblocks. No step is too
obvious to list. If the pass found nothing owner-side, say that explicitly —
silence reads as "forgot", not "clean".

### 7. Document (mandatory)

Per `CLAUDE.md`, never create a new audit doc — the old ones were consolidated.
Update `SOURCE_OF_TRUTH.md`:
- **§4** — check off fixed items, add newly-found ones ranked into P0/P1/P2 with
  their `AUDIT.md` ID, and record deferred owner steps against the item they block.
- **§9** — prepend a dated entry: what was fixed (commit SHAs, `file:line`), what
  was investigated and dismissed *and why* (this stops the next session
  re-finding it), and the owner-action list verbatim.

Then ship via `/ship`. If the fix touches `functions/`, scope the deploy with a
`Deploy-Functions:` line on the merge commit.

## Notes

- **Severity is flag-dependent.** Say which state you're describing. "World-
  writable rules on a public app are a data breach, not a finding" (§6) — but
  pre-launch, pre-cutover, they're the documented posture.
- **Don't touch `firestore.rules`** (the live file). Stage everything in
  `firestore.rules.locked`; the swap is owner step §4 task 2.
- One area per pass. A diff spanning the scraper, the rules, and iOS token
  storage can't be reviewed or rolled back cleanly.
