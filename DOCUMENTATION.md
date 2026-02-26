# VoiceForm.ai / Vaarta — Project Documentation

**Turn any form into a warm, conversational experience.** Upload a PDF or image form; the system extracts fields with AI, lets you edit and share a chat link; end users fill the form by chatting (text or voice) and download a filled PDF when done.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Why it exists](#2-why-it-exists)
3. [High-level architecture](#3-high-level-architecture)
4. [Backend](#4-backend)
5. [Frontend](#5-frontend)
6. [Data models & storage](#6-data-models--storage)
7. [User flows](#7-user-flows)
8. [Environment & setup](#8-environment--setup)

---

## 1. What it does

- **For form owners (agents):**
  - **Upload** a PDF or image of a form.
  - **Extract fields** automatically (AcroForm parsing or AI vision) — field names, types, positions (bounding boxes).
  - **Edit** the form: change title, add/remove/reorder fields, adjust bounding boxes and font/alignment for filled text.
  - **Preview** with sample values (API-generated or local fallbacks).
  - **Share** a chat link (copy, QR code, WhatsApp); view sessions and completion stats; download filled PDFs and export CSV.

- **For end users (fillers):**
  - Open the **chat link** for a form.
  - Have a **conversation** (text or voice) to provide answers; the AI extracts field values and confirms.
  - See **progress** (e.g. “3 of 5 fields filled”).
  - **Download** the filled PDF when the form is complete.

The system supports **bilingual** (e.g. English / Hindi) and **voice input** (Web Speech API) on the chat page.

---

## 2. Why it exists

- **Forms are tedious** — especially on mobile or for less tech-savvy users. A chat interface feels familiar and guided.
- **One link** — no separate “form app”; share a single URL that works on any device.
- **AI does the mapping** — no manual configuration of “this question → this field”; the model understands the form and the user’s answers.
- **Structured output** — filled PDFs and CSV export keep data usable for downstream workflows.

---

## 3. High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│  /agent (dashboard) · /agent/upload · /agent/form/[id] · /chat/[id] │
└───────────────────────────────┬─────────────────────────────────┘
                                 │ HTTP (REST)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI, Python)                    │
│  Forms · Sessions · Chat · Fill · Sample values                 │
└───────┬─────────────────┬─────────────────┬────────────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
   File store       OpenAI (chat,     Anthropic (Claude)
   (JSON + PDF)     sample values)    (vision extraction)
```

- **No database** — forms, sessions, and filled PDFs are stored as files under a configurable `data/` directory.
- **Backend** handles: upload & extraction, form CRUD, session lifecycle, chat (with tool-calling for field updates), PDF fill-back, sample-value generation.
- **Frontend** is a single Next.js app: agent dashboard and editor, and a public chat page for end users.

---

## 4. Backend

### 4.1 Stack & entry

- **Framework:** FastAPI.
- **Entry:** `backend/main.py`. Run with `python main.py` or `uvicorn main:app --reload` (default host `0.0.0.0`, port `8000`).
- **Docs:** Swagger UI at `/docs`.

### 4.2 Main modules (in `backend/`)

| Module | Role |
|--------|------|
| **main.py** | All HTTP routes, CORS, Pydantic request/response models. |
| **store.py** | Persistence: JSON files for forms/sessions, binary for originals and filled PDFs. Thread-safe writes. |
| **extractor.py** | Form field extraction: AcroForm (PyMuPDF) and/or vision (Claude) for images/scanned PDFs. |
| **chat_engine.py** | Chat logic: opening message and per-turn handling with OpenAI GPT-4o; tool-calling to update session `collected`. |
| **fillback.py** | Filling PDFs: AcroForm fill or text overlay (PyMuPDF/reportlab). |
| **prompts.py** | System prompt and tool definitions for the chat agent; opening/turn context builders. |

### 4.3 API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check. |
| POST | `/api/forms/upload` | Upload PDF/image → extract fields → save form + original → return form schema and chat link. |
| GET | `/api/forms/{form_id}` | Get form schema (metadata, fields). |
| GET | `/api/forms/{form_id}/preview` | Get form preview image (e.g. base64). |
| PATCH | `/api/forms/{form_id}` | Update form: fields and title (from editor). |
| POST | `/api/forms/{form_id}/sample-values` | Generate sample values (OpenAI) for preview; optional `fields` in body. |
| GET | `/api/agent/forms` | List all forms with session/completion counts. |
| GET | `/api/forms/{form_id}/sessions` | List sessions for a form. |
| POST | `/api/sessions/create` | Create a new session for a form. |
| GET | `/api/sessions/{session_id}` | Get session summary. |
| POST | `/api/chat/open` | Get opening message and initialise chat history. |
| POST | `/api/chat` | Process one user message; return reply, extracted fields, progress, completion. |
| POST | `/api/sessions/{session_id}/fill` | Generate filled PDF; return file. |

### 4.4 External services

- **Anthropic (Claude)** — `extractor.py`: vision to analyse form images and return structured fields (labels, types, bounding boxes). Also used to label AcroForm widgets.
- **OpenAI (GPT-4o)** — `chat_engine.py` for chat (opening message + each turn with tool-calling); `main.py` for sample-value generation for the editor.
- **PyMuPDF (fitz)** — PDF open/render, AcroForm read/write, overlay drawing.
- **Pillow / reportlab** — Used where needed for images and drawing in extractor/fill.

---

## 5. Frontend

### 5.1 Stack & entry

- **Framework:** Next.js 14 (App Router).
- **Entry:** `src/app/layout.tsx` (root layout, global CSS, Toaster); `src/app/page.tsx` redirects to `/agent`.
- **Styling:** Tailwind CSS; design tokens (teal, saffron, cream); Fraunces + Plus Jakarta Sans; Framer Motion for animations.

### 5.2 Routes & pages

| Path | Audience | Purpose |
|------|----------|---------|
| `/` | — | Redirect to `/agent`. |
| `/agent` | Agent | Dashboard: list forms, session/completion stats, links to detail and upload. |
| `/agent/upload` | Agent | Upload form (dropzone) → upload → extract → redirect to form edit. |
| `/agent/form/[formId]` | Agent | Form detail: sessions list, filter pills (All/Active/Completed), stacked completion bar, share strip (link, Copy, WhatsApp), Source block; download filled PDF, export CSV. |
| `/agent/form/[formId]/edit` | Agent | Field editor: title edit, fields (reorder, add, delete, bbox, type, label), live preview, Font & alignment dropdown, undo/redo, auto-save, share. |
| `/chat/[formId]` | End user | Chat UI: create/resume session, opening message, send messages, optional voice input, progress, download filled PDF when complete. |

### 5.3 Key components

| Component | Role |
|-----------|------|
| **shared/AgentNav.tsx** | Fixed top nav for agent: logo “Vaarta”, Dashboard, Upload. |
| **shared/ShareModal.tsx** | Share form: copy chat link, QR (react-qr-code), WhatsApp link. |
| **editor/FieldEditor.tsx** | Form field list + bbox overlays on preview image: reorder (Reorder), add/delete, edit label/type/bbox; coordinates popup when bbox is selected; local sample fallback; undo/redo via parent. |

### 5.4 API client (`src/lib/api.ts`)

- **Base URL:** `process.env.NEXT_PUBLIC_API_URL` or `http://localhost:8000`.
- **Client:** Axios instance, 90s timeout.
- **APIs:**
  - **formAPI:** `upload`, `get`, `update`, `list`, `sessions`, `preview`, `sampleValues`.
  - **sessionAPI:** `create`, `get`.
  - **chatAPI:** `send`, `opening`.
  - **fillAPI:** `fill` (returns Blob), `download(blob, filename)` (triggers browser download).

Types (e.g. `FormField`, `BBox`, `Session`, `ChatResponse`, `UploadResult`) are defined in the same file.

---

## 6. Data models & storage

### 6.1 Storage layout (backend `store.py`)

No database. All data under `VAARTA_DATA_DIR` (default `data/`):

| Path | Content |
|------|--------|
| `data/forms/{form_id}.json` | Form schema: `form_id`, `form_title`, `source_type`, `fields[]`, metadata, optional `raw_image_b64`, `sample_values`. |
| `data/originals/{form_id}.pdf` | Original uploaded file (used for AcroForm fill-back). |
| `data/sessions/{session_id}.json` | Session: `session_id`, `form_id`, `status`, `collected`, `chat_history`, etc. |
| `data/filled/{session_id}.pdf` | Filled PDF output. |

JSON writes are thread-safe (lock + temp file + replace).

### 6.2 Form & field schema

- **Form (stored):** `form_id`, `form_title`, `source_type` (e.g. `acroform` | `scanned_image` | `image_pdf`), `page_count`, dimensions, `original_filename`, `uploaded_at`, `fields[]`, `warnings`, optional `raw_image_b64`, `sample_values`.
- **Field:** `field_name`, `field_type` (text, checkbox, date, signature, radio, select, number, email, textarea), `semantic_label`, `question_template`, `description`, `is_required`, `data_type`, `validation_rules`, `bounding_box` (xmin, ymin, xmax, ymax in 0–1000 space), optional `acro_field_name`, `options`. Editor can add `font_size`, `font_style`, `font_color`, `text_align_h`, `text_align_v` for overlay/fill.

### 6.3 Session & chat

- **Session (stored):** `session_id`, `form_id`, `created_at`, `status` (e.g. active, completed, filled, abandoned), `collected` (field_name → value), `chat_history` (`{ role, content }[]`), progress info, optional `lang`, `filled_pdf_path`.
- **Chat API:** Request: `session_id`, `message`, `lang`. Response: `reply`, `extracted`, `confirmations`, `is_complete`, `progress`, `collected`.

---

## 7. User flows

### 7.1 Agent: upload → edit → share

1. Agent goes to **Upload** (`/agent/upload`), drops a PDF or image.
2. Frontend sends file to **POST /api/forms/upload**. Backend runs extractor (AcroForm or vision), saves form + original, returns form_id and chat link.
3. Frontend redirects to **Edit** (`/agent/form/[formId]/edit`). Agent can change title, add/remove/reorder fields, edit names/types/bbox, set font & alignment (dropdown), toggle live preview and generate sample values. Edits are sent via **PATCH /api/forms/{form_id}** (e.g. auto-save).
4. Agent opens **Share** (ShareModal): copy link, QR, or WhatsApp link to **/chat/[formId]**.

### 7.2 End user: chat → fill → download

1. User opens **/chat/[formId]** (from shared link).
2. Frontend creates session (**POST /api/sessions/create** if needed), then **POST /api/chat/open** for opening message and initial history.
3. User types (or uses voice); frontend sends **POST /api/chat** with `session_id`, `message`, `lang`. Backend runs chat engine (GPT-4o + tool), merges extracted into `collected`, saves session, returns reply and progress.
4. When form is complete, user (or agent from form detail) calls **POST /api/sessions/{session_id}/fill**; backend runs fillback and returns PDF; frontend uses `fillAPI.download` to save. Agent can also download filled PDF from form detail and export sessions to CSV.

---

## 8. Environment & setup

### 8.1 Backend (`backend/`)

- **Python:** 3.x; install deps: `pip install -r requirements.txt`.
- **Env (e.g. `.env`):**
  - `ANTHROPIC_API_KEY` — Claude (extractor vision).
  - `OPENAI_API_KEY` — GPT-4o (chat + sample values).
  - `BASE_URL` — Frontend base URL for shareable links (e.g. `http://localhost:3000`).
  - `ALLOWED_ORIGINS` — CORS origins (e.g. `http://localhost:3000`).
  - `VAARTA_DATA_DIR` — Data root (default `data`).

Run: `python main.py` or `uvicorn main:app --reload --host 0.0.0.0 --port 8000`.

### 8.2 Frontend (`frontend/`)

- **Node:** Install deps: `npm install`. Copy `.env.example` to `.env.local`.
- **Env:**
  - `NEXT_PUBLIC_API_URL` — Backend API base (e.g. `http://localhost:8000`).

Run: `npm run dev` → typically `http://localhost:3000`.

### 8.3 Quick start

1. Set backend env (API keys, `BASE_URL`, `ALLOWED_ORIGINS`); start backend.
2. Set `NEXT_PUBLIC_API_URL` in frontend; start frontend.
3. Open `/agent`, upload a form, edit if needed, share the chat link and test at `/chat/[formId]`.

---

*This document describes the VoiceForm.ai / Vaarta project end-to-end: purpose, architecture, backend and frontend, data, flows, and setup.*
