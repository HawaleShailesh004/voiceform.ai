"""
Vaarta Form Field Extractor
Handles: Digital PDFs (AcroForm), Scanned Images, Image-based PDFs
Vision: Claude claude-sonnet-4
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

from prompts import VISION_PROMPT, ACROFORM_LABEL_PROMPT

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────

@dataclass
class BoundingBox:
    xmin: float
    ymin: float
    xmax: float
    ymax: float


@dataclass
class FormField:
    field_name: str
    field_type: str
    semantic_label: str
    question_template: str
    description: str
    is_required: bool
    data_type: str
    validation_rules: dict
    purpose: str
    bounding_box: BoundingBox
    acro_field_name: Optional[str] = None
    acro_field_type: Optional[str] = None
    options: Optional[list] = None
    children: Optional[list] = None  # for radio/checkbox groups: [{ field_name, label, bounding_box }, ...]


@dataclass
class ExtractionResult:
    form_title: str
    source_type: str
    page_count: int
    fields: list
    page_width: float
    page_height: float
    raw_image_b64: Optional[str] = None
    warnings: list = field(default_factory=list)
    sample_values: Optional[dict] = None  # field_name -> sample value from vision

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────
# Core Extractor (vision prompts live in prompts.py)
# ─────────────────────────────────────────────

class FormExtractor:

    def __init__(self, api_key: Optional[str] = None):
        self.claude = anthropic.Anthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])
        self.model  = "claude-sonnet-4-20250514"

    def extract(self, file_path: str) -> ExtractionResult:
        path   = Path(file_path)
        suffix = path.suffix.lower()
        if suffix == ".pdf":
            return self._extract_pdf(file_path)
        elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}:
            return self._extract_image(file_path)
        else:
            raise ValueError(f"Unsupported: {suffix}")

    # ── PDF ──

    def _extract_pdf(self, file_path: str) -> ExtractionResult:
        doc    = fitz.open(file_path)
        page   = doc[0]
        pw, ph = page.rect.width, page.rect.height
        pages  = len(doc)

        acro = self._get_acroform_fields(doc)
        if acro:
            logger.info(f"AcroForm: {len(acro)} fields")
            result = self._process_acroform(doc, acro, pw, ph, pages)
        else:
            logger.info("No AcroForm — image PDF")
            result = self._process_image_pdf(doc, pw, ph, pages)

        doc.close()
        return result

    def _get_acroform_fields(self, doc: fitz.Document) -> list:
        fields = []
        for page in doc:
            pw, ph = page.rect.width, page.rect.height
            for w in page.widgets():
                if w.field_type_string in ("Text", "CheckBox", "RadioButton", "ListBox", "ComboBox"):
                    r = w.rect
                    fields.append({
                        "acro_name": w.field_name,
                        "acro_type": w.field_type_string,
                        "rect_pdf": [r.x0, r.y0, r.x1, r.y1],
                        "bounding_box": {
                            "xmin": round(r.x0 / pw * 1000),
                            "ymin": round(r.y0 / ph * 1000),
                            "xmax": round(r.x1 / pw * 1000),
                            "ymax": round(r.y1 / ph * 1000),
                        },
                        "page_index": page.number,
                        "choices": w.choice_values or [],
                    })
        return fields

    def _process_acroform(self, doc, acro, pw, ph, pages) -> ExtractionResult:
        page  = doc[0]
        mat   = fitz.Matrix(150/72, 150/72)
        pix   = page.get_pixmap(matrix=mat, alpha=False)
        img   = pix.tobytes("png")
        labeled = self._draw_markers(img, acro, pix.width, pix.height)

        prompt = ACROFORM_LABEL_PROMPT.format(
            field_count=len(acro),
            field_numbers=list(range(1, len(acro)+1))
        )
        labels = self._call_vision(labeled, prompt, media_type=self._media_type_from_bytes(labeled))
        labels = self._parse_json(labels)

        type_map = {"Text":"text","CheckBox":"checkbox","RadioButton":"radio","ListBox":"select","ComboBox":"select"}
        form_fields = []
        for i, a in enumerate(acro):
            lbl  = labels[i] if i < len(labels) else {}
            name = self._snake(a["acro_name"]) or f"field_{i+1}"
            form_fields.append(FormField(
                field_name=name,
                field_type=lbl.get("field_type", type_map.get(a["acro_type"],"text")),
                semantic_label=lbl.get("semantic_label", a["acro_name"]),
                question_template=lbl.get("question_template", f"Please provide {a['acro_name']}."),
                description=lbl.get("description",""),
                is_required=lbl.get("is_required", False),
                data_type=lbl.get("data_type","text"),
                validation_rules=lbl.get("validation_rules",{}),
                purpose=lbl.get("purpose",""),
                bounding_box=BoundingBox(**a["bounding_box"]),
                acro_field_name=a["acro_name"],
                acro_field_type=a["acro_type"],
                options=a.get("choices") or None,
            ))

        return ExtractionResult(
            form_title="Form",
            source_type="acroform",
            page_count=pages,
            fields=form_fields,
            page_width=pw, page_height=ph,
            raw_image_b64=base64.b64encode(img).decode(),
        )

    def _process_image_pdf(self, doc, pw, ph, pages) -> ExtractionResult:
        page = doc[0]
        pix  = page.get_pixmap(matrix=fitz.Matrix(150/72, 150/72), alpha=False)
        img  = pix.tobytes("png")
        res  = self._run_vision(img, media_type="image/png")
        res.source_type = "image_pdf"
        res.page_count  = pages
        res.page_width  = pw
        res.page_height = ph
        return res

    # ── Image ──

    def _extract_image(self, file_path: str) -> ExtractionResult:
        path = Path(file_path)
        with open(path, "rb") as f:
            img = f.read()
        media_type = self._media_type_for_suffix(path.suffix.lower())
        res = self._run_vision(img, media_type=media_type)
        res.source_type = "scanned_image"
        res.page_count  = 1
        return res

    # ── Vision Core ──

    def _media_type_for_suffix(self, suffix: str) -> str:
        return {
            ".png":  "image/png",
            ".jpg":  "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".tiff": "image/tiff",
            ".tif":  "image/tiff",
            ".bmp":  "image/bmp",
        }.get(suffix, "image/png")

    def _media_type_from_bytes(self, img: bytes) -> str:
        """Detect image media type from magic bytes so API gets correct type."""
        if len(img) < 12:
            return "image/png"
        if img[:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        if img[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if img[:4] == b"RIFF" and img[8:12] == b"WEBP":
            return "image/webp"
        if img[:2] in (b"II", b"MM"):
            return "image/tiff"
        if img[:2] == b"BM":
            return "image/bmp"
        return "image/png"

    def _run_vision(self, img: bytes, media_type: str = "image/png") -> ExtractionResult:
        # Prefer detected type so API never rejects wrong extension
        media_type = self._media_type_from_bytes(img) or media_type
        text = self._call_vision(img, VISION_PROMPT, media_type=media_type)
        raw  = self._parse_json(text)

        title    = raw.get("form_title","Unknown Form") if isinstance(raw, dict) else "Unknown Form"
        raw_flds = raw.get("fields",[]) if isinstance(raw, dict) else []

        fields   = []
        warnings = []
        seen     = set()

        for i, f in enumerate(raw_flds):
            try:
                name = self._snake(f.get("field_name",f"field_{i+1}"))
                if name in seen: name = f"{name}_{i+1}"
                seen.add(name)
                bb = f.get("bounding_box",{})
                children = None
                raw_children = f.get("children") or []
                if raw_children:
                    children = []
                    for c in raw_children:
                        cbb = c.get("bounding_box") or {}
                        children.append({
                            "field_name": c.get("field_name", ""),
                            "label": c.get("label", ""),
                            "bounding_box": {
                                "xmin": float(cbb.get("xmin", 0)),
                                "ymin": float(cbb.get("ymin", 0)),
                                "xmax": float(cbb.get("xmax", 100)),
                                "ymax": float(cbb.get("ymax", 100)),
                            },
                        })
                fields.append(FormField(
                    field_name=name,
                    field_type=f.get("field_type","text"),
                    semantic_label=f.get("semantic_label",name),
                    question_template=f.get("question_template",f"Please provide {name}."),
                    description=f.get("description",""),
                    is_required=bool(f.get("is_required",False)),
                    data_type=f.get("data_type","text"),
                    validation_rules=f.get("validation_rules",{}),
                    purpose=f.get("purpose",""),
                    bounding_box=BoundingBox(
                        xmin=float(bb.get("xmin",0)),
                        ymin=float(bb.get("ymin",0)),
                        xmax=float(bb.get("xmax",100)),
                        ymax=float(bb.get("ymax",100)),
                    ),
                    children=children,
                ))
            except Exception as e:
                warnings.append(f"Skipped field {i}: {e}")

        return ExtractionResult(
            form_title=title,
            source_type="scanned_image",
            page_count=1,
            fields=fields,
            page_width=0, page_height=0,
            raw_image_b64=base64.b64encode(img).decode(),
            warnings=warnings,
        )

    def _call_vision(self, img: bytes, prompt: str, media_type: str = "image/png") -> str:
        # Always detect from bytes so API never rejects (overrides any wrong caller type)
        media_type = self._media_type_from_bytes(img)
        msg = self.claude.messages.create(
            model=self.model,
            max_tokens=16384,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.b64encode(img).decode()}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        return msg.content[0].text

    def _parse_json(self, text: str):
        text = text.strip()
        if text.startswith("```"):
            parts = text.split("\n", 1)
            text = parts[1] if len(parts) > 1 else ""
            text = text.rsplit("```", 1)[0].strip()
        else:
            text = text.rsplit("```", 1)[0].strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Truncated response: try closing unterminated string and structure
            for suffix in ('"}\n  ]\n}', '"\n  ]\n}', '\n  ]\n}', '\n]\n}'):
                try:
                    return json.loads(text + suffix)
                except json.JSONDecodeError:
                    continue
            # Fallback: trim from end to find last valid JSON
            for trim in range(50, min(3000, len(text)), 50):
                try:
                    return json.loads(text[:-trim] + "\n  ]\n}")
                except json.JSONDecodeError:
                    continue
            for trim in range(1, 50):
                try:
                    return json.loads(text[:-trim] + "\n  ]\n}")
                except json.JSONDecodeError:
                    continue
            raise

    def _snake(self, name: str) -> str:
        import re
        name = name.lower().strip()
        name = re.sub(r"[^a-z0-9_\s]","",name)
        name = re.sub(r"\s+","_",name)
        return re.sub(r"_+","_",name).strip("_") or "field"

    def _draw_markers(self, img: bytes, fields: list, iw: int, ih: int) -> bytes:
        try:
            from PIL import Image, ImageDraw
            im = Image.open(io.BytesIO(img)).convert("RGB")
            d  = ImageDraw.Draw(im)
            for i, f in enumerate(fields):
                bb = f["bounding_box"]
                cx = int((bb["xmin"]+bb["xmax"])/2/1000*iw)
                cy = int((bb["ymin"]+bb["ymax"])/2/1000*ih)
                r  = 12
                d.ellipse([cx-r,cy-r,cx+r,cy+r], fill="red")
                d.text((cx-6,cy-8), str(i+1), fill="white")
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            return buf.getvalue()
        except ImportError:
            return img
