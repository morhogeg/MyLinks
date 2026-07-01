# iOS → TestFlight automation

`.github/workflows/ios-testflight.yml` builds the web bundle, syncs it into the
Capacitor iOS app, archives, and uploads to TestFlight **on a macOS runner** —
so no one has to open Xcode. It runs automatically on pushes to `main` that touch
`web/**`, and can be run by hand from the **Actions** tab → *iOS → TestFlight* →
*Run workflow*.

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
| `IOS_DIST_CERT_P12_BASE64` | Apple **Distribution** certificate incl. private key, base64 | Xcode → Settings → Accounts → Manage Certificates, or Keychain Access → export your "Apple Distribution" cert as `.p12`. Then `base64 -i cert.p12 \| pbcopy`. |
| `IOS_DIST_CERT_PASSWORD` | Password you set when exporting the `.p12` | — |
| `IOS_KEYCHAIN_PASSWORD` | Any random string (temp keychain password) | e.g. `openssl rand -base64 16` |

Signing profiles are created/renewed automatically by `-allowProvisioningUpdates`
using the API key, so you don't need to manage provisioning profiles by hand.

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
