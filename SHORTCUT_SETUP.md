# Save to Second Brain — iOS Shortcut Setup

This adds **"Save to Second Brain"** to your iPhone/iPad share sheet. Tap Share in any app
(Safari, Google Maps, Instagram, X, …) → pick it → the link is captured, AI-analyzed, and
appears in your feed within seconds.

> Why a Shortcut and not the app directly? iOS does not let a web app (PWA) register as a
> share target. An Apple Shortcut can — and it posts straight into the same pipeline.

---

## 1. Get your endpoint + token

In the app: **Settings → Share to Second Brain**. You'll see two values:

- **Endpoint URL** — e.g. `https://secondbrain-app-94da2.web.app/api/share`
- **Ingest Token** — a long random string (keep it private)

Copy both (tap the copy button). You'll paste them in step 2.

---

## 2. Build the Shortcut

Open the **Shortcuts** app → **+** (new shortcut) → name it **Save to Second Brain**.

1. **Shortcut details / Info** → enable **Show in Share Sheet**.
   - Under *Share Sheet Types*, keep **URLs** and **Text** enabled (you can turn the rest off).
2. Add action **Get Contents of URL**. Configure it:
   - **URL**: paste your **Endpoint URL**.
   - Expand **Show More**:
     - **Method**: `POST`
     - **Headers**: add one →
       - Key: `X-Ingest-Token`
       - Value: paste your **Ingest Token**
     - **Request Body**: `JSON`
       - Add field → Key: `url`, Type: `Text`, Value: tap the field and insert the
         **Shortcut Input** variable (the magic variable passed from the share sheet).
3. *(Optional)* Add action **Show Notification** with text like `Saved ✅` so you get
   confirmation. You can pass the previous action's result if you want details.

That's it. Save the shortcut.

---

## 3. Use it

In **Safari**: tap **Share** → scroll to **Save to Second Brain**.
In **Google Maps**: open a place → **Share** → **Save to Second Brain** (captures the
`maps.app.goo.gl` link).
Same in Instagram, X, News, etc.

Open the app — the new card appears in your feed, analyzed like any other link.

---

## Notes & troubleshooting

- **Duplicates**: re-sharing the same URL is ignored — it won't create a second card.
- **"No URL found"**: the shared item had no link (e.g. a plain photo). Share something with a URL.
- **403 / Invalid token**: re-copy the token from Settings (it may have been regenerated).
- **Security**: the token is your key. If it leaks, we can rotate it (regenerate) later.
- The Shortcut sends `{ "url": "<shared text or url>" }`; the server extracts the first
  `http(s)` link, so sharing text that contains a link also works.
