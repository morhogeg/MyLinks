# Handoff — native Sign in with Apple + Google (iOS → TestFlight)

**Status (2026-07-02): CI is GREEN with real native auth.** The GitHub Actions
**iOS → TestFlight** workflow builds the app with the native
`@capacitor-firebase/authentication` plugin **included** (no UI-only strip),
archives, and uploads to TestFlight.

- ✅ Green run: <https://github.com/morhogeg/MyLinks/actions/runs/28598643851>
  → **build 1006** ("UPLOAD SUCCEEDED with no errors").
- Fix commit: `1749caa` — `ci(ios): build native auth on macos-26 (Xcode 26)`.

Repo: `morhogeg/MyLinks`. `main` auto-deploys to Vercel (desktop).

---

## What was actually wrong (the earlier diagnosis was incorrect)

The archive was failing to compile `@capacitor/share@8.0.1`:

```
SharePlugin.swift: error: value of type 'CAPPluginCall' has no member 'reject'
SharePlugin.swift: error: missing argument for parameter #2 in call   (call.getString)
```

The old theory — "adding firebase-auth resolves `capacitor-swift-pm` to an
incompatible version" — is **wrong**. Verified: with firebase-auth in the graph,
SPM still resolves `capacitor-swift-pm` to **8.4.1** (identical to the UI-only
build; Firebase/Facebook/GoogleSignIn don't depend on it).

Real root cause: **[ionic-team/capacitor#8333](https://github.com/ionic-team/capacitor/issues/8333)**.
The Capacitor 8 SPM binary (`Capacitor.xcframework`) gates core APIs
(`CAPPluginCall.reject`, `getString(_ key:)`, `bridge.viewController`, …) behind
the Swift feature `$NonescapableTypes`. That feature is **inactive under Xcode
16.2** (the old `macos-14` runner, Swift 6.0) → the symbols are stripped from the
`.swiftinterface` → `@capacitor/share` fails to compile. It is **active under
Xcode 26** (Swift 6.2.1) → the symbols are visible → Share, Haptics and
firebase-auth all compile. Verified directly: `#if $NonescapableTypes` evaluates
`true` on the Xcode 26 toolchain.

This is why stripping firebase-auth never actually produced a green build either —
Share was going to fail against Xcode 16.2 regardless. It only *looked* like
firebase-auth's fault because the auth cutover is what bumped the app onto the
affected Capacitor 8.4.1 SPM binary.

## The fix (done)

`.github/workflows/ios-testflight.yml`:
- `runs-on: macos-14` → **`macos-26`** (ships Xcode 26 / Swift 6.2.1).
- Xcode-select glob `Xcode_16*` → **`Xcode_26*`**.
- **Removed** the temporary `sed -i '' '/CapacitorFirebaseAuthentication/d' …`
  strip, so the native auth plugin stays in the archive.

Nothing else changed. `cap sync` still regenerates the SPM manifest in CI (pins
`capacitor-swift-pm exact: "8.4.1"`, adds firebase-auth), and xcodebuild resolves
Firebase `12.15.0` / Facebook `18.1.0` / GoogleSignIn `9.2.0` fresh.

---

## Remaining work — device verification, then the auth cutover

The native auth **binary** is now on TestFlight but the runtime is still
flag-gated OFF (`REQUIRE_AUTH` / `NEXT_PUBLIC_REQUIRE_AUTH`), so web/desktop is
unaffected. Do NOT flip the flags until sign-in is verified on a device.

1. Install build 1006 from TestFlight on a device. Verify **Apple** and **Google**
   sign-in actually work (the plugin returns an OAuth credential that `lib/auth.ts`
   bridges into the Firebase JS SDK — `skipNativeAuth: true`).
2. Only then do the cutover flip: turn on `REQUIRE_AUTH` /
   `NEXT_PUBLIC_REQUIRE_AUTH` and deploy the locked `firestore.rules`, per
   `NATIVE_AUTH_SETUP.md`. Coordinate with the parallel auth-cutover work that
   owns that file.
3. Optionally re-enable the auto-build `push:` trigger in the workflow (still
   commented out) once the native path is trusted.

## Already done (don't redo)

- **CI workflow** — macos-26/Xcode 26 runner: builds web, `cap sync`, writes
  `GoogleService-Info.plist` from a secret, cloud-managed signing
  (`-allowProvisioningUpdates` + App Store Connect API key), archive, export,
  `altool` upload. Build number = `1000 + run_number`. Docs: `docs/IOS_CICD.md`.
- **Repo secrets SET**: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`,
  `GOOGLE_SERVICE_INFO_PLIST_BASE64`, `NEXT_PUBLIC_FIREBASE_*` (6),
  `IOS_KEYCHAIN_PASSWORD`. No `.p12` dist cert — signing is cloud-managed.
- **Apple Developer:** "Sign in with Apple" capability enabled on App ID
  `com.morhogeg.machina`.
- **Firebase:** iOS app added; `GoogleService-Info.plist` is a secret, registered
  as an App-target bundle resource (gitignored; CI writes it).
- The auth **code** is done and flag-gated behind `REQUIRE_AUTH` /
  `NEXT_PUBLIC_REQUIRE_AUTH` (OFF) — see `NATIVE_AUTH_SETUP.md`.

## Run / debug CI

```bash
gh workflow run "iOS → TestFlight" --repo morhogeg/MyLinks --ref main
gh run watch "$(gh run list --workflow=ios-testflight.yml --repo morhogeg/MyLinks -L1 --json databaseId -q '.[0].databaseId')" --repo morhogeg/MyLinks
gh run view <run-id> --log-failed --repo morhogeg/MyLinks
```

## Notes

- If a future Capacitor release rebuilds the xcframework without the
  `$NonescapableTypes` gating (#8333 fixed), the `macos-26` pin is no longer
  load-bearing but remains fine.
- **Rotate the App Store Connect API key** (`ASC_KEY_P8`) — it was pasted in
  plaintext during setup. Regenerate at App Store Connect → Users and Access →
  Integrations, then update the `ASC_*` secrets.
