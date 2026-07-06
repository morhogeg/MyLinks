---
name: testflight
description: Trigger and babysit a Machina AI "iOS → TestFlight" GitHub Actions run to a green upload — pre-flight checks, dispatch, watching, and the full failure-diagnosis playbook (Apple cert cap, entitlement tripwire, Xcode toolchain, stale web bundle, queued runs). Use when the user says "TestFlight build", "iOS build", "get a build out", "kick CI", or when /ship reaches its TestFlight step and the run needs watching or fails.
---

# TestFlight — run the iOS build to green

The workflow is `.github/workflows/ios-testflight.yml` (repo `morhogeg/MyLinks`,
manual dispatch only during the auth cutover). Build number = **1000 + run
number**, strictly increasing, shared across all sessions via the
`ios-testflight` concurrency group. History: runs #6→#41 hit every failure mode
below at least once — the playbook is the value of this skill.

## 1. Pre-flight (do NOT skip)

- [ ] **Sync with `origin/main`.** A build contains only its own ref's code.
      Two parallel sessions once shipped builds minutes apart, each missing the
      other's feature. If building from `main`, make sure the branch is merged
      first (usually this runs inside `/ship` after the merge step).
- [ ] **Does this change even need a build?** Backend-only → no. Web-only → only
      if the user wants the app updated (Vercel already shipped it). Anything
      under `web/ios/`, `capacitor.config.ts`, `Info.plist`, entitlements, or a
      web change the user wants on iOS → yes. Ask when ambiguous — builds are
      heavy (macOS runner + Apple processing).
- [ ] **Decide the `require_auth` input.** Default `false`. Set `true` only for
      builds meant to exercise the sign-in gate (it bakes
      `NEXT_PUBLIC_REQUIRE_AUTH=true` into the bundle). Never flip it "to test"
      without the user asking — pre-cutover users are on the no-auth path.
- [ ] **Check nothing is already running/queued** — the concurrency group
      serializes runs without cancelling; a queued duplicate wastes ~30 min and
      once re-exhausted the Apple cert cap. Cancel duplicates.

## 2. Trigger

Owner machine (has `gh`):
```bash
gh workflow run "iOS → TestFlight" --repo morhogeg/MyLinks --ref main
# add -f require_auth=true only when explicitly wanted
gh run watch "$(gh run list --workflow=ios-testflight.yml --repo morhogeg/MyLinks -L1 --json databaseId -q '.[0].databaseId')" --repo morhogeg/MyLinks
```

Remote session (no `gh`): use the GitHub MCP tools —
`actions_run_trigger` with `workflow_id: ios-testflight.yml`, `ref: main`
(inputs: `require_auth` if needed). If API dispatch returns 403 (has happened
from remote sessions), fall back to: tell the user to click Actions →
*iOS → TestFlight* → Run workflow, or — last resort — the temporary-push-trigger
pattern (commit that enables the `push` trigger, let it fire once, **revert the
trigger in the same session**; it is gated off for the auth cutover on purpose).

## 3. Watch

Poll the run via `gh run watch` or MCP `actions_get`/`get_job_logs`. Expected
green sequence: web build + `cap sync` guard → GoogleService plist decode →
REVERSED_CLIENT_ID injection → **signed archive** → export → **entitlement
tripwire** → `altool` upload. ~15–25 min. Do not busy-sleep; check in at
sensible intervals.

## 4. Failure playbook — diagnose by symptom

| Symptom in logs | Cause | Fix |
|---|---|---|
| Archive fails: `maximum number of certificates` | Every ephemeral runner mints an Apple *Development* cert; Apple caps them (runs #15/#16, #31) | **Owner action:** prune Development certs at developer.apple.com → Certificates (safe — they regenerate). Then re-run. Do NOT "fix" by unsigned archive or a global `CODE_SIGN_IDENTITY` override (see next two rows) |
| Tripwire step fails: App Group missing from app or ShareExt | Signing regression — entitlements bake at archive-time codesign; something made the archive unsigned or re-signed at export (build 1018's bug) | Restore the signed-archive step exactly (automatic signing + `-allowProvisioningUpdates` + ASC key). The tripwire did its job — never delete it to make CI pass |
| SPM targets fail signing | Someone set a global `CODE_SIGN_IDENTITY` — it leaks onto every SPM target (run #17) | Remove the override; per-target automatic signing only |
| `@capacitor/share` fails to compile / missing `CAPPluginCall` members | Runner/Xcode drift — Xcode 16 strips Capacitor 8's `$NonescapableTypes`-gated symbols (ionic-team/capacitor#8333) | Runner must be `macos-26`, Xcode selected via `Xcode_26*`. Never downgrade, never re-add the old `sed` strip |
| `ios/App/App/public/index.html missing` guard trips | `next build` or `cap sync ios` failed upstream | Read the web-build step logs — usually an env var (`NEXT_PUBLIC_FIREBASE_*` secrets) or a type error that slipped past |
| REVERSED_CLIENT_ID step fails | `GOOGLE_SERVICE_INFO_PLIST_BASE64` secret missing/empty or plist lacks the key | Owner re-creates the secret from a fresh GoogleService-Info.plist (docs/IOS_CICD.md) |
| Upload fails (`altool`) | ASC key secrets (`ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_KEY_P8_BASE64`) invalid/expired | Owner rotates the App Store Connect API key; note §4 task 5 already wants the pasted `.p8` rotated |
| Run sits queued | Another run holds the `ios-testflight` concurrency group | Wait, or cancel the other run if it's a duplicate. Numbers never collide (run number is unique) |
| Green run, but the app behaves like an old build | Stale web bundle — archive shipped whatever was in `public/` | Confirm the run's web-build step actually ran on the intended SHA; locally, `build-ios.sh` must fully finish before any manual Xcode archive |

Re-kick after each fix; one round is not the task — drive it to green or to a
diagnosis that needs the owner (cert prune, secret rotation), and say which.

## 5. Report + record

- Report: run link, **build number (1000 + run number)**, and that TestFlight
  availability lags upload by ~10–30 min of Apple processing.
- Record in `SOURCE_OF_TRUTH.md` §9 (the `/ship` skill's mandatory step): build
  number, what it carries, any failure/fix from the playbook, and any new failure
  mode → also add it to the §2 gotchas AND to this table.
- If sign-in behavior matters for this build, state whether it was built with
  `require_auth` and what that implies (flags are still OFF server-side
  pre-cutover).
