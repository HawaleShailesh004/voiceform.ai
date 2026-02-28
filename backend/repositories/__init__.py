"""Persistence layer: abstract interface and implementations."""

from .base import StoreProtocol
from .file_store import FileStore

__all__ = ["StoreProtocol", "FileStore"]
