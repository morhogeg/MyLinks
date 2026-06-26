# 🌟 MyLinks - Your AI-Powered Second Brain

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase">
  <img src="https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA">
  <img src="https://img.shields.io/badge/AI-Gemini-8E8E8E?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI">
</p>

> Transform your saved links into intelligent, searchable knowledge. MyLinks captures content from anywhere, analyzes it with AI, and transforms it into a personal knowledge base you can actually use.

---

## 🚀 Why MyLinks?

### The Problem

You save hundreds of links every month — articles, videos, resources — with the intention of reading them "later." But:

- 📚 **Bookmark overload** — Links pile up in browser bookmarks, never to be seen again
- 🔍 **Can't find what you need** — No context, no search, no retrieval system
- ⏰ **Lost insights** — Forgot what that article was actually about
- 📱 **Scattered everywhere** — Links in WhatsApp, emails, social media, nowhere unified

### The Solution

**MyLinks** automatically captures, analyzes, and organizes your web content using AI. It's not just a bookmark manager — it's your **second brain** that understands what you save.

---

## ✨ Key Features

### 🤖 AI-Powered Intelligence
- **Automatic Analysis** — Every link is analyzed using Google Gemini AI
- **Smart Summaries** — Get concise summaries of any article or video
- **Auto-Categorization** — Automatically categorizes content (Tech, Health, Business, Philosophy, etc.)
- **Intelligent Tagging** — AI suggests relevant tags for easy organization

### 📥 Multi-Channel Capture
- **WhatsApp Integration** — Forward links directly from WhatsApp
- **Manual Entry** — Add URLs via the intuitive UI
- **Image Upload** — Upload screenshots — AI reads and analyzes them
- **YouTube Deep Analysis** — Extracts transcripts, timestamps, and key insights from videos

### 🔍 Powerful Search & Discovery
- **Full-Text Search** — Search through titles, summaries, content
- **Tag-Based Filtering** — Filter by tags, categories, date
- **Graph Visualization** — See how your knowledge connects
- **Insights Dashboard** — Analytics on your reading habits

### 📱 Modern PWA Experience
- **Installable App** — Add to home screen on iOS & Android
- **Works Offline** — Access your saved links without internet
- **Dark/Light Theme** — Beautiful themes for day and night
- **Responsive Design** — Works perfectly on mobile and desktop

### 📊 Organization & Productivity
- **Card & Table Views** — Choose your preferred display mode
- **Reminders** — Set reminders to revisit important links
- **Favorites** — Star your most important content
- **Archive** — Keep your library clean

### 📬 Curated Digest
- **Scheduled delivery** — Get a hand-picked set of cards **daily or weekly**
- **Email and/or WhatsApp** — Choose one or both channels
- **Curation modes** — *Smart mix*, *Surprise me* (random), *By topic*, *Backlog* (oldest unread), *Favorites*, or *Rediscover* (resurface old saves you forgot)
- **Your schedule** — Pick the day/hour in your own timezone
- **Send one now** — Preview your digest instantly from Settings
- **Skip-when-empty** — Never sends a hollow digest
- **WhatsApp controls** — Reply `DIGEST` for an on-demand batch, or `STOP DIGEST` / `START DIGEST` to pause and resume

---

## 🏆 What Makes MyLinks Different?

| Feature | MyLinks | Pocket | Instapaper | Notion | Raindrop.io |
|---------|---------|--------|------------|--------|-------------|
| AI Analysis | ✅ Gemini | ❌ | ❌ | ❌ | ❌ |
| WhatsApp Capture | ✅ | ❌ | ❌ | ❌ | ❌ |
| Image Analysis | ✅ | ❌ | ❌ | ❌ | ❌ |
| YouTube Deep Analysis | ✅ | ❌ | ❌ | ❌ | ❌ |
| Knowledge Graph | ✅ | ❌ | ❌ | ❌ | ❌ |
| PWA (Offline) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Free & Open Source | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, TypeScript, React
- **UI**: Tailwind CSS, Shadcn UI components
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage
- **AI**: Google Gemini
- **Backend**: Python Cloud Functions
- **PWA**: Service Workers, Web App Manifest

---

## 🚦 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+ (for backend functions)
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
pip install -r requirements.txt
python main.py
```

### Test WhatsApp Webhook

```bash
curl -X POST http://localhost:5001/webhook/whatsapp \
  -d "From=+1234567890&Body=https://example.com"
```

---

## 📁 Project Structure

```
MyLinks/
├── web/                    # Next.js 15 PWA (TypeScript)
│   ├── app/                # Pages and API routes
│   │   ├── page.tsx       # Main dashboard
│   │   └── api/           # API endpoints
│   ├── components/        # React components
│   │   ├── AddLinkForm.tsx      # Link submission form
│   │   ├── Card.tsx             # Link card display
│   │   ├── Feed.tsx              # Main content feed
│   │   ├── GraphView.tsx         # Knowledge graph
│   │   ├── InsightsFeed.tsx      # Analytics dashboard
│   │   ├── LinkDetailModal.tsx   # Link details view
│   │   ├── ReminderModal.tsx     # Reminder settings
│   │   ├── TagExplorer.tsx       # Tag browser
│   │   └── ThemeToggle.tsx       # Dark/light mode
│   ├── lib/               # Utilities and services
│   │   ├── ai-service.ts  # AI analysis integration
│   │   ├── firebase.ts    # Firebase configuration
│   │   ├── types.ts       # TypeScript definitions
│   │   └── storage.ts     # Storage utilities
│   └── public/            # Static assets & PWA manifest
│       └── manifest.json  # PWA configuration
└── functions/             # Python Cloud Functions
    ├── ai_service.py      # Gemini AI integration
    ├── scraper.py         # Web content extraction
    ├── graph_service.py   # Knowledge graph logic
    ├── link_service.py    # Link CRUD operations
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

# AI Service
USE_MOCK_AI=false
GEMINI_API_KEY=your_gemini_key
```

### Firebase Setup

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and initialize
firebase login
firebase init

# Deploy
firebase deploy
```

---

## 📈 Roadmap & Future Features

Based on competitor analysis (Pocket, Instapaper, Notion, Obsidian, Readwise, Raindrop.io), here are planned enhancements:

### High Priority
- [ ] **Browser Extensions** — Save links from any website
- [ ] **Text-to-Speech** — Listen to articles
- [ ] **Clean Reading View** — Distraction-free article display
- [ ] **Export Options** — PDF, Markdown, HTML export

### Medium Priority
- [ ] **Reading Time Estimates** — Show estimated read time
- [ ] **Reading Progress** — Track how much you've read
- [ ] **Highlights & Annotations** — Like Readwise
- [ ] **Public Profile** — Share your favorite links

### Lower Priority
- [ ] **API Access** — Third-party integrations
- [ ] **RSS Feed Import** — Import from feed readers
- [x] **Curated Digest** — Scheduled email/WhatsApp digest of curated cards (random, by topic, backlog, rediscover & more)
- [ ] **Social Sharing** — Share to Twitter, LinkedIn

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT License — feel free to use this project for any purpose.

---

## 🙏 Acknowledgments

- [Google Gemini](https://gemini.google.com) — AI analysis
- [Firebase](https://firebase.google.com) — Database & Auth
- [Next.js](https://nextjs.org) — React framework
- [Shadcn UI](https://ui.shadcn.com) — Beautiful components

---

<p align="center">
  <strong>⭐ Star this repo if you find it useful!</strong>
</p>
