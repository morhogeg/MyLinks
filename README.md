# Machina AI — Ask Your Saves

> Save a link, image, or video from anywhere; Machina reads it with AI and later
> you just **ask**. "What did I save about mortgage rates?" → an answer, with
> sources. It's not a bookmark manager — it's recall over your own knowledge.

Machina AI (`com.morhogeg.machina`) is an AI-powered personal knowledge base:
capture content from the iOS share sheet, WhatsApp, the web UI, or a browser
extension → a Python Cloud Function scrapes it and Google Gemini analyzes it → a
structured card (summary, category, tags, concepts, embedding, related links)
lands in a real-time feed with semantic search, cited RAG answers, spaced
reminders, curated digests, weekly synthesis, and collections.

---

## What it actually does

### Capture from anywhere
- **iOS Share Extension** — share links, text, or images into Machina from any
  app; a native scan HUD shows real progress and never falsely reports success.
- **WhatsApp** — forward a link (English/Hebrew) to the Machina number; reply
  `DIGEST`, `STOP DIGEST` / `START DIGEST` for digest controls.
- **Web** — add a URL or upload an image/screenshot from the web app.
- **Browser extension** — save the current page from Chrome/Edge/Brave (a Safari
  converter is included).

### Understand every save
- **AI analysis** (Google Gemini) — a real summary, category, tags, and concepts
  for each link, image, or YouTube video (native video understanding).
- **Connections** — every save is checked against your library; cross-category
  concept clusters surface threads a category filter can't reproduce.

### Recall
- **Ask Machina** — hybrid RAG chat that answers *only* from what you saved and
  cites the cards it used (streaming on web, chat history kept).
- **Semantic search** — vector search over your saves, not just keyword match.
- **Reading view + text-to-speech**, reminders, favorites, archive, collections
  with public share pages, and a **weekly synthesis** written from your week's
  saves.

### Stay engaged
- **Curated digest** — a hand-picked set of cards **daily or weekly** over email
  and/or WhatsApp, with several curation modes (smart mix, backlog, rediscover,
  random, by topic, favorites), on your own schedule; never sends an empty one.

---

## Architecture

- **Frontend** — Next.js 16 + React 19 + Tailwind v4 (`web/`). One bundle serves
  desktop web (Vercel) and the native iOS shell.
- **iOS app** — Capacitor 8 shell (`web/ios/`) + a native Share Extension
  bridged through an App Group; shipped to TestFlight via GitHub Actions.
- **Backend** — Python 3.13 Firebase Cloud Functions (`functions/`), Gemini for
  analysis/vision and embeddings, Twilio for WhatsApp, SendGrid/SMTP for email
  digests.
- **Data** — Firestore (`users/{uid}/…` with `links`, `chats`, `collections`,
  `syntheses` subcollections); public `shared_cards` / `shared_collections`
  snapshots for share pages.

Deploy surfaces: **desktop web** → Vercel (auto on push to `main`); **iOS** →
the "iOS → TestFlight" GitHub Actions workflow; **Functions** →
`./deploy-functions.sh`; **Firebase Hosting** backs the `/api/*` rewrites and the
`/s`, `/c` share pages.

---

## Development

```bash
# Web
cd web
npm ci
npm run dev            # http://localhost:3000
npx tsc --noEmit       # typecheck

# Functions
cd functions
python3.13 -m venv venv && venv/bin/pip install -r requirements.txt
python -m py_compile *.py
```

Configuration lives in env, never in the bundle:

- `web/.env.local` — `NEXT_PUBLIC_FIREBASE_*` client config (see
  `web/VERCEL.md`).
- `functions/.env` (gitignored) — `GEMINI_API_KEY`, `TWILIO_*`, etc. as plain
  env vars (not Secret Manager — see `SOURCE_OF_TRUTH.md` §2).

The single source of truth for product state, the ranked backlog, the auth
cutover, and the ship process is **`SOURCE_OF_TRUTH.md`** — start there.

---

## Project structure

```
MyLinks/
├── web/                       # Next.js frontend + Capacitor iOS shell
│   ├── app/                   # Routes (page.tsx, /privacy, /terms, api proxies)
│   ├── components/            # Feed, Card, LinkDetailModal, AskBrain, Settings…
│   ├── lib/                   # api, firebase, auth, storage, search helpers
│   └── ios/                   # Capacitor shell + native Share Extension
├── functions/                 # Python Cloud Functions
│   ├── main.py                # HTTP endpoints, WhatsApp webhook, schedulers
│   ├── ai_service.py          # Gemini analysis / RAG / synthesis
│   ├── scraper.py             # SSRF-guarded content extraction
│   ├── search.py              # Embeddings + vector search
│   ├── graph_service.py       # Connections / related links
│   ├── digest_service.py      # Curated digest + weekly synthesis
│   └── whatsapp_handler.py    # Twilio webhook handling
├── extension/                 # Browser extension (Chrome/Edge/Brave)
├── firestore.rules(.locked)   # Live rules + the staged post-cutover ruleset
└── SOURCE_OF_TRUTH.md         # Product/architecture/backlog — read first
```

---

## Status & license

Machina AI is a commercial product heading to the App Store — see
`SOURCE_OF_TRUTH.md` §4 for the launch backlog. This repository is **not** open
source; all rights reserved. Not currently accepting external contributions.

Built with Google Gemini, Firebase, Next.js, and Capacitor.
