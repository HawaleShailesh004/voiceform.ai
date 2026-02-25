"""
Chat Engine - Conversation layer using your existing prompts.
Bridges the session/form schema with OpenAI tool-calling.
"""

import os
import json
import logging
from typing import Any

from openai import AsyncOpenAI
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

# ── Import your existing prompts ──────────────────────────────────────────────
# These are your prompts from prompts.py - we import them directly
try:
    from prompts import SYSTEM_PROMPT, EXTRACT_TOOL_DEFINITION
except ImportError:
    # Fallback if prompts.py not in path
    SYSTEM_PROMPT = """You are a warm, friendly assistant helping someone fill out a form.
    Call update_form_fields on EVERY turn with your reply and any extracted data."""

    EXTRACT_TOOL_DEFINITION = {
        "type": "function",
        "function": {
            "name": "update_form_fields",
            "description": "ALWAYS call this. Put reply in `reply`, extracted values in `extracted`.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reply": {"type": "string"},
                    "extracted": {"type": "object", "additionalProperties": True},
                    "is_complete": {"type": "boolean"},
                },
                "required": ["reply", "extracted", "is_complete"],
            },
        },
    }

openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def _build_system_context(form_schema: dict, collected: dict) -> str:
    """
    Inject form-specific context into the system prompt.
    Tells Claude exactly which fields are needed and which are done.
    """
    fields = form_schema.get("fields", [])
    form_title = form_schema.get("form_title", "this form")

    # Split fields into: done vs still needed
    still_needed = []
    already_filled = []

    for f in fields:
        name = f["field_name"]
        val = collected.get(name)
        if val and val != "N/A":
            already_filled.append(f"{f['semantic_label']}: {val}")
        else:
            still_needed.append(
                f"- {f['field_name']}: {f['semantic_label']} "
                f"[{f['field_type']}] — {f.get('description', f.get('purpose', ''))}"
            )

    context = f"""
=== FORM CONTEXT ===
Form: {form_title}
Total fields: {len(fields)}
Filled: {len(already_filled)} / {len(fields)}

ALREADY FILLED (DO NOT ASK AGAIN):
{chr(10).join(already_filled) if already_filled else "(none yet)"}

STILL NEEDED (ask about these):
{chr(10).join(still_needed) if still_needed else "(all done!)"}

=== END FORM CONTEXT ===
"""
    return SYSTEM_PROMPT + "\n\n" + context


async def run_chat_turn(
    user_message: str,
    session: dict,
    form_schema: dict,
) -> dict[str, Any]:
    """
    Process one chat turn:
    1. Build messages array with full history + new user message
    2. Call OpenAI with tool definition
    3. Extract tool call result
    4. Return reply + extracted fields + updated history
    """
    collected = session.get("collected", {})
    history = session.get("chat_history", [])

    # First turn: inject greeting context
    if not history:
        form_title = form_schema.get("form_title", "your form")
        total = len(form_schema.get("fields", []))
        history = []
        # We'll let the system prompt drive the greeting via the first user message

    # Build system message with live form context
    system_content = _build_system_context(form_schema, collected)

    # Append user message to history
    history.append({"role": "user", "content": user_message})

    # Call OpenAI
    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_content},
            *history,
        ],
        tools=[EXTRACT_TOOL_DEFINITION],
        tool_choice={"type": "function", "function": {"name": "update_form_fields"}},
        temperature=0.7,
    )

    message = response.choices[0].message

    # Parse tool call
    reply = ""
    extracted = {}
    is_complete = False

    if message.tool_calls:
        tool_call = message.tool_calls[0]
        try:
            args = json.loads(tool_call.function.arguments)
            reply = args.get("reply", "")
            extracted = args.get("extracted", {})
            is_complete = args.get("is_complete", False)
        except json.JSONDecodeError:
            reply = message.content or "Sorry, I had trouble processing that. Could you try again?"

    # Clean extracted — remove empty/null values
    extracted = {k: v for k, v in extracted.items() if v is not None and v != ""}

    # Add assistant reply to history
    history.append({"role": "assistant", "content": reply})

    return {
        "reply": reply,
        "extracted": extracted,
        "is_complete": is_complete,
        "updated_history": history,
    }


async def get_opening_message(form_schema: dict) -> str:
    """
    Generate a warm opening message for when user first opens the chat.
    Called once at session start.
    """
    form_title = form_schema.get("form_title", "this form")
    fields = form_schema.get("fields", [])
    total = len(fields)

    # Find first required field to ask about
    first_field = next(
        (f for f in fields if f.get("is_required")),
        fields[0] if fields else None,
    )

    opening_prompt = f"""You are starting a new form-filling conversation.
Form: {form_title} ({total} fields total)
First field to collect: {first_field['semantic_label'] if first_field else 'general info'}

Generate a warm, friendly opening message (2-3 sentences max) that:
1. Greets the user
2. Briefly explains you'll help them fill out {form_title}
3. Asks for the first piece of info: {first_field['question_template'] if first_field else 'your details'}

Be natural, NOT robotic. No bullet points. Just a friendly conversation starter."""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": opening_prompt}],
        temperature=0.8,
        max_tokens=150,
    )
    return response.choices[0].message.content
