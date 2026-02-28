# PostgreSQL Integration — Steps and Backend Modularization

This document describes (1) the steps to integrate PostgreSQL into the Vaarta backend, and (2) the modular backend structure so small changes are localized.

**Current status:** The backend is **fully modularized**. Config (`config.py`), schemas (`schemas/`), repository layer (`repositories/base.py`, `repositories/file_store.py`), and store facade (`store.py`) are in place. All routes live in `api/routes/`: `health.py`, `agent.py`, `forms.py`, `sessions.py`, `chat.py`, `fill.py`, `whatsapp.py`. `main.py` only creates the app, adds CORS, and includes these routers. You can proceed to PostgreSQL integration (Step 2 onwards).

---

## Part 1: Backend modularization (prerequisite)

The backend is refactored so that:

- **Config** — All environment and app settings live in one place (`config.py`). Changing a default or adding a new env var is a single-file change.
- **Schemas** — Pydantic request/response models live under `schemas/`. Adding or changing an API contract is done in the schema module, not inside route handlers.
- **Repository layer** — Persistence is behind an abstract interface (`repositories/base.py`). The current file-based implementation lives in `repositories/file_store.py`. Swapping to PostgreSQL means implementing the same interface in `repositories/postgres_store.py` and switching via config.
- **Routers** — Routes are split by domain: `api/routes/health.py`, `forms.py`, `sessions.py`, `chat.py`, `fill.py`, `whatsapp.py`. Adding or changing an endpoint is done in one router file; `main.py` only assembles the app and includes routers.
- **Dependencies** — FastAPI `Depends()` are used for injectable dependencies (e.g. `get_store()`, `get_config()`), so tests and future backends can swap implementations.

### Resulting structure

```
backend/
├── config.py                 # Settings from env (single source of truth)
├── main.py                   # App creation, CORS, include routers
├── api/
│   ├── deps.py               # Depends: get_config, get_store
│   └── routes/
│       ├── health.py
│       ├── forms.py          # Upload, get, update, re-extract, health, list, sessions, analytics
│       ├── sessions.py       # Create, get, resume
│       ├── chat.py           # Open, turn
│       ├── fill.py           # Fill PDF, download, upload-file, files
│       └── whatsapp.py       # Send, status
├── schemas/
│   └── requests.py          # SessionCreate, ChatMessage, FormUpdate, etc.
├── repositories/
│   ├── base.py              # Abstract interface (protocol) for persistence
│   ├── file_store.py        # Current file-based implementation
│   └── postgres_store.py    # (Step 5) PostgreSQL implementation
├── store.py                 # Facade: delegates to file_store or postgres_store by config
├── extractor.py
├── chat_engine.py
├── fillback.py
├── health_score.py
├── whatsapp_delivery.py
├── prompts.py
└── requirements.txt
```

After modularization:

- **Small change examples:** Add a new form field in the schema → edit `schemas/`. Add an endpoint → edit one router. Change storage backend → implement interface and switch in config.

---

## Part 2: Steps to integrate PostgreSQL

### Step 1: Install and run PostgreSQL

- Install PostgreSQL (e.g. 15+) locally or use a cloud instance.
- Create a database and user:
  ```sql
  CREATE DATABASE vaarta;
  CREATE USER vaarta_user WITH PASSWORD 'your_password';
  GRANT ALL PRIVILEGES ON DATABASE vaarta TO vaarta_user;
  ```
- Add connection settings to `.env`:
  ```env
  VAARTA_STORAGE=postgres
  DATABASE_URL=postgresql://vaarta_user:your_password@localhost:5432/vaarta
  ```
  Keep `VAARTA_STORAGE=file` (or unset) to use the current file-based storage.

### Step 2: Add Python dependencies

In `requirements.txt` add:

```text
# PostgreSQL
asyncpg>=0.29.0
sqlalchemy[asyncio]>=2.0.0
alembic>=1.13.0
```

- **asyncpg** — async PostgreSQL driver.
- **SQLAlchemy 2** — optional but recommended for schema, migrations, and connection pooling; can also use raw asyncpg.
- **Alembic** — migrations for schema changes over time.

### Step 3: Define the database schema

Map current JSON/file concepts to tables:

| Concept        | Current (file)              | PostgreSQL design |
|----------------|-----------------------------|--------------------|
| Form metadata  | `data/forms/{id}.json`      | Table `forms` (id, form_title, source_type, page_count, dimensions, original_filename, uploaded_at, fields JSONB, warnings JSONB, raw_image_b64 TEXT, sample_values JSONB, health_score JSONB). |
| Original file  | `data/originals/{id}.pdf`   | Either keep files on disk and store `original_path` in DB, or store blob in `forms.original_bytes` / separate `form_blobs` table. |
| Session        | `data/sessions/{id}.json`   | Table `sessions` (id, form_id FK, created_at, updated_at, status, collected JSONB, chat_history JSONB, progress, lang, whatsapp_phone, last_asked_field, filled_pdf_path). |
| Filled PDF     | `data/filled/{id}.pdf`      | Keep on disk and store path in `sessions.filled_pdf_path`, or store in a `filled_pdfs` blob table. |
| Session files  | `data/session_files/{id}/`   | Keep on disk and store (session_id, field_name, path) in table `session_file_attachments`, or store blobs in DB. |

Recommendation: keep binary files (originals, filled PDFs, session uploads) on disk and store only paths in the DB for simplicity and to avoid large DB size. Optionally move to bytea later.

### Step 4: Implement the repository interface

- In `repositories/base.py`, define the abstract interface (protocol or ABC) that the app uses: e.g. `load_form`, `save_form`, `list_forms`, `update_form_fields`, `load_session`, `save_session`, `list_sessions_for_form`, `original_path`, `save_original`, `filled_path`, `save_session_file`, `get_session_file`, `list_session_files`, etc.
- Ensure `repositories/file_store.py` implements this interface (current `store.py` logic).
- Add `repositories/postgres_store.py` that implements the same interface using asyncpg (or SQLAlchemy): read/write forms and sessions to PostgreSQL; delegate binary storage to the same disk paths as today (or a configurable volume). Expose the same function signatures and return types so callers do not change.

### Step 5: Wire storage backend in the app

- In `config.py`, add a setting (e.g. `storage_backend: Literal["file", "postgres"]`) from `VAARTA_STORAGE`.
- In `store.py` (or in `api/deps.py`), resolve the backend:
  - If `file` → use `repositories.file_store`.
  - If `postgres` → use `repositories.postgres_store` (with a connection pool from `DATABASE_URL`).
- Ensure `fillback.py` and `chat_engine.py` keep using the same `store` API (they already call `store.load_form`, `store.save_session`, etc.). No changes needed there if `store` is the facade that delegates to the chosen backend.

### Step 6: Migrations and startup

- Initialize Alembic: `alembic init alembic` in `backend/`.
- Add a migration that creates `forms` and `sessions` (and any blob/path tables). Run: `alembic upgrade head`.
- In `main.py` (or a startup hook), if `VAARTA_STORAGE=postgres`, create the async connection pool and pass it to the PostgreSQL repository. Ensure the app waits for the pool to be ready before accepting requests and closes the pool on shutdown.

### Step 7: Testing and rollout

- Run the test suite and manual smoke tests with `VAARTA_STORAGE=file` to ensure refactor did not break behavior.
- Run the same with `VAARTA_STORAGE=postgres` and a local PostgreSQL instance; test upload, edit, chat, fill, and WhatsApp flow.
- Optionally add a data migration script to copy existing file-based data into PostgreSQL (and copy originals/filled/session_files to the expected paths) for a one-time cutover.

---

## Summary checklist

| Step | Action |
|------|--------|
| 1 | Install PostgreSQL; create DB and user; add `DATABASE_URL` and `VAARTA_STORAGE` to `.env`. |
| 2 | Add `asyncpg`, `sqlalchemy`, `alembic` to `requirements.txt`. |
| 3 | Design and document DB schema (forms, sessions, paths for binaries). |
| 4 | Implement `repositories/base.py` interface and `repositories/postgres_store.py`. |
| 5 | In config and store facade, switch between file and postgres based on `VAARTA_STORAGE`. |
| 6 | Set up Alembic; add initial migration; wire pool lifecycle in app startup/shutdown. |
| 7 | Test with both backends; add migration path for existing file data if needed. |

After this, the backend remains modular: config, schemas, routes, and repository are separated, and PostgreSQL is one more implementation of the same persistence interface.
