# 🌟 Machina AI — Your AI-Powered Knowledge Brain

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="iOS">
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase">
  <img src="https://img.shields.io/badge/AI-Gemini-8E8E8E?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI">
</p>

> Save a link from anywhere and Machina turns it into a structured, searchable
> card — then lets you **ask your own knowledge and get a cited answer back**.
> Not another bookmark pile: a recall engine for everything you've saved.

---

## 🚀 Why Machina AI?

### The Problem

You save hundreds of links every month — articles, videos, posts — meaning to
read them "later." But:

- 📚 **Bookmark overload** — links pile up and are never seen again
- 🔍 **Can't find what you need** — no context, no real search, no retrieval
- ⏰ **Lost insight** — you forget what that article was even about
- 📱 **Scattered everywhere** — links stuck in WhatsApp, the share sheet, the browser

### The Solution

**Machina AI** captures content from wherever you find it, analyzes it with
Google Gemini, and files it as a structured card in a real-time feed. The hero
isn't storage — it's **recall**: semantic search and a RAG chat ("Ask Machina")
that answers questions from your own library, with citations back to the cards.

---

## ✨ Key Features

### 🧠 The Recall Engine
- **Ask Machina** — ask a natural-language question and get an answer synthesized
  from your saved cards, with citations to the sources it used
- **Semantic search** — find saves by meaning, not just keywords (vector search
  over per-card embeddings)
- **Related cards** — every save is connected to the most related things you've
  already saved, surfaced on the card

### 📥 The widest capture surface in the category
- **iOS Share Extension** — share a link or image into Machina from any app
- **WhatsApp** — forward a link (or a screenshot) straight from a chat
- **Browser extension** — save the current page from your desktop browser
- **Manual entry & image upload** — paste a URL, or upload a screenshot and let
  AI read it

### 🤖 AI analysis on every save
- **Structured cards** — Gemini produces a title, concise summary, category,
  tags, and key concepts for each save
- **Platform-aware scraping** — dedicated handling for X/Twitter, Instagram,
  Facebook, LinkedIn, and YouTube
- **Native YouTube understanding** — videos are analyzed by Gemini's native video
  ingestion (no fragile transcript scraping), with a graceful metadata-only fallback

### 📖 Read & listen
- **Clean reading view** — a distraction-free, article-structured reader
- **Text-to-speech** — listen to a saved article

### 📬 Curated Digest
- **Scheduled delivery** — a hand-picked set of cards **daily or weekly**
- **Email and/or WhatsApp** — choose one or both channels
- **Curation modes** — *Smart mix*, *Surprise me* (random), *By topic*,
  *Backlog* (oldest unread), *Favorites*, or *Rediscover* (resurface old saves)
- **Your schedule** — pick the day/hour in your own timezone
- **Send one now** — preview your digest instantly from Settings
- **Skip-when-empty** — never sends a hollow digest
- **WhatsApp controls** — reply `DIGEST` for an on-demand batch, or
  `STOP DIGEST` / `START DIGEST` to pause and resume

### 🗂️ Organize & revisit
- **Collections** — group related cards
- **Reminders** — resurface an important save later
- **Favorites & archive** — star what matters, keep the library clean
- **Weekly synthesis** — a short AI recap of what your week of reading added up to
- **Dark / light theme**

---

## 🏆 What makes Machina AI different?

| Feature | Machina AI | Pocket | Instapaper | Notion | Raindrop.io |
|---------|:----------:|:------:|:----------:|:------:|:-----------:|
| Ask-your-library RAG chat | ✅ | ❌ | ❌ | ❌ | ❌ |
| Semantic (vector) search | ✅ | ❌ | ❌ | ❌ | ❌ |
| AI analysis on save | ✅ Gemini | ❌ | ❌ | ❌ | ❌ |
| WhatsApp capture | ✅ | ❌ | ❌ | ❌ | ❌ |
| Image / screenshot analysis | ✅ | ❌ | ❌ | ❌ | ❌ |
| Native YouTube understanding | ✅ | ❌ | ❌ | ❌ | ❌ |
| Curated email/WhatsApp digest | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI**: Tailwind CSS v4 (design-token theme)
- **iOS app**: Capacitor 8 shell + native Share Extension
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage
- **AI**: Google Gemini (analysis, vision, embeddings)
- **Backend**: Python Firebase Cloud Functions
- **Messaging**: Twilio (WhatsApp), SendGrid/SMTP (email digests)

---

## 🚦 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.13 (for backend functions)
- Firebase account (for production)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/morhogeg/MyLinks.git
cd MyLinks

# Install web dependencies
cd web
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running Backend Functions (Optional)

```bash
cd functions
python3.13 -m venv venv
venv/bin/pip install -r requirements.txt
```

---

## 📁 Project Structure

```
MyLinks/
├── web/                    # Next.js app (TypeScript) + Capacitor iOS shell
│   ├── app/                # Pages and API routes
│   │   ├── page.tsx        # Main app
│   │   └── api/            # API route handlers
│   ├── components/         # React components
│   │   ├── AddLinkForm.tsx      # Link submission form
│   │   ├── Feed.tsx             # Main content feed
│   │   ├── Card.tsx             # Link card display
│   │   ├── AskBrain.tsx         # "Ask Machina" RAG chat
│   │   ├── ReadingView.tsx      # Clean reading view + TTS
│   │   ├── DigestView.tsx       # Curated digest surface
│   │   ├── SynthesisCard.tsx    # Weekly AI synthesis
│   │   ├── CollectionsGallery.tsx  # Collections
│   │   ├── LinkDetailModal.tsx  # Card detail view
│   │   ├── ReminderModal.tsx    # Reminder settings
│   │   ├── TagExplorer.tsx      # Tag browser
│   │   └── ThemeToggle.tsx      # Dark/light mode
│   ├── ios/                # Capacitor iOS project + Share Extension
│   ├── lib/                # Utilities and services
│   │   ├── firebase.ts     # Firebase configuration
│   │   ├── types.ts        # TypeScript definitions
│   │   └── storage.ts      # Data-layer helpers
│   └── public/             # Static assets
├── extension/              # Browser extension
└── functions/              # Python Cloud Functions
    ├── ai_service.py       # Gemini analysis, vision, embeddings
    ├── scraper.py          # Platform-aware content extraction
    ├── search.py           # Semantic (vector) search
    ├── graph_service.py    # Related-card connections
    ├── digest_service.py   # Curated digest + weekly synthesis
    ├── reminder_service.py # Reminders
    ├── link_service.py     # Link/user CRUD
    └── whatsapp_handler.py # WhatsApp webhook handler
```

---

## 🔧 Configuration

### Environment Variables

Create `web/.env.local`:

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Create `functions/.env` (gitignored — plain env vars, not Secret Manager):

```bash
GEMINI_API_KEY=your_gemini_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
```

### Firebase Setup

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login
```

---

## 🗺️ Roadmap

- [x] **Curated Digest** — scheduled email/WhatsApp digest of curated cards
- [x] **Browser extension** — save the current page from desktop
- [x] **Clean reading view + Text-to-speech**
- [x] **Weekly AI synthesis** — "what you learned this week"
- [ ] **Highlights & annotations**
- [ ] **Export** — Markdown / PDF
- [ ] **API access** — third-party integrations

---

## 🤝 Contributing

Contributions are welcome! Please feel free to open an issue or submit a Pull
Request.

---

## 📄 License

MIT License — feel free to use this project for any purpose.

---

## 🙏 Acknowledgments

- [Google Gemini](https://gemini.google.com) — AI analysis
- [Firebase](https://firebase.google.com) — Database, Storage & Auth
- [Next.js](https://nextjs.org) — React framework
- [Capacitor](https://capacitorjs.com) — native iOS shell

---

<p align="center">
  <strong>⭐ Star this repo if you find it useful!</strong>
</p>
