"""
멀티테넌트 권한 관리 — 사용자별 역할 기반 접근 제어 + 계열사별 데이터 격리

GET    /api/permissions                      — 전체 권한 목록 (admin only)
GET    /api/permissions/my                   — 내 권한 목록
POST   /api/permissions/grant                — 권한 부여
DELETE /api/permissions/{id}                 — 권한 제거
GET    /api/permissions/company/{id}         — 계열사별 권한 목록
GET    /api/permissions/company/{id}/check   — 특정 계열사 접근 권한 확인
GET    /api/permissions/users                — 사용자 목록 + 역할 정보
PATCH  /api/permissions/{id}                 — 역할 변경
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user, get_admin_user
from models.models import UserCompanyRole, User, Company

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/permissions", tags=["permissions"])

VALID_ROLES = {"chairman", "ceo", "manager", "viewer"}


@router.get("")
def list_all_permissions(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """전체 권한 목록 (관리자 전용)."""
    roles = db.query(UserCompanyRole).all()
    return [_fmt(r, db) for r in roles]


@router.get("/my")
def my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자의 권한 목록."""
    roles = db.query(UserCompanyRole).filter(
        UserCompanyRole.user_id == current_user.id
    ).all()

    result = []
    for r in roles:
        company = db.query(Company).filter(Company.id == r.company_id).first()
        result.append({
            "id": r.id,
            "company_id": r.company_id,
            "company_name": company.name if company else "Unknown",
            "role": r.role,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return result


@router.post("/grant")
def grant_permission(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """권한 부여 (admin 또는 해당 계열사 chairman/ceo만 가능)."""
    user_id = body.get("user_id")
    company_id = body.get("company_id")
    role = body.get("role", "viewer")

    if not user_id or not company_id:
        raise HTTPException(400, "user_id, company_id 필수")
    if role not in VALID_ROLES:
        raise HTTPException(400, f"유효한 역할: {', '.join(VALID_ROLES)}")

    # 권한 체크: admin이거나, 해당 계열사의 chairman/ceo
    if current_user.role != "admin":
        my_role = db.query(UserCompanyRole).filter(
            UserCompanyRole.user_id == current_user.id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role.in_(["chairman", "ceo"]),
        ).first()
        if not my_role:
            raise HTTPException(403, "권한이 없습니다. admin 또는 해당 계열사 chairman/ceo만 부여 가능합니다.")

    # 대상 사용자 존재 확인
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")

    # 계열사 존재 확인
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "계열사를 찾을 수 없습니다")

    # 기존 권한 확인 — 이미 있으면 업데이트
    existing = db.query(UserCompanyRole).filter(
        UserCompanyRole.user_id == user_id,
        UserCompanyRole.company_id == company_id,
    ).first()

    if existing:
        existing.role = role
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return _fmt(existing, db)

    ucr = UserCompanyRole(
        user_id=user_id,
        company_id=company_id,
        role=role,
        granted_by=current_user.id,
    )
    db.add(ucr)
    db.commit()
    db.refresh(ucr)
    return _fmt(ucr, db)


@router.delete("/{perm_id}")
def revoke_permission(
    perm_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """권한 제거."""
    ucr = db.query(UserCompanyRole).filter(UserCompanyRole.id == perm_id).first()
    if not ucr:
        raise HTTPException(404, "권한을 찾을 수 없습니다")

    # 권한 체크
    if current_user.role != "admin":
        my_role = db.query(UserCompanyRole).filter(
            UserCompanyRole.user_id == current_user.id,
            UserCompanyRole.company_id == ucr.company_id,
            UserCompanyRole.role.in_(["chairman", "ceo"]),
        ).first()
        if not my_role:
            raise HTTPException(403, "권한이 없습니다")

    db.delete(ucr)
    db.commit()
    return {"ok": True}


@router.patch("/{perm_id}")
def update_permission(
    perm_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """역할 변경."""
    ucr = db.query(UserCompanyRole).filter(UserCompanyRole.id == perm_id).first()
    if not ucr:
        raise HTTPException(404, "권한을 찾을 수 없습니다")

    new_role = body.get("role")
    if new_role and new_role not in VALID_ROLES:
        raise HTTPException(400, f"유효한 역할: {', '.join(VALID_ROLES)}")

    if current_user.role != "admin":
        my_role = db.query(UserCompanyRole).filter(
            UserCompanyRole.user_id == current_user.id,
            UserCompanyRole.company_id == ucr.company_id,
            UserCompanyRole.role.in_(["chairman", "ceo"]),
        ).first()
        if not my_role:
            raise HTTPException(403, "권한이 없습니다")

    if new_role:
        ucr.role = new_role
    ucr.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ucr)
    return _fmt(ucr, db)


@router.get("/company/{company_id}")
def company_permissions(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """계열사별 권한 사용자 목록."""
    roles = db.query(UserCompanyRole).filter(
        UserCompanyRole.company_id == company_id,
    ).all()
    return [_fmt(r, db) for r in roles]


@router.get("/company/{company_id}/check")
def check_company_access(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자가 특정 계열사에 접근 가능한지 확인."""
    if current_user.role == "admin":
        return {"has_access": True, "role": "admin", "level": "full"}

    ucr = db.query(UserCompanyRole).filter(
        UserCompanyRole.user_id == current_user.id,
        UserCompanyRole.company_id == company_id,
    ).first()

    if not ucr:
        return {"has_access": False, "role": None, "level": "none"}

    level_map = {
        "chairman": "full",
        "ceo": "full",
        "manager": "write",
        "viewer": "read",
    }

    return {
        "has_access": True,
        "role": ucr.role,
        "level": level_map.get(ucr.role, "read"),
    }


@router.get("/users")
def list_users_with_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """사용자 목록 + 각 사용자의 계열사 역할 정보."""
    users = db.query(User).filter(User.is_active == True).all()
    result = []
    for u in users:
        roles = db.query(UserCompanyRole).filter(UserCompanyRole.user_id == u.id).all()
        company_roles = []
        for r in roles:
            company = db.query(Company).filter(Company.id == r.company_id).first()
            company_roles.append({
                "id": r.id,
                "company_id": r.company_id,
                "company_name": company.name if company else "Unknown",
                "role": r.role,
            })
        result.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "system_role": u.role,
            "is_active": u.is_active,
            "company_roles": company_roles,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })
    return result


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────
def _fmt(ucr: UserCompanyRole, db) -> dict:
    user = db.query(User).filter(User.id == ucr.user_id).first()
    company = db.query(Company).filter(Company.id == ucr.company_id).first()
    return {
        "id": ucr.id,
        "user_id": ucr.user_id,
        "username": user.username if user else "Unknown",
        "company_id": ucr.company_id,
        "company_name": company.name if company else "Unknown",
        "role": ucr.role,
        "granted_by": ucr.granted_by,
        "created_at": ucr.created_at.isoformat() if ucr.created_at else None,
        "updated_at": ucr.updated_at.isoformat() if ucr.updated_at else None,
    }


# ── 유틸리티 (다른 모듈에서 사용 가능) ────────────────────────────────────────
def check_permission(
    db: Session, user_id: int, company_id: int, required_level: str = "read",
) -> bool:
    """사용자가 특정 계열사에 요구 권한 이상을 가지고 있는지 확인.

    required_level: read | write | full
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    if user.role == "admin":
        return True

    ucr = db.query(UserCompanyRole).filter(
        UserCompanyRole.user_id == user_id,
        UserCompanyRole.company_id == company_id,
    ).first()
    if not ucr:
        return False

    level_hierarchy = {"read": 0, "write": 1, "full": 2}
    role_to_level = {
        "viewer": "read",
        "manager": "write",
        "ceo": "full",
        "chairman": "full",
    }

    user_level = level_hierarchy.get(role_to_level.get(ucr.role, "read"), 0)
    required = level_hierarchy.get(required_level, 0)

    return user_level >= required
