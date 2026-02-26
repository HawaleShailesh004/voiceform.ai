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
# Image overlay fill (WYSIWYG: match frontend preview)
# ─────────────────────────────────────────────

# Reference width so font size in PDF matches preview at ~800px display
_PREVIEW_REF_WIDTH = 800.0

# Padding matches frontend overlay: "2px 6px" (top/bottom 2, left/right 6)
_PAD_X = 6
_PAD_Y = 2


def _hex_to_rgb(hex_str: str) -> tuple:
    """Convert #RRGGBB to (r, g, b) for PIL."""
    s = (hex_str or "#0D3D3A").strip().lstrip("#")
    if len(s) == 6:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    return (13, 61, 58)


def _overlay_fill(form_schema: dict, data: dict, output_path: str) -> None:
    """
    Overlay collected text onto the form image at each field's bounding box.
    Uses same padding, alignment, font size scaling, and font style as frontend preview.
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

        # Font paths: Regular + Bold/Italic so PDF matches preview font_style (Linux, macOS, Windows)
        font_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            os.path.expandvars(r"%WINDIR%\Fonts\arial.ttf"),
            os.path.expandvars(r"%WINDIR%\Fonts\arialbd.ttf"),
            os.path.expandvars(r"%WINDIR%\Fonts\ariali.ttf"),
        ]
        regular_path = None
        for fp in font_paths:
            if os.path.exists(fp):
                regular_path = fp
                break
        def _exists(p):
            return p and os.path.exists(p)
        bold_path = next((p for p in font_paths if _exists(p) and ("Bold" in p or "bold" in p or "bd" in p.lower())), regular_path)
        italic_path = next((p for p in font_paths if _exists(p) and ("Oblique" in p or "Italic" in p or "ariali" in p.lower())), regular_path)
        font_cache: dict = {}

        def get_font(size: int, style: str = "normal"):
            """Load font at size; style in normal|bold|italic."""
            size = max(8, min(72, int(size)))
            key = (size, style)
            if key in font_cache:
                return font_cache[key]
            path = regular_path
            if style == "bold" and bold_path:
                path = bold_path
            elif style == "italic" and italic_path:
                path = italic_path
            try:
                f = ImageFont.truetype(path, size=size) if path and os.path.exists(path) else ImageFont.load_default()
            except Exception:
                f = ImageFont.load_default()
            font_cache[key] = f
            return f

        for f in form_schema.get("fields", []):
            fname = f.get("field_name") if isinstance(f, dict) else f.field_name
            val   = data.get(fname)
            if not val:
                continue

            bb    = f.get("bounding_box") if isinstance(f, dict) else None
            ftype = f.get("field_type", "text") if isinstance(f, dict) else "text"
            if not bb:
                continue

            # Bbox in 0–1000 per-mille (same as frontend)
            xmin = bb.get("xmin", 0) / 1000.0 * iw
            ymin = bb.get("ymin", 0) / 1000.0 * ih
            xmax = bb.get("xmax", 1000) / 1000.0 * iw
            ymax = bb.get("ymax", 1000) / 1000.0 * ih
            bw   = xmax - xmin
            bh   = ymax - ymin

            fsize = f.get("font_size", 14) if isinstance(f, dict) else getattr(f, "font_size", 14)
            fsize = float(fsize)
            # Scale font so PDF at ~ref width matches preview (preview uses CSS px at ~800px)
            scale = iw / _PREVIEW_REF_WIDTH
            fsize = max(8, min(72, round(fsize * scale)))
            fstyle = (f.get("font_style") or "normal") if isinstance(f, dict) else getattr(f, "font_style", None) or "normal"
            field_font = get_font(fsize, fstyle)
            fcolor = _hex_to_rgb(
                f.get("font_color", "#0D3D3A") if isinstance(f, dict) else getattr(f, "font_color", None) or "#0D3D3A"
            )
            align_h = f.get("text_align_h", "left") if isinstance(f, dict) else getattr(f, "text_align_h", "left")
            align_v = f.get("text_align_v", "top") if isinstance(f, dict) else getattr(f, "text_align_v", "top")

            if ftype == "checkbox":
                mark = "✓" if val in (True, "true", "True", "yes", "Yes", "1", 1) else "☐"
                bb_t = draw.textbbox((0, 0), mark, font=field_font)
                tw, th = bb_t[2] - bb_t[0], bb_t[3] - bb_t[1]
                cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
                tx = cx - tw / 2
                ty = cy - th / 2
                draw.text((tx, ty), mark, fill=fcolor, font=field_font)
            else:
                text = str(val)
                while len(text) > 1:
                    bb_t = draw.textbbox((0, 0), text, font=field_font)
                    if bb_t[2] - bb_t[0] <= bw - _PAD_X * 2:
                        break
                    text = text[:-2] + "…"
                bb_t = draw.textbbox((0, 0), text, font=field_font)
                tw, th = bb_t[2] - bb_t[0], bb_t[3] - bb_t[1]
                if align_h == "center":
                    tx = xmin + (bw - tw) / 2
                elif align_h == "right":
                    tx = xmax - tw - _PAD_X
                else:
                    tx = xmin + _PAD_X
                if align_v == "middle":
                    ty = ymin + (bh - th) / 2
                elif align_v == "bottom":
                    ty = ymax - th - _PAD_Y
                else:
                    ty = ymin + _PAD_Y
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
