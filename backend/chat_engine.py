"""
Vaarta Chat Engine
OpenAI gpt-4o with smart extraction, bilingual support, human-like conversation.
"""

import json
import logging
import os
import re
from typing import Any

from openai import AsyncOpenAI

from dotenv import load_dotenv
load_dotenv()

from prompts import (
    SYSTEM_PROMPT,
    EXTRACT_TOOL_DEFINITION,
    build_opening_prompt,
    build_turn_context,
)

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


# ─────────────────────────────────────────────────────────────────────────────
# Opening message
# ─────────────────────────────────────────────────────────────────────────────

async def get_opening_message(form_schema: dict, lang: str = "en") -> str:
    """
    Generate a warm, form-specific opening message.
    Called once when user opens /chat/[formId] — before any user input.
    """
    form_title = form_schema.get("form_title", "this form")
    fields     = form_schema.get("fields", [])

    prompt = build_opening_prompt(form_title, fields, lang)

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.85,
            max_tokens=160,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Opening message failed: {e}")
        if lang == "hi":
            return f"नमस्ते! 🙏 मैं आपकी '{form_title}' भरने में मदद करूँगा। क्या हम शुरू करें?"
        return f"Hi there! 👋 I'm here to help you fill out the '{form_title}'. Shall we get started?"


# ─────────────────────────────────────────────────────────────────────────────
# Main chat turn
# ─────────────────────────────────────────────────────────────────────────────

async def run_chat_turn(
    user_message: str,
    session: dict,
    form_schema: dict,
    lang: str = "en",
) -> dict[str, Any]:
    """
    Process one user message. Returns:
      - reply:             bot's conversational response
      - extracted:         all field values parsed this turn (incl. inferred)
      - confirmations:     field names the bot auto-filled and wants user to confirm
      - is_complete:       True only when all required fields done + user confirmed
      - updated_history:   full conversation history for next turn
    """
    collected = session.get("collected", {})
    history   = session.get("chat_history", [])

    # Build per-turn system prompt = base personality + live form state
    system = SYSTEM_PROMPT + "\n\n" + build_turn_context(form_schema, collected, lang)

    # Add the new user message
    history.append({"role": "user", "content": user_message})

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system},
                *history,
            ],
            tools=[EXTRACT_TOOL_DEFINITION],
            tool_choice={"type": "function", "function": {"name": "update_form_fields"}},
            temperature=0.75,
            max_tokens=512,
        )
    except Exception as e:
        logger.error(f"OpenAI call failed: {e}", exc_info=True)
        raise

    message = response.choices[0].message

    # ── Parse tool call ──
    reply          = ""
    extracted      = {}
    confirmations  = []
    validation_err = []
    is_complete    = False

    if message.tool_calls:
        try:
            args = json.loads(message.tool_calls[0].function.arguments)
            reply          = args.get("reply", "")
            extracted      = args.get("extracted", {}) or {}
            confirmations  = args.get("confirmations_needed", []) or []
            validation_err = args.get("validation_errors", []) or []
            is_complete    = bool(args.get("is_complete", False))
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Tool call parse error: {e}")
            reply = message.content or _fallback_reply(lang)
    else:
        # Model didn't call the tool — use content as reply
        reply = message.content or _fallback_reply(lang)

    # ── Post-processing ──

    # 1. Clean extracted — remove blanks, normalise values
    extracted = _clean_extracted(extracted, form_schema)

    # 2. Smart fill: if collected a full name, auto-split into sub-fields
    extracted = _smart_name_split(extracted, form_schema, collected)

    # 3. Validate extracted values against field rules
    extracted, invalid_fields = _validate_extracted(extracted, form_schema)
    if invalid_fields:
        # Don't fill invalid values — let the bot's reply handle correction
        for field_name in invalid_fields:
            extracted.pop(field_name, None)

    # 4. Handle "SKIPPED" sentinel (user said they don't know)
    extracted = _detect_skip_intent(user_message, extracted, form_schema, collected, lang)

    # 5. Update history with assistant reply
    history.append({"role": "assistant", "content": reply})

    return {
        "reply":            reply,
        "extracted":        extracted,
        "confirmations":    confirmations,
        "is_complete":      is_complete,
        "updated_history":  history,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Smart helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fallback_reply(lang: str) -> str:
    if lang == "hi":
        return "माफ़ करें, कुछ गड़बड़ हो गई। क्या आप फिर से बता सकते हैं?"
    return "Sorry, something went wrong on my end. Could you say that again?"


def _clean_extracted(extracted: dict, form_schema: dict) -> dict:
    """
    Remove nulls, empty strings, 'N/A', and keys not in form schema.
    Normalise booleans.
    """
    valid_names = {f["field_name"] for f in form_schema.get("fields", [])}
    cleaned = {}
    for k, v in extracted.items():
        if v in (None, "", "N/A", "null", "undefined"):
            continue
        if k not in valid_names:
            continue
        # Normalise boolean-ish
        if isinstance(v, str) and v.lower() in ("yes", "true", "1", "haan", "ha", "✓"):
            field = next((f for f in form_schema["fields"] if f["field_name"] == k), {})
            if field.get("field_type") == "checkbox":
                v = True
        elif isinstance(v, str) and v.lower() in ("no", "false", "0", "nahi", "na", "☐"):
            field = next((f for f in form_schema["fields"] if f["field_name"] == k), {})
            if field.get("field_type") == "checkbox":
                v = False
        cleaned[k] = v
    return cleaned


def _smart_name_split(extracted: dict, form_schema: dict, collected: dict) -> dict:
    """
    If any extracted value looks like a multi-part name AND the form has
    separate first/middle/last name fields, auto-split and fill them.
    Only fills fields that are currently empty.
    """
    field_names = {f["field_name"]: f for f in form_schema.get("fields", [])}

    # Detect name-type fields by field_name and data_type
    first_name_keys  = _find_fields(field_names, ["first_name", "fname", "given_name"], "name")
    middle_name_keys = _find_fields(field_names, ["middle_name", "mname", "middle"], "name")
    last_name_keys   = _find_fields(field_names, ["last_name", "lname", "surname", "family_name"], "name")
    full_name_keys   = _find_fields(field_names, ["full_name", "name", "applicant_name", "candidate_name"], "name")

    # Look for a name value that was just extracted OR already collected
    name_value = None
    name_source_key = None

    # Check newly extracted first
    for k, v in extracted.items():
        field = field_names.get(k, {})
        if field.get("data_type") == "name" or "name" in k.lower():
            if isinstance(v, str) and len(v.split()) >= 2:
                name_value = v.strip()
                name_source_key = k
                break

    if not name_value:
        return extracted

    # Clean title prefixes
    title_prefixes = ["dr.", "mr.", "mrs.", "ms.", "prof.", "er.", "adv."]
    title = None
    name_clean = name_value
    lower = name_value.lower()
    for prefix in title_prefixes:
        if lower.startswith(prefix):
            title = name_value[:len(prefix)].rstrip(".")
            name_clean = name_value[len(prefix):].strip()
            break

    parts = name_clean.split()

    # If we have separate name fields AND they're not already filled
    if first_name_keys and last_name_keys:
        first_key  = first_name_keys[0]
        last_key   = last_name_keys[0]
        middle_key = middle_name_keys[0] if middle_name_keys else None

        # Only auto-fill if not already collected
        if collected.get(first_key) in (None, "", "N/A"):
            if len(parts) == 2:
                extracted[first_key] = parts[0]
                extracted[last_key]  = parts[1]
            elif len(parts) == 3 and middle_key:
                extracted[first_key]  = parts[0]
                extracted[middle_key] = parts[1]
                extracted[last_key]   = parts[2]
            elif len(parts) >= 3 and not middle_key:
                # No middle name field — put first word as first, rest as last
                extracted[first_key] = parts[0]
                extracted[last_key]  = " ".join(parts[1:])
            elif len(parts) == 1:
                extracted[first_key] = parts[0]

        # Fill title field if exists
        if title:
            title_keys = _find_fields(field_names, ["title", "salutation", "prefix"], None)
            if title_keys and collected.get(title_keys[0]) in (None, "", "N/A"):
                extracted[title_keys[0]] = title

    # Also fill full_name if present and empty
    if full_name_keys:
        fk = full_name_keys[0]
        if collected.get(fk) in (None, "", "N/A") and fk != name_source_key:
            extracted[fk] = name_value

    return extracted


def _find_fields(field_names: dict, keywords: list, data_type: str | None) -> list:
    """Find field keys that match any keyword or data_type."""
    matches = []
    for name, field in field_names.items():
        name_lower = name.lower()
        if any(kw in name_lower for kw in keywords):
            matches.append(name)
        elif data_type and field.get("data_type") == data_type:
            if any(kw in (field.get("semantic_label", "") + name).lower() for kw in keywords):
                matches.append(name)
    return matches


def _validate_extracted(extracted: dict, form_schema: dict) -> tuple[dict, list]:
    """
    Check extracted values against field validation rules.
    Returns (cleaned_extracted, list_of_invalid_field_names).
    """
    field_map = {f["field_name"]: f for f in form_schema.get("fields", [])}
    invalid = []

    for key, value in extracted.items():
        field = field_map.get(key, {})
        rules = field.get("validation_rules", {})
        ftype = field.get("field_type", "text")

        if not isinstance(value, str):
            continue

        v = value.strip()

        # Email validation
        if rules.get("type") == "email" or ftype == "email":
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
                invalid.append(key)

        # Phone validation (Indian 10-digit)
        elif rules.get("type") == "phone" or field.get("data_type") == "phone":
            digits = re.sub(r"[\s\-\+\(\)]", "", v)
            if digits.startswith("91") and len(digits) == 12:
                digits = digits[2:]  # Strip +91
            if not re.match(r"^\d{10}$", digits):
                invalid.append(key)
            else:
                extracted[key] = digits  # Normalise

        # Pincode (Indian 6-digit)
        elif rules.get("type") == "pincode" or "pincode" in key.lower() or "pin_code" in key.lower():
            if not re.match(r"^\d{6}$", v.replace(" ", "")):
                invalid.append(key)

        # Date — basic sanity
        elif ftype == "date":
            # Just normalise common formats — deep validation left to bot
            pass

    return extracted, invalid


def _detect_skip_intent(
    user_message: str,
    extracted: dict,
    form_schema: dict,
    collected: dict,
    lang: str,
) -> dict:
    """
    If user clearly says they don't know / want to skip,
    mark the most recently asked unfilled field as SKIPPED.
    The bot's reply should handle this gracefully.
    """
    skip_phrases_en = ["don't know", "not sure", "skip", "leave it", "no idea", "cant say", "can't say", "later"]
    skip_phrases_hi = ["नहीं पता", "पता नहीं", "छोड़ दो", "बाद में", "skip करो"]

    msg_lower = user_message.lower().strip()
    is_skip = (
        any(p in msg_lower for p in skip_phrases_en) or
        any(p in user_message for p in skip_phrases_hi)
    )

    if is_skip and not extracted:
        # Find first unfilled required field and mark it skipped
        for f in form_schema.get("fields", []):
            name = f["field_name"]
            val = collected.get(name)
            if val in (None, "", "N/A") and f.get("is_required"):
                extracted[name] = "SKIPPED"
                break

    return extracted
