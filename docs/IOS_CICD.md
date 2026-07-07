# iOS → TestFlight automation

`.github/workflows/ios-testflight.yml` builds the web bundle, syncs it into the
Capacitor iOS app, archives, and uploads to TestFlight **on a macOS runner** —
so no one has to open Xcode. During the auth cutover the automatic push trigger
is **commented out**, so today it runs **manually only**: from the **Actions**
tab → *iOS → TestFlight* → *Run workflow*. (Re-enable the `push` trigger in the
workflow once the native auth setup is confirmed — see the note in the workflow.)

The build number is `1000 + <run number>`, so it always increases and stays well
clear of the manual builds.

## One-time setup — add these repo secrets

GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**.

I can't add these for you: they're your private Apple + Firebase credentials.

### Apple signing / upload
| Secret | What it is | How to get it |
| --- | --- | --- |
| `ASC_KEY_ID` | App Store Connect API key ID | [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) → create a key with **App Manager** role. It's the "Key ID". |
| `ASC_ISSUER_ID` | Issuer ID | Same page, shown above the keys list. |
| `ASC_KEY_P8_BASE64` | The `.p8` key file, base64 | Download the key once (`AuthKey_XXXX.p8`), then: `base64 -i AuthKey_XXXX.p8 \| pbcopy` |

### Stable signing certificate (one-time — this is what stops the cert-cap failures)

**Why you need this.** Without it, every CI run signs with a *throwaway*
certificate: a GitHub runner starts with an empty keychain, so automatic signing
asks Apple to **mint a new Apple Development certificate each run**, and that cert
dies with the runner. Apple only allows **2 Development certificates per account**,
so every few builds the Archive step fails with *"maximum number of certificates"*
and you have to revoke certs by hand at developer.apple.com. Importing one
**persistent** certificate that CI reuses ends this for good — no more revoking.

Do this once, on your Mac:

1. **Create the certificate(s).** Xcode → **Settings → Accounts** → pick your team
   → **Manage Certificates…** → click **+** and add **Apple Distribution** (if you
   don't already have one). If there's no **Apple Development** entry, add that too.
   Both now live in your **login keychain** with their private keys.
2. **Export them together.** Open **Keychain Access** → **login** keychain →
   category **My Certificates**. Select **Apple Distribution: … (8Y2M94RUHG)** *and*
   **Apple Development: …** (⌘-click both) → right-click → **Export 2 items…** →
   save as `signing.p12` → set a password when prompted. Exporting both covers the
   archive (Development) and the store export (Distribution) so neither step mints.
3. **Base64 it:** `base64 -i signing.p12 | pbcopy`
4. **Add two repo secrets:**

| Secret | What it is |
| --- | --- |
| `BUILD_CERTIFICATE_P12_BASE64` | the base64 from step 3 |
| `BUILD_CERTIFICATE_PASSWORD` | the password you set in step 2 |

The workflow's **Install signing certificate** step imports this into a temporary
keychain each run; automatic signing then **reuses** it (`-allowProvisioningUpdates`
+ the API key still auto-manage the *profiles*, which are uncapped). Until the
secret exists the workflow logs a warning and falls back to the old minting
behavior, so adding it is safe to do anytime. **Don't revoke these two certs** —
they're the ones CI now depends on.

### Native Firebase / Sign in with Apple (from the auth cutover)

The app bundles the native Firebase Auth pod + the Sign in with Apple
entitlement, so an iOS build additionally needs:

| Secret | What it is | How to get it |
| --- | --- | --- |
| `GOOGLE_SERVICE_INFO_PLIST_BASE64` | The iOS Firebase config, base64 | Firebase Console → Project settings → add an iOS app (bundle `com.morhogeg.machina`) → download `GoogleService-Info.plist`, then `base64 -i GoogleService-Info.plist \| pbcopy`. Gitignored — CI writes it into the App target at build time. |

Plus a one-time Apple-Developer toggle (not a secret): **Identifiers →
`com.morhogeg.machina` → enable Sign in with Apple → Save**, so the
cloud-managed profile can include that entitlement.

Local `./build-ios.sh` builds also need `GoogleService-Info.plist` placed at
`web/ios/App/App/GoogleService-Info.plist` (same file; it stays gitignored).

### Firebase web config (baked into the bundle at build time)
Copy these from `web/.env.local`:

`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.

(These ship in the public client bundle anyway, so they're config, not real secrets — but keeping them here means the workflow builds identically to your Mac.)

## First run
Once the secrets are in: Actions tab → *iOS → TestFlight* → **Run workflow** on
`main`. Watch the log. The first run of any signing pipeline often needs a small
tweak (Xcode version, an entitlement) — ping me with the failing step and I'll
fix the workflow.
