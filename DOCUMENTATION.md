# VoiceForm.ai / Vaarta — Project Documentation

**Turn any form into a warm, conversational experience.** Upload a PDF or image form; the system extracts fields with AI, lets you edit and share a chat link; end users fill the form by chatting (text or voice) in their language and download or receive a filled PDF via WhatsApp.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Tech stack](#2-tech-stack)
3. [Features](#3-features)
4. [Architecture](#4-architecture)
5. [Backend](#5-backend)
6. [Frontend](#6-frontend)
7. [Data models & storage](#7-data-models--storage)
8. [User flows](#8-user-flows)
9. [Coordinate system & field mapping](#9-coordinate-system--field-mapping)
10. [Environment & setup](#10-environment--setup)

---

## 1. Project overview

### What it does

- **For form owners (agents):**
  - **Upload** a PDF or image of a form (dropzone with progress).
  - **Extract fields** automatically: AcroForm parsing (digital PDFs) or **Claude vision** (scanned images / image PDFs) — field names, types, positions (bounding boxes in 0–1000 space).
  - **Edit** the form: change title, add/remove/reorder fields, adjust bounding boxes, set font size/style/color and text alignment for filled text overlay.
  - **Preview** with sample values (OpenAI-generated or local fallbacks).
  - **Health score** per form: clarity, required ratio, type variety, confusion risk, estimated completion time (grade A–F); shown on dashboard and form detail.
  - **Share** a chat link (copy, QR code, WhatsApp share link).
  - **Sessions**: list sessions per form (All / Active / Completed), view collected data, download filled PDFs, **export CSV** of completed responses.
  - **Analytics**: field-level drop-off (reached, filled, abandoned), completion rate, avg completion time, language distribution, funnel for charts.
  - **WhatsApp**: trigger “Send PDF to number” from form detail for a session; backend can auto-send when form is completed if user shared their number in chat.

- **For end users (fillers):**
  - Open the **chat link** for a form (create new session or **resume** via `?session=...`).
  - **Conversation** (text or **voice** via Web Speech API) to provide answers; **GPT-4o** extracts field values with tool-calling, validates PAN/Aadhaar/GSTIN/IFSC etc., and confirms.
  - **Bilingual**: auto language detection (Hindi, Tamil, Telugu, Bengali, Gujarati, Hinglish); prompts and replies switch language; persisted per session.
  - **Progress**: “X of Y fields filled”, progress bar; optional “Continue later” via resume link.
  - **Attachments**: upload files (e.g. Aadhaar image, signature) during chat; stored per session and embedded in filled PDF for file-type fields.
  - **Download**: when complete (or partial), **Get PDF** opens a modal to enter a **mobile number** → same message (text-only when backend URL is local, or text + PDF when public) sent via **WhatsApp**; or “Download to device” for direct PDF download.
  - **Partial PDF**: fill with some fields blank; unfilled required fields highlighted in yellow.

### Why it exists

- **Forms are tedious** — especially on mobile or for less tech-savvy users. A chat interface feels familiar and guided.
- **One link** — no separate “form app”; share a single URL that works on any device.
- **AI does the mapping** — no manual “this question → this field”; the model understands the form and the user’s answers.
- **Structured output** — filled PDFs and CSV export keep data usable for downstream workflows.
- **Inclusive** — multi-language and voice lower barriers.

---

## 2. Tech stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.x, **FastAPI**, Uvicorn, Pydantic, python-dotenv |
| **Frontend** | **Next.js 14** (App Router), React 18, TypeScript |
| **Styling** | **Tailwind CSS**, Framer Motion, custom design tokens (teal, saffron, cream) |
| **Fonts** | Fraunces (display), Plus Jakarta Sans (body), JetBrains Mono |
| **APIs (backend)** | **Anthropic** (Claude) — vision extraction; **OpenAI** (GPT-4o) — chat + sample values |
| **PDF / images** | **PyMuPDF (fitz)**, ReportLab, Pillow |
| **WhatsApp** | **Twilio** (optional): send message/PDF to user; `twilio` package (not in `requirements.txt` by default — install if using WhatsApp) |
| **HTTP client (frontend)** | Axios (90s timeout) |
| **Other frontend** | react-dropzone, react-qr-code, react-hot-toast, clsx, use-debounce, Lucide icons |
| **Persistence** | File-based: JSON (forms, sessions), PDFs and images under `VAARTA_DATA_DIR` |

---

## 3. Features

| Feature | Where | Notes |
|--------|--------|------|
| Form upload | Agent: `/agent/upload` | PDF or image → extract → redirect to edit |
| AcroForm extraction | Backend: `extractor.py` | Digital PDFs: read widgets with PyMuPDF |
| Vision extraction | Backend: `extractor.py` | Scanned/image PDFs: Claude, bounding boxes, media type detection (webp/jpeg/png) |
| Form edit | Agent: `/agent/form/[id]/edit` | Title, fields (reorder, add, delete), bbox, type, label; font & alignment; live preview; undo/redo; auto-save |
| Sample values | Backend: OpenAI | Optional per-form sample values for preview |
| Health score | Backend: `health_score.py` | 100 pts: clarity, required ratio, type variety, confusion risk, completion time; stored on form |
| Share | ShareModal | Copy link, QR, WhatsApp share link |
| Session list | Agent: `/agent/form/[id]` | Filter All/Active/Completed; stacked bar; download PDF, Export CSV |
| Analytics | Agent: `/agent/form/[id]/analytics` | Field drop-off, funnel, completion rate, language distribution |
| Resume session | Chat: `?session=...` | GET `/api/sessions/{id}/resume` → restore history, collected, next field |
| Chat | Chat: `/chat/[formId]` | Opening message, send message, tool-calling for field updates |
| Language detection | Backend: `chat_engine.py` + prompts | Script + Hinglish; `detected_lang` persisted; replies in same language |
| Voice input | Chat page | Web Speech API (browser); en-IN / hi-IN |
| Validation | Backend: `chat_engine.py` | PAN, Aadhaar, GSTIN, IFSC, TAN, etc.; glossary in prompts |
| Drop-off tracking | Backend: `last_asked_field` | Per-session; analytics “abandoned_here” |
| Session file upload | Chat + Agent | POST file for a field → stored under `session_files/{session_id}/`; fillback embeds in PDF |
| Fill (full/partial) | Backend: `fillback.py` | AcroForm fill or overlay; partial = yellow highlight for unfilled required |
| Download PDF | Chat + Form detail | Blob from POST `/fill`; or GET `/filled-pdf` for URL |
| WhatsApp send | Backend: `whatsapp_delivery.py` | Twilio; text-only if `VAARTA_BASE_URL` is local, else text + PDF URL |
| Get PDF modal | Chat page | Enter mobile number → fill + send to that number; or download to device |
| VAARTA_ALWAYS_SEND_TO | Backend: `main.py` | Optional env: every fill also sends to this number |

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 14, React 18)                      │
│  / · /agent · /agent/upload · /agent/form/[id] · /agent/form/[id]/edit  │
│  /agent/form/[id]/analytics · /chat/[formId]                             │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │ REST (Axios, NEXT_PUBLIC_API_URL)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI, Python)                         │
│  Forms · Sessions · Chat · Fill · WhatsApp · Analytics · Health · Files  │
└───┬─────────┬─────────┬────────────┬──────────────┬─────────────────────┘
    │         │         │            │              │
    ▼         ▼         ▼            ▼              ▼
  store   extractor  chat_engine  fillback   whatsapp_delivery
  (JSON,  (Claude,   (OpenAI     (PyMuPDF,   (Twilio)
   PDFs)   PyMuPDF)   GPT-4o)     overlay)   health_score
```

- **No database** — forms, sessions, filled PDFs, and session file attachments live under `VAARTA_DATA_DIR` (default `data/`).
- **Backend** handles: upload & extraction, form CRUD, health score, session lifecycle, chat (with tool-calling), resume, fill (full/partial), WhatsApp delivery, analytics, session file upload/serve.
- **Frontend**: agent dashboard, upload, form detail (sessions, CSV export, WhatsApp button), form edit, analytics page; public chat page with voice, progress, Get PDF modal.

---

## 5. Backend

### 5.1 Stack & entry

- **Framework:** FastAPI. **Version:** 3.0.0 (see `main.py` docstring).
- **Entry:** `backend/main.py`. Run: `python main.py` or `uvicorn main:app --reload` (default host `0.0.0.0`, port `8000`).
- **Docs:** Swagger UI at `/docs`.
- **Env:** `python-dotenv` loads `.env` from backend directory.

### 5.2 Modules (`backend/`)

| Module | Role |
|--------|------|
| **main.py** | All HTTP routes, CORS, Pydantic models, upload response (BoundingBox → dict), health/analytics/resume/whatsapp/fill/session file endpoints. |
| **store.py** | Persistence: forms, originals, sessions, filled PDFs, **session_files** (per-session uploads); thread-safe JSON writes; `update_form_health_score`. |
| **extractor.py** | Form extraction: AcroForm (PyMuPDF) and/or **Claude vision** for images/scanned PDFs; media type detection (suffix + magic bytes); resilient JSON parse from vision output. |
| **chat_engine.py** | Opening message (GPT-4o); per-turn chat with **tool-calling** (`update_form_fields`); language detection; validation (PAN, Aadhaar, etc.); **WhatsApp phone** collection when `is_complete` and Twilio configured; `last_asked_field` for analytics. |
| **prompts.py** | System prompt, tool definition, opening/turn context builders; **FIELD_GLOSSARY** (TAN, PAN, Aadhaar, etc.); auto language rules. |
| **fillback.py** | Fill PDF: AcroForm fill or **text/image overlay**; **partial** = yellow highlight for unfilled required; file fields = embed session uploads. |
| **health_score.py** | `compute_health_score(fields)`: clarity, required ratio, type variety, confusion risk, completion time; returns grade, issues, suggestions. |
| **whatsapp_delivery.py** | Twilio: **send_whatsapp_pdf** (text-only if `VAARTA_BASE_URL` is local, else text + PDF URL); **is_configured** (TWILIO_ACCOUNT_SID + AUTH_TOKEN). |

### 5.3 API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check. |
| POST | `/api/forms/upload` | Upload file → extract → save form + original → return schema, chat_link, whatsapp_link, **health_score**. |
| GET | `/api/forms/{form_id}` | Get form schema. |
| GET | `/api/forms/{form_id}/preview` | Preview image (e.g. base64). |
| PATCH | `/api/forms/{form_id}` | Update form (fields, title). |
| GET | `/api/forms/{form_id}/health` | Get form health score. |
| POST | `/api/forms/{form_id}/sample-values` | Generate sample values (OpenAI); optional `fields` in body. |
| GET | `/api/agent/forms` | List all forms with session/completion counts and **health_score**. |
| GET | `/api/forms/{form_id}/sessions` | List sessions for form. |
| GET | `/api/forms/{form_id}/analytics` | Field-level drop-off, completion rate, avg time, language distribution, funnel. |
| POST | `/api/sessions/create` | Create session for form. |
| GET | `/api/sessions/{session_id}` | Session summary. |
| GET | `/api/sessions/{session_id}/resume` | Full resume data: chat_history, collected, progress, lang, next_field. |
| POST | `/api/chat/open` | Opening message + init history. |
| POST | `/api/chat` | One user message → reply, extracted, is_complete, progress, lang. |
| POST | `/api/sessions/{session_id}/fill` | Generate filled/partial PDF; optional **VAARTA_ALWAYS_SEND_TO**; return file. |
| POST | `/api/sessions/{session_id}/whatsapp` | Send PDF/message to given phone (body: phone, lang). |
| GET | `/api/sessions/{session_id}/filled-pdf` | Serve filled PDF file (for Twilio media URL when public). |
| GET | `/api/whatsapp/status` | `{ configured: true/false }` for frontend. |
| POST | `/api/sessions/{session_id}/upload-file` | Upload file for a field (query: field_name; file in body). |
| GET | `/api/sessions/{session_id}/files/{field_name}` | Download session file for field. |
| GET | `/api/sessions/{session_id}/files` | List session file metadata. |

### 5.4 External services

- **Anthropic (Claude)** — `extractor.py`: vision for form images; structured fields + bounding boxes.
- **OpenAI (GPT-4o)** — `chat_engine.py` (opening + turns with tool-calling); `main.py` sample-values.
- **Twilio** — `whatsapp_delivery.py`: send WhatsApp text (and PDF URL when base URL is public). Optional; `pip install twilio`.
- **PyMuPDF (fitz)** — PDF open/render, AcroForm read/write, overlay.
- **Pillow / ReportLab** — Images and drawing where needed.

---

## 6. Frontend

### 6.1 Stack & entry

- **Framework:** Next.js 14 (App Router), React 18, TypeScript.
- **Entry:** `src/app/layout.tsx` (root layout, globals.css, Toaster); `src/app/page.tsx` redirects to `/agent`.
- **Styling:** Tailwind CSS; design tokens in `tailwind.config.js` (teal, saffron, cream, ink, sand); Fraunces, Plus Jakarta Sans, JetBrains Mono; Framer Motion; custom utilities in `globals.css` (e.g. `.bg-woven`, `.grain`, `.btn-primary`).

### 6.2 Routes

| Path | Audience | Purpose |
|------|----------|---------|
| `/` | — | Redirect to `/agent`. |
| `/agent` | Agent | Dashboard: form list with health badge, session/completion counts, upload CTA. |
| `/agent/upload` | Agent | Upload (dropzone, progress) → redirect to form edit. |
| `/agent/form/[formId]` | Agent | Form detail: sessions (All/Active/Completed), share strip, download PDF, **Export CSV**, **WhatsApp** button per session; **Health** tab (FormHealthScore); Source block. |
| `/agent/form/[formId]/edit` | Agent | Field editor: title, fields (reorder, add, delete, bbox, type, label), preview, font/alignment, undo/redo, auto-save, share. |
| `/agent/form/[formId]/analytics` | Agent | Analytics: FormAnalyticsDashboard (funnel, field stats, completion rate, language). |
| `/chat/[formId]` | End user | Chat: create/resume session, opening message, send (text/voice), progress, **Get PDF modal** (phone → WhatsApp or download), partial/full download. |

### 6.3 Key components

| Component | Role |
|-----------|------|
| **shared/AgentNav.tsx** | Top nav: Vaarta logo, Dashboard, Upload. |
| **shared/ShareModal.tsx** | Copy chat link, QR (react-qr-code), WhatsApp link. |
| **shared/FormHealthScore.tsx** | Health grade, breakdown, issues, suggestions (compact/expandable). |
| **shared/WhatsAppModal.tsx** | Modal to send PDF to a number (used from form detail session row). |
| **editor/FieldEditor.tsx** | Field list, bbox overlays, reorder/add/delete, coordinates popup, sample fallback, undo/redo. |
| **analytics/FormanalyticalDashboard.tsx** | Funnel chart, field analytics table, completion/language stats. |
| **GetPDFModal** (in chat page) | Portal modal: “Send to which number?” — phone input, Send (fill + whatsappAPI.send) or “Download to device”; mobile-friendly, body scroll lock. |

### 6.4 API client (`src/lib/api.ts`)

- **Base:** `process.env.NEXT_PUBLIC_API_URL` or `http://localhost:8000`; Axios 90s timeout.
- **formAPI:** upload, get, update, list, sessions, preview, sampleValues, **analytics**.
- **sessionAPI:** create, get, **resume**.
- **chatAPI:** send, opening.
- **fillAPI:** fill(sessionId, partial?), download(blob, filename).
- **whatsappAPI:** isConfigured(), send(sessionId, phone, lang).

Types: BBox, FormField, UploadResult, **HealthScore**, AgentForm, Session, ChatResponse, **FieldAnalytic**, **FunnelStep**, **FormAnalytics**, **ResumeSession**.

---

## 7. Data models & storage

### 7.1 Storage layout (`store.py`)

Under `VAARTA_DATA_DIR` (default `data/`):

| Path | Content |
|------|---------|
| `data/forms/{form_id}.json` | Form schema + optional `health_score`, `sample_values`, `raw_image_b64`. |
| `data/originals/{form_id}.pdf` or `.png`/`.jpg` | Original uploaded file. |
| `data/sessions/{session_id}.json` | Session: form_id, status, collected, chat_history, lang, **whatsapp_phone**, **last_asked_field**, **filled_pdf_path**, updated_at. |
| `data/filled/{session_id}.pdf` | Filled PDF output. |
| `data/session_files/{session_id}/{field_name}.{suffix}` | Uploaded files (e.g. Aadhaar image) per session/field. |

### 7.2 Form & session schema

- **Form:** form_id, form_title, source_type, page_count, dimensions, original_filename, uploaded_at, fields[], warnings, optional raw_image_b64, sample_values, **health_score**.
- **Field:** field_name, field_type, semantic_label, question_template, description, is_required, data_type, validation_rules, bounding_box (0–1000), acro_field_name, options; editor: font_size, font_style, font_color, text_align_h, text_align_v.
- **Session:** session_id, form_id, created_at, updated_at, status, collected, chat_history, progress, lang, **whatsapp_phone**, **last_asked_field**, **filled_pdf_path**.

---

## 8. User flows

### 8.1 Agent: upload → edit → share → sessions & analytics

1. **Upload:** `/agent/upload` → drop file → POST `/api/forms/upload` → redirect to `/agent/form/[id]/edit`.
2. **Edit:** Change title/fields/bbox/font; preview; auto-save PATCH. Share modal: copy link, QR, WhatsApp.
3. **Form detail:** `/agent/form/[id]` — sessions list, filter, download PDF, **Export CSV**, **WhatsApp** (send to number); **Health** tab; **Analytics** tab.

### 8.2 End user: chat → fill → download / WhatsApp

1. Open `/chat/[formId]` (or `?session=...` to resume). Create session if needed; POST `/api/chat/open` for opening message.
2. Send messages (or voice); POST `/api/chat`; backend returns reply, extracted, is_complete, progress. Optionally upload file for a field.
3. When complete, backend may ask for WhatsApp number in reply; user can send number or say skip.
4. **Get PDF:** Click “Get PDF” / “Partial PDF” (or “Download filled form” on Done card). If WhatsApp configured → **GetPDFModal** (enter number → fill + send to that number); else direct download. **VAARTA_ALWAYS_SEND_TO** (if set) also receives a copy on every fill.

### 8.3 Resume

- User opens `/chat/[formId]?session=<session_id>`. Frontend calls GET `/api/sessions/{id}/resume` and restores chat history, collected, progress, lang, next_field.

---

## 9. Coordinate system & field mapping

All stored field positions use a **single normalized coordinate system**. Fill-back (overlay) and the editor use this same system so extraction and mapping stay consistent.

### 9.1 Stored format: 0–1000 normalized (unitless)

- **Schema:** Every field has `bounding_box: { xmin, ymin, xmax, ymax }` in **0–1000** space.
- **Meaning:** Fraction of page/image dimensions:
  - `(0, 0)` = top-left corner of the page/image.
  - `(1000, 1000)` = bottom-right corner.
  - So `xmin/1000` = fraction of width from left; `ymin/1000` = fraction of height from top.
- **Units:** Not inches or points — **unitless scale 0–1000** (i.e. 0–100% with 0.1% resolution). Same logic works for any page size or image resolution.

**Math:**

- `left_fraction   = xmin / 1000`
- `top_fraction    = ymin / 1000`
- `width_fraction  = (xmax - xmin) / 1000`
- `height_fraction = (ymax - ymin) / 1000`

### 9.2 Extraction: where the numbers come from

| Source | Backend | Coordinate system used | Conversion to 0–1000 |
|--------|--------|-------------------------|----------------------|
| **AcroForm PDF** | `extractor.py` | PyMuPDF widget rect in **PDF points** (1 pt = 1/72 inch). Origin top-left, y down. `page.rect.width` / `height` in points. | `xmin = round(r.x0 / pw * 1000)`, same for y and xmax/ymax. So **points → fraction of page (in points) → scale by 1000**. |
| **Image PDF** (first page rendered) | `extractor.py` | Page rendered to PNG at **150 DPI** (`fitz.Matrix(150/72, 150/72)`). Vision sees that image. | Claude returns 0–1000 in the prompt: “(0,0)=top-left, (1000,1000)=bottom-right.” So **relative to that rendered image**. |
| **Scanned image** (PNG/JPEG/WebP) | `extractor.py` | Image sent as-is to Claude. No “page” size in points. | Same: prompt says 0–1000 relative to image; **(0,0)=top-left, (1000,1000)=bottom-right** of the image. |

**AcroForm conversion (code):**

```text
pw, ph = page.rect.width, page.rect.height   # PDF page size in points
r = widget.rect                              # (x0, y0, x1, y1) in points
bounding_box = {
  "xmin": round(r.x0 / pw * 1000),
  "ymin": round(r.y0 / ph * 1000),
  "xmax": round(r.x1 / pw * 1000),
  "ymax": round(r.y1 / ph * 1000),
}
```

**Vision prompt (VISION_PROMPT):**

```text
Coordinates: 0–1000 scale. (0,0)=top-left, (1000,1000)=bottom-right.
bounding_box = FILLABLE AREA only (where user writes), NOT the label.
```

### 9.3 Fill-back (overlay): 0–1000 → pixels → PDF

Used for **scanned_image** and **image_pdf** (and AcroForm fallback when original PDF is missing). Overlay draws on the **preview image** (`raw_image_b64`), then saves as PDF.

**Step 1 — Decode preview image**

- `raw_image_b64` from form schema → decode → PIL `Image`.
- `iw, ih = img.size` (pixels). This is the only “ruler” for overlay.

**Step 2 — 0–1000 → pixel coordinates**

```text
xmin_px = (xmin / 1000.0) * iw
ymin_px = (ymin / 1000.0) * ih
xmax_px = (xmax / 1000.0) * iw
ymax_px = (ymax / 1000.0) * ih
```

So **same normalized box** works for any image size: the box is always a fraction of width/height.

**Step 3 — Text position and font size**

- **Font size:** Stored `font_size` (e.g. 14) is scaled by image width relative to a reference:  
  `scale = iw / 800` (800 = `_PREVIEW_REF_WIDTH`), then `fsize = font_size * scale` (clamped 8–72). So a wider preview image gets proportionally larger font.
- **Text position:** Padding `_PAD_X = 6`, `_PAD_Y = 2` (pixels). Horizontal: left/center/right from `text_align_h`. Vertical: top/middle/bottom from `text_align_v`. Text is placed inside the pixel rect `[xmin_px, ymin_px, xmax_px, ymax_px]` with that alignment.

**Step 4 — Output PDF**

- `img.save(output_path, "PDF", resolution=150)` — PIL writes the image (with text/image overlays) as PDF at **150 DPI**. So the “points” of the final PDF are tied to that 150 DPI raster.

### 9.4 AcroForm fill (no coordinate math)

For **acroform** source, fill-back does **not** use bounding boxes for position. It uses PyMuPDF’s native widget API:

- Map `field_name` → `acro_field_name` and set `widget.field_value`.
- PyMuPDF places text in the existing widget rect (which is already in **PDF points** in the file). No 0–1000 conversion; the PDF keeps its own coordinates.

### 9.5 Summary table

| Concept | Units / system |
|--------|-----------------|
| **Stored bounding_box** | 0–1000 normalized (unitless fraction of width/height). |
| **PDF page (PyMuPDF)** | **Points** (1 pt = 1/72 inch). `page.rect.width/height`, `widget.rect`. |
| **Preview image (extractor)** | Rendered at **150 DPI** from first page (image PDF / AcroForm); or original image (scanned). |
| **Overlay fill** | 0–1000 → pixels on preview image; font scaled by `iw/800`; output PDF at **150 DPI**. |
| **Editor (frontend)** | Same 0–1000; bbox drawn on preview image so alignment matches overlay. |

So: **extraction** produces 0–1000 from either PDF points (AcroForm) or vision (image/scanned); **mapping** is “0–1000 = fraction of preview image dimensions”; no inches in the stored schema — only points inside the PDF engine and 150 DPI for the raster preview/overlay path.

---

## 10. Environment & setup

### 10.1 Backend (`backend/`)

- **Python:** 3.x. Deps: `pip install -r requirements.txt`. **WhatsApp:** `twilio` is not in `requirements.txt`; run `pip install twilio` if using WhatsApp delivery.
- **`.env`** (copy from `.env.example`):

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude (extractor vision). |
| `OPENAI_API_KEY` | GPT-4o (chat + sample values). |
| `BASE_URL` | Frontend base URL for shareable links. |
| `ALLOWED_ORIGINS` | CORS (e.g. `http://localhost:3000`). |
| `VAARTA_DATA_DIR` | Data root (default `data`). |
| `TWILIO_ACCOUNT_SID` | Optional: WhatsApp. |
| `TWILIO_AUTH_TOKEN` | Optional: WhatsApp. |
| `TWILIO_WHATSAPP_FROM` | Optional: e.g. `whatsapp:+14155238886`. |
| `VAARTA_BASE_URL` | **Public** URL for Twilio to fetch PDF (e.g. ngrok for local). If local → WhatsApp sends text only. |
| `VAARTA_ALWAYS_SEND_TO` | Optional: every fill also sends to this number (e.g. `+919321556764`). |

Run: `python main.py` or `uvicorn main:app --reload --host 0.0.0.0 --port 8000`.

### 10.2 Frontend (`frontend/`)

- **Node:** `npm install`. Copy `.env.example` to `.env.local`.
- **Env:** `NEXT_PUBLIC_API_URL` — backend base (e.g. `http://localhost:8000`).

Run: `npm run dev` → e.g. `http://localhost:3000`.

### 10.3 Quick start

1. Set backend `.env` (API keys, BASE_URL, ALLOWED_ORIGINS); optionally Twilio + VAARTA_BASE_URL for WhatsApp PDF).
2. Start backend; start frontend with `NEXT_PUBLIC_API_URL` set.
3. Open `/agent`, upload a form, edit, share link; test at `/chat/[formId]`.

---

*This document describes the VoiceForm.ai / Vaarta project: purpose, tech stack, features, architecture, backend and frontend, data, flows, and setup. For a file-by-file reference see `FILE_REFERENCE.md`.*
