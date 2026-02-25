# FormBot Backend

## Architecture

```
Upload (PDF/Image)
        │
        ▼
┌───────────────────┐
│   FormExtractor   │
│                   │
│  AcroForm PDF? ───┼──→ Extract widgets natively
│                   │    + Claude Vision for labels
│  Image/ImagePDF? ─┼──→ Render to PNG
│                   │    + Claude Vision for fields
└───────────────────┘
        │
        ▼
  form_schema.json
  { fields: [...], form_title, source_type, preview_image }
        │
        ├──→ Agent Dashboard (shows fields, shareable link)
        │
        ▼
  Chat Session
  { session_id, collected: {}, chat_history: [] }
        │
        ▼
  Chat Engine (OpenAI gpt-4o + your SYSTEM_PROMPT)
  - Asks questions from question_template
  - Extracts values via update_form_fields tool
  - Marks is_complete when all fields filled
        │
        ▼
  Fill-back Engine
  - AcroForm: write to PDF widgets
  - Image: overlay text at bounding box coords
        │
        ▼
  Filled PDF → Agent downloads
```

## Setup

```bash
cd backend
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your API keys

# Test extraction on a form
python test_extractor.py your_form.pdf

# Run the API
python main.py
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

## Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/forms/upload` | Upload form → extract fields |
| GET | `/api/forms/{form_id}` | Get form schema |
| GET | `/api/forms/{form_id}/preview` | Get preview image |
| POST | `/api/sessions/create` | Start chat session |
| POST | `/api/chat` | Send message → get reply |
| POST | `/api/sessions/{id}/fill` | Fill form → download PDF |
| GET | `/api/agent/forms` | Agent dashboard: list all forms |
| GET | `/api/forms/{id}/sessions` | List sessions for a form |

## File Structure

```
backend/
├── main.py           ← FastAPI app, all endpoints
├── extractor.py      ← Form field extraction (Claude Vision + PyMuPDF)
├── chat_engine.py    ← Conversation engine (OpenAI + your prompts)
├── fillback.py       ← Write answers back onto form PDF
├── prompts.py        ← Your existing prompts (copy here)
├── test_extractor.py ← Quick test script
├── requirements.txt
└── .env.example
```

## Form Type Handling

| Type | Detection | Extraction | Fill-back |
|------|-----------|------------|-----------|
| AcroForm PDF | `doc.widgets()` returns fields | Claude Vision labels numbered markers | `widget.field_value = val` |
| Image PDF | No widgets found | Render page → Claude Vision | Text overlay at bbox coords |
| Scanned Image | `.png/.jpg` extension | Claude Vision direct | Text overlay at bbox coords |

## Adding WhatsApp (Twilio)

```python
# Webhook endpoint for Twilio
@app.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request):
    form = await request.form()
    from_number = form.get("From")
    body = form.get("Body", "").strip()
    
    # Route to existing chat engine using phone as session key
    session_id = whatsapp_sessions.get(from_number)
    if not session_id:
        # Extract form_id from START:xxx message
        ...
    
    result = await run_chat_turn(body, session, form_schema)
    
    # Reply via Twilio
    from twilio.twiml.messaging_response import MessagingResponse
    resp = MessagingResponse()
    resp.message(result["reply"])
    return Response(str(resp), media_type="text/xml")
```
