# FormFlow Frontend

Built with Next.js 14, Tailwind CSS, Framer Motion.

## Design System

**Color palette** — Navy + Paper + Amber accent
- `#1B2B4B` Navy — primary backgrounds, chat surface
- `#F4F1EB` Paper — agent dashboard background  
- `#C9893A` Amber — CTAs, highlights, progress
- `#0E1628` Ink — body text
- `#4A6080` Steel — borders, muted elements

**Typography**
- `Playfair Display` — headings, display text
- `DM Sans` — body, UI text  
- `JetBrains Mono` — code, IDs, numbers

## Pages

| Route | User | Purpose |
|-------|------|---------|
| `/agent` | Agent | Upload form, see fields, copy link |
| `/agent/form/[formId]` | Agent | Session tracking, download PDFs |
| `/chat/[formId]` | End user | Conversational form filling |

## Setup

```bash
cd frontend
npm install

cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL to your backend URL

npm run dev
# → http://localhost:3000
```

## Connecting to backend

All API calls go through `src/lib/api.ts`.
Set `NEXT_PUBLIC_API_URL=http://localhost:8000` (or your deployed backend).

## File structure

```
src/
├── app/
│   ├── layout.tsx              ← Root layout, fonts, toasts
│   ├── page.tsx                ← Redirects to /agent
│   ├── agent/
│   │   ├── page.tsx            ← Agent dashboard (upload + forms list)
│   │   └── form/[formId]/
│   │       └── page.tsx        ← Form detail + sessions
│   └── chat/[formId]/
│       └── page.tsx            ← User chat interface
├── lib/
│   └── api.ts                  ← All backend API calls
└── styles/
    └── globals.css             ← Fonts, Tailwind, base styles
```

## Features

**Agent side**
- Drag-and-drop upload with animated progress stages
- Real-time bounding box overlay on form preview (hover a field → highlights on form image)
- Copy shareable chat link in one click
- Session dashboard with progress bars
- Download filled PDFs per session

**User side**
- Clean WhatsApp-style chat UI on dark navy
- Animated progress bar (fills as user answers)
- Voice input via Web Speech API (Indian English, `en-IN`)
- Typing indicator while bot processes
- Completion card with summary + PDF download

## Production deployment

```bash
# Vercel (recommended)
vercel --prod

# Or build manually
npm run build
npm start
```
