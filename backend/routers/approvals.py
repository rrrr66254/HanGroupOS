from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json
import re
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

    # WebSocket으로 배지 카운트 업데이트 브로드캐스트
    try:
        from routers.notifications import manager as notif_manager
        from models.models import TerminalRequest
        pending_approvals = db.query(ApprovalRequest).filter(ApprovalRequest.status == "pending").count()
        pending_terminals = db.query(TerminalRequest).filter(TerminalRequest.status == "pending").count()
        notif_manager.notify_sync(None, {
            "type": "badge_update",
            "approvals": pending_approvals,
            "terminals": pending_terminals,
        })
    except Exception:
        pass

    # 역량 승인 시 자동 활성화
    if review.status == "approved" and approval.request_type == "capability_update":
        try:
            from services.capability_analyzer import activate_capabilities
            activate_capabilities(approval.id, db)
        except Exception as e:
            print(f"[CapabilityAnalyzer] 역량 활성화 실패 (무시): {e}")

    # video_gen 승인 시 provider에 따라 자동 영상 생성 시작
    if review.status == "approved" and approval.request_type == "video_gen":
        try:
            from routers.video_gen import _start_video_job
            video_job_id = (approval.meta or {}).get("video_job_id")
            if video_job_id:
                started = _start_video_job(video_job_id, db)
                print(f"[video_gen] 승인 → 자동 시작 {'성공' if started else '실패(API 키 없음)'}: job #{video_job_id}")
        except Exception as e:
            print(f"[video_gen] 자동 시작 실패 (무시): {e}")

    return approval


@router.post("/{approval_id}/ai-review")
def ai_review_approval(
    approval_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """AI가 결재 요청을 사전 분석하여 위험도·권고사항을 반환하고 meta에 저장."""
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.id == approval_id).first()
    if not approval:
        raise HTTPException(404, "Approval not found")

    from services.ai_provider import get_provider_from_db, AIProvider
    try:
        ai = get_provider_from_db(db)
    except Exception:
        ai = AIProvider()

    TYPE_LABELS_KO = {
        "company_create": "계열사 설립",
        "org_change": "조직 변경",
        "strategy": "전략 결정",
        "capability_update": "역량 활성화",
        "video_gen": "영상 생성",
        "general": "일반",
    }
    type_label = TYPE_LABELS_KO.get(approval.request_type, approval.request_type)

    meta_str = ""
    if approval.meta:
        try:
            meta_str = f"\n추가 정보: {json.dumps(approval.meta, ensure_ascii=False, default=str)}"
        except Exception:
            pass

    prompt = f"""다음 결재 요청을 분석하여 아래 JSON 형식으로만 응답하세요.

결재 요청:
- 유형: {type_label}
- 제목: {approval.title}
- 요청자: {approval.requester}
- 내용: {approval.description or '내용 없음'}{meta_str}

JSON 형식으로만 응답하세요:
{{"risk_level": "low|medium|high", "risk_factors": ["위험요소1"], "recommendation": "approve|reject|review", "recommendation_reason": "권고 이유 (2문장)", "key_points": ["핵심포인트1", "핵심포인트2"], "questions": ["확인필요사항1"]}}"""

    response = ai.chat(
        messages=[{"role": "user", "content": prompt}],
        system="기업 결재 위험 분석 전문가입니다. 반드시 JSON 형식으로만 응답합니다.",
        max_tokens=600,
    )

    review_data: dict = {}
    try:
        jm = re.search(r'\{[\s\S]*\}', response)
        if jm:
            review_data = json.loads(jm.group())
        else:
            review_data = {"error": "AI 응답 파싱 실패", "raw": response[:300]}
    except Exception:
        review_data = {"error": "AI 응답 파싱 실패", "raw": response[:300]}

    # meta에 저장
    meta = dict(approval.meta or {})
    meta["ai_review"] = {**review_data, "reviewed_at": datetime.utcnow().isoformat()}
    approval.meta = meta
    db.commit()

    return review_data


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
