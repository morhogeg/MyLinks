# Machina AI

**Your AI-powered personal knowledge base — save anything, then just ask.**

Machina AI captures links and images from wherever you find them, reads and
analyzes them with AI, and turns the pile into a knowledge base you can actually
query. The hero is the **Recall Engine**: ask a question in plain language and get
a cited answer drawn from your own saves.

> "What did I save about mortgage rates?" → a written answer, with the exact cards
> it came from.

---

## What it does

### Capture from anywhere

- **iOS share sheet** — a native Share Extension saves links, text, and images
  straight into your library from any app.
- **In-app add** — paste a URL or upload an image (screenshots included — the AI
  reads them).
- **Browser extension** — one-click capture from Chrome, Edge, and Brave, plus a
  Safari build via a native wrapper. It's a thin client that POSTs to the same
  ingest endpoint the share sheet uses.

Everything lands on the same backend, which scrapes the content, analyzes it, and
syncs the finished card back to your feed in real time.

### Intelligence on every save

- **Gemini analysis** — a structured summary, a category, tags, and the key
  concepts, generated for each item.
- **Semantic search** — embeddings power meaning-based search, not just keyword
  matching.
- **Knowledge graph** — a "See also" set of related cards is computed on every
  save, so connections surface as your library grows.
- **Ask Machina** — hybrid retrieval-augmented chat over your own content, with
  inline citations back to the source cards and persistent chat history.

### Stay on top of it

- **Reminders** — spaced-repetition nudges to revisit what matters.
- **Curated digests** — a scheduled, hand-picked batch of cards in six modes
  (smart mix, surprise, by topic, backlog, favorites, rediscover), delivered via
  push or email on your schedule.
- **Weekly synthesis** — an AI-written recap of the week's saves: themes, a
  standout, an open question, all cited back to your content.
- **Collections + public share pages** — group cards and publish server-rendered,
  OG-tagged pages to share a set or a single card.
- **Reading view + text-to-speech** — a clean reader with the option to listen.

---

## Tech stack

| Layer | Tech |
|---|---|
| Web frontend | Next.js 16 · React 19 · Tailwind CSS v4 · TypeScript |
| iOS app | Capacitor 8 shell + a native Swift **Share Extension** |
| Backend | Python 3.13 Firebase Cloud Functions |
| Data | Firestore (with vector search for embeddings) + Cloud Storage |
| AI | Google Gemini (flash-lite for analysis & vision) · `gemini-embedding-001` for search |
| Auth | Firebase Authentication (Google + Sign in with Apple) |

The web app is deployed to Vercel; the backend runs as Cloud Functions; the iOS
app ships to TestFlight via GitHub Actions.

---

## Project structure

```
MyLinks/
├── web/                      # Next.js frontend + Capacitor iOS shell
│   ├── app/                  # App Router pages + API routes
│   │   ├── page.tsx          # Main feed
│   │   ├── privacy/, terms/  # Public legal pages
│   │   └── api/              # Thin proxies (analyze, analyze-image, article, chat)
│   ├── components/           # React components
│   │   ├── Feed.tsx          # The main feed (search, filters, view modes)
│   │   ├── AskBrain.tsx      # Ask Machina (RAG chat)
│   │   ├── Card.tsx          # Card display
│   │   ├── LinkDetailModal.tsx
│   │   ├── ReadingView.tsx   # Reader + text-to-speech
│   │   ├── DigestView.tsx    # Curated digests
│   │   ├── SynthesisCard.tsx # Weekly synthesis
│   │   └── CollectionsGallery.tsx
│   ├── lib/                  # Client services (firebase, auth, search, types…)
│   └── ios/App/              # Capacitor shell + ShareExt/ native Share Extension
├── functions/                # Python Firebase Cloud Functions
│   ├── main.py               # HTTP/trigger entry points
│   ├── ai_service.py         # Gemini analysis + RAG
│   ├── scraper.py            # Content extraction
│   ├── search.py             # Semantic search + embeddings
│   ├── graph_service.py      # "See also" knowledge graph
│   ├── link_service.py       # Card CRUD
│   ├── digest_service.py     # Curated digests
│   ├── reminder_service.py   # Reminders
│   └── push_service.py       # FCM/APNs push
├── extension/                # Chromium browser extension (MV3)
└── safari/                   # Safari wrapper build script
```

---

## Quick start

### Prerequisites

- Node.js 18+
- Python 3.13 (for the Cloud Functions backend)
- A Firebase project (for anything beyond the local UI)

### Run the web app

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Create `web/.env.local` with your Firebase web config:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### The backend

The backend is a set of **Firebase Cloud Functions**, not a local server — there's
no `python main.py`. Configuration (including `GEMINI_API_KEY`) lives in
`functions/.env`, and deploys go through `./deploy-functions.sh` with explicit
function targets. See the deploy script and the docs for details.

---

## Roadmap

Shipped and stable today: capture surfaces, Gemini analysis, semantic search, the
knowledge graph, Ask Machina, reminders, curated digests, weekly synthesis,
collections, and reading view with TTS.

On the roadmap:

- **Voice capture and voice ask** — talk to your library.
- **Proactive observations** — surface contradictions and reinforcements across
  your saves without being asked.
- **Auto-collections** — cluster concepts and embeddings into suggested
  collections.
- **Export** — Markdown / PDF / HTML from the reading view.

---

## License

All rights reserved. This repository does not currently ship an open-source
license.
