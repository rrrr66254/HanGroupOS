from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import Document, Reference, AgentActivity, OrgNode, User
from schemas.schemas import DocumentCreate, DocumentOut, ReferenceCreate, ReferenceOut, AgentActivityOut

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


# ── Documents ─────────────────────────────────────────────────────────────────
@router.get("", response_model=List[DocumentOut])
def list_documents(
    company_id: Optional[int] = None,
    doc_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Document)
    if company_id is not None:
        q = q.filter(Document.company_id == company_id)
    if doc_type:
        q = q.filter(Document.doc_type == doc_type)
    if search:
        q = q.filter(
            Document.title.ilike(f"%{search}%") | Document.content.ilike(f"%{search}%")
        )
    return q.order_by(Document.created_at.desc()).all()


@router.post("", response_model=DocumentOut)
def create_document(
    doc_in: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = Document(
        title=doc_in.title,
        content=doc_in.content,
        company_id=doc_in.company_id,
        doc_type=doc_in.doc_type,
        tags=doc_in.tags,
        created_by=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@router.patch("/{doc_id}/tags")
def update_tags(
    doc_id: int,
    tags: List[str],
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.tags = tags
    doc.version += 1
    db.commit()
    return {"ok": True, "tags": tags}


@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Not found")
    db.delete(doc)
    db.commit()
    return {"ok": True}


# ── References ────────────────────────────────────────────────────────────────
@router.get("/references/graph", response_model=List[ReferenceOut])
def get_references(
    from_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Reference)
    if from_type:
        q = q.filter(Reference.from_type == from_type)
    return q.all()


@router.post("/references", response_model=ReferenceOut)
def create_reference(
    ref_in: ReferenceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    ref = Reference(**ref_in.model_dump())
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return ref


# ── Agent Activity (Live Office) ──────────────────────────────────────────────
@router.get("/agents/activity", response_model=List[AgentActivityOut])
def list_agent_activity(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(AgentActivity)
    if company_id:
        q = q.filter(AgentActivity.company_id == company_id)
    return q.order_by(AgentActivity.created_at.desc()).limit(50).all()


@router.get("/agents/live")
def live_agents(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns current org nodes as live agents for the office view."""
    import random
    from datetime import datetime

    activities = [
        "시장 데이터 분석 중",
        "전략 보고서 작성 중",
        "경쟁사 모니터링 중",
        "회의 자료 준비 중",
        "KPI 지표 검토 중",
        "팀 미팅 진행 중",
        "코드 리뷰 중",
        "마케팅 캠페인 검토 중",
        "재무 모델 업데이트 중",
        "고객 데이터 분석 중",
    ]
    statuses = ["working", "thinking", "idle", "working", "working"]

    q = db.query(OrgNode)
    if company_id:
        q = q.filter(OrgNode.company_id == company_id)
    nodes = q.limit(20).all()

    agents = []
    for node in nodes:
        agents.append({
            "id": node.id,
            "name": node.name,
            "role": node.role,
            "level": node.level,
            "company_id": node.company_id,
            "activity": random.choice(activities),
            "status": random.choice(statuses),
            "ai_provider": node.ai_provider,
            "ai_model": node.ai_model,
        })

    return {"agents": agents, "timestamp": datetime.utcnow().isoformat()}


# ── Dashboard ─────────────────────────────────────────────────────────────────
@router.get("/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from models.models import (
        Company, OrgNode, ApprovalRequest, Meeting,
        CorporateMemory, SimulationRun, StrategyItem,
    )
    return {
        "total_companies": db.query(Company).count(),
        "active_companies": db.query(Company).filter(Company.status == "active").count(),
        "total_org_nodes": db.query(OrgNode).count(),
        "pending_approvals": db.query(ApprovalRequest).filter(ApprovalRequest.status == "pending").count(),
        "open_meetings": db.query(Meeting).filter(Meeting.status == "open").count(),
        "total_memories": db.query(CorporateMemory).count(),
        "recent_simulations": db.query(SimulationRun).count(),
        "total_strategies": db.query(StrategyItem).count(),
    }
