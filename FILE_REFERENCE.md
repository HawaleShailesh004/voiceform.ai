# VoiceForm.ai / Vaarta — File Reference

Every project file with path, description, and how/why it is used.  
*(Excludes generated/build artifacts: `.next/`, `node_modules/`, `venv/`, `data/*.json`.)*

---

## Table of contents

1. [Root](#1-root)
2. [Backend](#2-backend)
3. [Frontend](#3-frontend)

---

## 1. Root

| File | Description | How & why used |
|------|-------------|----------------|
| **`.gitignore`** | Git ignore rules | Tells Git to ignore env files (`.env`), Python venvs (`venv/`, `.venv/`), `__pycache__/`, Node `node_modules/`, Next.js `.next/`, IDE/OS cruft (`.idea/`, `.DS_Store`), logs, and build artifacts so they are not committed. |
| **`DOCUMENTATION.md`** | High-level project docs | Describes what the product does, architecture, backend/frontend overview, data models, user flows, and setup. Used as the main human-readable project guide. |
| **`FILE_REFERENCE.md`** | This file | Per-file reference: path, description, and usage for each project file. |

---

## 2. Backend

| File | Description | How & why used |
|------|-------------|----------------|
| **`backend/main.py`** | FastAPI app entry and REST API | **Entry point:** run with `python main.py` or `uvicorn main:app --reload` (port 8000). Defines all HTTP routes: health, form upload, form get/update/preview/sample-values, agent form list, form sessions, session create/get, chat open, chat turn, fill PDF. Wires CORS, uses `store` for persistence and `extractor` for uploads. **Why:** single place for all API contracts and request handling. |
| **`backend/extractor.py`** | Form field extraction (PDF/image → schema) | **What:** Detects fillable fields from uploaded PDFs or images. **How:** For digital PDFs with AcroForm, uses PyMuPDF to read widgets and build fields + bounding boxes; for image-based PDFs or images, encodes page as base64 and sends to Anthropic Claude vision API with a structured JSON prompt. Returns `ExtractionResult` (form_title, source_type, fields, page dimensions, raw_image_b64, warnings, optional sample_values). Defines dataclasses: `BoundingBox`, `FormField`, `ExtractionResult`. **Why:** Enables “upload form → AI reads it” without manual field mapping. |
| **`backend/chat_engine.py`** | Conversational form-fill logic (OpenAI) | **What:** Drives the chat bot that helps users fill the form. **How:** Uses OpenAI `gpt-4o` with a system prompt from `prompts.py`; supports tool-calling to “set” field values. `get_opening_message()` generates a warm, form-specific first message; `run_chat_turn()` processes one user message, runs the model with current form schema and collected data, parses tool calls into extracted fields, and returns reply + extracted dict + updated history + is_complete. **Why:** Centralizes all chat/AI behavior so the API only passes session + form + message. |
| **`backend/fillback.py`** | Write collected data onto the form (PDF output) | **What:** Produces the filled PDF that the user downloads. **How:** For **AcroForm** PDFs, loads the original from `store.original_path()` and uses PyMuPDF to set widget values; for **image PDFs / scanned images**, renders text overlay at each field’s bounding box (with optional font size/style/align from form schema). Writes to `store.filled_path(session_id)`. **Why:** Separates “how we fill the form” from API and storage. |
| **`backend/store.py`** | File-based persistence (no DB) | **What:** All persistent data lives as JSON/PDF files under a configurable `data/` dir. **How:** Provides: `save_form` / `load_form` / `list_forms` / `update_form_fields` / `update_form_sample_values`; `save_original` / `original_path`; `save_session` / `load_session` / `list_sessions_for_form`; `filled_path`. Uses a lock for safe concurrent writes. **Why:** No database setup; data survives restarts and is easy to backup. |
| **`backend/prompts.py`** | Chat system prompt and helpers | **What:** Defines Vaarta’s personality, extraction rules, and bilingual behavior. **How:** `SYSTEM_PROMPT` is the main system message (warm tone, smart inference for names/addresses/dates/phone/gender/checkboxes, validation phrasing, Hindi/English). `EXTRACT_TOOL_DEFINITION` describes the tool the model uses to set field values. `build_opening_prompt()` and `build_turn_context()` build per-request prompts with form fields and current collected state. **Why:** All prompt text in one place for tuning and consistency. |
| **`backend/test_chat.py`** | Smoke test for chat engine | **What:** Quick script to run the chat flow without the API. **How:** Defines a mock form and session, imports `run_chat_turn` from `chat_engine`, and runs a few example user messages (e.g. full name, email, phone) in a loop, printing replies and extracted fields. **Why:** Fast verification that chat extraction and inference work. Run with `python test_chat.py`. |
| **`backend/requirements.txt`** | Python dependencies | Lists packages (e.g. fastapi, uvicorn, anthropic, openai, pymupdf, python-dotenv, etc.) and versions. Used by `pip install -r requirements.txt` to create a reproducible backend environment. |
| **`backend/.env.example`** | Example environment variables | Template for `.env`. Documents `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `BASE_URL`, `ALLOWED_ORIGINS`, `VAARTA_DATA_DIR`. Copy to `.env` and fill real keys; never commit `.env`. |

---

## 3. Frontend

### 3.1 Config & tooling

| File | Description | How & why used |
|------|-------------|----------------|
| **`frontend/package.json`** | Node dependencies and scripts | Defines `dependencies` (Next.js, React, axios, framer-motion, react-dropzone, react-hot-toast, react-qr-code, etc.) and scripts (`dev`, `build`, `start`, `lint`). `npm install` and `npm run dev` use this. |
| **`frontend/next.config.js`** | Next.js configuration | Sets `reactStrictMode: true` and injects `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) so the frontend knows the backend base URL. |
| **`frontend/tailwind.config.js`** | Tailwind CSS theme | Extends theme: custom colors (teal, saffron, cream, sand, ink, success, error), font families (Fraunces, Plus Jakarta Sans, JetBrains Mono), border radius, box shadows, animations/keyframes. **Why:** Consistent Vaarta look across all pages and components. |
| **`frontend/postcss.config.js`** | PostCSS plugins | Enables `tailwindcss` and `autoprefixer` so Tailwind directives in CSS are compiled and vendor prefixes added. |
| **`frontend/next-env.d.ts`** | TypeScript types for Next.js | Auto-generated by Next.js to provide TypeScript types for Next-specific features. |
| **`frontend/README.md`** | Frontend setup and overview | Short guide: setup (`npm install`, `.env.local`, `npm run dev`), route table (agent, upload, form edit, form detail, chat), design tokens, and feature list. |

### 3.2 App layout and routing

| File | Description | How & why used |
|------|-------------|----------------|
| **`frontend/src/app/layout.tsx`** | Root layout | Wraps the whole app: HTML lang, global CSS import, metadata (title “Vaarta”, description, OpenGraph). Renders `Toaster` (react-hot-toast) with Vaarta-styled options, then `{children}`. **Why:** Single place for global UI and metadata. |
| **`frontend/src/app/page.tsx`** | Root route `/` | Client component that immediately redirects to `/agent` via `useRouter().replace('/agent')`. **Why:** So visiting the site root goes to the agent dashboard. |
| **`frontend/src/app/agent/page.tsx`** | Agent dashboard `/agent` | **What:** Lists all forms with stats (session count, completed count, completion %). **How:** Calls `formAPI.list()`, shows stat cards and form cards (with link to `/agent/form/[formId]`), and a CTA to “Upload form” → `/agent/upload`. Uses Framer Motion for entrance. **Why:** Agent’s home to see and open forms. |
| **`frontend/src/app/agent/upload/page.tsx`** | Upload form `/agent/upload` | **What:** Drag-and-drop upload, then AI extraction, then redirect to editor. **How:** Uses `react-dropzone`; on accept, uploads via `formAPI.upload()` with progress; shows stages (uploading → extracting → done); on success navigates to `/agent/form/[formId]/edit`. **Why:** Entry point for adding a new form. |
| **`frontend/src/app/agent/form/[formId]/page.tsx`** | Form detail `/agent/form/[id]` | **What:** Single form view: metadata, sessions list, download filled PDF, export CSV, share (link, QR, WhatsApp). **How:** Loads form with `formAPI.get(formId)` and sessions with `formAPI.sessions(formId)`; filter by status (all/completed/active); download via `fillAPI.fill(sessionId)`; ShareModal for link/QR/WhatsApp. **Why:** Agent manages responses and shares the chat link. |
| **`frontend/src/app/agent/form/[formId]/edit/page.tsx`** | Form editor `/agent/form/[id]/edit` | **What:** Edit form title, reorder/edit/delete/add fields, drag bounding boxes, set overlay font/size/align, live preview with sample values. **How:** Loads form + preview image; `FieldEditor` for field list and bbox canvas; save with `formAPI.update()`; “Generate samples” calls `formAPI.sampleValues()`; undo/redo for field list; ShareModal. **Why:** Where the agent refines extracted fields and publishes. |
| **`frontend/src/app/chat/[formId]/page.tsx`** | Public chat `/chat/[id]` | **What:** End-user chat UI to fill the form. **How:** On load, creates session via `sessionAPI.create(formId)` then fetches opening message via `chatAPI.opening()`. User types or uses voice (Web Speech API); messages sent with `chatAPI.send()`; shows progress (e.g. “3 of 5”); on completion offers download via `fillAPI.fill()`. Language toggle (en/hi). **Why:** The shareable link recipients use to fill the form by conversation. |

### 3.3 Shared code and styles

| File | Description | How & why used |
|------|-------------|----------------|
| **`frontend/src/lib/api.ts`** | Backend API client and types | **What:** Axios instance (base URL from `NEXT_PUBLIC_API_URL`), TypeScript interfaces (FormField, BBox, UploadResult, AgentForm, Session, ChatResponse), and namespaced helpers. **APIs:** `formAPI` (upload, get, update, list, sessions, preview, sampleValues), `sessionAPI` (create, get), `chatAPI` (send, opening), `fillAPI` (fill, download). **Why:** Single place for all API calls and shared types used by pages and components. |
| **`frontend/src/styles/globals.css`** | Global and component CSS | **What:** Tailwind base/components/utilities; reset; body/scrollbar/selection; custom classes (e.g. `.bg-woven`, `.grain`); `@layer components` for `.btn`, `.btn-primary`, `.btn-ghost`, `.card`, `.input`, `.badge`, dividers, etc. **Why:** Shared design system and layout utilities across the app. |

### 3.4 Components

| File | Description | How & why used |
|------|-------------|----------------|
| **`frontend/src/components/shared/AgentNav.tsx`** | Top navigation for agent area | Renders fixed header with Vaarta logo (link to `/agent`) and nav links (Dashboard, Upload Form). Uses `usePathname()` to highlight active route. Shown on `/agent`, `/agent/upload`, `/agent/form/[id]`, and edit page. **Why:** Consistent agent navigation. |
| **`frontend/src/components/shared/ShareModal.tsx`** | Share link / QR / WhatsApp modal | **Props:** isOpen, onClose, formTitle, chatLink, whatsappLink. Tabs: copy web link, show/download QR (react-qr-code, SVG download), WhatsApp share link. **Why:** Reused on form detail and edit pages to share the chat form. |
| **`frontend/src/components/editor/FieldEditor.tsx`** | Field list + bounding box editor | **What:** Full field editor: reorder (Framer Reorder), add/delete fields, edit field name/label/type/question/required/data type; canvas overlay of form preview with draggable/resizable bounding boxes per field; optional live preview with sample values and font size/style/alignment. **How:** Receives fields, title, preview image, sample values, and callbacks for change/save; uses local fallback samples when API samples missing. **Why:** Single complex component for “edit fields and their positions” on the edit page. |

---

## Summary

- **Backend:** `main.py` is the API; `extractor.py` gets fields from PDFs/images; `chat_engine.py` runs the form-fill conversation; `fillback.py` produces filled PDFs; `store.py` persists everything to disk; `prompts.py` holds chat prompts; `test_chat.py` exercises the chat.
- **Frontend:** Next.js app with root redirect to `/agent`; agent dashboard, upload, form detail, and form edit pages; public chat page; shared API client, global styles, AgentNav, ShareModal, and FieldEditor.
- **Config:** `.gitignore`, `DOCUMENTATION.md`, backend `requirements.txt` and `.env.example`, frontend `package.json`, `next.config.js`, Tailwind/PostCSS, and READMEs.

For high-level architecture and flows, see **`DOCUMENTATION.md`**.
