from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from core.database import get_db
from core.security import get_current_user
from models.models import ApprovalRequest, User
from schemas.schemas import ApprovalCreate, ApprovalReview, ApprovalOut

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("", response_model=List[ApprovalOut])
def list_approvals(
    status: Optional[str] = None,
    request_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(ApprovalRequest)
    if status:
        q = q.filter(ApprovalRequest.status == status)
    if request_type:
        q = q.filter(ApprovalRequest.request_type == request_type)
    return q.order_by(ApprovalRequest.created_at.desc()).all()


@router.get("/counts")
def get_approval_counts(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """pending 승인 요청을 request_type별 카운트로 반환."""
    from sqlalchemy import func
    rows = (
        db.query(ApprovalRequest.request_type, func.count(ApprovalRequest.id))
        .filter(ApprovalRequest.status == "pending")
        .group_by(ApprovalRequest.request_type)
        .all()
    )
    counts = {rtype: cnt for rtype, cnt in rows}
    total = sum(counts.values())
    return {"total": total, "by_type": counts}


@router.get("/inbox", response_model=List[ApprovalOut])
def inbox(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return (
        db.query(ApprovalRequest)
        .filter(ApprovalRequest.status == "pending")
        .order_by(ApprovalRequest.created_at.desc())
        .all()
    )


@router.post("", response_model=ApprovalOut)
def create_approval(
    approval_in: ApprovalCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    approval = ApprovalRequest(**approval_in.model_dump())
    db.add(approval)
    db.commit()
    db.refresh(approval)
    return approval


@router.get("/{approval_id}", response_model=ApprovalOut)
def get_approval(
    approval_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.id == approval_id).first()
    if not approval:
        raise HTTPException(404, "Approval not found")
    return approval


@router.post("/{approval_id}/review", response_model=ApprovalOut)
def review_approval(
    approval_id: int,
    review: ApprovalReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.id == approval_id).first()
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval.status != "pending":
        raise HTTPException(400, f"Approval already {approval.status}")

    approval.status = review.status
    approval.reviewer_note = review.reviewer_note
    approval.reviewed_by = current_user.id
    approval.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(approval)

    # 역량 승인 시 자동 활성화
    if review.status == "approved" and approval.request_type == "capability_update":
        try:
            from services.capability_analyzer import activate_capabilities
            activate_capabilities(approval.id, db)
        except Exception as e:
            print(f"[CapabilityAnalyzer] 역량 활성화 실패 (무시): {e}")

    # video_gen 승인 시 HuggingFace 영상 생성 자동 시작
    if review.status == "approved" and approval.request_type == "video_gen":
        try:
            import threading
            from routers.video_gen import _run_generation, _get_hf_token
            video_job_id = (approval.meta or {}).get("video_job_id")
            if video_job_id:
                token = _get_hf_token(db)
                if token:
                    t = threading.Thread(
                        target=_run_generation,
                        args=(video_job_id, token),
                        daemon=True,
                    )
                    t.start()
                    print(f"[video_gen] 승인 → 자동 시작: job #{video_job_id}")
                else:
                    print("[video_gen] HuggingFace 토큰 없음 — 영상 생성 스킵")
        except Exception as e:
            print(f"[video_gen] 자동 시작 실패 (무시): {e}")

    return approval


@router.delete("/{approval_id}")
def delete_approval(
    approval_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.id == approval_id).first()
    if not approval:
        raise HTTPException(404, "Not found")
    db.delete(approval)
    db.commit()
    return {"ok": True}
