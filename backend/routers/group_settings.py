"""그룹 설정 API — 그룹 이름, 슬로건 등 전역 설정 관리."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from core.database import get_db
from models.models import GroupSettings

router = APIRouter(prefix="/api/group-settings", tags=["group-settings"])

# 기본값
DEFAULTS = {
    "group_name": "Group",
    "group_name_ko": "그룹",
    "slogan": "AI Corporate Operating System",
    "slogan_ko": "AI 기업 운영 시스템",
}


def _get(db: Session, key: str) -> str:
    row = db.query(GroupSettings).filter(GroupSettings.key == key).first()
    return row.value if row else DEFAULTS.get(key, "")


def get_group_name(db: Session) -> str:
    return _get(db, "group_name")


def get_group_name_ko(db: Session) -> str:
    return _get(db, "group_name_ko")


class SettingUpdate(BaseModel):
    group_name: Optional[str] = None
    group_name_ko: Optional[str] = None
    slogan: Optional[str] = None
    slogan_ko: Optional[str] = None


@router.get("")
def get_all_settings(db: Session = Depends(get_db)):
    """전체 그룹 설정 조회."""
    result = dict(DEFAULTS)
    rows = db.query(GroupSettings).all()
    for row in rows:
        result[row.key] = row.value
    return result


@router.patch("")
def update_settings(data: SettingUpdate, db: Session = Depends(get_db)):
    """그룹 설정 업데이트."""
    updates = data.model_dump(exclude_none=True)
    for key, value in updates.items():
        row = db.query(GroupSettings).filter(GroupSettings.key == key).first()
        if row:
            row.value = value
        else:
            db.add(GroupSettings(key=key, value=value))
    db.commit()
    return get_all_settings(db)
