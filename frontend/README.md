# Vaarta — बात कaro. Form bhar jao.
> Turn any form into a warm, bilingual conversation.

## Setup

```bash
npm install
cp .env.example .env.local   # Set NEXT_PUBLIC_API_URL
npm run dev                   # → localhost:3000
```

## Pages

| Route | Who | What |
|---|---|---|
| `/agent` | Agent | Dashboard — all forms, stats |
| `/agent/upload` | Agent | Upload form, AI extracts fields |
| `/agent/form/[id]/edit` | Agent | Drag bbox editor, rename fields, publish |
| `/agent/form/[id]` | Agent | Sessions, completion rate, download PDFs |
| `/chat/[id]` | User | Bilingual chat to fill the form |

## Design

**Colors:** Deep teal `#0D3D3A` · Saffron `#E8873A` · Cream `#FAF6EF`  
**Fonts:** Fraunces (display) · Plus Jakarta Sans (body)  
**Motion:** Spring physics via Framer Motion

## Features

- Drag-and-drop bounding box editor (move, resize, 8 handles)
- Reorder fields by dragging cards
- Double-click any field label to rename inline
- QR code generation with Vaarta logo center
- WhatsApp message preview + direct share
- Bilingual chat (English / Hindi) with language toggle
- Voice input in en-IN or hi-IN
- CSV export of all collected data
- Animated progress bar per session
