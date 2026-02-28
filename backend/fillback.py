"""
Vaarta Fill-back Engine v2
- AcroForm PDFs  → fill widgets natively
- Image PDFs     → text overlay at bounding box coordinates
- Partial fill   → unfilled required fields highlighted yellow
- File fields    → image attachments embedded at bounding box
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

# Yellow highlight for unfilled required fields
_HIGHLIGHT_COLOR = (255, 243, 176)   # PIL RGB
_HIGHLIGHT_FITZ  = (1.0, 0.95, 0.69) # fitz RGB (0–1)


async def fill_form_pdf(
    form_schema: dict,
    collected_data: dict,
    session_id: str,
    partial: bool = False,
) -> str:
    """
    Fill the form and write to a PDF. Returns the output file path.
    partial=True → highlight unfilled required fields in yellow instead of leaving blank.
    """
    form_id     = form_schema.get("form_id", "")
    source_type = form_schema.get("source_type", "scanned_image")
    output_path = str(store.filled_path(session_id))

    clean_data = {k: v for k, v in collected_data.items() if v not in ("SKIPPED", "N/A", None, "")}

    if source_type == "acroform":
        orig = store.original_path(form_id)
        if orig and orig.suffix == ".pdf":
            _fill_acroform(str(orig), form_schema, clean_data, output_path, partial=partial)
        else:
            logger.warning("AcroForm original not found — falling back to overlay")
            _overlay_fill(form_schema, clean_data, output_path, partial=partial)
    else:
        _overlay_fill(form_schema, clean_data, output_path, partial=partial)

    return output_path


# ─────────────────────────────────────────────
# AcroForm native fill
# ─────────────────────────────────────────────

def _fill_acroform(orig_path: str, form_schema: dict, data: dict, output_path: str, partial: bool = False) -> None:
    doc = fitz.open(orig_path)

    acro_map: dict[str, any] = {}
    for f in form_schema.get("fields", []):
        acro_name  = f.get("acro_field_name") or f.get("field_name")
        field_name = f.get("field_name")
        val = data.get(field_name)
        if val is not None:
            acro_map[acro_name] = val

    # Track which acro fields are unfilled required fields (for highlight)
    required_unfilled = set()
    if partial:
        for f in form_schema.get("fields", []):
            if f.get("is_required"):
                fname = f.get("field_name")
                if fname not in data:
                    acro_name = f.get("acro_field_name") or fname
                    required_unfilled.add(acro_name)

    for page in doc:
        for widget in page.widgets():
            val = acro_map.get(widget.field_name)
            if val is not None:
                wtype = widget.field_type_string
                if wtype == "Text":
                    widget.field_value = str(val)
                elif wtype == "CheckBox":
                    widget.field_value = val in (True, "true", "True", "yes", "Yes", "1", 1)
                elif wtype in ("ListBox", "ComboBox"):
                    widget.field_value = str(val)
                widget.update()
            elif partial and widget.field_name in required_unfilled:
                # Draw yellow highlight rectangle over the empty widget
                rect = widget.rect
                shape = page.new_shape()
                shape.draw_rect(rect)
                shape.finish(color=None, fill=_HIGHLIGHT_FITZ, fill_opacity=0.5)
                shape.commit()

    doc.save(output_path, deflate=True)
    doc.close()
    logger.info(f"AcroForm filled (partial={partial}): {output_path}")


# ─────────────────────────────────────────────
# Image overlay fill
# ─────────────────────────────────────────────

_PAD_X = 6
_PAD_Y = 2


def _hex_to_rgb(hex_str: str) -> tuple:
    s = (hex_str or "#0D3D3A").strip().lstrip("#")
    if len(s) == 6:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    return (13, 61, 58)


def _overlay_fill(form_schema: dict, data: dict, output_path: str, partial: bool = False) -> None:
    raw_b64 = form_schema.get("raw_image_b64")
    if not raw_b64:
        raise ValueError("No preview image for overlay fill")

    try:
        from PIL import Image, ImageDraw, ImageFont
        img_bytes = base64.b64decode(raw_b64)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        iw, ih = img.size
        draw = ImageDraw.Draw(img)

        font_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            os.path.expandvars(r"%WINDIR%\Fonts\arial.ttf"),
        ]
        regular_path = next((p for p in font_paths if os.path.exists(p)), None)
        bold_path    = next((p for p in font_paths if os.path.exists(p) and ("Bold" in p or "bd" in p.lower())), regular_path)
        italic_path  = next((p for p in font_paths if os.path.exists(p) and ("Oblique" in p or "Italic" in p)), regular_path)
        font_cache: dict = {}

        def get_font(size: int, style: str = "normal"):
            size = max(8, min(72, int(size)))
            key = (size, style)
            if key in font_cache:
                return font_cache[key]
            path = bold_path if style == "bold" else italic_path if style == "italic" else regular_path
            try:
                f = ImageFont.truetype(path, size=size) if path and os.path.exists(path) else ImageFont.load_default()
            except Exception:
                f = ImageFont.load_default()
            font_cache[key] = f
            return f

        fields = form_schema.get("fields", [])

        for f in fields:
            fname = f.get("field_name") if isinstance(f, dict) else f.field_name
            val   = data.get(fname)
            bb    = f.get("bounding_box") if isinstance(f, dict) else None
            ftype = f.get("field_type", "text") if isinstance(f, dict) else "text"
            is_req = f.get("is_required", False) if isinstance(f, dict) else False

            if not bb:
                continue

            xmin = bb.get("xmin", 0) / 1000.0 * iw
            ymin = bb.get("ymin", 0) / 1000.0 * ih
            xmax = bb.get("xmax", 1000) / 1000.0 * iw
            ymax = bb.get("ymax", 1000) / 1000.0 * ih
            bw   = xmax - xmin
            bh   = ymax - ymin

            # ── Partial fill: highlight unfilled required fields ──
            if not val and partial and is_req:
                draw.rectangle([xmin, ymin, xmax, ymax], fill=_HIGHLIGHT_COLOR, outline=(255, 200, 0), width=1)
                # Small "required" label
                hint_font = get_font(max(8, min(12, round(bh * 0.35))))
                draw.text((xmin + 3, ymin + 2), "required", fill=(180, 120, 0), font=hint_font)
                continue

            if not val:
                continue

            # ── File/image field: embed uploaded image ──
            if ftype in ("signature", "file", "image"):
                uploaded = store.get_session_file(fname, data.get("_session_id", ""))
                if uploaded:
                    try:
                        att = Image.open(io.BytesIO(uploaded)).convert("RGBA")
                        att.thumbnail((int(bw), int(bh)), Image.LANCZOS)
                        paste_x = int(xmin + (bw - att.width) / 2)
                        paste_y = int(ymin + (bh - att.height) / 2)
                        img.paste(att, (paste_x, paste_y), att if att.mode == "RGBA" else None)
                        continue
                    except Exception as e:
                        logger.warning(f"Could not embed file for {fname}: {e}")

            # Font size from box height: fill ~55% of box (works at any image resolution)
            fsize   = max(8, min(48, round(bh * 0.55)))
            fstyle  = (f.get("font_style") or "normal") if isinstance(f, dict) else "normal"
            field_font = get_font(fsize, fstyle)
            fcolor  = _hex_to_rgb(f.get("font_color", "#0D3D3A") if isinstance(f, dict) else "#0D3D3A")
            align_h = f.get("text_align_h", "left") if isinstance(f, dict) else "left"
            align_v = f.get("text_align_v", "top") if isinstance(f, dict) else "top"

            # Radio/checkbox group: draw mark at selected child's bbox only
            children = f.get("children") or [] if isinstance(f, dict) else []
            if children and ftype in ("radio", "checkbox"):
                val_str = str(val).strip().lower()
                for child in children:
                    child_label = (child.get("label") or "").strip().lower()
                    if child_label and val_str != child_label:
                        continue
                    cbb = child.get("bounding_box") or {}
                    cxmin = cbb.get("xmin", 0) / 1000.0 * iw
                    cymin = cbb.get("ymin", 0) / 1000.0 * ih
                    cxmax = cbb.get("xmax", 100) / 1000.0 * iw
                    cymax = cbb.get("ymax", 100) / 1000.0 * ih
                    cx = (cxmin + cxmax) / 2
                    cy = (cymin + cymax) / 2
                    mark = "●" if ftype == "radio" else "✓"
                    bb_t = draw.textbbox((0, 0), mark, font=field_font)
                    tw, th = bb_t[2] - bb_t[0], bb_t[3] - bb_t[1]
                    draw.text((cx - tw / 2, cy - th / 2), mark, fill=fcolor, font=field_font)
                continue

            if ftype == "checkbox":
                mark = "✓" if val in (True, "true", "True", "yes", "Yes", "1", 1) else "☐"
                bb_t = draw.textbbox((0, 0), mark, font=field_font)
                tw, th = bb_t[2] - bb_t[0], bb_t[3] - bb_t[1]
                cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
                draw.text((cx - tw / 2, cy - th / 2), mark, fill=fcolor, font=field_font)
            else:
                text = str(val)
                while len(text) > 1:
                    bb_t = draw.textbbox((0, 0), text, font=field_font)
                    if bb_t[2] - bb_t[0] <= bw - _PAD_X * 2:
                        break
                    text = text[:-2] + "…"
                bb_t = draw.textbbox((0, 0), text, font=field_font)
                tw, th = bb_t[2] - bb_t[0], bb_t[3] - bb_t[1]
                tx = xmin + (bw - tw) / 2 if align_h == "center" else (xmax - tw - _PAD_X if align_h == "right" else xmin + _PAD_X)
                ty = ymin + (bh - th) / 2 if align_v == "middle" else (ymax - th - _PAD_Y if align_v == "bottom" else ymin + _PAD_Y)
                draw.text((tx, ty), text, fill=fcolor, font=field_font)

        img.save(output_path, "PDF", resolution=150)
        logger.info(f"Overlay fill done (partial={partial}): {output_path}")

    except ImportError:
        _text_only_pdf(form_schema, data, output_path)


def _text_only_pdf(form_schema: dict, data: dict, output_path: str) -> None:
    doc  = fitz.open()
    page = doc.new_page()
    y    = 72
    page.insert_text((72, 40), form_schema.get("form_title", "Form"), fontsize=16)
    for f in form_schema.get("fields", []):
        fname = f.get("field_name", "")
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