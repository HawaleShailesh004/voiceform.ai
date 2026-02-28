# VoiceForm.ai (Vaarta) — Features & Implementation Overview

**Last analyzed:** February 2025  
**Purpose:** Single reference for what is implemented, tech stack, strategies, workflows, user journeys, and pages.

---

## Table of contents

1. [Project purpose](#1-project-purpose)
2. [Tech stack](#2-tech-stack)
3. [Features implemented](#3-features-implemented)
4. [Strategies & architecture](#4-strategies--architecture)
5. [Workflows](#5-workflows)
6. [User journeys](#6-user-journeys)
7. [Pages & routes](#7-pages--routes)
8. [API reference](#8-api-reference)
9. [Data & storage](#9-data--storage)
10. [Multi-page PDFs (current behavior)](#10-multi-page-pdfs-current-behavior)
11. [Not implemented / out of scope](#11-not-implemented--out-of-scope)

---

## 1. Project purpose

- **Product name:** VoiceForm.ai / Vaarta (API title: "Vaarta API" v3.0.0).
- **One-liner:** Turn any form into a conversational experience. Agents upload PDF/image forms; AI extracts fields; end users fill via chat (text or voice) and get filled PDFs (download or WhatsApp).
- **Audiences:**
  - **Form owners (agents):** Upload, edit, share forms; view sessions, analytics, health; export CSV; send PDFs via WhatsApp.
  - **End users (fillers):** Open chat link, converse (text/voice), optionally upload files; get filled PDF (download or WhatsApp).

---

## 2. Tech stack

### 2.1 Backend

| Category | Technology | Version / notes |
|----------|------------|-----------------|
| Runtime | Python | 3.x |
| Framework | FastAPI | 0.115.0 |
| Server | Uvicorn | 0.30.0 (standard) |
| Request/validation | python-multipart, Pydantic | 0.0.9, ≥2.7.0, <3 |
| AI – extraction | Anthropic (Claude) | anthropic 0.40.0; model e.g. claude-sonnet-4-20250514 |
| AI – chat & samples | OpenAI (GPT-4o) | openai 1.54.0 |
| PDF | PyMuPDF (fitz), ReportLab | 1.24.11, 4.2.2 |
| Images | Pillow | 10.4.0 |
| Config / HTTP | python-dotenv, httpx | 1.0.1, 0.27.2 |
| WhatsApp (optional) | Twilio | Not in requirements.txt; `pip install twilio` |

- **Entry:** `backend/main.py`. Run: `python main.py` or `uvicorn main:app --reload` (host `0.0.0.0`, port **8000**).
- **Docs:** Swagger UI at `/docs`.
- **Persistence:** File-based only (no database). See [§9 Data & storage](#9-data--storage).

### 2.2 Frontend

| Category | Technology | Version / notes |
|----------|------------|-----------------|
| Framework | Next.js | 14.2.5 (App Router) |
| UI | React | ^18 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | ^3.4.1 |
| Motion | Framer Motion | ^11.3.8 |
| HTTP client | Axios | ^1.7.2 (90s timeout) |
| Icons | Lucide React | ^0.414.0 |
| Upload | react-dropzone | ^14.2.3 |
| Toasts | react-hot-toast | ^2.4.1 |
| QR codes | react-qr-code | ^2.0.15 |
| Utilities | clsx, use-debounce | ^2.1.1, ^10.0.3 |

- **Entry:** `frontend/src/app/layout.tsx`; root `/` redirects to `/agent`.
- **Design:** Custom tokens (teal, saffron, cream, sand, ink); fonts: Fraunces, Plus Jakarta Sans, JetBrains Mono.
- **State:** React local state only (no Redux/global store). API base: `NEXT_PUBLIC_API_URL` or `http://localhost:8000`.

### 2.3 External services

| Service | Use | Config |
|---------|-----|--------|
| Anthropic | Form field extraction (vision) for images/scanned PDFs | `ANTHROPIC_API_KEY` |
| OpenAI | Chat (opening + turns with tool-calling), sample values | `OPENAI_API_KEY` |
| Twilio | WhatsApp: send text + optional PDF link | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `VAARTA_BASE_URL` |

### 2.4 Infra

- No Docker/Compose in repo. Backend: `.env` (from `.env.example`); Frontend: `.env.local` (e.g. `NEXT_PUBLIC_API_URL`). Optional `VAARTA_BASE_URL` (e.g. ngrok) for Twilio when backend is not public.

---

## 3. Features implemented

Each row is backed by the codebase (file/location where relevant).

| Feature | Where implemented | Notes |
|--------|-------------------|------|
| **Form upload** | Agent: `/agent/upload`; Backend: `POST /api/forms/upload` | PDF or image (.pdf, .png, .jpg, .jpeg, .webp, .tiff); max 20 MB; react-dropzone + progress → redirect to form edit |
| **AcroForm extraction** | `backend/extractor.py` | Digital PDFs: PyMuPDF reads widgets → fields + bounding boxes (0–1000) |
| **Vision extraction** | `backend/extractor.py` | Scanned/image PDFs: Claude vision; bounding boxes; media type detection (webp/jpeg/png) |
| **Re-extract** | Backend: `POST /api/forms/{form_id}/re-extract`; Frontend: `formAPI.reExtract(formId)` | Re-run extraction on stored original; returns updated fields, preview, health_score |
| **Form editor** | `/agent/form/[formId]/edit`; `FieldEditor.tsx` | Title; fields: reorder, add, delete, bbox, type, label, font size/style/color, text align; live preview; undo/redo; auto-save |
| **Sample values** | Backend: OpenAI; `POST /api/forms/{form_id}/sample-values`; Frontend: "Generate samples" | Optional per-form samples for preview |
| **Form health score** | `backend/health_score.py`; `GET /api/forms/{form_id}/health`; `FormHealthScore.tsx` | 100 pts: clarity, required ratio, type variety, confusion risk, completion time; grade A–F; issues/suggestions |
| **Share** | `ShareModal.tsx` | Copy chat link, QR (react-qr-code), WhatsApp share link |
| **Session list** | `/agent/form/[formId]` | Filter All/Active/Completed; session cards; download PDF, Export CSV, WhatsApp per session |
| **Analytics** | `/agent/form/[formId]/analytics`; `GET /api/forms/{form_id}/analytics`; `FormAnalyticalDashboard.tsx` | Field drop-off (reached, filled, abandoned), funnel, completion rate, avg time, language distribution |
| **Resume session** | Chat: `?session=...`; `GET /api/sessions/{id}/resume`; `sessionAPI.resume()` | Restore chat_history, collected, progress, lang, next_field |
| **Chat** | `/chat/[formId]`; `POST /api/chat/open`, `POST /api/chat` | Opening message; send message; tool-calling for field updates |
| **Language detection** | `chat_engine.py` + `prompts.py` | Script + Hinglish; `detected_lang` persisted; replies in same language (Hindi, Tamil, Telugu, Bengali, Gujarati, Hinglish) |
| **Voice input** | Chat page: Web Speech API | Browser-only STT (e.g. en-IN, hi-IN); mic button toggles listening |
| **Validation** | `chat_engine.py`, `prompts.py` | PAN, Aadhaar, GSTIN, IFSC, TAN, etc.; glossary in prompts |
| **Drop-off tracking** | Backend: `last_asked_field` per session | Analytics "abandoned_here" |
| **Session file upload** | `POST /api/sessions/{session_id}/upload-file`; GET files/list | Per-session uploads (e.g. Aadhaar image); fillback embeds in PDF for file-type fields |
| **Fill PDF (full/partial)** | `backend/fillback.py`; `POST /api/sessions/{session_id}/fill` | AcroForm fill or overlay; partial = yellow highlight for unfilled required |
| **Download PDF** | Chat + Form detail | Blob from POST `/fill` or GET `/filled-pdf`; fillAPI.download() |
| **WhatsApp send** | `whatsapp_delivery.py`; `POST /api/sessions/{session_id}/whatsapp`; `GET /api/whatsapp/status` | Twilio; text-only if VAARTA_BASE_URL local, else text + PDF URL |
| **Get PDF modal** | Chat page: GetPDFModal | Enter mobile → fill + send to that number; or "Download to device" |
| **VAARTA_ALWAYS_SEND_TO** | `main.py` | Optional env: every fill also sends a copy to this number |

---

## 4. Strategies & architecture

### 4.1 High-level architecture

```
Frontend (Next.js 14, React 18)
  / · /agent · /agent/upload · /agent/form/[id] · /agent/form/[id]/edit
  /agent/form/[id]/analytics · /chat/[formId]
        │
        │ REST (Axios, NEXT_PUBLIC_API_URL)
        ▼
Backend (FastAPI, Python)
  Forms · Sessions · Chat · Fill · WhatsApp · Analytics · Health · Files
        │
  store · extractor · chat_engine · fillback · whatsapp_delivery · health_score
  (JSON/PDFs) (Claude, PyMuPDF) (OpenAI GPT-4o) (PyMuPDF, overlay) (Twilio)
```

### 4.2 Extraction strategy

- **Digital PDF (AcroForm):** PyMuPDF reads widget rects (PDF points) → convert to 0–1000 normalized space; field names from AcroForm.
- **Image / scanned PDF:** First page rendered to image (or image as-is); Claude vision with structured prompt; bounding boxes in 0–1000; same coordinate system for editor and fill-back.

### 4.3 Chat strategy

- **Opening:** GPT-4o with form schema + build_opening_prompt() → one warm, form-specific message.
- **Turns:** User message + form schema + collected so far → GPT-4o with tool `update_form_fields`; model returns tool calls → backend applies extracted key-value; reply + is_complete, progress, lang.
- **Validation:** PAN, Aadhaar, GSTIN, IFSC, TAN, etc. in prompts; model confirms or asks again.
- **Resume:** Stored chat_history and collected; next_field for "continue from here."

### 4.4 Fill-back strategy

- **AcroForm:** Original PDF from store; PyMuPDF set widget values by acro_field_name.
- **Scanned/image:** Decode form’s raw_image_b64 → overlay text (and optional images for file fields) using 0–1000 → pixel conversion; font size scaled by image width; output PDF (e.g. 150 DPI).

### 4.5 Coordinate system

- All field positions: **0–1000 normalized** (fraction of width/height). (0,0) = top-left, (1000,1000) = bottom-right. Used by extraction, editor, and overlay fill; no inches in stored schema.

### 4.6 Persistence strategy

- File-based only under `VAARTA_DATA_DIR` (default `data/`). Thread-safe JSON writes; no DB, no queues. WhatsApp send is fire-and-forget (`asyncio.create_task`) after fill.

---

## 5. Workflows

### 5.1 Agent: upload → extract → edit → share → sessions & export

1. **Upload:** `/agent/upload` → drop file → `POST /api/forms/upload` (upload + extract) → redirect to `/agent/form/[id]/edit`.
2. **Edit:** Change title/fields/bbox/font; preview; PATCH `/api/forms/{id}`; ShareModal (link, QR, WhatsApp).
3. **Form detail:** `/agent/form/[id]` — sessions (All/Active/Completed), download PDF (`POST .../fill`), Export CSV (client-side), WhatsApp (WhatsAppModal → `POST .../whatsapp`), Health tab, Analytics tab (`/agent/form/[id]/analytics`).

### 5.2 End user: chat → fill → download / WhatsApp

1. Open `/chat/[formId]` or `/chat/[formId]?session=...` (resume). If new: `POST /api/sessions/create` → `POST /api/chat/open`. If resume: `GET /api/sessions/{id}/resume`.
2. Send messages (or voice via Web Speech API); `POST /api/chat`; backend returns reply, extracted, is_complete, progress, lang. Optional: `POST /api/sessions/{id}/upload-file` for a field.
3. When complete, "Get PDF" / "Partial PDF" opens GetPDFModal: enter phone → fill + whatsappAPI.send, or "Download to device" (fill + fillAPI.download). If `VAARTA_ALWAYS_SEND_TO` is set, that number also receives a copy on every fill.

### 5.3 Resume

- User opens `/chat/[formId]?session=<session_id>`. Frontend calls `GET /api/sessions/{id}/resume` and restores chat_history, collected, progress, lang, next_field in the UI.

---

## 6. User journeys

### 6.1 Agent journey

| Step | Action | Page / API |
|------|--------|------------|
| 1 | Land on dashboard | `/agent` |
| 2 | Click "Upload form" | → `/agent/upload` |
| 3 | Drop PDF/image, wait for upload + extraction | `POST /api/forms/upload` |
| 4 | Land on form editor | `/agent/form/[id]/edit` |
| 5 | Edit title, fields, bboxes, font/align; preview; optional "Generate samples", "Re-extract" | PATCH `/api/forms/{id}`, sample-values, re-extract |
| 6 | Open Share modal, copy link / QR / WhatsApp link | ShareModal |
| 7 | Go to form detail | `/agent/form/[id]` |
| 8 | View sessions, filter, download PDF, Export CSV, send WhatsApp to number | sessions, fill, whatsapp |
| 9 | Open Health tab | FormHealthScore on same page |
| 10 | Open Analytics | `/agent/form/[id]/analytics` |

### 6.2 End-user (filler) journey

| Step | Action | Page / API |
|------|--------|------------|
| 1 | Open chat link (or resume link with ?session=) | `/chat/[formId]` |
| 2 | Session created or resumed; opening message shown | create/resume, `POST /api/chat/open` |
| 3 | Type or use voice; send messages | `POST /api/chat` |
| 4 | Optionally upload file for a field | `POST /api/sessions/{id}/upload-file` |
| 5 | See progress (e.g. "3 of 5 fields") | From chat response |
| 6 | On completion, click "Get PDF" or "Partial PDF" | GetPDFModal |
| 7 | Enter mobile (optional) → Send via WhatsApp, or "Download to device" | fill + whatsapp or fill + download |

---

## 7. Pages & routes

| Path | Audience | Purpose |
|------|----------|--------|
| `/` | — | Redirect to `/agent` |
| `/agent` | Agent | Dashboard: form list (health badge, session/completion counts), upload CTA |
| `/agent/upload` | Agent | Upload: dropzone, progress → redirect to form edit |
| `/agent/form/[formId]` | Agent | Form detail: sessions (All/Active/Completed), share, download PDF, Export CSV, WhatsApp per session, Health tab, Source block |
| `/agent/form/[formId]/edit` | Agent | Form editor: title, fields (reorder/add/delete, bbox, type, label), font/align, preview, undo/redo, auto-save, share |
| `/agent/form/[formId]/analytics` | Agent | Analytics: funnel, field stats, completion rate, language distribution |
| `/chat/[formId]` | End user | Chat: create/resume session, opening message, send text/voice, progress, Get PDF modal (phone → WhatsApp or download) |

### 7.1 Key components

| Component | Role |
|-----------|------|
| `AgentNav.tsx` | Top nav: Vaarta logo, Dashboard, Upload Form; active route highlight |
| `ShareModal.tsx` | Copy link, QR (react-qr-code), WhatsApp share link |
| `FormHealthScore.tsx` | Health grade, breakdown, issues, suggestions (compact/expandable) |
| `WhatsAppModal.tsx` | Send PDF to a number (from form detail session row) |
| `FieldEditor.tsx` | Field list, bbox overlays on preview, reorder/add/delete, coordinates, sample preview, font/align, undo/redo |
| `FormAnalyticalDashboard.tsx` | Funnel, field analytics table, completion/language stats |
| GetPDFModal (in chat page) | Phone input, Send (fill + whatsappAPI.send) or "Download to device"; body scroll lock |

---

## 8. API reference

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/health` | Health check |
| POST | `/api/forms/upload` | Upload file → extract → save form + original → return schema, chat_link, whatsapp_link, health_score |
| POST | `/api/forms/{form_id}/re-extract` | Re-run extraction on stored original |
| GET | `/api/forms/{form_id}` | Get form schema |
| GET | `/api/forms/{form_id}/preview` | Preview image (e.g. base64) |
| PATCH | `/api/forms/{form_id}` | Update form (fields, title) |
| GET | `/api/forms/{form_id}/health` | Get form health score |
| POST | `/api/forms/{form_id}/sample-values` | Generate sample values (OpenAI); optional body `fields` |
| GET | `/api/agent/forms` | List all forms with session/completion counts and health_score |
| GET | `/api/forms/{form_id}/sessions` | List sessions for form |
| GET | `/api/forms/{form_id}/analytics` | Field drop-off, completion rate, avg time, language distribution, funnel |
| POST | `/api/sessions/create` | Create session for form |
| GET | `/api/sessions/{session_id}` | Session summary |
| GET | `/api/sessions/{session_id}/resume` | Full resume: chat_history, collected, progress, lang, next_field |
| POST | `/api/chat/open` | Opening message + init history |
| POST | `/api/chat` | One user message → reply, extracted, is_complete, progress, lang |
| POST | `/api/sessions/{session_id}/fill` | Generate filled/partial PDF; optional VAARTA_ALWAYS_SEND_TO |
| POST | `/api/sessions/{session_id}/whatsapp` | Send PDF/message to given phone (body: phone, lang) |
| GET | `/api/sessions/{session_id}/filled-pdf` | Serve filled PDF (e.g. for Twilio media URL) |
| GET | `/api/whatsapp/status` | `{ configured: true/false }` |
| POST | `/api/sessions/{session_id}/upload-file` | Upload file for a field (query: field_name) |
| GET | `/api/sessions/{session_id}/files/{field_name}` | Download session file for field |
| GET | `/api/sessions/{session_id}/files` | List session file metadata |

---

## 9. Data & storage

### 9.1 Layout (under `VAARTA_DATA_DIR`, default `data/`)

| Path | Content |
|------|--------|
| `data/forms/{form_id}.json` | Form schema, optional health_score, sample_values, raw_image_b64 |
| `data/originals/{form_id}.pdf` or `.png`/`.jpg` | Original upload |
| `data/sessions/{session_id}.json` | Session: form_id, status, collected, chat_history, lang, whatsapp_phone, last_asked_field, filled_pdf_path, updated_at, etc. |
| `data/filled/{session_id}.pdf` | Filled PDF |
| `data/session_files/{session_id}/{field_name}.{suffix}` | Per-session uploads (e.g. Aadhaar image) |

### 9.2 Form schema (summary)

- form_id, form_title, source_type, page_count, dimensions, original_filename, uploaded_at, fields[], warnings, optional raw_image_b64, sample_values, health_score.
- **Field:** field_name, field_type, semantic_label, question_template, description, is_required, data_type, validation_rules, bounding_box (0–1000), acro_field_name, options; editor: font_size, font_style, font_color, text_align_h, text_align_v; children for radio/checkbox groups.

### 9.3 Session schema (summary)

- session_id, form_id, created_at, updated_at, status, collected, chat_history, progress, lang, whatsapp_phone, last_asked_field, filled_pdf_path.

---

## 10. Multi-page PDFs (current behavior)

| Layer | Multi-page support | Details |
|-------|--------------------|--------|
| **Backend – AcroForm** | **Partial** | **Extraction:** Fields are collected from all pages (`for page in doc` in `_get_acroform_fields`). **Fill:** All pages are filled (`for page in doc` in `_fill_acroform`). **Preview / editor:** Only the first page is used: `raw_image_b64` is from `doc[0]` only. **page_index** is computed per field but not passed to `FormField` / not persisted in the form schema, so the editor cannot associate fields with pages. |
| **Backend – Image PDF** | **First page only** | **Extraction:** Only `doc[0]` is sent to vision (`_process_image_pdf`). **Preview:** First page. **Fill (overlay):** Single `raw_image_b64` → one output PDF page. |
| **Backend – Scanned image** | N/A | Single image = single page. |
| **Frontend** | **No** | Single `preview_image`; no page selector or “Page 2 of N”. All fields are shown on one canvas. `page_count` exists in API types but is not used for multi-page UI. |

**Summary:** Multi-page is fully handled only for **AcroForm fill** (all pages get filled). The **editor and preview are effectively single-page** (first page only). Image PDFs and overlay fill are single-page only.

---

## 11. Not implemented / out of scope

| Item | Status |
|------|--------|
| **Authentication** | No login, JWT, or session cookies; no user/tenant identity. Anyone with form_id/session_id can access. |
| **Database** | File-based only; no SQL/NoSQL. |
| **Multi-page in editor/preview** | See [§10 Multi-page PDFs](#10-multi-page-pdfs-current-behavior). AcroForm fill is multi-page; preview/overlay and frontend are first-page / single-page only. |
| **TTS / playback** | No text-to-speech; voice is input-only (Web Speech API STT). |
| **Background job queue** | No Celery/Redis; WhatsApp send is asyncio fire-and-forget. |
| **Twilio in requirements.txt** | Optional; install with `pip install twilio` if using WhatsApp. |

---

*This document is generated from the current codebase. For file-by-file reference see `FILE_REFERENCE.md`; for architecture and coordinate system details see `DOCUMENTATION.md`.*
