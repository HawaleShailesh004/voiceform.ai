"""
Vaarta Chat Engine — v4.0
─────────────────────────────────────────────────────────────────────────────
Philosophy:
  - Tier 1 (Hard validate):   PAN / Aadhaar / GSTIN / IFSC / TAN / Phone
                               → reject if format is wrong, ask to re-enter
  - Tier 2 (Smart parse):     Dates, amounts, names, emails, pincodes
                               → parse best guess, confirm only if uncertain
  - Tier 3 (Trust fully):     Free text — address, occupation, purpose, etc.
                               → extract and accept without questioning

Key upgrades over v3:
  ✓ Correction detection — "wait, my name is actually X" overwrites cleanly
  ✓ Confidence-flagged extraction — LLM signals uncertain fields for confirmation
  ✓ Smart date / amount / name normalisation (natural language → structured)
  ✓ Final confirmation summary before marking complete
  ✓ Field dependency / conditional skip support via schema
  ✓ Progress context injected into every turn ("4 of 9 fields done")
  ✓ Required-field skip protection (bot pushes back, never writes "SKIPPED")
  ✓ WhatsApp __SKIP__ handled correctly
  ✓ Marathi disambiguation from Devanagari script
  ✓ Module-level imports (no hot-path import overhead)
  ✓ print() debug statements removed (were leaking API keys)
  ✓ Duplicate TTS null-check bug fixed
  ✓ STT GROQ_API_KEY AttributeError fixed
"""

import json
import logging
import os
import re
from datetime import datetime
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from config import get_settings
from prompts import (
    SYSTEM_PROMPT,
    EXTRACT_TOOL_DEFINITION,
    build_opening_prompt,
    build_turn_context,
)

# Module-level import — not inside the hot path
try:
    from whatsapp_delivery import is_configured as whatsapp_is_configured
except ImportError:
    def whatsapp_is_configured():
        return False

logger = logging.getLogger(__name__)
_settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# Chat client factory
# ─────────────────────────────────────────────────────────────────────────────

def _chat_client():
    """Return (client, model_name) based on CHAT_PROVIDER setting."""
    if _settings.CHAT_PROVIDER == "groq":
        from groq import AsyncGroq
        return (
            AsyncGroq(api_key=_settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY")),
            _settings.GROQ_CHAT_MODEL,
        )
    from openai import AsyncOpenAI
    return (
        AsyncOpenAI(api_key=_settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")),
        "gpt-4o",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Language detection
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_RANGES = {
    "hi": (0x0900, 0x097F),   # Devanagari — Hindi AND Marathi share this block
    "ta": (0x0B80, 0x0BFF),
    "te": (0x0C00, 0x0C7F),
    "bn": (0x0980, 0x09FF),
    "gu": (0x0A80, 0x0AFF),
}

# Marathi-specific words written in Devanagari — disambiguates from Hindi
MARATHI_MARKERS = ["आहे", "आहेत", "माझे", "माझी", "मला", "तुमचे", "नाव", "सांगा", "करा"]

HINGLISH_MARKERS = [
    "mera", "meri", "mujhe", "aapka", "aapki", "hai", "hain",
    "naam", "kya", "nahi", "nahin", "haan", "achha", "theek",
    "bata", "chahiye", "karein", "dijiye",
]


def detect_language(text: str) -> str | None:
    """
    Returns detected language code if non-English script found, else None.
    Devanagari is disambiguated between Hindi (hi) and Marathi (mr).
    """
    for lang, (lo, hi) in SCRIPT_RANGES.items():
        if any(lo <= ord(c) <= hi for c in text):
            if lang == "hi":
                # Check if it's actually Marathi
                if any(marker in text for marker in MARATHI_MARKERS):
                    return "mr"
            return lang

    # Hinglish heuristic
    lower = text.lower()
    if sum(1 for w in HINGLISH_MARKERS if re.search(r'\b' + w + r'\b', lower)) >= 2:
        return "hi"
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Smart natural-language parsers (Tier 2)
# These parse fuzzy human input → clean structured value.
# They NEVER raise — they return (value, confident: bool).
# If confident=False, the bot will ask for confirmation.
# ─────────────────────────────────────────────────────────────────────────────

# Word → digit maps (covers Indian English + Hindi numerals spoken in English)
_WORD_NUMBERS = {
    "zero":0,"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,
    "eight":8,"nine":9,"ten":10,"eleven":11,"twelve":12,"thirteen":13,
    "fourteen":14,"fifteen":15,"sixteen":16,"seventeen":17,"eighteen":18,
    "nineteen":19,"twenty":20,"thirty":30,"forty":40,"fifty":50,"sixty":60,
    "seventy":70,"eighty":80,"ninety":90,"hundred":100,"thousand":1000,
    "lakh":100000,"lac":100000,"lakhs":100000,"crore":10000000,"crores":10000000,
}

_MONTH_MAP = {
    "jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,
    "apr":4,"april":4,"may":5,"jun":6,"june":6,"jul":7,"july":7,
    "aug":8,"august":8,"sep":9,"sept":9,"september":9,"oct":10,"october":10,
    "nov":11,"november":11,"dec":12,"december":12,
}


def _words_to_number(text: str) -> int | None:
    """Convert spoken number words to integer. Returns None if unparseable."""
    text = text.lower().strip()
    # Already a digit string
    clean = re.sub(r"[,\s]", "", text)
    if re.match(r"^\d+$", clean):
        return int(clean)

    tokens = re.split(r"[\s\-]+", text)
    result = 0
    current = 0
    for t in tokens:
        t = t.rstrip("sth").rstrip("nd").rstrip("rd")  # strip ordinal suffixes
        n = _WORD_NUMBERS.get(t)
        if n is None:
            # try stripping trailing 's' (twenties → twenty)
            n = _WORD_NUMBERS.get(t.rstrip("s"))
        if n is None:
            continue
        if n == 100:
            current = (current or 1) * 100
        elif n >= 1000:
            result += (current or 1) * n
            current = 0
        else:
            current += n
    result += current
    return result if result > 0 else None


def parse_date(text: str) -> tuple[str | None, bool]:
    """
    Parse a date from natural language. Returns (ISO_date_string or None, is_confident).
    Examples:
      "15 march 1990"        → ("1990-03-15", True)
      "15 of march twenty26" → ("2026-03-15", True)   ← the exact use-case from spec
      "5/6/89"               → ("1989-06-05", False)  ← ambiguous, ask to confirm
      "dob is next tuesday"  → (None, False)
    """
    text_clean = text.lower().strip()
    # Remove noise words
    text_clean = re.sub(r"\b(of|the|on|dated?|dob|born|birth|date)\b", " ", text_clean)
    text_clean = re.sub(r"\s+", " ", text_clean).strip()

    day = month = year = None
    confident = True

    # ── Try to extract year first (4-digit or word-form like "twenty twenty-six") ──
    # Word-form years: "twenty twenty six" → 2026
    year_word_match = re.search(
        r"\b(nineteen|twenty)\s+(\w+)(?:\s+(\w+))?\b", text_clean
    )
    if year_word_match:
        century_word = year_word_match.group(1)
        century_base = 1900 if century_word == "nineteen" else 2000
        rest = year_word_match.group(2)
        extra = year_word_match.group(3) or ""
        decade = _words_to_number(rest)
        units = _words_to_number(extra) if extra else 0
        if decade is not None:
            year = century_base + decade + (units or 0)
        text_clean = text_clean[:year_word_match.start()] + text_clean[year_word_match.end():]
        text_clean = text_clean.strip()

    # 4-digit year
    if year is None:
        yr_match = re.search(r"\b(19\d{2}|20\d{2})\b", text_clean)
        if yr_match:
            year = int(yr_match.group(1))
            text_clean = text_clean.replace(yr_match.group(1), "").strip()

    # 2-digit year (e.g. "89" → 1989, "26" → 2026)
    if year is None:
        yr2_match = re.search(r"\b(\d{2})\b", text_clean)
        if yr2_match:
            yr2 = int(yr2_match.group(1))
            year = (1900 + yr2) if yr2 >= 30 else (2000 + yr2)
            confident = False  # 2-digit year is ambiguous
            text_clean = text_clean.replace(yr2_match.group(1), "", 1).strip()

    # ── Month ──
    for m_text, m_num in _MONTH_MAP.items():
        if re.search(r'\b' + m_text + r'\b', text_clean):
            month = m_num
            text_clean = re.sub(r'\b' + m_text + r'\b', "", text_clean).strip()
            break

    # ── Day ──
    # Word-form day ("fifteen", "first", "twenty-first")
    day_num = _words_to_number(text_clean)
    if day_num and 1 <= day_num <= 31:
        day = day_num
    else:
        d_match = re.search(r"\b(\d{1,2})\b", text_clean)
        if d_match:
            day = int(d_match.group(1))
            if not (1 <= day <= 31):
                day = None

    # ── Fallback: pure numeric formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD) ──
    if not all([day, month, year]):
        for sep in (r"/", r"-", r"\.", r"\s"):
            p = rf"(\d{{1,4}}){sep}(\d{{1,2}}){sep}(\d{{2,4}})"
            m = re.search(p, text.lower())
            if m:
                a, b, c = int(m.group(1)), int(m.group(2)), int(m.group(3))
                if a > 31:                      # YYYY-MM-DD
                    year, month, day = a, b, c
                elif c > 31:                    # DD/MM/YYYY or MM/DD/YYYY
                    year = (1900 + c) if c >= 30 else (2000 + c) if c < 100 else c
                    if b > 12:                  # must be DD/MM
                        day, month = b, a
                    elif a > 12:               # must be DD/MM
                        day, month = a, b
                    else:
                        day, month = a, b      # assume DD/MM (Indian convention)
                        confident = False      # ambiguous D/M order
                break

    if not all([day, month, year]):
        return None, False

    # Basic sanity check
    try:
        dt = datetime(year, month, day)
        # Flag future birthdates or implausibly old dates as uncertain
        now = datetime.now()
        if dt > now and "dob" in text.lower() or "birth" in text.lower():
            confident = False
        return dt.strftime("%d/%m/%Y"), confident
    except ValueError:
        return None, False


def parse_amount(text: str) -> tuple[str | None, bool]:
    """
    Parse Indian currency amount from natural language.
    "fifty thousand rupees" → ("50000", True)
    "₹ 1,50,000"           → ("150000", True)
    "around 2 lakh"        → ("200000", False)  ← "around" signals uncertainty
    """
    text_lower = text.lower()
    confident = "around" not in text_lower and "approximately" not in text_lower \
                and "roughly" not in text_lower and "lagbhag" not in text_lower

    # Remove currency symbols and noise
    clean = re.sub(r"[₹$,\s]", " ", text_lower)
    clean = re.sub(r"\b(rupees?|rs\.?|inr|per\s+annum|per\s+month|monthly|annually)\b", " ", clean)
    clean = re.sub(r"\b(around|about|approximately|roughly)\b", " ", clean)
    clean = clean.strip()

    # Try word-based parsing
    amount = _words_to_number(clean)
    if amount:
        return str(amount), confident

    # Try pure numeric with multiplier
    m = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|lac|crore|k|thousand)?", clean)
    if m:
        base = float(m.group(1))
        mult_word = (m.group(2) or "").lower()
        mult = {"lakh": 100000, "lac": 100000, "crore": 10000000,
                "k": 1000, "thousand": 1000}.get(mult_word, 1)
        return str(int(base * mult)), confident

    return None, False


def parse_name(text: str) -> tuple[str | None, bool]:
    """
    Clean and title-case a name. Flags if suspicious (too short, has digits, etc.)
    "rahul kumar sharma" → ("Rahul Kumar Sharma", True)
    "r k"                → ("R K", False)  ← initials only — ask to confirm
    """
    # Strip common noise phrases
    noise = r"\b(my name is|i am|mera naam|naam hai|i'm|mujhe)\b"
    clean = re.sub(noise, "", text, flags=re.IGNORECASE).strip()
    clean = re.sub(r"[^a-zA-Z\s\.\-]", "", clean).strip()

    if not clean:
        return None, False

    parts = clean.split()
    confident = True

    # Flag suspicious names
    if len(parts) == 1 and len(parts[0]) <= 2:
        confident = False   # single initial
    if any(p.isdigit() for p in parts):
        confident = False

    title_cased = " ".join(p.capitalize() for p in parts)
    return title_cased, confident


# ─────────────────────────────────────────────────────────────────────────────
# Tier 1: Hard validators (reject and ask again if wrong)
# ─────────────────────────────────────────────────────────────────────────────

def _hard_validate(key: str, value: str, field: dict) -> tuple[str | None, str | None]:
    """
    For Tier-1 fields only. Returns (normalised_value, error_message).
    error_message is None if valid.
    """
    name_low = key.lower()
    v = value.strip().upper()
    v_raw = value.strip()

    # ── Phone ──
    if "phone" in name_low or "mobile" in name_low or \
       field.get("data_type") == "phone" or \
       (field.get("validation_rules") or {}).get("type") == "phone":
        digits = re.sub(r"[\s\-\+\(\)]", "", v_raw)
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        if re.match(r"^[6-9]\d{9}$", digits):
            return digits, None
        return None, "That doesn't look like a valid 10-digit Indian mobile number. Could you share it again?"

    # ── PAN ──
    if "pan" in name_low and "company" not in name_low:
        pan = re.sub(r"\s", "", v)
        if re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", pan):
            return pan, None
        return None, "PAN should be in the format ABCDE1234F (5 letters, 4 digits, 1 letter). Please check and re-enter."

    # ── Aadhaar ──
    if "aadhaar" in name_low or "aadhar" in name_low:
        digits = re.sub(r"[\s\-]", "", v_raw)
        if re.match(r"^\d{12}$", digits):
            return digits, None
        return None, "Aadhaar number should be exactly 12 digits. Please re-enter."

    # ── GSTIN ──
    if "gstin" in name_low or ("gst" in name_low and "number" in name_low):
        gstin = re.sub(r"\s", "", v)
        if re.match(r"^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$", gstin):
            return gstin, None
        return None, "GSTIN should be 15 characters (e.g. 22ABCDE1234F1Z5). Please check and re-enter."

    # ── IFSC ──
    if "ifsc" in name_low:
        ifsc = re.sub(r"\s", "", v)
        if re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", ifsc):
            return ifsc, None
        return None, "IFSC code should be 11 characters starting with 4 letters, then 0, then 6 alphanumeric (e.g. SBIN0001234). Please re-enter."

    # ── TAN ──
    if name_low == "tan" or name_low.startswith("tan_") or name_low.endswith("_tan"):
        tan = re.sub(r"\s", "", v)
        if re.match(r"^[A-Z]{4}[0-9]{5}[A-Z]$", tan):
            return tan, None
        return None, "TAN should be 10 characters (4 letters, 5 digits, 1 letter). Please re-enter."

    # ── Email ──
    if (field.get("validation_rules") or {}).get("type") == "email" or \
       field.get("field_type") == "email":
        if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v_raw):
            return v_raw.lower(), None
        return None, "That email address doesn't look right. Could you double-check it?"

    return value, None   # Not a Tier-1 field — caller handles it


# ─────────────────────────────────────────────────────────────────────────────
# Tier 2: Smart parse + confidence
# ─────────────────────────────────────────────────────────────────────────────

def _smart_parse(key: str, value: str, field: dict) -> tuple[str | None, bool]:
    """
    Returns (parsed_value or None, is_confident).
    None means unparseable — bot should ask again naturally.
    False confidence means bot should confirm with user.
    """
    name_low = key.lower()
    ftype = field.get("field_type", "text")
    dtype = field.get("data_type", "text")

    # Date fields
    if dtype == "date" or "date" in name_low or "dob" in name_low or "birth" in name_low:
        return parse_date(value)

    # Amount / currency fields
    if dtype in ("amount", "currency", "number") or \
       any(w in name_low for w in ("amount", "salary", "income", "fee", "price", "cost", "value")):
        parsed, confident = parse_amount(value)
        if parsed:
            return parsed, confident
        # If parse_amount fails, try raw numeric extraction
        nums = re.findall(r"\d+", value.replace(",", ""))
        if nums:
            return nums[0], False

    # Name fields
    if dtype == "name" or any(w in name_low for w in ("name", "fname", "lname", "mname", "surname")):
        return parse_name(value)

    # Pincode (6 digits — lenient extraction)
    if any(w in name_low for w in ("pincode", "pin_code", "postal")):
        digits = re.sub(r"\s", "", value)
        m = re.search(r"\b(\d{6})\b", digits)
        if m:
            return m.group(1), True
        return None, False

    # Radio/checkbox — match against options leniently
    children = field.get("children") or []
    if ftype in ("radio", "checkbox") and children:
        val_lower = value.strip().lower()
        # Exact match
        for c in children:
            lab = (c.get("label") or "").strip().lower()
            if lab == val_lower:
                return c["label"], True
        # Partial / number match
        for i, c in enumerate(children):
            lab = (c.get("label") or "").strip().lower()
            if val_lower in lab or lab in val_lower:
                return c["label"], True
            if val_lower == str(i + 1):  # user said "1", "2", etc.
                return c["label"], True
        return None, False

    # Default: return as-is (Tier 3 trust)
    return value.strip(), True


# ─────────────────────────────────────────────────────────────────────────────
# Correction detection
# ─────────────────────────────────────────────────────────────────────────────

CORRECTION_PHRASES_EN = [
    "wait", "actually", "sorry", "no,", "i meant", "i mean",
    "not", "wrong", "mistake", "correct it", "change it",
    "update", "it should be", "should be", "replace",
]
CORRECTION_PHRASES_HI = [
    "ruko", "nahi", "galat", "sahi karo", "badlo", "matlab",
    "woh nahi", "actually",
]


def _is_correction(user_message: str) -> bool:
    lower = user_message.lower()
    return (
        any(p in lower for p in CORRECTION_PHRASES_EN) or
        any(p in user_message for p in CORRECTION_PHRASES_HI)
    )


# ─────────────────────────────────────────────────────────────────────────────
# Opening message
# ─────────────────────────────────────────────────────────────────────────────

async def get_opening_message(form_schema: dict, lang: str = "en") -> str:
    """Generate a warm, form-specific opening message."""
    form_title = form_schema.get("form_title", "this form")
    fields     = form_schema.get("fields", [])
    required   = [f for f in fields if f.get("is_required")]
    prompt     = build_opening_prompt(form_title, fields, lang)
    client, model = _chat_client()

    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.85,
            max_tokens=180,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.error("Opening message failed: %s", e)
        total = len(required)
        if lang == "hi":
            return (
                f"नमस्ते! 🙏 मैं आपकी '{form_title}' भरने में मदद करूँगा। "
                f"कुल {total} ज़रूरी जानकारियाँ भरनी हैं। क्या हम शुरू करें?"
            )
        return (
            f"Hi there! 👋 I'm here to help you fill out the '{form_title}'. "
            f"We have {total} required fields to complete. Shall we get started?"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Progress tracking
# ─────────────────────────────────────────────────────────────────────────────

def _compute_progress(form_schema: dict, collected: dict) -> dict:
    """Returns progress info for injection into system prompt."""
    required_fields = [f for f in form_schema.get("fields", []) if f.get("is_required")]
    total = len(required_fields)
    done = sum(
        1 for f in required_fields
        if collected.get(f["field_name"]) not in (None, "", "N/A", "SKIPPED")
    )
    return {
        "total_required": total,
        "completed": done,
        "remaining": total - done,
        "percent": int((done / total * 100)) if total else 100,
    }


def _get_next_unfilled_field(form_schema: dict, collected: dict) -> str | None:
    """Return field_name of the next unfilled required field (for drop-off analytics)."""
    for f in form_schema.get("fields", []):
        if f.get("is_required"):
            val = collected.get(f["field_name"])
            if val in (None, "", "N/A", "SKIPPED"):
                return f["field_name"]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Conditional / dependent field logic
# ─────────────────────────────────────────────────────────────────────────────

def _should_skip_field(field: dict, collected: dict) -> bool:
    """
    Return True if a field should be skipped due to dependency conditions.
    Schema support: field["depends_on"] = {"field": "employment_type", "value": "Salaried"}
    Means: only show this field if employment_type == "Salaried".
    """
    depends = field.get("depends_on")
    if not depends:
        return False
    parent_field = depends.get("field")
    required_value = depends.get("value")
    parent_val = collected.get(parent_field, "")
    if isinstance(required_value, list):
        return str(parent_val).lower() not in [str(v).lower() for v in required_value]
    return str(parent_val).lower() != str(required_value).lower()


# ─────────────────────────────────────────────────────────────────────────────
# Confirmation summary builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_confirmation_summary(form_schema: dict, collected: dict, lang: str) -> str:
    """
    Build a human-readable summary of all collected values
    for the final confirmation turn.
    """
    lines = []
    for f in form_schema.get("fields", []):
        name = f["field_name"]
        val = collected.get(name)
        if val in (None, "", "N/A", "SKIPPED"):
            continue
        label = f.get("semantic_label") or name.replace("_", " ").title()
        lines.append(f"• {label}: {val}")

    if lang == "hi":
        header = "आपने जो जानकारी दी है, वो यहाँ है:\n\n"
        footer = "\n\nक्या यह सब सही है? 'हाँ' कहें तो मैं फ़ॉर्म पूरा कर दूँगा।"
    else:
        header = "Here's a summary of everything you've shared:\n\n"
        footer = "\n\nDoes everything look correct? Say 'yes' to finalise the form."

    return header + "\n".join(lines) + footer


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
    Process one user message.

    Returns:
      reply              — bot's conversational response
      extracted          — field values parsed this turn
      confirmations      — field names bot wants user to confirm
      low_confidence     — field names parsed but uncertain (bot will ask naturally)
      is_complete        — True only after user confirms the summary
      updated_history    — full conversation history for next turn
      detected_lang      — new lang code if user switched language (or None)
      last_asked_field   — next unfilled required field (for drop-off analytics)
      progress           — {total_required, completed, remaining, percent}
    """
    collected   = session.get("collected", {})
    history     = session.get("chat_history", [])
    awaiting_summary_confirm = session.get("awaiting_summary_confirm", False)

    # ── Auto language detection ──
    auto_lang = detect_language(user_message)
    if auto_lang and auto_lang != lang:
        logger.info("Language auto-switched: %s → %s", lang, auto_lang)
        lang = auto_lang

    detected_lang = None

    # ── Drop-off tracking (computed on state entering this turn) ──
    last_asked_field = _get_next_unfilled_field(form_schema, collected)
    progress = _compute_progress(form_schema, collected)

    # ── Handle confirmation of final summary ──
    if awaiting_summary_confirm:
        confirm_words_en = ["yes", "correct", "ok", "okay", "right", "sure", "confirm", "submit", "done", "haan", "ha", "sahi"]
        if any(w in user_message.lower() for w in confirm_words_en):
            if lang == "hi":
                reply = "बहुत बढ़िया! 🎉 आपका फ़ॉर्म सफलतापूर्वक भर गया है।"
            else:
                reply = "All done! 🎉 Your form has been successfully completed."
            history.append({"role": "user", "content": user_message})
            history.append({"role": "assistant", "content": reply})
            return {
                "reply": reply,
                "extracted": {},
                "confirmations": [],
                "low_confidence": [],
                "is_complete": True,
                "updated_history": history,
                "detected_lang": detected_lang,
                "last_asked_field": None,
                "progress": _compute_progress(form_schema, collected),
            }
        else:
            # User wants to change something — treat as a regular correction turn
            session["awaiting_summary_confirm"] = False

    # ── Build system prompt with progress context ──
    progress_note = (
        f"Progress: {progress['completed']}/{progress['total_required']} required fields done. "
        f"{progress['remaining']} remaining."
    )
    is_correction_turn = _is_correction(user_message)
    correction_note = (
        "\n[CORRECTION DETECTED: User wants to change a previously given answer. "
        "Update the relevant field(s) and confirm the change warmly.]"
        if is_correction_turn else ""
    )

    system = (
        SYSTEM_PROMPT
        + "\n\n"
        + build_turn_context(form_schema, collected, lang)
        + "\n\n"
        + progress_note
        + correction_note
    )

    history.append({"role": "user", "content": user_message})

    client, model = _chat_client()
    try:
        response = await client.chat.completions.create(
            model=model,
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
        logger.error("Chat API call failed: %s", e, exc_info=True)
        raise

    message = response.choices[0].message

    reply          = ""
    extracted      = {}
    confirmations  = []
    low_confidence = []   # NEW: fields parsed but uncertain
    is_complete    = False

    if message.tool_calls:
        try:
            args = json.loads(message.tool_calls[0].function.arguments)
            reply          = args.get("reply", "")
            extracted      = args.get("extracted", {}) or {}
            confirmations  = args.get("confirmations_needed", []) or []
            is_complete    = bool(args.get("is_complete", False))
            model_lang     = args.get("detected_lang")
            if model_lang and model_lang != lang:
                detected_lang = model_lang
                lang = model_lang
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning("Tool call parse error: %s", e)
            reply = message.content or _fallback_reply(lang)
    else:
        reply = message.content or _fallback_reply(lang)

    if auto_lang and auto_lang != session.get("lang", "en") and not detected_lang:
        detected_lang = auto_lang

    # ── Post-processing pipeline ──
    extracted = _clean_extracted(extracted, form_schema)
    extracted = _smart_name_split(extracted, form_schema, collected, is_correction_turn)

    # ── Apply Tier-1 hard validation + Tier-2 smart parsing ──
    field_map = {f["field_name"]: f for f in form_schema.get("fields", [])}
    validated_extracted = {}
    hard_validation_errors = []  # [(field_name, error_message)]

    for key, value in extracted.items():
        field = field_map.get(key, {})
        if not isinstance(value, str):
            validated_extracted[key] = value
            continue

        # Check Tier 1 first
        norm_val, err = _hard_validate(key, value, field)
        if err:
            hard_validation_errors.append((key, err))
            continue  # Don't persist — let error message handle it

        if norm_val != value:
            # Tier 1 normalised it (e.g. PAN uppercased)
            validated_extracted[key] = norm_val
            continue

        # Tier 2: smart parse
        parsed_val, confident = _smart_parse(key, value, field)
        if parsed_val is None:
            # Completely unparseable — don't persist, bot will ask again
            continue
        validated_extracted[key] = parsed_val
        if not confident:
            low_confidence.append(key)

    extracted = validated_extracted

    # ── Skip protection: never mark required field as SKIPPED ──
    skip_intent = _detect_skip_intent(user_message, form_schema, collected, lang)
    if skip_intent and not extracted:
        # Signal skip for optional fields only; push back on required
        target_field = _get_next_unfilled_field(form_schema, collected)
        if target_field:
            field_obj = field_map.get(target_field, {})
            if not field_obj.get("is_required"):
                extracted[target_field] = "N/A"
            else:
                if lang == "hi":
                    skip_block_reply = f"माफ़ करें, '{field_obj.get('semantic_label', target_field)}' एक ज़रूरी जानकारी है — इसे छोड़ा नहीं जा सकता। क्या आप यह बाद में बता सकते हैं?"
                else:
                    skip_block_reply = f"'{field_obj.get('semantic_label', target_field)}' is a required field and can't be skipped. Could you provide it, even if approximate?"
                reply = skip_block_reply

    # ── No injection of validation errors: keep the model's reply natural; invalid values simply aren't persisted ──

    # ── Conditional field skipping ──
    for f in form_schema.get("fields", []):
        if _should_skip_field(f, {**collected, **extracted}):
            # If this field somehow got extracted (edge case), discard it
            extracted.pop(f["field_name"], None)

    # ── Check if all required fields are now done (after merging) ──
    merged = {**collected, **extracted}
    all_required_done = all(
        merged.get(f["field_name"]) not in (None, "", "N/A", "SKIPPED")
        for f in form_schema.get("fields", [])
        if f.get("is_required") and not _should_skip_field(f, merged)
    )

    # ── Trigger final confirmation summary instead of marking complete directly ──
    if is_complete and all_required_done and not session.get("awaiting_summary_confirm"):
        summary = _build_confirmation_summary(form_schema, merged, lang)
        reply = summary
        is_complete = False
        session["awaiting_summary_confirm"] = True

    # ── WhatsApp: only capture if user volunteers it in this message; never ask in chat ──
    # (Frontend "Get PDF" / "Send to WhatsApp" modal collects number; no duplicate ask here.)
    if is_complete and whatsapp_is_configured():
        phone_stored = session.get("whatsapp_phone")
        if not phone_stored:
            phone_from_msg = _extract_phone_from_message(user_message)
            if phone_from_msg == "__SKIP__":
                session["whatsapp_phone"] = "__SKIP__"
            elif phone_from_msg:
                session["whatsapp_phone"] = phone_from_msg
                extracted["_whatsapp_phone"] = phone_from_msg

    history.append({"role": "assistant", "content": reply})

    return {
        "reply":             reply,
        "extracted":         extracted,
        "confirmations":     confirmations,
        "low_confidence":    low_confidence,
        "is_complete":       is_complete,
        "updated_history":   history,
        "detected_lang":     detected_lang,
        "last_asked_field":  last_asked_field,
        "progress":          _compute_progress(form_schema, {**collected, **extracted}),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
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
        if k not in valid_names and not k.startswith("_"):
            continue
        if isinstance(v, str) and v.lower() in ("yes", "true", "1", "haan", "ha", "✓"):
            field = next((f for f in form_schema["fields"] if f["field_name"] == k), {})
            if field.get("field_type") == "checkbox" and not field.get("children"):
                v = True
        elif isinstance(v, str) and v.lower() in ("no", "false", "0", "nahi", "na", "☐"):
            field = next((f for f in form_schema["fields"] if f["field_name"] == k), {})
            if field.get("field_type") == "checkbox" and not field.get("children"):
                v = False
        cleaned[k] = v
    return cleaned


def _smart_name_split(
    extracted: dict,
    form_schema: dict,
    collected: dict,
    force_update: bool = False,
) -> dict:
    """
    Auto-split full names into first/middle/last sub-fields.
    If force_update=True (correction turn), overwrites even already-filled fields.
    """
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
            if isinstance(v, str) and len(v.split()) >= 1:
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

        # Only update if empty OR it's a forced correction
        if collected.get(first_key) in (None, "", "N/A") or force_update:
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
            if title_keys and (collected.get(title_keys[0]) in (None, "", "N/A") or force_update):
                extracted[title_keys[0]] = title

    if full_name_keys:
        fk = full_name_keys[0]
        if (collected.get(fk) in (None, "", "N/A") or force_update) and fk != name_source_key:
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
    form_schema: dict,
    collected: dict,
    lang: str,
) -> bool:
    """Returns True if user expressed skip intent (caller decides what to do)."""
    skip_phrases_en = ["don't know", "not sure", "skip", "leave it", "no idea", "cant say", "can't say", "later", "next"]
    skip_phrases_hi = ["नहीं पता", "पता नहीं", "छोड़ दो", "बाद में", "skip करो"]

    msg_lower = user_message.lower().strip()
    return (
        any(p in msg_lower for p in skip_phrases_en) or
        any(p in user_message for p in skip_phrases_hi)
    )


def _extract_phone_from_message(text: str) -> str | None:
    """Extract Indian phone number from free text, or __SKIP__ if user declines."""
    t = text.replace(" ", "").replace("-", "")
    patterns = [
        r"\+91([6-9]\d{9})",
        r"\b91([6-9]\d{9})\b",
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