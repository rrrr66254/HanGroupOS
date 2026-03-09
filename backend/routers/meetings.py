from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import Meeting, MeetingMessage, User
from schemas.schemas import MeetingCreate, MeetingOut, MeetingMessageCreate, MeetingMessageOut
from services.ai_provider import get_provider_from_db

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.get("", response_model=List[MeetingOut])
def list_meetings(
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Meeting)
    if company_id:
        q = q.filter(Meeting.company_id == company_id)
    if status:
        q = q.filter(Meeting.status == status)
    return q.order_by(Meeting.created_at.desc()).all()


@router.post("", response_model=MeetingOut)
def create_meeting(
    meeting_in: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = Meeting(
        company_id=meeting_in.company_id,
        title=meeting_in.title,
        description=meeting_in.description,
        tags=meeting_in.tags,
        created_by=current_user.id,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    return meeting


@router.get("/{meeting_id}/messages", response_model=List[MeetingMessageOut])
def get_messages(
    meeting_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(MeetingMessage)
        .filter(MeetingMessage.meeting_id == meeting_id)
        .order_by(MeetingMessage.created_at)
        .all()
    )


@router.post("/{meeting_id}/messages", response_model=MeetingMessageOut)
def add_message(
    meeting_id: int,
    msg_in: MeetingMessageCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    msg = MeetingMessage(
        meeting_id=meeting_id,
        sender=msg_in.sender,
        sender_role=msg_in.sender_role,
        content=msg_in.content,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.post("/{meeting_id}/ai-response", response_model=MeetingMessageOut)
def ai_response(
    meeting_id: int,
    responder_role: str = "AI 분석가",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ask AI to generate the next meeting response."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    history = (
        db.query(MeetingMessage)
        .filter(MeetingMessage.meeting_id == meeting_id)
        .order_by(MeetingMessage.created_at)
        .all()
    )
    messages = [{"role": "user", "content": f"[{m.sender}({m.sender_role})]: {m.content}"} for m in history]
    if not messages:
        messages = [{"role": "user", "content": f"회의 주제: {meeting.title}. 회의를 시작해 주세요."}]

    provider = get_provider_from_db(db, current_user.id)
    system = f"""당신은 {responder_role}입니다. 회의 내용을 분석하고 전문적인 의견을 제시하세요.
회의 제목: {meeting.title}
회의 설명: {meeting.description}"""
    ai_reply = provider.chat(messages, system=system, session_type="general")

    msg = MeetingMessage(
        meeting_id=meeting_id,
        sender=responder_role,
        sender_role="AI",
        content=ai_reply,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.post("/{meeting_id}/close")
def close_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    meeting.status = "closed"
    db.commit()
    return {"ok": True}


@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Not found")
    db.query(MeetingMessage).filter(MeetingMessage.meeting_id == meeting_id).delete()
    db.delete(meeting)
    db.commit()
    return {"ok": True}


# ── AI 회의록 자동 정리 + 액션 아이템 추출 ────────────────────────────────────
@router.post("/{meeting_id}/summarize")
def summarize_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI가 회의 전체 내용을 요약하고 참가자별 액션 아이템을 추출합니다."""
    from models.models import ApprovalRequest
    import json, re

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    history = (
        db.query(MeetingMessage)
        .filter(MeetingMessage.meeting_id == meeting_id)
        .order_by(MeetingMessage.created_at)
        .all()
    )
    if not history:
        raise HTTPException(400, "회의 내용이 없습니다.")

    transcript = "\n".join(
        f"[{m.sender}({m.sender_role})]: {m.content}" for m in history
    )

    prompt = f"""다음 회의록을 분석하여 JSON으로 반환하세요.
회의 제목: {meeting.title}
회의 설명: {meeting.description or ''}

=== 회의 내용 ===
{transcript}

=== 출력 형식 ===
{{
  "summary": "회의 전체 요약 (3-5문장)",
  "key_decisions": ["결정 사항 1", "결정 사항 2"],
  "action_items": [
    {{
      "assignee": "담당자 이름",
      "task": "액션 아이템 내용",
      "priority": "high|medium|low"
    }}
  ],
  "next_steps": "다음 단계 제안"
}}"""

    provider = get_provider_from_db(db, current_user.id)
    raw = provider.chat(
        [{"role": "user", "content": prompt}],
        system="당신은 회의록 분석 전문가입니다. 반드시 JSON만 반환하세요.",
        session_type="general",
    )

    default = {
        "summary": f"'{meeting.title}' 회의가 진행되었습니다. AI 분석에 실패했습니다.",
        "key_decisions": [],
        "action_items": [],
        "next_steps": "추가 논의 필요",
    }
    try:
        m = re.search(r"\{[\s\S]*\}", raw)
        result = json.loads(m.group()) if m else default
    except Exception:
        result = default

    # 액션 아이템을 승인함에 자동 등록
    created_approvals = []
    for item in result.get("action_items", []):
        approval = ApprovalRequest(
            title=f"[회의 액션] {item.get('task', '')}",
            description=f"회의 '{meeting.title}'에서 추출된 액션 아이템\n담당: {item.get('assignee', '미정')}",
            request_type="meeting_action",
            requester="AI 회의록 시스템",
            company_id=meeting.company_id,
            meta={
                "meeting_id": meeting_id,
                "meeting_title": meeting.title,
                "assignee": item.get("assignee"),
                "priority": item.get("priority", "medium"),
                "from_summary": True,
            },
        )
        db.add(approval)
        db.flush()
        created_approvals.append({"task": item.get("task"), "assignee": item.get("assignee")})

    db.commit()
    return {**result, "approvals_created": len(created_approvals)}
