"""
Quick smoke test for Vaarta's smart chat engine.
Run: python test_chat.py
"""

import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

# Minimal mock form schema — name split test
MOCK_FORM = {
    "form_id": "test",
    "form_title": "Bank Account Opening Form",
    "fields": [
        {"field_name": "first_name",   "field_type": "text", "semantic_label": "First Name",   "question_template": "What is your first name?",   "is_required": True,  "data_type": "name",  "validation_rules": {}, "description": "", "purpose": ""},
        {"field_name": "middle_name",  "field_type": "text", "semantic_label": "Middle Name",  "question_template": "What is your middle name?",  "is_required": False, "data_type": "name",  "validation_rules": {}, "description": "", "purpose": ""},
        {"field_name": "last_name",    "field_type": "text", "semantic_label": "Last Name",    "question_template": "What is your last name?",    "is_required": True,  "data_type": "name",  "validation_rules": {}, "description": "", "purpose": ""},
        {"field_name": "email",        "field_type": "email","semantic_label": "Email Address","question_template": "What is your email?",         "is_required": True,  "data_type": "email", "validation_rules": {"type": "email"}, "description": "", "purpose": ""},
        {"field_name": "mobile",       "field_type": "text", "semantic_label": "Mobile Number","question_template": "What is your mobile number?","is_required": True,  "data_type": "phone", "validation_rules": {"type": "phone"}, "description": "", "purpose": ""},
        {"field_name": "dob",          "field_type": "date", "semantic_label": "Date of Birth","question_template": "What is your date of birth?","is_required": True,  "data_type": "date",  "validation_rules": {}, "description": "", "purpose": ""},
    ]
}

MOCK_SESSION = {
    "session_id": "test-session",
    "form_id": "test",
    "collected": {},
    "chat_history": [],
    "status": "active",
}


async def test_turn(message: str, session: dict, label: str):
    from chat_engine import run_chat_turn
    result = await run_chat_turn(message, session, MOCK_FORM, lang="en")
    session["collected"].update(result["extracted"])
    session["chat_history"] = result["updated_history"]
    print(f"\n{'='*60}")
    print(f"USER ({label}): {message}")
    print(f"BOT:  {result['reply']}")
    print(f"EXTRACTED: {result['extracted']}")
    if result.get("confirmations"):
        print(f"CONFIRMATIONS NEEDED: {result['confirmations']}")
    print(f"COLLECTED SO FAR: {session['collected']}")


async def main():
    print("Vaarta Chat Engine — Smart Inference Test")
    print("="*60)

    session = dict(MOCK_SESSION)

    # Test 1: Full name → should auto-split into first/middle/last
    await test_turn("My name is Rahul Kumar Sharma", session, "full name → should split")

    # Test 2: Email with typo — should flag validation
    await test_turn("email is rahulkumar.sharma", session, "invalid email")

    # Test 3: Correct email
    await test_turn("rahul.sharma@gmail.com", session, "valid email")

    # Test 4: Phone with country code
    await test_turn("mobile is +91 98765 43210", session, "phone with +91")

    # Test 5: Date in varied format
    await test_turn("DOB is 15th March 1990", session, "date natural language")

    # Test 6: Skip
    await test_turn("I don't know the middle name, skip it", session, "skip")

    print(f"\n{'='*60}")
    print("FINAL COLLECTED DATA:")
    for k, v in session["collected"].items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    if not os.environ.get("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not set in .env")
        exit(1)
    asyncio.run(main())
