"""
Shared utility functions for HAN Group OS backend.
"""
from typing import Optional
from sqlalchemy.orm import Session


def get_active_api_key(db: Session, service: str) -> Optional["ExternalApiKey"]:
    """Retrieve an active ExternalApiKey by service name. Returns None if not found."""
    from models.models import ExternalApiKey
    return db.query(ExternalApiKey).filter(
        ExternalApiKey.service == service,
        ExternalApiKey.is_active == True,
    ).first()
