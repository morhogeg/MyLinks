# SecondBrain PWA

A "Second Brain" progressive web app for capturing, analyzing, and retrieving knowledge.

## Quick Start

```bash
# Navigate to web directory
cd web

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
MyLinks/
├── web/                    # Next.js 15 PWA (TypeScript)
│   ├── app/                # Pages and API routes
│   ├── components/         # React components
│   ├── lib/                # Utilities and services
│   └── public/             # Static assets & PWA manifest
└── functions/              # Python Cloud Functions (placeholder)
```

## Features

- ✅ Add links via the UI (+ button)
- ✅ AI-powered content analysis (mock for local testing)
- ✅ Search and filter saved links
- ✅ Archive/favorite functionality
- ✅ Dark mode design
- ✅ PWA support (iOS Add to Home Screen)

## TODO: Production Integration

### Firebase Setup
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and init
firebase login
firebase init
```

### Environment Variables
```bash
# web/.env.local
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
USE_MOCK_AI=false

# Functions secrets
firebase functions:secrets:set ANTHROPIC_API_KEY
```

### Deploy
```bash
firebase deploy
```

## Development

### Local Python Functions
```bash
cd functions
pip install -r requirements.txt
python main.py  # Starts Flask on :5001
```

### Test Webhook
```bash
curl -X POST http://localhost:5001/webhook/whatsapp \
  -d "From=+1234567890&Body=https://example.com"
```
