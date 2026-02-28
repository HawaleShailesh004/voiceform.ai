"""
Vaarta Prompts — v3.0
Intelligence upgrades:
  - Auto language detection (user writes Hindi/Marathi/Tamil → AI auto-switches)
  - Field context hints (TAN, PAN, Aadhaar explained proactively)
  - Enhanced validation (PAN, Aadhaar, GSTIN, IFSC, etc.)
  - Drop-off tracking signal
"""

# ─────────────────────────────────────────────────────────────────────────────
# FIELD GLOSSARY
# When the AI encounters a field whose semantic_label matches a key here,
# it MUST proactively explain what the field is before asking — unless the user
# already seems to know (e.g. they volunteered the value unprompted).
# ─────────────────────────────────────────────────────────────────────────────

FIELD_GLOSSARY = {
    # Tax / Identity
    "tan": "TAN (Tax Deduction Account Number) is a 10-character alphanumeric code issued by the Income Tax Department to entities that deduct or collect tax at source. Format: 4 letters + 5 digits + 1 letter (e.g. PDES03028F).",
    "pan": "PAN (Permanent Account Number) is a 10-character alphanumeric ID issued by the Income Tax Department to every taxpayer. Format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F).",
    "aadhaar": "Aadhaar is a 12-digit unique identity number issued by UIDAI to every Indian resident. You can find it on your Aadhaar card.",
    "gstin": "GSTIN (Goods and Services Tax Identification Number) is a 15-digit code assigned to every GST-registered business.",
    "din": "DIN (Director Identification Number) is a unique 8-digit number allotted to a person intending to be a director of a company in India.",
    "cin": "CIN (Corporate Identity Number) is a 21-digit alphanumeric code issued by the Ministry of Corporate Affairs to every registered company.",
    "ifsc": "IFSC (Indian Financial System Code) is an 11-character alphanumeric code that identifies a bank branch. You can find it on your cheque book or passbook. Format: 4 letters (bank) + 0 + 6 digits (branch).",
    "micr": "MICR (Magnetic Ink Character Recognition) code is a 9-digit number printed at the bottom of cheques that identifies the bank and branch.",
    "uan": "UAN (Universal Account Number) is a 12-digit number assigned by EPFO to every PF member. It stays the same across all jobs.",
    "esic": "ESIC number is a 17-digit insurance number issued by the Employees' State Insurance Corporation.",
    "form 16": "Form 16 is a TDS certificate issued by your employer showing your income and tax deducted. You'll need it for tax filing.",
    "cibil": "CIBIL score is a 3-digit number (300–900) that represents your credit history. Higher is better. You can check it for free on the CIBIL website.",
    "noc": "NOC (No Objection Certificate) is a legal document confirming that the issuing party has no objection to the stated matter.",
    "roc": "ROC (Registrar of Companies) is the authority where companies are registered in India.",
}


# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are Vaarta, a warm and intelligent form-filling assistant. Your job is to help
someone fill out a form by having a natural, friendly conversation — NOT by firing
questions like a robot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Warm, patient, and encouraging — like a helpful colleague sitting next to the user
- NEVER sound like a form or a questionnaire
- Acknowledge what the user said before moving on ("Got it!", "Perfect!", "Thanks!")
- Use the user's first name once you know it (not every turn — that gets annoying)
- If the user seems confused or hesitant, reassure them ("No worries, take your time")
- Keep replies SHORT. 1–3 sentences max unless absolutely necessary.
- Never list out all the remaining fields. Ask naturally, one topic at a time.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 AUTO LANGUAGE DETECTION — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST detect the language the user is writing in and SWITCH to it automatically.
Do NOT wait for a language toggle. Do NOT ask permission.

Detection rules:
- If user message contains Devanagari script (Hindi/Marathi) → respond in Hindi
- If user message contains Tamil script → respond in Tamil
- If user message contains Telugu script → respond in Telugu
- If user message contains Bengali script → respond in Bengali
- If user message contains Gujarati script → respond in Gujarati
- If user message is pure English → respond in English
- If user mixes languages (Hinglish like "mera naam Rahul hai") → respond in Hindi
- Once you switch language, STAY in that language for the rest of the session
  unless the user explicitly switches back

Language switch signal: When you detect a language change, set detected_lang in your
tool call so the system can persist it.

Hindi mode reminders:
- Reply ENTIRELY in Hindi — no English sentences mixed in
- English technical terms (email, PIN, OTP, PAN, Aadhaar) are fine to keep as-is
- Use respectful "आप" not "तुम"
- Acknowledgements: "बिल्कुल!", "ठीक है!", "धन्यवाद!"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 FIELD CONTEXT HINTS — VERY IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When asking for a technical or government field that many users find confusing,
ALWAYS briefly explain what it is BEFORE asking for it. Use the context provided
in the FIELD HINTS section of each turn's context.

Examples:
  ✅ "Next, I need your PAN — that's the 10-character tax ID on your PAN card
      (format: ABCDE1234F). Could you share it?"
  ✅ "Could you share your IFSC code? It's the 11-character code on your cheque
      book or passbook that identifies your bank branch."
  ❌ "What is your IFSC code?" ← No context = user confusion

If the FIELD HINT for the current field is in the context, USE IT. Don't skip it.
If the user volunteers a value before you ask (e.g. they already know their PAN),
skip the explanation and just confirm it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SMART INFERENCE — THE MOST IMPORTANT PART
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are smart. You infer related fields from a single answer whenever possible.
Always maximise how much you extract from each user message, then confirm if uncertain.

NAMES — When a user gives any name, extract as much as possible:
  - "Rahul Sharma" → first_name="Rahul", last_name="Sharma" (fill both silently)
  - "Rahul Kumar Sharma" → first_name="Rahul", middle_name="Kumar", last_name="Sharma"
  - "My name is Dr. Priya Patel" → title="Dr.", first_name="Priya", last_name="Patel"
  - If form only has full_name field → fill it as given
  - If the split is ambiguous, fill what you're confident about and gently confirm the rest

ADDRESSES — When a user gives an address, extract all sub-fields:
  - "123 MG Road, Pune, Maharashtra 411001" →
    street="123 MG Road", city="Pune", state="Maharashtra", pincode="411001"

DATES — Accept any format and normalise:
  - "15th March 1995", "15/03/1995", "March 15 95" → "15/03/1995"
  - If year is ambiguous (e.g., "95"), assume 1900s for DOB fields

CONTACT INFO — Phone numbers:
  - Strip spaces, dashes, country codes: "+91 98765 43210" → "9876543210"

GENDER — Accept natural language:
  - "I'm a guy" / "male" / "M" / "पुरुष" → "Male"
  - "female" / "F" / "महिला" → "Female"

CHECKBOX / YES-NO:
  - "yes" / "yeah" / "haan" / "✓" → true
  - "no" / "nahi" / "nope" → false

IMPLICIT CONTEXT:
  - "Same as above" / "same city" → copy relevant field(s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ VALIDATION (conversational, never robotic)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Never say "Invalid input" or "Error". Always phrase as a friendly clarification.

PAN: 10 chars, format AAAAA9999A (5 letters, 4 digits, 1 letter), all uppercase
  → "That PAN doesn't look quite right — it should be 10 characters like ABCDE1234F.
     Could you double-check?"

Aadhaar: exactly 12 digits
  → "Aadhaar numbers are 12 digits — that one looks a bit short. Could you recheck?"

GSTIN: 15 chars, starts with 2-digit state code
  → "GSTIN should be 15 characters starting with a 2-digit state code. Could you verify?"

IFSC: 11 chars, first 4 letters = bank code, 5th char = 0, last 6 = branch code
  → "IFSC codes are 11 characters (e.g. SBIN0001234). That one looks a bit off."

Email: must contain @ and domain
  → "Hmm, that email doesn't look quite right — could you double-check it?"

Phone (India): 10 digits
  → "Could you check that number? It looks like it might be missing a digit."

Pincode (India): 6 digits
  → "Indian pincodes are 6 digits — could you recheck that one?"

Date: must be a real date ("Feb 30" is not valid)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GROUPING — Don't ask one field per turn
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group related fields naturally:
  - "What's your full name and date of birth?" (name + dob together)
  - "What's your address?" (all address sub-fields at once)
  - But don't group more than 2–3 topics at a time

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HANDLING DIFFICULT SITUATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "I don't know" / "not sure" → "No problem, we can skip that for now and come back."
- "Why do you need this?" → Give a short, honest explanation. Never make up reasons.
- Off-topic messages → "Ha ha! But let's get this form done first — [next question]"
- Angry / frustrated → "I'm really sorry this is taking longer than expected. Let me
  make it as quick as possible."
- "Can I save and come back?" → "Of course! Your progress is automatically saved.
  Just use the same link to come back anytime."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPLETION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Only set is_complete=true when ALL required fields are filled (or explicitly skipped)
- Before completing, do a quick natural summary:
  "Alright, I think we have everything! Here's a quick summary: [2–3 key things].
   Does everything look correct?"
- Wait for confirmation before setting is_complete=true
- In Hindi: "बढ़िया! सब कुछ भर गया है। क्या सब ठीक लग रहा है?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL CALL — MANDATORY ON EVERY TURN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST call update_form_fields on EVERY single response, even if nothing was extracted.
- reply: your conversational message to the user
- extracted: dict of field_name → value for EVERYTHING you inferred this turn.
  For the filled PDF to display correctly, use English (Roman script) for values when the form
  is in English — transliterate/translate from the user's language (e.g. Hindi name → Rahul).
- confirmations_needed: field_names where you filled a value but want to confirm
- is_complete: true only when all required fields filled AND user confirmed
- detected_lang: set this to 'hi', 'ta', 'te', 'bn', 'gu', or 'en' if you detect
  a language change in the user's message (omit if no change)
"""


# ─────────────────────────────────────────────────────────────────────────────
# TOOL DEFINITION — now includes detected_lang
# ─────────────────────────────────────────────────────────────────────────────

EXTRACT_TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "update_form_fields",
        "description": (
            "ALWAYS call this on every turn. "
            "Put your reply in `reply`. "
            "Put ALL extracted field values in `extracted` — including inferred ones. "
            "List any uncertain auto-filled fields in `confirmations_needed`. "
            "Set is_complete=true only when all required fields are done AND user confirmed. "
            "Set detected_lang if the user's language changed this turn."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "reply": {
                    "type": "string",
                    "description": "Your warm, conversational reply to the user"
                },
                "extracted": {
                    "type": "object",
                    "description": (
                        "Dict of field_name → extracted value. "
                        "Include ALL inferred values, not just explicitly stated ones. "
                        "Use field_name keys exactly as they appear in the form schema. "
                        "PDF OUTPUT: So the filled PDF displays correctly, put values in English (Roman script) "
                        "when the form labels are in English — e.g. user says name in Hindi → output the name in "
                        "English/transliteration (Rahul, not राहुल); translate or transliterate free text as needed."
                    ),
                    "additionalProperties": True
                },
                "confirmations_needed": {
                    "type": "array",
                    "description": "List of field_names where you auto-filled but are uncertain.",
                    "items": {"type": "string"}
                },
                "validation_errors": {
                    "type": "array",
                    "description": "List of field_names with invalid values that need correction",
                    "items": {"type": "string"}
                },
                "detected_lang": {
                    "type": "string",
                    "description": (
                        "Set this to the detected language code if the user's language "
                        "changed this turn: 'hi' (Hindi/Marathi), 'ta' (Tamil), "
                        "'te' (Telugu), 'bn' (Bengali), 'gu' (Gujarati), 'en' (English). "
                        "Omit entirely if the language has not changed."
                    )
                },
                "is_complete": {
                    "type": "boolean",
                    "description": "True ONLY when all required fields filled AND user confirmed summary"
                }
            },
            "required": ["reply", "extracted", "is_complete"]
        }
    }
}


# ─────────────────────────────────────────────────────────────────────────────
# OPENING MESSAGE PROMPT
# ─────────────────────────────────────────────────────────────────────────────

def build_opening_prompt(form_title: str, fields: list, lang: str) -> str:
    required_fields = [f for f in fields if f.get("is_required")]
    first = required_fields[0] if required_fields else (fields[0] if fields else None)
    first_label = first["semantic_label"] if first else "your details"

    # Check if the first field needs a hint
    hint = _get_field_hint(first) if first else None
    hint_instruction = (
        f"\n4. If asking for '{first_label}', include a brief one-sentence explanation "
        f"of what it is: \"{hint}\""
    ) if hint else ""

    if lang == "hi":
        return f"""आप Vaarta हैं, एक मैत्रीपूर्ण फ़ॉर्म-भरने वाला सहायक।
उपयोगकर्ता "{form_title}" भरने के लिए यहाँ है ({len(fields)} जानकारियाँ चाहिए)।

एक गर्मजोशी भरा स्वागत संदेश लिखें (2-3 वाक्य) जो:
1. उपयोगकर्ता का अभिनंदन करे
2. बताए कि यह फ़ॉर्म भरने में मदद करेगा और यह आसान होगा
3. पहली जानकारी माँगे: {first_label}{hint_instruction}

बिल्कुल प्राकृतिक, दोस्ताना हो। कोई bullet points नहीं।
केवल संदेश लिखें, कोई prefix नहीं।"""
    else:
        return f"""You are Vaarta, a friendly form-filling assistant.
The user is here to fill out "{form_title}" ({len(fields)} fields needed).

Write a warm, friendly opening message (2-3 sentences) that:
1. Greets them warmly (not "Hello!" — something more natural)
2. Briefly explains you'll make this quick and easy
3. Asks for the first piece of info: {first_label}{hint_instruction}

Be natural and human. No bullet points. No "I am an AI assistant."
Write only the message, no prefix."""


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT BUILDER — now includes field hints and drop-off tracking
# ─────────────────────────────────────────────────────────────────────────────

def build_turn_context(form_schema: dict, collected: dict, lang: str) -> str:
    fields = form_schema.get("fields", [])
    form_title = form_schema.get("form_title", "this form")

    filled = []
    needed = []
    next_field_hint = None  # hint for the very next unfilled field

    for f in fields:
        name  = f["field_name"]
        label = f["semantic_label"]
        ftype = f.get("field_type", "text")
        desc  = f.get("description") or f.get("purpose") or ""
        req   = "REQUIRED" if f.get("is_required") else "optional"
        rules = f.get("validation_rules", {})
        children = f.get("children") or []

        val = collected.get(name)
        if val not in (None, "", "N/A", "SKIPPED"):
            filled.append(f"  ✓ {label}: {val}")
        else:
            rule_hint = _build_rule_hint(name, ftype, rules)
            options_hint = ""
            if children and ftype in ("radio", "checkbox"):
                opt_labels = [c.get("label", "").strip() for c in children if c.get("label")]
                if opt_labels:
                    options_hint = f" | options: {', '.join(opt_labels)}"
            needed.append(
                f"  • {name} | {label} | {ftype} | {req}{rule_hint}{options_hint}"
                + (f" | {desc}" if desc else "")
            )
            # Only capture hint for the FIRST unfilled field
            if next_field_hint is None:
                field_hint = _get_field_hint(f)
                if field_hint:
                    next_field_hint = f"  ⚡ HINT FOR NEXT FIELD ({label}): {field_hint}"

    skipped = [f["semantic_label"] for f in fields if collected.get(f["field_name"]) in ("N/A", "SKIPPED")]

    lines = [
        "=== VAARTA FORM CONTEXT ===",
        f"Form: {form_title}",
        f"Language: {_lang_label(lang)} — reply in this language ONLY",
        f"Progress: {len(filled)}/{len(fields)} fields filled",
        "",
        "ALREADY COLLECTED (do NOT ask again):",
        *(filled if filled else ["  (none yet)"]),
        "",
        "STILL NEEDED (field_name | label | type | required | notes):",
        *(needed if needed else ["  ✅ All fields collected!"]),
    ]

    if next_field_hint:
        lines += ["", "FIELD HINTS (use these when asking for the next field):"]
        lines.append(next_field_hint)

    if skipped:
        lines += ["", f"SKIPPED (user said they don't know): {', '.join(skipped)}"]

    lines += ["", "=== END CONTEXT ==="]
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _lang_label(lang: str) -> str:
    return {
        "hi": "Hindi (respond entirely in Hindi)",
        "ta": "Tamil (respond entirely in Tamil)",
        "te": "Telugu (respond entirely in Telugu)",
        "bn": "Bengali (respond entirely in Bengali)",
        "gu": "Gujarati (respond entirely in Gujarati)",
        "en": "English",
    }.get(lang, "English")


def _build_rule_hint(name: str, ftype: str, rules: dict) -> str:
    """Build a short validation hint string for the context."""
    rtype = rules.get("type", "")
    name_lower = name.lower()

    if rtype == "email" or ftype == "email":
        return " [valid email required]"
    elif rtype == "phone" or "phone" in name_lower or "mobile" in name_lower:
        return " [10-digit Indian mobile]"
    elif "pincode" in name_lower or "pin_code" in name_lower:
        return " [6-digit Indian pincode]"
    elif "pan" in name_lower and "company" not in name_lower:
        return " [PAN: AAAAA9999A format]"
    elif "aadhaar" in name_lower or "aadhar" in name_lower:
        return " [12-digit Aadhaar number]"
    elif "gstin" in name_lower or "gst" in name_lower:
        return " [15-char GSTIN]"
    elif "ifsc" in name_lower:
        return " [11-char IFSC code]"
    elif "tan" == name_lower or name_lower.startswith("tan_"):
        return " [TAN: AAAA99999A format]"
    elif ftype == "date":
        return " [any date format OK]"
    return ""


# ─────────────────────────────────────────────────────────────────────────────
# EXTRACTION / VISION PROMPTS (used by extractor.py)
# ─────────────────────────────────────────────────────────────────────────────

VISION_PROMPT = """Analyse this form image and extract EVERY fillable field.

Return ONLY valid JSON (no markdown, no preamble):
{
  "form_title": "<detected title or 'Unknown Form'>",
  "fields": [
    {
      "field_name": "<unique_snake_case_id>",
      "field_type": "text|checkbox|date|signature|radio|select|number|email",
      "semantic_label": "<Human label e.g. First Name>",
      "question_template": "<Natural question e.g. What is your full name?>",
      "description": "<what goes here>",
      "is_required": true|false,
      "data_type": "name|email|phone|date|address|ssn|text|number",
      "validation_rules": {}|{"type":"email"}|{"type":"phone"}|{"type":"pincode"},
      "purpose": "<brief context>",
      "bounding_box": {"xmin":0,"ymin":0,"xmax":0,"ymax":0},
      "children": [
        {
          "field_name": "<parent_field>_<option_snake>",
          "label": "<option label e.g. Male>",
          "bounding_box": {"xmin":0,"ymin":0,"xmax":0,"ymax":0}
        }
      ]
    }
  ]
}

- bounding_box = the fillable area or, for radio/checkbox groups, the ENTIRE group area.
- "children" is OPTIONAL. Only include for radio and checkbox GROUPS (multiple options).
- For radio/checkbox groups: bounding_box = entire group (from first option to last).
- children[] = each individual option with its own "label" and "bounding_box".
- children[].bounding_box = the clickable circle or square ONLY, NOT the option label text.
- children[].field_name = parent field_name + "_" + snake_case(label), e.g. gender_male, gender_female.
- For a standalone single checkbox (one yes/no box): do NOT use children.

BOUNDING BOX RULES — read carefully:
- Scale: 0–1000. (0,0)=top-left corner of the image, (1000,1000)=bottom-right corner.
- Include the ENTIRE input element — the visible box border, underline, or checkbox near of label
  outline itself. Do NOT crop tightly to just the interior white space.
- If the fillable area is just underline place the box at bottom attached
- xmin: left edge of the input box/underline (NOT the label to its left)
- ymin: top edge of the input box (include the top border line if visible)
- xmax: right edge of the input box
- ymax: bottom edge of the input box (include the bottom border/underline)
- For a single checkbox: bounding_box = the checkbox square itself, not the label next to it.
- NEVER let xmin bleed into the label text to the left of the box.
- When in doubt, make the box SLIGHTLY LARGER rather than smaller — text must fit inside.

OTHER RULES:
- field_name: unique, lowercase, snake_case. Duplicates → append _1, _2.
- For name fields: use separate first_name, middle_name, last_name if form has
  separate boxes. If single name box → use full_name.
- is_required: true if asterisk (*), "required", bold label, or clear convention.
- Be EXHAUSTIVE — find every single fillable field, even small date boxes."""

ACROFORM_LABEL_PROMPT = """This PDF form has {field_count} fillable fields marked with red numbered circles.

For each numbered field, return ONLY valid JSON array:
[
  {{
    "index": 1,
    "semantic_label": "Full Name",
    "field_type": "text|checkbox|radio|select",
    "question_template": "What is your full name?",
    "is_required": true,
    "description": "Legal full name of applicant",
    "purpose": "Identify the applicant",
    "data_type": "name",
    "validation_rules": {{}}
  }}
]

Numbers to label: {field_numbers}"""


def _get_field_hint(field: dict) -> str | None:
    """Return a plain-language explanation for confusing fields, or None."""
    label = (field.get("semantic_label") or "").lower()
    name  = (field.get("field_name") or "").lower()
    combined = f"{label} {name}"

    for keyword, hint in FIELD_GLOSSARY.items():
        # Match whole word to avoid "tan" matching "tanker"
        import re
        if re.search(r'\b' + re.escape(keyword) + r'\b', combined):
            return hint
    return None