from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import ModelCatalog, ModelAssignment, ProviderConfig, User
from schemas.schemas import (
    ModelCatalogOut, ModelAssignRequest,
    ModelRecommendRequest, ProviderConfigCreate, ProviderConfigOut,
)

router = APIRouter(prefix="/api/models", tags=["ai-models"])


@router.get("/catalog", response_model=List[ModelCatalogOut])
def get_catalog(
    provider: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(ModelCatalog)
    if provider:
        q = q.filter(ModelCatalog.provider == provider)
    return q.all()


@router.post("/recommend")
def recommend_model(
    req: ModelRecommendRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    role_recommendations = {
        "chairman": {
            "primary": "claude-opus-4-6",
            "fallback": "claude-haiku-4-5-20251001",
            "budget": "mock-model",
            "rationale": "회장 역할은 복잡한 전략적 판단이 필요하므로 최고 성능 모델 권장",
        },
        "ceo": {
            "primary": "claude-sonnet-4-6",
            "fallback": "gpt-4o-mini",
            "budget": "llama3.2",
            "rationale": "CEO 역할은 균형잡힌 성능과 비용이 중요",
        },
        "chief": {
            "primary": "claude-haiku-4-5-20251001",
            "fallback": "gpt-4o-mini",
            "budget": "llama3.2",
            "rationale": "Chief 레이어는 빠른 응답과 비용 효율성이 중요",
        },
        "team_lead": {
            "primary": "gpt-4o-mini",
            "fallback": "claude-haiku-4-5-20251001",
            "budget": "llama3.2",
            "rationale": "팀 리더는 반복적 작업이 많아 비용 효율적 모델 권장",
        },
        "specialist": {
            "primary": "llama3.2",
            "fallback": "gpt-4o-mini",
            "budget": "llama3.2",
            "rationale": "스페셜리스트는 특화 작업이므로 작은 모델로도 충분",
        },
    }
    rec = role_recommendations.get(req.org_role, role_recommendations["specialist"])

    if req.budget == "free":
        selected = rec["budget"]
    elif req.budget == "low":
        selected = rec["fallback"]
    else:
        selected = rec["primary"]

    return {
        "org_role": req.org_role,
        "recommended_model": selected,
        "all_options": rec,
        "rationale": rec["rationale"],
    }


@router.post("/assign")
def assign_model(
    req: ModelAssignRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    model = db.query(ModelCatalog).filter(ModelCatalog.id == req.model_catalog_id).first()
    if not model:
        raise HTTPException(404, "Model not found in catalog")

    existing = db.query(ModelAssignment).filter(
        ModelAssignment.org_role == req.org_role,
        ModelAssignment.company_id == req.company_id,
    ).first()

    if existing:
        existing.model_catalog_id = req.model_catalog_id
    else:
        assignment = ModelAssignment(
            org_role=req.org_role,
            company_id=req.company_id,
            model_catalog_id=req.model_catalog_id,
        )
        db.add(assignment)
    db.commit()
    return {"ok": True, "assigned_model": model.name}


# ── Provider Config ───────────────────────────────────────────────────────────
@router.get("/providers", response_model=List[ProviderConfigOut])
def list_providers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ProviderConfig)
        .filter(ProviderConfig.user_id == current_user.id)
        .all()
    )


@router.post("/providers", response_model=ProviderConfigOut)
def save_provider(
    config_in: ProviderConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(ProviderConfig).filter(
        ProviderConfig.user_id == current_user.id,
        ProviderConfig.provider == config_in.provider,
    ).first()

    if existing:
        existing.api_key = config_in.api_key
        existing.model_override = config_in.model_override
        existing.base_url = config_in.base_url
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing
    else:
        config = ProviderConfig(
            user_id=current_user.id,
            provider=config_in.provider,
            api_key=config_in.api_key,
            model_override=config_in.model_override,
            base_url=config_in.base_url,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
        return config


@router.delete("/providers/{config_id}")
def delete_provider(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = db.query(ProviderConfig).filter(
        ProviderConfig.id == config_id,
        ProviderConfig.user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(404, "Not found")
    db.delete(config)
    db.commit()
    return {"ok": True}


@router.get("/providers/health")
def providers_health(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    configs = (
        db.query(ProviderConfig)
        .filter(ProviderConfig.user_id == current_user.id, ProviderConfig.is_active == True)
        .all()
    )
    result = {"mock": {"status": "always_available", "model": "mock-model"}}
    for c in configs:
        result[c.provider] = {
            "status": "configured" if (c.api_key or c.provider in ("ollama", "mock")) else "no_api_key",
            "model": c.model_override or "default",
        }
    return result
