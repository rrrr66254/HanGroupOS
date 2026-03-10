"""
역량 관리 API
=============
GET  /api/capabilities/company/{company_id}   — 회사 역량 목록
GET  /api/capabilities/analyze/{company_id}   — AI 역량 분석 (결과 미저장)
POST /api/capabilities/request/{company_id}   — 역량 승인 요청 생성
POST /api/capabilities/{capability_id}/activate — 수동 활성화 (admin)
GET  /api/capabilities/pending                — 승인 대기 중인 역량 목록
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import CompanyCapability, Company, User
from services.capability_analyzer import (
    analyze_and_request_capabilities,
    activate_capabilities,
    INDUSTRY_CAPABILITIES,
    CAPABILITY_META,
    _match_industry,
)

router = APIRouter(prefix="/api/capabilities", tags=["capabilities"])


@router.get("/company/{company_id}")
def get_company_capabilities(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """회사의 역량 목록 반환."""
    caps = db.query(CompanyCapability).filter(
        CompanyCapability.company_id == company_id
    ).all()
    return [
        {
            "id": c.id,
            "company_id": c.company_id,
            "capability_type": c.capability_type,
            "name": CAPABILITY_META.get(c.capability_type, {}).get("name", c.capability_type),
            "description": CAPABILITY_META.get(c.capability_type, {}).get("description", ""),
            "status": c.status,
            "config": c.config,
            "approval_id": c.approval_id,
            "activated_at": c.activated_at,
            "created_at": c.created_at,
        }
        for c in caps
    ]


@router.get("/pending")
def get_pending_capabilities(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """승인 대기 중인 역량 목록."""
    caps = db.query(CompanyCapability).filter(
        CompanyCapability.status == "pending"
    ).all()
    return [
        {
            "id": c.id,
            "company_id": c.company_id,
            "capability_type": c.capability_type,
            "name": CAPABILITY_META.get(c.capability_type, {}).get("name", c.capability_type),
            "status": c.status,
            "approval_id": c.approval_id,
            "created_at": c.created_at,
        }
        for c in caps
    ]


@router.get("/analyze/{company_id}")
def analyze_company(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """AI 역량 분석 실행 — 결과를 DB에 저장하지 않고 미리보기만 반환."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    search_text = f"{company.industry} {company.vision or ''} {company.description or ''}"
    industry_key = _match_industry(search_text)
    cap_types = INDUSTRY_CAPABILITIES.get(industry_key, INDUSTRY_CAPABILITIES["general"])

    caps_preview = []
    for cap_type in cap_types:
        meta = CAPABILITY_META.get(cap_type, {})
        caps_preview.append({
            "capability_type": cap_type,
            "name": meta.get("name", cap_type),
            "description": meta.get("description", ""),
            "required_permits": meta.get("required_permits", []),
            "required_apis": meta.get("required_apis", []),
        })

    return {
        "company_id": company_id,
        "company_name": company.name,
        "industry": company.industry,
        "detected_industry_key": industry_key,
        "recommended_capabilities": caps_preview,
    }


@router.post("/request/{company_id}")
def request_capabilities(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """역량 승인 요청 생성 (이미 존재하면 에러)."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    existing = db.query(CompanyCapability).filter(
        CompanyCapability.company_id == company_id
    ).first()
    if existing:
        raise HTTPException(400, "이미 역량 요청이 존재합니다. 기존 요청을 확인하세요.")

    approval = analyze_and_request_capabilities(company_id, db)
    if not approval:
        raise HTTPException(500, "역량 분석 실패")

    return {
        "ok": True,
        "approval_id": approval.id,
        "message": f"역량 승인 요청 #{approval.id} 생성됨. 회장 승인 후 활성화됩니다.",
    }


@router.post("/{capability_id}/activate")
def activate_capability(
    capability_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """수동 역량 활성화 (admin 전용)."""
    if current_user.role != "admin":
        raise HTTPException(403, "Admin only")

    cap = db.query(CompanyCapability).filter(CompanyCapability.id == capability_id).first()
    if not cap:
        raise HTTPException(404, "Capability not found")

    cap.status = "active"
    cap.activated_at = datetime.utcnow()
    db.commit()
    db.refresh(cap)

    return {
        "id": cap.id,
        "capability_type": cap.capability_type,
        "status": cap.status,
        "activated_at": cap.activated_at,
    }
