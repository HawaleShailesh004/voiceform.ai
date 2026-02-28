# Vaarta - Just Talk, We'll Handle the Form

### *Baat karo. Form bharo.*

> Turn any digital form into a conversation. Upload a form, share a link - users fill it by talking in Hindi or English, get the filled PDF on WhatsApp.

---

## What is Vaarta?

Vaarta has two sides:

| | **For agents** (bank branches, NGOs, CSC operators, hospitals) | **For users** (form fillers) |
|---|----------------------------------------------------------------|------------------------------|
| <img src="https://api.iconify.design/mdi:upload.svg" width="18" height="18" alt=""> | Upload any form → AI extracts every field → preview and correct the layout → share a chat link or QR code | Open the link → talk naturally in English, Hindi, or supported Indian languages (text or voice) |
| <img src="https://api.iconify.design/mdi:download.svg" width="18" height="18" alt=""> | | Receive the filled PDF directly on WhatsApp |

**No app download. No login. Just talk.**

- **One link** - no separate form app; works on any device  
- **AI mapping** - no manual “this question → this field”; the model maps answers to fields  
- **Multi-language** - Hindi, Tamil, Telugu, Bengali, Gujarati, Hinglish; auto-detected per session  
- **Resume** - users can continue later via `?session=...` in the chat URL  

---

## Demo

| **Agent - upload & edit** | **User - fill by chat** |
|--------------------------|--------------------------|
| Upload scanned form → Claude Vision extracts fields → drag-to-correct editor with live canvas preview | Open link → chat in Hindi/English → voice input → filled PDF on WhatsApp |

---

## Features

### Agent side

- **Universal form ingestion** - AcroForm PDF (~100% accuracy), scanned PDF, image PDF (50–70% accuracy with visual correction)
- **AI field extraction** - Claude Vision extracts field names, types, bounding boxes, question templates, validation rules
- **Visual field editor** - drag bounding boxes, live canvas preview with sample Indian data, per-field font/size/colour/alignment, undo/redo (50 steps), **auto-save every 6s**, **re-extract with confirmation** to avoid losing edits
- **Editor UX** - type dropdown stays aligned on scroll (portal + scroll listeners), **Chat preview** button opens `/chat/[formId]` in a new tab to test before sharing
- **Form health score** - automated A–F grade across 5 dimensions before sharing
- **Session dashboard** - All / Active / Completed filter, download PDFs, export CSV; **delete forms** from dashboard (form + sessions + filled PDFs removed)
- **Analytics** - field-level drop-off funnel, completion rate, language distribution
- **Share** - chat link, **QR code (download as PNG or SVG)** for print/WhatsApp, WhatsApp share link with pre-written message

### User side

- **Multilingual chat** - English, Hindi, Hinglish, Tamil, Telugu, Bengali, Gujarati; bot replies in the user’s language; **extracted values stored in English for PDF** when form is in English (no boxes for Indic script)
- **Voice input** - Web Speech API (en-IN / hi-IN), browser-native
- **Read aloud (TTS)** - optional **speaker toggle** in chat; when on, bot replies are spoken via Google Cloud TTS (en/hi and other Indian languages)
- **Smart inference** - e.g. "Rahul Kumar Sharma" fills first, middle, last name simultaneously
- **Checkbox & radio** - bot always asks for these (no skipping); options listed in context
- **Indian document validation** - PAN, Aadhaar, GSTIN, IFSC, TAN, mobile, pincode (invalid values not saved; no injected error text — natural replies only)
- **Session resume** - return to incomplete form via `?session=...` URL
- **WhatsApp PDF delivery** - filled form sent via Twilio; when `VAARTA_BASE_URL` is local, **Cloudinary** uploads the PDF and Twilio uses that public URL so the PDF is attached even without a public backend

---

## Tech stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **Styling** | Tailwind CSS, Framer Motion |
| **Canvas preview** | HTML5 Canvas API (client-only) |
| **AI - Extraction** | Anthropic Claude (Vision) |
| **AI - Chat** | OpenAI GPT-4o or **Groq** (OpenAI-compatible) via `CHAT_PROVIDER` |
| **Backend** | Python 3, FastAPI, Uvicorn |
| **PDF** | PyMuPDF (fitz), ReportLab, Pillow (Unicode/Indic font fallback for overlay) |
| **WhatsApp** | Twilio WhatsApp Business API; **Cloudinary** for public PDF URL when backend is local |
| **Voice - STT** | Web Speech API (browser) or Groq Whisper via `/api/audio/transcribe` |
| **Voice - TTS** | Google Cloud Text-to-Speech via `/api/audio/synthesize` (optional) |

---

## Project structure

```
vaarta/
├── backend/
│   ├── main.py                # FastAPI app, CORS, route wiring
│   ├── config.py              # Settings from env
│   ├── extractor.py           # Claude Vision + PyMuPDF field extraction
│   ├── chat_engine.py         # Chat (OpenAI or Groq), validation, no error injection
│   ├── fillback.py            # AcroForm + overlay (Unicode/Indic font fallback)
│   ├── whatsapp_delivery.py   # Twilio + Cloudinary PDF URL when local
│   ├── store.py               # Persistence facade
│   ├── prompts.py             # System prompts, checkbox/radio rules
│   ├── api/routes/            # health, agent, forms, sessions, chat, fill, whatsapp, audio
│   ├── services/tts.py        # Google TTS; services/cloudinary_storage.py
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── agent/                      # Agent dashboard, upload, form detail
│   │   │   │   ├── page.tsx                # Dashboard (list forms, delete)
│   │   │   │   ├── upload/page.tsx        # Upload form
│   │   │   │   └── form/[formId]/
│   │   │   │       ├── page.tsx            # Sessions, health, analytics
│   │   │   │       └── edit/page.tsx      # Field editor, re-extract confirm, chat preview
│   │   │   └── chat/[formId]/page.tsx      # User chat (TTS toggle, voice, WhatsApp modal)
│   │   ├── components/
│   │   │   ├── editor/FieldEditor.tsx      # Drag/resize, type dropdown (scroll fix)
│   │   │   ├── shared/
│   │   │   │   ├── AgentNav.tsx
│   │   │   │   ├── ShareModal.tsx        # QR PNG/SVG, link, WhatsApp
│   │   │   │   └── FormHealthScore.tsx
│   │   │   └── analytics/FormAnalyticalDashboard.tsx
│   │   ├── lib/api.ts                      # All API calls + types
│   │   └── styles/globals.css              # Design tokens
│   ├── tailwind.config.js
│   └── .env.local.example
│
└── backend/data/              # Auto-created (VAARTA_DATA_DIR)
    ├── forms/                 # Form schemas (JSON)
    ├── originals/            # Uploaded files
    ├── sessions/             # Session state (JSON)
    ├── filled/               # Generated PDFs
    └── session_files/        # Per-session user uploads
```

---

## Getting started

### Prerequisites

- Python 3.10+
- Node.js 18+
- API keys: [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/)
- (Optional) Twilio account for WhatsApp delivery

---

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy and fill the env file:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
VAARTA_DATA_DIR=data

# Optional - WhatsApp delivery via Twilio
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
VAARTA_BASE_URL=https://your-public-url.ngrok.io   # or leave local and use Cloudinary below
VAARTA_ALWAYS_SEND_TO=+91XXXXXXXXXX               # copy of every filled PDF to this number

# Optional - when VAARTA_BASE_URL is local, upload PDF to Cloudinary so Twilio can attach it
CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Optional - Chat: Groq (set CHAT_PROVIDER=groq) or OpenAI
CHAT_PROVIDER=openai
GROQ_API_KEY=...
GROQ_CHAT_MODEL=openai/gpt-oss-120b

# Optional - Read aloud (TTS) in chat
GOOGLE_TTS_API_KEY=...
```

Start the server:

```bash
python main.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs: **http://localhost:8000/docs**

---

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
npm run dev
```

Open **http://localhost:3000** - redirects to `/agent`.

---

### Twilio WhatsApp (optional)

**Option A – Public backend:** Set `VAARTA_BASE_URL` to your public URL (e.g. ngrok or production). Twilio fetches the PDF from `{VAARTA_BASE_URL}/api/sessions/{id}/filled-pdf`.

**Option B – Local backend:** Leave `VAARTA_BASE_URL` as localhost and set **Cloudinary** env vars (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`). The backend uploads each filled PDF to Cloudinary and sends that URL to Twilio, so the PDF is attached without exposing your machine.

**Sandbox:** Recipients must send `join <your-sandbox-word>` to your Twilio WhatsApp number first; otherwise messages may not be delivered even when the API returns 201.

---

## Environment reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude (form extraction) |
| `OPENAI_API_KEY` | Yes | GPT-4o (chat + sample values) unless using Groq |
| `BASE_URL` | Yes | Frontend base URL for share links (e.g. `http://localhost:3000`) |
| `ALLOWED_ORIGINS` | Yes | CORS (e.g. `http://localhost:3000`) |
| `VAARTA_DATA_DIR` | | Data directory (default `data`) |
| `TWILIO_ACCOUNT_SID` | | WhatsApp |
| `TWILIO_AUTH_TOKEN` | | WhatsApp |
| `TWILIO_WHATSAPP_FROM` | | e.g. `whatsapp:+14155238886` |
| `VAARTA_BASE_URL` | | Public backend URL for PDF; if local, Cloudinary is used for WhatsApp PDF URL |
| `VAARTA_ALWAYS_SEND_TO` | | Phone number that receives a copy on every fill (E.164 or 10-digit) |
| `CLOUDINARY_CLOUD_NAME` | | For WhatsApp PDF when `VAARTA_BASE_URL` is local |
| `CLOUDINARY_API_KEY` | | Cloudinary |
| `CLOUDINARY_API_SECRET` | | Cloudinary |
| `CHAT_PROVIDER` | | `openai` (default) or `groq` |
| `GROQ_API_KEY` | | Required when `CHAT_PROVIDER=groq` |
| `GROQ_CHAT_MODEL` | | e.g. `openai/gpt-oss-120b` |
| `GOOGLE_TTS_API_KEY` | | Enables “Read aloud” (TTS) in chat; `/api/audio/synthesize` |

---

## API reference

| Method | Endpoint | Description |
|--------|----------|--------------|
| `POST` | `/api/forms/upload` | Upload form → extract fields → return schema |
| `GET` | `/api/forms/{id}` | Get form schema |
| `PATCH` | `/api/forms/{id}` | Update fields and title |
| `DELETE` | `/api/forms/{id}` | Delete form and all sessions, filled PDFs, originals |
| `GET` | `/api/forms/{id}/preview` | Preview image (base64) |
| `POST` | `/api/forms/{id}/re-extract` | Re-run extraction on original |
| `GET` | `/api/forms/{id}/health` | Form health score |
| `POST` | `/api/forms/{id}/sample-values` | Generate sample values (GPT-4o) |
| `GET` | `/api/forms/{id}/sessions` | List all sessions |
| `GET` | `/api/forms/{id}/analytics` | Drop-off funnel, completion stats |
| `GET` | `/api/agent/forms` | List all forms (dashboard) |
| `POST` | `/api/sessions/create` | Create new session |
| `GET` | `/api/sessions/{id}/resume` | Resume session (chat history + collected) |
| `GET` | `/api/sessions/{id}/filled-pdf` | Serve filled PDF (when VAARTA_BASE_URL public) |
| `POST` | `/api/chat/open` | Generate opening message |
| `POST` | `/api/chat` | Send message → reply + extracted values |
| `POST` | `/api/sessions/{id}/fill` | Generate filled PDF |
| `POST` | `/api/sessions/{id}/whatsapp` | Send PDF to phone (Cloudinary URL when local) |
| `POST` | `/api/sessions/{id}/upload-file` | Upload file for a field |
| `GET` | `/api/whatsapp/status` | Check Twilio configuration |
| `GET` | `/api/audio/status` | Voice status (STT/TTS available) |
| `POST` | `/api/audio/transcribe` | Transcribe audio (Whisper) |
| `POST` | `/api/audio/synthesize` | Text-to-speech (Google TTS) |

---

## Coordinate system

All field bounding boxes use a **0–1000 normalized space**:

- `(0, 0)` = top-left corner of the form  
- `(1000, 1000)` = bottom-right corner  
- Independent of image resolution or PDF dimensions  

The same stored schema works for extraction (any resolution), the editor (any screen size), and fill-back (any output resolution).

---

## Known limitations

- **Scanned form extraction** accuracy is 50–70% - the visual editor exists specifically to correct this  
- **Multi-page image PDFs** - editor and overlay fill are currently first-page only; AcroForm fill handles all pages  
- **No authentication** - anyone with a `form_id` or `session_id` can access it; not production-safe as-is  
- **File-based storage** - suitable for demo/hackathon; not horizontally scalable  

---

## Roadmap

- [ ] Multi-page editor and overlay fill  
- [ ] Agent authentication and tenant isolation  
- [ ] WhatsApp inbound conversation (WABA)  
- [ ] On-device Whisper STT for offline/low-bandwidth  
- [ ] Language expansion: Marathi, Kannada, Odia, Punjabi  
- [ ] Form template library (common Indian government forms)  
- [ ] PostgreSQL migration for production scale  

---

## Docs

- **DOCUMENTATION.md** - Architecture, data models, user flows, coordinate system, full setup  
- **FEATURES_AND_IMPLEMENTATION.md** - Implemented features, tech stack, APIs, multi-page behavior  
- **FILE_REFERENCE.md** - Per-file reference  

---

## License

MIT

---

