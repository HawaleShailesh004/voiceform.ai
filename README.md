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
- **Visual field editor** - drag bounding boxes, live canvas preview with sample Indian data, overflow detection, per-field font/size/colour/alignment, undo/redo (30 steps), auto-save
- **Form health score** - automated A–F grade across 5 dimensions before sharing
- **Session dashboard** - All / Active / Completed filter, download PDFs, export CSV
- **Analytics** - field-level drop-off funnel, completion rate, language distribution
- **Share** - chat link, QR code, WhatsApp share link

### User side

- **Multilingual chat** - English, Hindi, Hinglish, Tamil, Telugu, Bengali, Gujarati
- **Voice input** - Web Speech API (en-IN / hi-IN), browser-native
- **Smart inference** - e.g. "Rahul Kumar Sharma" fills first, middle, last name simultaneously
- **Indian document validation** - PAN, Aadhaar, GSTIN, IFSC, TAN, mobile, pincode
- **Session resume** - return to incomplete form via `?session=...` URL
- **WhatsApp PDF delivery** - filled form sent via Twilio to user's phone number

---

## Tech stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **Styling** | Tailwind CSS, Framer Motion |
| **Canvas preview** | HTML5 Canvas API (client-only) |
| **AI - Extraction** | Anthropic Claude `claude-sonnet-4-20250514` (Vision) |
| **AI - Chat** | OpenAI GPT-4o with tool-calling |
| **Backend** | Python 3, FastAPI, Uvicorn |
| **PDF** | PyMuPDF (fitz), ReportLab, Pillow |
| **WhatsApp** | Twilio WhatsApp Business API |
| **Voice** | Web Speech API (browser-native) |

---

## Project structure

```
vaarta/
├── backend/
│   ├── main.py                # FastAPI app, all routes
│   ├── extractor.py           # Claude Vision + PyMuPDF field extraction
│   ├── chat_engine.py         # GPT-4o tool-calling chat engine
│   ├── fillback.py            # AcroForm fill + image overlay PDF generation
│   ├── health_score.py        # 5-dimension form health scoring
│   ├── whatsapp_delivery.py   # Twilio WhatsApp PDF delivery
│   ├── store.py               # File-based JSON persistence
│   ├── prompts.py             # System prompts, validation rules
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── agent/                      # Agent dashboard, upload, form detail
│   │   │   │   ├── page.tsx                # Dashboard
│   │   │   │   ├── upload/page.tsx        # Upload form
│   │   │   │   └── form/[formId]/
│   │   │   │       ├── page.tsx            # Sessions, health, analytics
│   │   │   │       ├── edit/page.tsx      # Field editor
│   │   │   │       └── analytics/page.tsx # Analytics dashboard
│   │   │   └── chat/[formId]/page.tsx      # User chat interface
│   │   ├── components/
│   │   │   ├── editor/FieldEditor.tsx      # Visual field editor
│   │   │   ├── shared/
│   │   │   │   ├── AgentNav.tsx
│   │   │   │   ├── ShareModal.tsx
│   │   │   │   └── FormHealthScore.tsx
│   │   │   └── analytics/FormAnalyticalDashboard.tsx
│   │   ├── lib/api.ts                      # All API calls + types
│   │   └── styles/globals.css              # Design tokens
│   ├── tailwind.config.js
│   └── .env.local.example
│
└── data/                      # Auto-created at runtime
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
VAARTA_BASE_URL=https://your-public-url.ngrok.io   # needed for Twilio media URL

# Optional - send every filled form to this number as well
VAARTA_ALWAYS_SEND_TO=whatsapp:+91XXXXXXXXXX
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

For local development, expose the backend with ngrok:

```bash
ngrok http 8000
```

Set `VAARTA_BASE_URL` in `.env` to the ngrok HTTPS URL. Twilio uses this to serve the filled PDF as a media attachment.

For production, set `VAARTA_BASE_URL` to your deployed backend URL.

---

## Environment reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude (form extraction) |
| `OPENAI_API_KEY` | Yes | GPT-4o (chat + sample values) |
| `BASE_URL` | Yes | Frontend base URL for share links (e.g. `http://localhost:3000`) |
| `ALLOWED_ORIGINS` | Yes | CORS (e.g. `http://localhost:3000`) |
| `VAARTA_DATA_DIR` | | Data directory (default `data`) |
| `TWILIO_ACCOUNT_SID` | | WhatsApp |
| `TWILIO_AUTH_TOKEN` | | WhatsApp |
| `TWILIO_WHATSAPP_FROM` | | e.g. `whatsapp:+14155238886` |
| `VAARTA_BASE_URL` | | Public backend URL for Twilio to fetch PDF (e.g. ngrok) |
| `VAARTA_ALWAYS_SEND_TO` | | Phone number that receives a copy on every fill |

---

## API reference

| Method | Endpoint | Description |
|--------|----------|--------------|
| `POST` | `/api/forms/upload` | Upload form → extract fields → return schema |
| `GET` | `/api/forms/{id}` | Get form schema |
| `PATCH` | `/api/forms/{id}` | Update fields and title |
| `GET` | `/api/forms/{id}/preview` | Preview image (base64) |
| `POST` | `/api/forms/{id}/re-extract` | Re-run extraction on original |
| `GET` | `/api/forms/{id}/health` | Form health score |
| `POST` | `/api/forms/{id}/sample-values` | Generate sample values (GPT-4o) |
| `GET` | `/api/forms/{id}/sessions` | List all sessions |
| `GET` | `/api/forms/{id}/analytics` | Drop-off funnel, completion stats |
| `GET` | `/api/agent/forms` | List all forms (dashboard) |
| `POST` | `/api/sessions/create` | Create new session |
| `GET` | `/api/sessions/{id}/resume` | Resume session (chat history + collected) |
| `POST` | `/api/chat/open` | Generate opening message |
| `POST` | `/api/chat` | Send message → reply + extracted values |
| `POST` | `/api/sessions/{id}/fill` | Generate filled PDF |
| `POST` | `/api/sessions/{id}/whatsapp` | Send PDF to phone via WhatsApp |
| `POST` | `/api/sessions/{id}/upload-file` | Upload file for a field |
| `GET` | `/api/whatsapp/status` | Check Twilio configuration |

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

