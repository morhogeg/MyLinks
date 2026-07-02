# Handoff — finish native Sign in with Apple + Google (iOS → TestFlight)

**Goal:** get the iOS app building **with working native Sign in with Apple + Google**
and the GitHub Actions **iOS → TestFlight** workflow green, uploading to TestFlight.
Do **NOT** ship a UI-only build — the real native auth is wanted.

Repo: `morhogeg/MyLinks`. Work on branch `claude/ios-ui-refinements-8pe0s1`.
`main` auto-deploys to Vercel (desktop).

---

## Step 1 — revert the temporary workaround

In `.github/workflows/ios-testflight.yml`, remove the CI step that strips the auth
plugin — this line (added in commit `ca1e9dd`):

```
sed -i '' '/CapacitorFirebaseAuthentication/d' ios/App/CapApp-SPM/Package.swift
```

We want the native `@capacitor-firebase/authentication` plugin **included**, not removed.

## Step 2 — fix the real blocker (native dependency conflict)

The native archive fails compiling `@capacitor/share@8.0.1`:

```
SharePlugin.swift: error: value of type 'CAPPluginCall' has no member 'reject'
SharePlugin.swift: error: missing argument for parameter #2 in call   (call.getString)
```

Root cause: adding `@capacitor-firebase/authentication@8.3.0` makes SPM resolve
`capacitor-swift-pm` to a version incompatible with `@capacitor/share@8.0.1`.

- `@capacitor/share@8.0.1` is the latest; its `Package.swift` uses
  `capacitor-swift-pm from: "8.0.0"`.
- The committed `web/ios/App/CapApp-SPM/Package.swift` is **stale** (lists only
  Share + Haptics, pins `capacitor-swift-pm exact: "8.4.1"`). `cap sync` regenerates
  it in CI to add the firebase-auth plugin.
- Nobody has successfully built the post-cutover iOS app yet.

Figure out the correct aligned Capacitor / SPM version set. Ideas: check what
`capacitor-swift-pm` version `@capacitor-firebase/authentication` actually pulls
(`node_modules/@capacitor-firebase/authentication/Package.swift`); pin
`capacitor-swift-pm`; and/or bump the Capacitor suite; ensure the generated
`Package.swift` / `Package.resolved` resolve to a set where Share, Haptics, and
firebase-auth all compile. **This needs iterating on a real macOS build (CI).**

## Step 3 — verify, then flip the flags

After CI is green and a build reaches TestFlight, verify Apple + Google sign-in on
device. Only then do the cutover flip (turn on `REQUIRE_AUTH` /
`NEXT_PUBLIC_REQUIRE_AUTH` and deploy the locked `firestore.rules`) per
`NATIVE_AUTH_SETUP.md`.

---

## Already done (don't redo)

- **CI workflow** `.github/workflows/ios-testflight.yml` — macOS runner: builds web,
  `cap sync`, writes `GoogleService-Info.plist` from a secret, **cloud-managed
  signing** (`-allowProvisioningUpdates` + App Store Connect API key), archive,
  export, `altool` upload. Build number = `1000 + run_number`. Docs:
  `docs/IOS_CICD.md`.
- **Repo secrets SET** (GitHub → Settings → Secrets → Actions): `ASC_KEY_ID`,
  `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `GOOGLE_SERVICE_INFO_PLIST_BASE64`,
  `NEXT_PUBLIC_FIREBASE_*` (6), `IOS_KEYCHAIN_PASSWORD`. No `.p12` dist cert —
  signing is cloud-managed.
- **Apple Developer:** "Sign in with Apple" capability **enabled** on App ID
  `com.morhogeg.machina`.
- **Firebase:** iOS app added; `GoogleService-Info.plist` is a secret and is
  registered as an App-target bundle resource in
  `web/ios/App/App.xcodeproj/project.pbxproj` (file is gitignored; CI writes it).
- **Node 22** in CI (Capacitor 8 CLI needs >= 22). Web build + Firebase config +
  code signing all **pass** in CI — only the `@capacitor/share` native compile fails.
- The auth **code** is done and flag-gated behind `REQUIRE_AUTH` /
  `NEXT_PUBLIC_REQUIRE_AUTH` (OFF by default) — see `NATIVE_AUTH_SETUP.md`. Web /
  desktop is unaffected. All the non-auth UI work (List view, header safe-area fix,
  mobile search, Collections/Ask header unification, tour copy, detail-modal delete)
  is already on `main` + desktop and folds into the CI build once it's green.

## Run / debug CI

```bash
gh workflow run "iOS → TestFlight" --repo morhogeg/MyLinks --ref main
gh run watch "$(gh run list --workflow=ios-testflight.yml --repo morhogeg/MyLinks -L1 --json databaseId -q '.[0].databaseId')" --repo morhogeg/MyLinks
gh run view <run-id> --log-failed --repo morhogeg/MyLinks
```

## Notes

- Coordinate with the parallel auth-cutover work — it owns `NATIVE_AUTH_SETUP.md`
  and the Capacitor dependency choices.
- **Rotate the App Store Connect API key** (`ASC_KEY_P8`) — it was pasted in
  plaintext during setup. Regenerate at App Store Connect → Users and Access →
  Integrations → App Store Connect API, then update the `ASC_*` secrets.
