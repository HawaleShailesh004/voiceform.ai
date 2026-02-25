"""
Form Field Extractor
Handles: Digital PDFs (AcroForm), Scanned Images, Image-based PDFs
Vision: Claude Sonnet | Chat: OpenAI (your existing setup)
"""

import os
import io
import json
import base64
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field, asdict

import anthropic
import fitz  # PyMuPDF

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────

@dataclass
class BoundingBox:
    xmin: float  # 0–1000 normalized
    ymin: float
    xmax: float
    ymax: float

    def to_pdf_rect(self, page_width: float, page_height: float) -> tuple:
        """Convert normalized coords back to PDF points."""
        return (
            self.xmin / 1000 * page_width,
            self.ymin / 1000 * page_height,
            self.xmax / 1000 * page_width,
            self.ymax / 1000 * page_height,
        )


@dataclass
class FormField:
    field_name: str
    field_type: str          # text | checkbox | date | signature | radio | select | number | email
    semantic_label: str      # Human readable: "First Name"
    question_template: str   # "What is your first name?"
    description: str
    is_required: bool
    data_type: str           # name | email | phone | date | address | text | ssn
    validation_rules: dict
    purpose: str
    bounding_box: BoundingBox
    # AcroForm extras (only for digital PDFs)
    acro_field_name: Optional[str] = None
    acro_field_type: Optional[str] = None
    options: Optional[list] = None  # for radio/select


@dataclass
class ExtractionResult:
    form_title: str
    source_type: str          # "acroform" | "scanned_image" | "image_pdf"
    page_count: int
    fields: list[FormField]
    page_width: float         # PDF points (72 dpi)
    page_height: float
    raw_image_b64: Optional[str] = None   # base64 PNG of first page for UI preview
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


# ─────────────────────────────────────────────
# Claude Vision Prompt
# ─────────────────────────────────────────────

VISION_PROMPT = """You are a form analysis AI. Analyze this form image and extract EVERY fillable field.

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "form_title": "<title of the form or 'Unknown Form'>",
  "fields": [
    {
      "field_name": "<unique_snake_case_id>",
      "field_type": "text" | "checkbox" | "date" | "signature" | "radio" | "select" | "number" | "email",
      "semantic_label": "<Human readable label e.g. First Name, Date of Birth>",
      "question_template": "<Natural conversational question e.g. What is your full name?>",
      "description": "<short description of what goes here>",
      "is_required": true | false,
      "data_type": "name" | "email" | "phone" | "date" | "address" | "ssn" | "text" | "number",
      "validation_rules": {} | {"type": "email"} | {"type": "phone"} | {"type": "date"},
      "purpose": "<brief context of this field>",
      "bounding_box": {
        "ymin": <0-1000>,
        "xmin": <0-1000>,
        "ymax": <0-1000>,
        "xmax": <0-1000>
      }
    }
  ]
}

CRITICAL RULES:
- Coordinates: 0-1000 scale. (0,0)=top-left, (1000,1000)=bottom-right.
- Bounding box = FILLABLE AREA only (the box/underline where user writes), NOT the label.
- field_name: unique, lowercase, snake_case. If multiple similar fields, append _1, _2 etc.
- For radio buttons: use field_type "radio" and include all options as separate fields OR group logically.
- For checkboxes: field_type "checkbox", bounding_box around the actual checkbox square.
- For signature fields: field_type "signature".
- is_required: true if asterisk (*), "required", bold label, or form convention implies it.
- Be EXHAUSTIVE - find every single fillable area, even small ones."""


ACROFORM_LABEL_PROMPT = """This PDF form image has fillable fields marked with numbers ({field_count} total).
The numbers mark the CENTER of each fillable area.

For each numbered field, provide:
1. A human-readable label (what should be entered there)
2. The field type (text or checkbox)
3. A conversational question to ask the user
4. Whether it's required

Numbers visible: {field_numbers}

Return ONLY valid JSON array (no markdown):
[
  {{
    "index": 1,
    "semantic_label": "Full Name",
    "field_type": "text",
    "question_template": "What is your full name?",
    "is_required": true,
    "description": "Legal full name of applicant",
    "purpose": "Identify the applicant",
    "data_type": "name"
  }}
]"""


# ─────────────────────────────────────────────
# Core Extractor
# ─────────────────────────────────────────────

class FormExtractor:
    """
    Three-path extractor:
    1. AcroForm PDF → extract fields natively, use Claude to label them
    2. Scanned image (PNG/JPG) → Claude Vision direct
    3. Image-based PDF (no AcroForm) → render to image → Claude Vision
    """

    def __init__(self, anthropic_api_key: Optional[str] = None):
        self.claude = anthropic.Anthropic(
            api_key=anthropic_api_key or os.environ["ANTHROPIC_API_KEY"]
        )
        self.model = "claude-opus-4-5"  # Best vision accuracy for forms

    # ── Public entry point ─────────────────────

    def extract(self, file_path: str) -> ExtractionResult:
        """
        Main extraction method. Auto-detects file type and routing.
        Returns ExtractionResult with all fields normalized.
        """
        path = Path(file_path)
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            return self._extract_pdf(file_path)
        elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}:
            return self._extract_image(file_path)
        else:
            raise ValueError(f"Unsupported file type: {suffix}")

    # ── PDF Path ───────────────────────────────

    def _extract_pdf(self, file_path: str) -> ExtractionResult:
        doc = fitz.open(file_path)
        page = doc[0]
        page_width = page.rect.width
        page_height = page.rect.height
        page_count = len(doc)

        # Check for AcroForm fields
        acro_fields = self._get_acroform_fields(doc)

        if acro_fields:
            logger.info(f"AcroForm detected: {len(acro_fields)} fields")
            result = self._process_acroform(doc, acro_fields, page_width, page_height, page_count)
        else:
            logger.info("No AcroForm — treating as image-based PDF")
            result = self._process_image_pdf(doc, page_width, page_height, page_count)

        doc.close()
        return result

    def _get_acroform_fields(self, doc: fitz.Document) -> list:
        """Extract raw AcroForm widget data from all pages."""
        fields = []
        for page in doc:
            for widget in page.widgets():
                if widget.field_type_string in ("Text", "CheckBox", "RadioButton", "ListBox", "ComboBox"):
                    rect = widget.rect
                    # Normalize to 0-1000
                    pw, ph = page.rect.width, page.rect.height
                    fields.append({
                        "acro_name": widget.field_name,
                        "acro_type": widget.field_type_string,
                        "rect_pdf": [rect.x0, rect.y0, rect.x1, rect.y1],
                        "bounding_box": {
                            "xmin": round(rect.x0 / pw * 1000),
                            "ymin": round(rect.y0 / ph * 1000),
                            "xmax": round(rect.x1 / pw * 1000),
                            "ymax": round(rect.y1 / ph * 1000),
                        },
                        "page_index": page.number,
                        "choices": widget.choice_values or [],
                    })
        return fields

    def _process_acroform(
        self, doc, acro_fields, page_width, page_height, page_count
    ) -> ExtractionResult:
        """
        AcroForm path:
        1. Render page to image with numbered markers over each field
        2. Ask Claude to label each number
        3. Merge labels back with AcroForm metadata
        """
        page = doc[0]

        # Render page to image at 150 DPI
        mat = fitz.Matrix(150 / 72, 150 / 72)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes("png")

        # Draw numbered markers on image copy for Claude
        labeled_img = self._draw_field_markers(img_bytes, acro_fields, pix.width, pix.height)

        # Ask Claude to label each numbered field
        field_count = len(acro_fields)
        field_numbers = list(range(1, field_count + 1))

        prompt = ACROFORM_LABEL_PROMPT.format(
            field_count=field_count,
            field_numbers=field_numbers
        )

        response = self._call_claude_vision(labeled_img, prompt)
        labels = self._parse_json_response(response)

        # Merge AcroForm data with Claude labels
        form_fields = []
        for i, acro in enumerate(acro_fields):
            label_data = labels[i] if i < len(labels) else {}
            idx = i + 1

            field_type_map = {
                "Text": "text",
                "CheckBox": "checkbox",
                "RadioButton": "radio",
                "ListBox": "select",
                "ComboBox": "select",
            }

            # Clean up the acro_name into a readable snake_case field_name
            raw_name = acro["acro_name"].strip()
            clean_name = self._sanitize_field_name(raw_name) or f"field_{idx}"

            form_fields.append(FormField(
                field_name=clean_name,
                field_type=label_data.get("field_type", field_type_map.get(acro["acro_type"], "text")),
                semantic_label=label_data.get("semantic_label", raw_name),
                question_template=label_data.get("question_template", f"Please provide your {raw_name}."),
                description=label_data.get("description", ""),
                is_required=label_data.get("is_required", False),
                data_type=label_data.get("data_type", "text"),
                validation_rules=label_data.get("validation_rules", {}),
                purpose=label_data.get("purpose", ""),
                bounding_box=BoundingBox(**acro["bounding_box"]),
                acro_field_name=raw_name,
                acro_field_type=acro["acro_type"],
                options=acro.get("choices") or None,
            ))

        # Generate preview image (clean, no markers)
        preview_b64 = base64.b64encode(img_bytes).decode()

        return ExtractionResult(
            form_title="Form",  # Claude didn't see the full form for title here
            source_type="acroform",
            page_count=page_count,
            fields=form_fields,
            page_width=page_width,
            page_height=page_height,
            raw_image_b64=preview_b64,
        )

    def _process_image_pdf(
        self, doc, page_width, page_height, page_count
    ) -> ExtractionResult:
        """Image-based PDF: render to image then use full Vision path."""
        page = doc[0]
        mat = fitz.Matrix(150 / 72, 150 / 72)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes("png")

        result = self._run_vision_extraction(img_bytes)
        result.source_type = "image_pdf"
        result.page_count = page_count
        result.page_width = page_width
        result.page_height = page_height
        return result

    # ── Image Path ─────────────────────────────

    def _extract_image(self, file_path: str) -> ExtractionResult:
        """Direct image extraction path."""
        with open(file_path, "rb") as f:
            img_bytes = f.read()

        # Get dimensions via fitz
        doc = fitz.open(stream=img_bytes, filetype="png")
        try:
            page = doc[0]
            pw, ph = page.rect.width, page.rect.height
        except Exception:
            pw, ph = 0, 0
        finally:
            doc.close()

        result = self._run_vision_extraction(img_bytes)
        result.source_type = "scanned_image"
        result.page_count = 1
        if pw and ph:
            result.page_width = pw
            result.page_height = ph
        return result

    # ── Claude Vision Core ─────────────────────

    def _run_vision_extraction(self, img_bytes: bytes) -> ExtractionResult:
        """Send image to Claude Vision and parse structured field data."""
        response_text = self._call_claude_vision(img_bytes, VISION_PROMPT)
        raw = self._parse_json_response(response_text)

        form_title = raw.get("form_title", "Unknown Form")
        raw_fields = raw.get("fields", [])

        form_fields = []
        warnings = []
        seen_names = set()

        for i, f in enumerate(raw_fields):
            try:
                # Deduplicate field names
                name = self._sanitize_field_name(f.get("field_name", f"field_{i+1}"))
                if name in seen_names:
                    name = f"{name}_{i+1}"
                seen_names.add(name)

                bb_raw = f.get("bounding_box", {})
                bb = BoundingBox(
                    xmin=float(bb_raw.get("xmin", 0)),
                    ymin=float(bb_raw.get("ymin", 0)),
                    xmax=float(bb_raw.get("xmax", 100)),
                    ymax=float(bb_raw.get("ymax", 100)),
                )

                form_fields.append(FormField(
                    field_name=name,
                    field_type=f.get("field_type", "text"),
                    semantic_label=f.get("semantic_label", name),
                    question_template=f.get("question_template", f"Please provide your {name}."),
                    description=f.get("description", ""),
                    is_required=bool(f.get("is_required", False)),
                    data_type=f.get("data_type", "text"),
                    validation_rules=f.get("validation_rules", {}),
                    purpose=f.get("purpose", ""),
                    bounding_box=bb,
                ))
            except Exception as e:
                warnings.append(f"Skipped field {i}: {e}")

        preview_b64 = base64.b64encode(img_bytes).decode()

        return ExtractionResult(
            form_title=form_title,
            source_type="scanned_image",  # overridden by caller
            page_count=1,
            fields=form_fields,
            page_width=0,
            page_height=0,
            raw_image_b64=preview_b64,
            warnings=warnings,
        )

    # ── Helpers ────────────────────────────────

    def _call_claude_vision(self, img_bytes: bytes, prompt: str) -> str:
        """Send image + prompt to Claude Vision, return raw text response."""
        img_b64 = base64.b64encode(img_bytes).decode()

        message = self.claude.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": img_b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        return message.content[0].text

    def _parse_json_response(self, text: str) -> dict | list:
        """Strip markdown fences and parse JSON. Raises on failure."""
        text = text.strip()
        # Strip ```json ... ``` or ``` ... ```
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        text = text.strip()
        return json.loads(text)

    def _sanitize_field_name(self, name: str) -> str:
        """Convert to lowercase snake_case, strip special chars."""
        import re
        name = name.lower().strip()
        name = re.sub(r"[^a-z0-9_\s]", "", name)
        name = re.sub(r"\s+", "_", name)
        name = re.sub(r"_+", "_", name).strip("_")
        return name or "field"

    def _draw_field_markers(
        self, img_bytes: bytes, acro_fields: list, img_width: int, img_height: int
    ) -> bytes:
        """
        Draw numbered red circles on a copy of the image at each field's center.
        Used to help Claude identify and label each AcroForm field.
        """
        try:
            from PIL import Image, ImageDraw, ImageFont
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            draw = ImageDraw.Draw(img)

            for i, f in enumerate(acro_fields):
                bb = f["bounding_box"]
                # Convert normalized 0-1000 → pixel
                cx = int((bb["xmin"] + bb["xmax"]) / 2 / 1000 * img_width)
                cy = int((bb["ymin"] + bb["ymax"]) / 2 / 1000 * img_height)
                r = 12
                draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill="red")
                draw.text((cx - 6, cy - 8), str(i + 1), fill="white")

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()
        except ImportError:
            # Pillow not installed — return original image, Claude will still work
            logger.warning("Pillow not installed; sending unmarked image for AcroForm labeling")
            return img_bytes
