"""
Upload filled PDFs to Cloudinary to get a public URL for WhatsApp (and other) delivery.
When VAARTA_BASE_URL is local, Twilio needs a publicly reachable URL to attach the PDF;
Cloudinary provides that.
"""

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    """True if Cloudinary env vars are set."""
    from config import get_settings
    s = get_settings()
    return bool(s.CLOUDINARY_CLOUD_NAME and s.CLOUDINARY_API_KEY and s.CLOUDINARY_API_SECRET)


def upload_pdf(file_path: str, public_id_prefix: str = "vaarta/filled") -> Optional[str]:
    """
    Upload a PDF file to Cloudinary (raw asset) and return its public URL.

    Args:
        file_path: Local path to the PDF file.
        public_id_prefix: Folder/prefix for the asset (e.g. "vaarta/filled").

    Returns:
        Secure URL of the uploaded PDF, or None if upload fails or Cloudinary not configured.
    """
    if not is_configured():
        return None
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        logger.warning("upload_pdf: file not found %s", file_path)
        return None
    try:
        import cloudinary
        from cloudinary import uploader
        from config import get_settings
        s = get_settings()
        cloudinary.config(
            cloud_name=s.CLOUDINARY_CLOUD_NAME,
            api_key=s.CLOUDINARY_API_KEY,
            api_secret=s.CLOUDINARY_API_SECRET,
        )
        # Use stem + .pdf so the delivery URL ends with .pdf (helps Twilio/WhatsApp)
        public_id = f"{public_id_prefix}/{path.stem}.pdf"
        result = uploader.upload(
            str(path),
            resource_type="raw",
            public_id=public_id,
        )
        url = result.get("secure_url") or result.get("url")
        if url:
            logger.info("Cloudinary upload OK: %s -> %s", path.name, public_id)
        return url
    except ImportError:
        logger.warning("cloudinary package not installed. pip install cloudinary")
        return None
    except Exception as e:
        logger.error("Cloudinary upload failed: %s", e, exc_info=True)
        return None
