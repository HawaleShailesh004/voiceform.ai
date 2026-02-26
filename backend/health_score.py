"""
Vaarta Form Health Score
Zero extra API calls — pure logic on the extraction result.

Score (100 pts):
  field_clarity      30  labels readable, have descriptions
  required_ratio     20  not too many required fields
  type_variety       15  mix of field types
  confusion_risk     20  technical fields have explanations
  completion_time    15  estimated minutes to complete
"""
import re
from typing import Any

CONFUSING = {"tan","gstin","din","cin","uan","esic","ifsc","micr","pan","aadhaar","aadhar","cibil","noc","roc"}
OFTEN_OPTIONAL = {"middle_name","fax","fax_number","alternate_phone","alt_phone","reference","website","linkedin","twitter"}
FIELD_SECS = {"text":12,"email":10,"phone":8,"number":8,"date":10,"checkbox":4,"radio":5,"select":6,"textarea":25,"signature":15,"file":20}


def compute_health_score(fields: list[dict]) -> dict[str, Any]:
    if not fields:
        return _empty()

    issues, suggestions, field_scores = [], [], []
    total = len(fields)
    req_count = sum(1 for f in fields if f.get("is_required"))

    # 1. Clarity (30)
    clarity = 0
    for f in fields:
        label = (f.get("semantic_label") or "").strip()
        name  = (f.get("field_name") or "").strip()
        s = 0
        if label and label.lower() != name.lower(): s += 1
        if " " in label or (label and label[0].isupper()): s += 1
        if f.get("description") or f.get("question_template"): s += 1
        clarity += s
        field_scores.append({"field_name": name, "semantic_label": label, "clarity": s,
                              "is_confusing": _confusing(name, label), "is_required": f.get("is_required", False)})

    clarity_pts = round(clarity / (total * 3) * 30)
    unclear = [x for x in field_scores if x["clarity"] < 2]
    if unclear:
        issues.append(f"{len(unclear)} field(s) have unclear labels or missing descriptions")
        suggestions.append("Add plain-language labels for: " + ", ".join(x["semantic_label"] or x["field_name"] for x in unclear[:3]) + ("…" if len(unclear) > 3 else ""))

    # 2. Required ratio (20)
    ratio = req_count / total
    req_pts = 20 if ratio <= .5 else 14 if ratio <= .7 else 8 if ratio <= .85 else 3
    if ratio > .85:
        issues.append(f"{req_count}/{total} fields required ({round(ratio*100)}%) — may frustrate users")
        suggestions.append("Mark fewer fields as required. Optional info can be collected later.")
    over = [f for f in fields if f.get("is_required") and any(k in (f.get("field_name") or "").lower() for k in OFTEN_OPTIONAL)]
    if over:
        issues.append("Typically-optional fields are marked required: " + ", ".join(f.get("semantic_label") or f.get("field_name") for f in over))
        suggestions.append("Consider making these optional to improve completion rates.")

    # 3. Type variety (15)
    types = set(f.get("field_type","text") for f in fields)
    variety_pts = 15 if len(types) >= 4 else 11 if len(types) == 3 else 7 if len(types) == 2 else 3
    if len(types) == 1 and total > 5:
        issues.append("All fields are the same type — AI may have missed checkboxes or dates")
        suggestions.append("Review the field editor to set correct types (date, checkbox, select, etc.)")

    # 4. Confusion risk (20)
    confusing = [x for x in field_scores if x["is_confusing"]]
    no_desc   = [x for x in confusing if not next((f.get("description") or f.get("purpose") for f in fields if f.get("field_name") == x["field_name"]), None)]
    if not confusing:
        conf_pts = 20
    elif not no_desc:
        conf_pts = 15
    elif len(no_desc) <= 2:
        conf_pts = 10
        issues.append("Technical fields without explanations: " + ", ".join(x["semantic_label"] or x["field_name"] for x in no_desc))
        suggestions.append("Add descriptions for technical fields — Vaarta will explain them to users automatically.")
    else:
        conf_pts = 4
        issues.append(f"{len(no_desc)} govt/technical fields lack descriptions ({', '.join(x['semantic_label'] or x['field_name'] for x in no_desc[:3])}…)")
        suggestions.append("Add descriptions for all government ID/financial fields. Users abandon forms they don't understand.")

    # 5. Time estimate (15)
    secs = sum(FIELD_SECS.get(f.get("field_type","text"), 12) for f in fields if f.get("is_required")) + len(confusing) * 20
    mins = round(secs / 60, 1)
    if mins <= 3:    time_pts = 15
    elif mins <= 5:  time_pts = 12
    elif mins <= 8:  time_pts = 7
    elif mins <= 12:
        time_pts = 3
        issues.append(f"Estimated ~{mins} min to complete — users may abandon")
        suggestions.append("Make more fields optional or split into shorter forms.")
    else:
        time_pts = 0
        issues.append(f"Very long form (~{mins} min) — high abandonment risk")
        suggestions.append("Strongly consider splitting into 2–3 shorter forms.")

    score = max(0, min(100, clarity_pts + req_pts + variety_pts + conf_pts + time_pts))
    grade = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "F"
    labels = {"A":"Excellent — users will find this easy","B":"Good — minor improvements possible",
              "C":"Fair — some users may struggle","D":"Needs work — high abandonment likely","F":"Poor — consider redesigning"}

    pos = []
    if clarity_pts >= 24: pos.append("Field labels are clear and well-described")
    if req_pts >= 16:     pos.append("Good balance of required vs optional fields")
    if mins <= 3:         pos.append(f"Short form (~{mins} min) — users will complete it quickly")
    if not confusing:     pos.append("No confusing government/technical fields detected")
    if len(types) >= 4:   pos.append("Good mix of field types detected")

    return {
        "overall_score": score, "grade": grade, "grade_label": labels[grade],
        "estimated_minutes": mins, "total_fields": total, "required_fields": req_count,
        "score_breakdown": {"field_clarity": clarity_pts, "required_ratio": req_pts,
                            "field_type_variety": variety_pts, "confusion_risk": conf_pts, "completion_time": time_pts},
        "issues": issues, "suggestions": suggestions, "positives": pos, "field_scores": field_scores,
    }


def _confusing(name: str, label: str) -> bool:
    c = f"{name} {label}".lower()
    return any(re.search(r'\b' + re.escape(k) + r'\b', c) for k in CONFUSING)


def _empty() -> dict:
    return {"overall_score": 0, "grade": "F", "grade_label": "No fields detected",
            "estimated_minutes": 0, "total_fields": 0, "required_fields": 0,
            "score_breakdown": {"field_clarity":0,"required_ratio":0,"field_type_variety":0,"confusion_risk":0,"completion_time":0},
            "issues": ["No fields were detected in this form"],
            "suggestions": ["Try re-uploading with a clearer scan, or use the field editor to add fields manually"],
            "positives": [], "field_scores": []
            }