"""
Form Fill-back Engine
- AcroForm PDFs: fill fields natively via PyMuPDF
- Image-based PDFs / scanned images: overlay text at bounding box coordinates
"""

import os
import json
import tempfile
import logging
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(tempfile.gettempdir()) / "formbot_filled"
OUTPUT_DIR.mkdir(exist_ok=True)


async def fill_form_pdf(
    form_schema: dict,
    collected_data: dict,
    session_id: str,
) -> str:
    """
    Main fill-back entry point.
    Returns path to filled PDF file.
    """
    source_type = form_schema.get("source_type", "scanned_image")
    original_b64 = form_schema.get("raw_image_b64")
    fields = form_schema.get("fields", [])

    output_path = str(OUTPUT_DIR / f"filled_{session_id}.pdf")

    if source_type == "acroform":
        _fill_acroform(form_schema, collected_data, output_path)
    else:
        # Both image_pdf and scanned_image → overlay text
        _fill_with_overlay(original_b64, fields, collected_data, output_path, form_schema)

    return output_path


# ─────────────────────────────────────────────
# Path 1: AcroForm Fill
# ─────────────────────────────────────────────

def _fill_acroform(form_schema: dict, collected_data: dict, output_path: str):
    """
    Fill a true AcroForm PDF by writing to widget fields directly.
    Uses acro_field_name stored during extraction to match fields.
    """
    # We need the original PDF bytes — stored as raw_image_b64 only for image
    # For AcroForm we need the original PDF. For hackathon, re-extract from b64 or store separately.
    # Simplest approach: use overlay for now as fallback
    original_b64 = form_schema.get("raw_image_b64")
    if not original_b64:
        raise ValueError("No original form data available for fill-back")

    import base64
    import io

    pdf_bytes = base64.b64decode(original_b64)

    # Try to open as PDF — if it was rendered to image for preview, fall back to overlay
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        _fill_acroform_doc(doc, form_schema, collected_data)
        doc.save(output_path)
        doc.close()
        logger.info(f"AcroForm filled: {output_path}")
    except Exception:
        # Fall back to overlay
        logger.warning("AcroForm fill failed, falling back to overlay")
        _fill_with_overlay(original_b64, form_schema.get("fields", []), collected_data, output_path, form_schema)


def _fill_acroform_doc(doc: fitz.Document, form_schema: dict, collected_data: dict):
    """Fill AcroForm widgets in-place on the document."""
    # Build lookup: acro_field_name → collected value
    acro_map = {}
    for f in form_schema.get("fields", []):
        acro_name = f.get("acro_field_name") or f.get("field_name")
        field_name = f.get("field_name")
        val = collected_data.get(field_name)
        if val and val != "N/A":
            acro_map[acro_name] = val

    for page in doc:
        for widget in page.widgets():
            if widget.field_name in acro_map:
                val = acro_map[widget.field_name]
                widget_type = widget.field_type_string

                if widget_type == "Text":
                    widget.field_value = str(val)
                elif widget_type == "CheckBox":
                    widget.field_value = val in (True, "true", "True", "yes", "Yes", "1", 1)
                elif widget_type in ("ListBox", "ComboBox"):
                    widget.field_value = str(val)

                widget.update()


# ─────────────────────────────────────────────
# Path 2: Image Overlay Fill
# ─────────────────────────────────────────────

def _fill_with_overlay(
    original_b64: Optional[str],
    fields: list,
    collected_data: dict,
    output_path: str,
    form_schema: dict,
):
    """
    Overlay collected text onto form image at bounding box positions.
    Creates a new PDF with the form image as background + text layer.
    """
    if not original_b64:
        raise ValueError("No original form image available")

    import base64
    import io
    from PIL import Image, ImageDraw, ImageFont

    img_bytes = base64.b64decode(original_b64)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    img_width, img_height = img.size

    draw = ImageDraw.Draw(img)

    # Try to load a clean font, fall back to default
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size=14)
    except Exception:
        font = ImageFont.load_default()

    # Get page dimensions from schema (for coord conversion if needed)
    page_width = form_schema.get("page_width", img_width)
    page_height = form_schema.get("page_height", img_height)

    for f in fields:
        field_name = f.get("field_name") if isinstance(f, dict) else f.field_name
        val = collected_data.get(field_name)

        if not val or val == "N/A":
            continue

        bb = f.get("bounding_box") if isinstance(f, dict) else None
        if not bb:
            continue

        # bounding_box is 0-1000 normalized
        xmin = bb.get("xmin", 0) / 1000 * img_width
        ymin = bb.get("ymin", 0) / 1000 * img_height
        xmax = bb.get("xmax", 100) / 1000 * img_width
        ymax = bb.get("ymax", 100) / 1000 * img_height

        field_type = f.get("field_type", "text") if isinstance(f, dict) else "text"

        if field_type == "checkbox":
            # Draw a checkmark or X
            cx = (xmin + xmax) / 2
            cy = (ymin + ymax) / 2
            if val in (True, "true", "True", "yes", "Yes", "1", 1):
                draw.text((cx - 5, cy - 8), "✓", fill="blue", font=font)
            else:
                draw.text((cx - 5, cy - 8), "☐", fill="black", font=font)
        else:
            # Text: draw inside the bounding box, slightly inset
            text = str(val)
            tx = xmin + 3
            ty = ymin + 2

            # Truncate if too long for the box
            box_width = xmax - xmin
            while len(text) > 1:
                bbox_text = draw.textbbox((0, 0), text, font=font)
                text_w = bbox_text[2] - bbox_text[0]
                if text_w <= box_width - 6:
                    break
                text = text[:-2] + "…"

            draw.text((tx, ty), text, fill="#1a1a6e", font=font)

    # Save as PDF
    img_rgb = img.convert("RGB")
    img_rgb.save(output_path, "PDF", resolution=150)
    logger.info(f"Overlay fill complete: {output_path}")


# ─────────────────────────────────────────────
# Utility: Store original PDF bytes in session
# ─────────────────────────────────────────────

def store_original_pdf(file_bytes: bytes, form_id: str) -> str:
    """
    Store original PDF bytes to disk for AcroForm fill-back.
    Returns file path. Called during upload.
    """
    pdf_dir = OUTPUT_DIR / "originals"
    pdf_dir.mkdir(exist_ok=True)
    path = str(pdf_dir / f"original_{form_id}.pdf")
    with open(path, "wb") as f:
        f.write(file_bytes)
    return path
