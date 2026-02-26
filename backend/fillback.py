"""
Vaarta Fill-back Engine
- AcroForm PDFs  → fill widgets natively using stored original PDF
- Image PDFs     → text overlay at bounding box coordinates
- Scanned images → same overlay approach
"""

import base64
import io
import logging
import os
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

import store

logger = logging.getLogger(__name__)


async def fill_form_pdf(
    form_schema: dict,
    collected_data: dict,
    session_id: str,
) -> str:
    """
    Fill the form and write to a PDF. Returns the output file path.
    """
    form_id     = form_schema.get("form_id", "")
    source_type = form_schema.get("source_type", "scanned_image")
    fields      = form_schema.get("fields", [])
    output_path = str(store.filled_path(session_id))

    # Filter SKIPPED fields — don't write them
    clean_data = {k: v for k, v in collected_data.items() if v not in ("SKIPPED", "N/A", None, "")}

    if source_type == "acroform":
        orig = store.original_path(form_id)
        if orig and orig.suffix == ".pdf":
            _fill_acroform(str(orig), form_schema, clean_data, output_path)
        else:
            logger.warning("AcroForm original not found — falling back to overlay")
            _overlay_fill(form_schema, clean_data, output_path)
    else:
        _overlay_fill(form_schema, clean_data, output_path)

    return output_path


# ─────────────────────────────────────────────
# AcroForm native fill
# ─────────────────────────────────────────────

def _fill_acroform(orig_path: str, form_schema: dict, data: dict, output_path: str) -> None:
    """Write values directly into PDF AcroForm widgets."""
    doc = fitz.open(orig_path)

    # Build lookup: acro_field_name → value
    acro_map: dict[str, any] = {}
    for f in form_schema.get("fields", []):
        acro_name  = f.get("acro_field_name") or f.get("field_name")
        field_name = f.get("field_name")
        val = data.get(field_name)
        if val is not None:
            acro_map[acro_name] = val

    for page in doc:
        for widget in page.widgets():
            val = acro_map.get(widget.field_name)
            if val is None:
                continue
            wtype = widget.field_type_string
            if wtype == "Text":
                widget.field_value = str(val)
            elif wtype == "CheckBox":
                widget.field_value = val in (True, "true", "True", "yes", "Yes", "1", 1)
            elif wtype in ("ListBox", "ComboBox"):
                widget.field_value = str(val)
            widget.update()

    doc.save(output_path, deflate=True)
    doc.close()
    logger.info(f"AcroForm filled: {output_path}")


# ─────────────────────────────────────────────
# Image overlay fill
# ─────────────────────────────────────────────

def _overlay_fill(form_schema: dict, data: dict, output_path: str) -> None:
    """
    Overlay collected text onto the form image at each field's bounding box.
    Produces a PDF with the form as background + a text layer.
    """
    raw_b64 = form_schema.get("raw_image_b64")
    if not raw_b64:
        raise ValueError("No preview image for overlay fill")

    try:
        from PIL import Image, ImageDraw, ImageFont
        img_bytes = base64.b64decode(raw_b64)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        iw, ih = img.size
        draw = ImageDraw.Draw(img)

        # Load a readable font
        font_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
        font = None
        for fp in font_paths:
            if os.path.exists(fp):
                try:
                    font = ImageFont.truetype(fp, size=14)
                    break
                except Exception:
                    pass
        if font is None:
            font = ImageFont.load_default()

        def get_font(size: int):
            if size == 14 and font is not None:
                return font
            for fp in font_paths:
                if os.path.exists(fp):
                    try:
                        return ImageFont.truetype(fp, size=size)
                    except Exception:
                        pass
            return ImageFont.load_default()

        for f in form_schema.get("fields", []):
            fname = f.get("field_name") if isinstance(f, dict) else f.field_name
            val   = data.get(fname)
            if not val:
                continue

            bb    = f.get("bounding_box") if isinstance(f, dict) else None
            ftype = f.get("field_type","text") if isinstance(f, dict) else "text"
            if not bb:
                continue

            fsize = f.get("font_size", 14) if isinstance(f, dict) else getattr(f, "font_size", 14)
            fsize = max(8, min(72, int(fsize)))
            field_font = get_font(fsize)
            fcolor = f.get("font_color", "#0D3D3A") if isinstance(f, dict) else getattr(f, "font_color", None) or "#0D3D3A"
            align_h = f.get("text_align_h", "left") if isinstance(f, dict) else getattr(f, "text_align_h", "left")
            align_v = f.get("text_align_v", "top") if isinstance(f, dict) else getattr(f, "text_align_v", "top")

            xmin = bb.get("xmin",0) / 1000 * iw
            ymin = bb.get("ymin",0) / 1000 * ih
            xmax = bb.get("xmax",100) / 1000 * iw
            ymax = bb.get("ymax",100) / 1000 * ih
            bw   = xmax - xmin
            bh   = ymax - ymin

            if ftype == "checkbox":
                cx, cy = (xmin+xmax)/2, (ymin+ymax)/2
                mark = "✓" if val in (True,"true","True","yes","Yes","1",1) else "☐"
                draw.text((cx-6, cy-8), mark, fill=fcolor, font=field_font)
            else:
                text = str(val)
                while len(text) > 1:
                    bb_t = draw.textbbox((0,0), text, font=field_font)
                    if bb_t[2] - bb_t[0] <= bw - 6:
                        break
                    text = text[:-2] + "…"
                bb_t = draw.textbbox((0,0), text, font=field_font)
                tw, th = bb_t[2] - bb_t[0], bb_t[3] - bb_t[1]
                pad = 3
                if align_h == "center":
                    tx = xmin + (bw - tw) / 2
                elif align_h == "right":
                    tx = xmax - tw - pad
                else:
                    tx = xmin + pad
                if align_v == "middle":
                    ty = ymin + (bh - th) / 2
                elif align_v == "bottom":
                    ty = ymax - th - pad
                else:
                    ty = ymin + pad
                draw.text((tx, ty), text, fill=fcolor, font=field_font)

        img.save(output_path, "PDF", resolution=150)
        logger.info(f"Overlay fill done: {output_path}")

    except ImportError:
        # Pillow not available — create a plain text PDF as fallback
        _text_only_pdf(form_schema, data, output_path)


def _text_only_pdf(form_schema: dict, data: dict, output_path: str) -> None:
    """Fallback: simple text-only PDF listing all collected values."""
    doc  = fitz.open()
    page = doc.new_page()
    y    = 72

    page.insert_text((72, 40), form_schema.get("form_title","Form"), fontsize=16)

    for f in form_schema.get("fields", []):
        fname = f.get("field_name","")
        label = f.get("semantic_label", fname)
        val   = data.get(fname)
        if val:
            page.insert_text((72, y), f"{label}: {val}", fontsize=11)
            y += 20
            if y > 750:
                page = doc.new_page()
                y = 72

    doc.save(output_path)
    doc.close()
