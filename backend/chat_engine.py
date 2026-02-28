"""
Vaarta Chat Engine — v3.0
Upgrades:
  - Auto language detection persisted back via detected_lang
  - PAN / Aadhaar / GSTIN / IFSC / TAN validation
  - Drop-off signal: last_asked_field tracked so analytics know where users stop
"""

import json
import logging
import os
import re
from datetime import datetime
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
# Language detection helper (fast, no API call)
# Used as a pre-flight check before sending to GPT so we can set the right lang
# in the system prompt even on the very first message.
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_RANGES = {
    "hi": (0x0900, 0x097F),   # Devanagari — covers Hindi AND Marathi
    "ta": (0x0B80, 0x0BFF),   # Tamil
    "te": (0x0C00, 0x0C7F),   # Telugu
    "bn": (0x0980, 0x09FF),   # Bengali
    "gu": (0x0A80, 0x0AFF),   # Gujarati
}

def detect_language(text: str) -> str | None:
    """
    Returns detected language code if non-English script is found, else None.
    Checks character ranges — no API call needed.
    """
    for lang, (lo, hi) in SCRIPT_RANGES.items():
        if any(lo <= ord(c) <= hi for c in text):
            return lang
    # Hinglish heuristic: common Hindi words written in Latin
    hinglish_markers = [
        "mera", "meri", "mujhe", "aapka", "aapki", "hai", "hain",
        "naam", "kya", "nahi", "nahin", "haan", "achha", "theek",
        "bata", "chahiye", "karein", "dijiye",
    ]
    lower = text.lower()
    if sum(1 for w in hinglish_markers if re.search(r'\b' + w + r'\b', lower)) >= 2:
        return "hi"
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Opening message
# ─────────────────────────────────────────────────────────────────────────────

async def get_opening_message(form_schema: dict, lang: str = "en") -> str:
    """Generate a warm, form-specific opening message."""
    form_title = form_schema.get("form_title", "this form")
    fields     = form_schema.get("fields", [])
    prompt     = build_opening_prompt(form_title, fields, lang)

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
      - reply:              bot's conversational response
      - extracted:          all field values parsed this turn (incl. inferred)
      - confirmations:      field names the bot auto-filled and wants user to confirm
      - is_complete:        True only when all required fields done + user confirmed
      - updated_history:    full conversation history for next turn
      - detected_lang:      new language code if the user switched language (or None)
      - last_asked_field:   field_name of the next unfilled required field (for drop-off analytics)
    """
    collected = session.get("collected", {})
    history   = session.get("chat_history", [])

    # ── Auto language detection (fast, before API call) ──
    auto_lang = detect_language(user_message)
    if auto_lang and auto_lang != lang:
        logger.info(f"Language auto-switched: {lang} → {auto_lang}")
        lang = auto_lang

    # ── Identify what field we're currently working on (for drop-off tracking) ──
    last_asked_field = _get_next_unfilled_field(form_schema, collected)

    # ── Build system prompt with live form state ──
    system = SYSTEM_PROMPT + "\n\n" + build_turn_context(form_schema, collected, lang)

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
    detected_lang  = None

    if message.tool_calls:
        try:
            args = json.loads(message.tool_calls[0].function.arguments)
            reply          = args.get("reply", "")
            extracted      = args.get("extracted", {}) or {}
            confirmations  = args.get("confirmations_needed", []) or []
            validation_err = args.get("validation_errors", []) or []
            is_complete    = bool(args.get("is_complete", False))
            # Language detection from model (catches cases our regex misses)
            model_lang     = args.get("detected_lang")
            if model_lang and model_lang != lang:
                detected_lang = model_lang
                lang = model_lang
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Tool call parse error: {e}")
            reply = message.content or _fallback_reply(lang)
    else:
        reply = message.content or _fallback_reply(lang)

    # If our fast detector found a language switch, report it
    if auto_lang and auto_lang != session.get("lang", "en") and not detected_lang:
        detected_lang = auto_lang

    # ── Post-processing ──
    extracted = _clean_extracted(extracted, form_schema)
    extracted = _smart_name_split(extracted, form_schema, collected)
    extracted, invalid_fields = _validate_extracted(extracted, form_schema)

    # Don't persist invalid values — let the bot's reply handle correction
    for field_name in invalid_fields:
        extracted.pop(field_name, None)

    extracted = _detect_skip_intent(user_message, extracted, form_schema, collected, lang)

    history.append({"role": "assistant", "content": reply})

    # ── WhatsApp phone collection ──────────────────────────────────────
    from whatsapp_delivery import is_configured
    if is_complete and is_configured():
        phone_stored = session.get("whatsapp_phone")
        if not phone_stored:
            phone_from_msg = _extract_phone_from_message(user_message)
            if phone_from_msg:
                session["whatsapp_phone"] = phone_from_msg
                extracted["_whatsapp_phone"] = phone_from_msg
            else:
                is_complete = False
                if lang == "hi":
                    reply = (
                        "बहुत बढ़िया! 🎉 आपका फ़ॉर्म लगभग तैयार है।\n\n"
                        "क्या आप चाहेंगे कि भरा हुआ PDF आपके WhatsApp पर भेजा जाए? "
                        "अगर हाँ, तो अपना WhatsApp नंबर बताएँ (10 अंक)। "
                        "या 'नहीं' कहें — फिर आप सीधे डाउनलोड कर सकते हैं।"
                    )
                else:
                    reply = (
                        "Almost done! 🎉\n\n"
                        "Would you like your completed PDF sent directly to your WhatsApp? "
                        "If yes, share your WhatsApp number (10 digits). "
                        "Or say 'skip' to just download it."
                    )
                history[-1]["content"] = reply

    return {
        "reply":             reply,
        "extracted":         extracted,
        "confirmations":     confirmations,
        "is_complete":       is_complete,
        "updated_history":   history,
        "detected_lang":     detected_lang,
        "last_asked_field":  last_asked_field,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Drop-off analytics helper
# ─────────────────────────────────────────────────────────────────────────────

def _get_next_unfilled_field(form_schema: dict, collected: dict) -> str | None:
    """Return the field_name of the next required field that hasn't been filled."""
    for f in form_schema.get("fields", []):
        if f.get("is_required"):
            val = collected.get(f["field_name"])
            if val in (None, "", "N/A"):
                return f["field_name"]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Validation — enhanced with Indian government ID formats
# ─────────────────────────────────────────────────────────────────────────────

def _validate_extracted(extracted: dict, form_schema: dict) -> tuple[dict, list]:
    """
    Validate extracted values against field rules AND known Indian ID formats.
    Returns (cleaned_extracted, list_of_invalid_field_names).
    """
    field_map = {f["field_name"]: f for f in form_schema.get("fields", [])}
    invalid = []

    for key, value in list(extracted.items()):
        field = field_map.get(key, {})
        rules = field.get("validation_rules", {})
        ftype = field.get("field_type", "text")

        if not isinstance(value, str):
            continue

        v         = value.strip().upper()   # upper for ID checks
        v_raw     = value.strip()
        name_low  = key.lower()

        # ── Email ──
        if rules.get("type") == "email" or ftype == "email":
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v_raw):
                invalid.append(key)

        # ── Phone (Indian 10-digit) ──
        elif rules.get("type") == "phone" or field.get("data_type") == "phone" or \
                "phone" in name_low or "mobile" in name_low:
            digits = re.sub(r"[\s\-\+\(\)]", "", v_raw)
            if digits.startswith("91") and len(digits) == 12:
                digits = digits[2:]
            if not re.match(r"^\d{10}$", digits):
                invalid.append(key)
            else:
                extracted[key] = digits

        # ── Pincode (Indian 6-digit) ──
        elif "pincode" in name_low or "pin_code" in name_low or "postal_code" in name_low:
            if not re.match(r"^\d{6}$", v_raw.replace(" ", "")):
                invalid.append(key)

        # ── PAN (AAAAA9999A) ──
        elif "pan" in name_low and "company" not in name_low:
            pan_clean = re.sub(r"\s", "", v)
            if not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", pan_clean):
                invalid.append(key)
            else:
                extracted[key] = pan_clean

        # ── Aadhaar (12 digits) ──
        elif "aadhaar" in name_low or "aadhar" in name_low:
            digits = re.sub(r"[\s\-]", "", v_raw)
            if not re.match(r"^\d{12}$", digits):
                invalid.append(key)
            else:
                extracted[key] = digits

        # ── GSTIN (15 chars: 2 digits + 10 PAN + 1 digit + Z + 1 checksum) ──
        elif "gstin" in name_low or ("gst" in name_low and "number" in name_low):
            gstin_clean = re.sub(r"\s", "", v)
            if not re.match(r"^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$", gstin_clean):
                invalid.append(key)
            else:
                extracted[key] = gstin_clean

        # ── IFSC (AAAA0BBBBBB) ──
        elif "ifsc" in name_low:
            ifsc_clean = re.sub(r"\s", "", v)
            if not re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", ifsc_clean):
                invalid.append(key)
            else:
                extracted[key] = ifsc_clean

        # ── TAN (AAAA99999A) ──
        elif name_low == "tan" or name_low.startswith("tan_") or name_low.endswith("_tan"):
            tan_clean = re.sub(r"\s", "", v)
            if not re.match(r"^[A-Z]{4}[0-9]{5}[A-Z]$", tan_clean):
                invalid.append(key)
            else:
                extracted[key] = tan_clean

        # ── Radio/checkbox with children: value must match one of the option labels ──
        elif ftype in ("radio", "checkbox"):
            children = field.get("children") or []
            if children:
                val_lower = value.strip().lower()
                matched_label = None
                for c in children:
                    lab = (c.get("label") or "").strip()
                    if lab and lab.lower() == val_lower:
                        matched_label = lab
                        break
                if matched_label is not None:
                    extracted[key] = matched_label  # normalise to schema label
                else:
                    invalid.append(key)

    return extracted, invalid


# ─────────────────────────────────────────────────────────────────────────────
# Helpers (unchanged from v2, kept in one place)
# ─────────────────────────────────────────────────────────────────────────────

def _fallback_reply(lang: str) -> str:
    if lang == "hi":
        return "माफ़ करें, कुछ गड़बड़ हो गई। क्या आप फिर से बता सकते हैं?"
    return "Sorry, something went wrong on my end. Could you say that again?"


def _clean_extracted(extracted: dict, form_schema: dict) -> dict:
    """Remove nulls, empty strings, invalid keys. Normalise booleans."""
    valid_names = {f["field_name"] for f in form_schema.get("fields", [])}
    cleaned = {}
    for k, v in extracted.items():
        if v in (None, "", "N/A", "null", "undefined"):
            continue
        if k not in valid_names:
            continue
        if isinstance(v, str) and v.lower() in ("yes", "true", "1", "haan", "ha", "✓"):
            field = next((f for f in form_schema["fields"] if f["field_name"] == k), {})
            if field.get("field_type") == "checkbox" and not (field.get("children")):
                v = True
        elif isinstance(v, str) and v.lower() in ("no", "false", "0", "nahi", "na", "☐"):
            field = next((f for f in form_schema["fields"] if f["field_name"] == k), {})
            if field.get("field_type") == "checkbox" and not (field.get("children")):
                v = False
        cleaned[k] = v
    return cleaned


def _smart_name_split(extracted: dict, form_schema: dict, collected: dict) -> dict:
    """Auto-split full names into first/middle/last sub-fields if the form has them."""
    field_names = {f["field_name"]: f for f in form_schema.get("fields", [])}

    first_name_keys  = _find_fields(field_names, ["first_name", "fname", "given_name"], "name")
    middle_name_keys = _find_fields(field_names, ["middle_name", "mname", "middle"], "name")
    last_name_keys   = _find_fields(field_names, ["last_name", "lname", "surname", "family_name"], "name")
    full_name_keys   = _find_fields(field_names, ["full_name", "name", "applicant_name", "candidate_name"], "name")

    name_value = None
    name_source_key = None

    for k, v in extracted.items():
        field = field_names.get(k, {})
        if field.get("data_type") == "name" or "name" in k.lower():
            if isinstance(v, str) and len(v.split()) >= 2:
                name_value = v.strip()
                name_source_key = k
                break

    if not name_value:
        return extracted

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

    if first_name_keys and last_name_keys:
        first_key  = first_name_keys[0]
        last_key   = last_name_keys[0]
        middle_key = middle_name_keys[0] if middle_name_keys else None

        if collected.get(first_key) in (None, "", "N/A"):
            if len(parts) == 2:
                extracted[first_key] = parts[0]
                extracted[last_key]  = parts[1]
            elif len(parts) == 3 and middle_key:
                extracted[first_key]  = parts[0]
                extracted[middle_key] = parts[1]
                extracted[last_key]   = parts[2]
            elif len(parts) >= 3 and not middle_key:
                extracted[first_key] = parts[0]
                extracted[last_key]  = " ".join(parts[1:])
            elif len(parts) == 1:
                extracted[first_key] = parts[0]

        if title:
            title_keys = _find_fields(field_names, ["title", "salutation", "prefix"], None)
            if title_keys and collected.get(title_keys[0]) in (None, "", "N/A"):
                extracted[title_keys[0]] = title

    if full_name_keys:
        fk = full_name_keys[0]
        if collected.get(fk) in (None, "", "N/A") and fk != name_source_key:
            extracted[fk] = name_value

    return extracted


def _find_fields(field_names: dict, keywords: list, data_type: str | None) -> list:
    matches = []
    for name, field in field_names.items():
        name_lower = name.lower()
        if any(kw in name_lower for kw in keywords):
            matches.append(name)
        elif data_type and field.get("data_type") == data_type:
            if any(kw in (field.get("semantic_label", "") + name).lower() for kw in keywords):
                matches.append(name)
    return matches


def _detect_skip_intent(
    user_message: str,
    extracted: dict,
    form_schema: dict,
    collected: dict,
    lang: str,
) -> dict:
    skip_phrases_en = ["don't know", "not sure", "skip", "leave it", "no idea", "cant say", "can't say", "later"]
    skip_phrases_hi = ["नहीं पता", "पता नहीं", "छोड़ दो", "बाद में", "skip करो"]

    msg_lower = user_message.lower().strip()
    is_skip = (
        any(p in msg_lower for p in skip_phrases_en) or
        any(p in user_message for p in skip_phrases_hi)
    )

    if is_skip and not extracted:
        for f in form_schema.get("fields", []):
            name = f["field_name"]
            val  = collected.get(name)
            if val in (None, "", "N/A") and f.get("is_required"):
                extracted[name] = "SKIPPED"
                break

    return extracted


def _extract_phone_from_message(text: str) -> str | None:
    """Extract Indian phone number from free text, or __SKIP__ if user declines."""
    import re
    t = text.replace(" ", "").replace("-", "")
    patterns = [
        r"\+91[\s\-]?([6-9]\d{9})",
        r"\b91[\s\-]?([6-9]\d{9})\b",
        r"\b([6-9]\d{9})\b",
    ]
    for pat in patterns:
        m = re.search(pat, t)
        if m:
            return m.group(1) if m.lastindex else m.group(0)
    skip_words = ["skip", "no", "nahi", "nahin", "nope", "later", "dont", "don't"]
    if any(w in text.lower() for w in skip_words):
        return "__SKIP__"
    return None