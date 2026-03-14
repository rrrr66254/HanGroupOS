"""
그룹 내부 메신저 API
====================
POST   /api/messenger/rooms                   — 채팅방 생성
GET    /api/messenger/rooms                   — 내 채팅방 목록
GET    /api/messenger/rooms/{id}              — 채팅방 상세
DELETE /api/messenger/rooms/{id}              — 채팅방 삭제
POST   /api/messenger/rooms/{id}/members      — 멤버 추가
DELETE /api/messenger/rooms/{id}/members/{uid} — 멤버 제거
GET    /api/messenger/rooms/{id}/messages     — 메시지 목록
POST   /api/messenger/rooms/{id}/messages     — 메시지 전송
"""
import os
import uuid
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import ChatRoom, ChatRoomMember, ChatRoomMessage, User, MessageReadStatus

UPLOAD_DIR = Path(__file__).parent.parent / "uploads" / "messenger"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",  # 이미지
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".pptx", ".txt", ".csv",  # 문서
    ".zip", ".tar", ".gz",  # 압축
}

router = APIRouter(prefix="/api/messenger", tags=["messenger"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class RoomCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    room_type: Optional[str] = "group"
    company_id: Optional[int] = None
    member_ids: Optional[List[int]] = []


class MessageSendRequest(BaseModel):
    content: str
    message_type: Optional[str] = "text"
    reply_to: Optional[int] = None


class MemberAddRequest(BaseModel):
    user_id: int
    role: Optional[str] = "member"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _room_to_dict(room: ChatRoom, db: Session) -> dict:
    members = db.query(ChatRoomMember).filter(ChatRoomMember.room_id == room.id).all()
    member_list = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        member_list.append({
            "user_id": m.user_id,
            "username": u.username if u else "unknown",
            "role": m.role,
            "joined_at": str(m.joined_at),
        })
    last_msg = db.query(ChatRoomMessage).filter(
        ChatRoomMessage.room_id == room.id
    ).order_by(ChatRoomMessage.created_at.desc()).first()

    return {
        "id": room.id,
        "name": room.name,
        "description": room.description,
        "room_type": room.room_type,
        "company_id": room.company_id,
        "created_by": room.created_by,
        "is_active": room.is_active,
        "member_count": len(member_list),
        "members": member_list,
        "last_message": {
            "content": last_msg.content[:100] if last_msg else None,
            "user_id": last_msg.user_id if last_msg else None,
            "created_at": str(last_msg.created_at) if last_msg else None,
        } if last_msg else None,
        "created_at": str(room.created_at),
        "updated_at": str(room.updated_at),
    }


def _check_membership(db: Session, room_id: int, user_id: int) -> ChatRoomMember:
    member = db.query(ChatRoomMember).filter(
        ChatRoomMember.room_id == room_id,
        ChatRoomMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(403, "채팅방 멤버가 아닙니다.")
    return member


# ── Room Endpoints ─────────────────────────────────────────────────────────────

@router.post("/rooms")
def create_room(
    req: RoomCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """채팅방 생성 — 생성자는 자동으로 admin 멤버."""
    room = ChatRoom(
        name=req.name,
        description=req.description or "",
        room_type=req.room_type or "group",
        company_id=req.company_id,
        created_by=user.id,
    )
    db.add(room)
    db.flush()

    # 생성자를 admin으로 추가
    db.add(ChatRoomMember(room_id=room.id, user_id=user.id, role="admin"))

    # 추가 멤버
    for uid in (req.member_ids or []):
        if uid != user.id:
            db.add(ChatRoomMember(room_id=room.id, user_id=uid, role="member"))

    # 시스템 메시지
    db.add(ChatRoomMessage(
        room_id=room.id,
        user_id=user.id,
        content=f"{user.username}님이 채팅방을 만들었습니다.",
        message_type="system",
    ))

    db.commit()
    db.refresh(room)
    return _room_to_dict(room, db)


@router.get("/rooms")
def list_rooms(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """내가 속한 채팅방 목록."""
    my_memberships = db.query(ChatRoomMember).filter(
        ChatRoomMember.user_id == user.id
    ).all()
    room_ids = [m.room_id for m in my_memberships]

    rooms = db.query(ChatRoom).filter(
        ChatRoom.id.in_(room_ids),
        ChatRoom.is_active == True,
    ).order_by(ChatRoom.updated_at.desc()).all()

    return [_room_to_dict(r, db) for r in rooms]


@router.get("/rooms/{room_id}")
def get_room(
    room_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """채팅방 상세."""
    _check_membership(db, room_id, user.id)
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "채팅방을 찾을 수 없습니다.")
    return _room_to_dict(room, db)


@router.delete("/rooms/{room_id}")
def delete_room(
    room_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """채팅방 삭제 (admin만 가능)."""
    member = _check_membership(db, room_id, user.id)
    if member.role != "admin":
        raise HTTPException(403, "관리자만 채팅방을 삭제할 수 있습니다.")
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(404, "채팅방을 찾을 수 없습니다.")
    room.is_active = False
    room.updated_at = datetime.utcnow()
    db.commit()
    return {"id": room_id, "status": "deleted"}


# ── Member Endpoints ───────────────────────────────────────────────────────────

@router.post("/rooms/{room_id}/members")
def add_member(
    room_id: int,
    req: MemberAddRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """멤버 추가."""
    _check_membership(db, room_id, user.id)
    # 이미 멤버인지 확인
    exists = db.query(ChatRoomMember).filter(
        ChatRoomMember.room_id == room_id,
        ChatRoomMember.user_id == req.user_id,
    ).first()
    if exists:
        raise HTTPException(409, "이미 채팅방 멤버입니다.")

    new_member = ChatRoomMember(
        room_id=room_id,
        user_id=req.user_id,
        role=req.role or "member",
    )
    db.add(new_member)

    target_user = db.query(User).filter(User.id == req.user_id).first()
    target_name = target_user.username if target_user else f"User#{req.user_id}"
    db.add(ChatRoomMessage(
        room_id=room_id,
        user_id=user.id,
        content=f"{target_name}님이 초대되었습니다.",
        message_type="system",
    ))

    db.commit()
    return {"room_id": room_id, "user_id": req.user_id, "status": "added"}


@router.delete("/rooms/{room_id}/members/{user_id}")
def remove_member(
    room_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """멤버 제거 (admin 또는 본인 나가기)."""
    my_member = _check_membership(db, room_id, user.id)
    if user_id != user.id and my_member.role != "admin":
        raise HTTPException(403, "관리자만 다른 멤버를 제거할 수 있습니다.")

    target = db.query(ChatRoomMember).filter(
        ChatRoomMember.room_id == room_id,
        ChatRoomMember.user_id == user_id,
    ).first()
    if not target:
        raise HTTPException(404, "멤버를 찾을 수 없습니다.")

    db.delete(target)
    target_user = db.query(User).filter(User.id == user_id).first()
    target_name = target_user.username if target_user else f"User#{user_id}"
    db.add(ChatRoomMessage(
        room_id=room_id,
        user_id=user.id,
        content=f"{target_name}님이 채팅방을 나갔습니다.",
        message_type="system",
    ))
    db.commit()
    return {"room_id": room_id, "user_id": user_id, "status": "removed"}


# ── Message Endpoints ──────────────────────────────────────────────────────────

@router.get("/rooms/{room_id}/messages")
def list_messages(
    room_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    before_id: Optional[int] = Query(default=None, description="이 ID 이전 메시지"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """메시지 목록 (최신순, 페이지네이션)."""
    _check_membership(db, room_id, user.id)

    query = db.query(ChatRoomMessage).filter(ChatRoomMessage.room_id == room_id)
    if before_id:
        query = query.filter(ChatRoomMessage.id < before_id)
    messages = query.order_by(ChatRoomMessage.created_at.desc()).limit(limit).all()

    # 사용자 이름 캐시
    user_cache = {}
    result = []
    for m in reversed(messages):
        if m.user_id not in user_cache:
            u = db.query(User).filter(User.id == m.user_id).first()
            user_cache[m.user_id] = u.username if u else f"User#{m.user_id}"
        result.append({
            "id": m.id,
            "room_id": m.room_id,
            "user_id": m.user_id,
            "username": user_cache[m.user_id],
            "content": m.content,
            "message_type": m.message_type,
            "reply_to": m.reply_to,
            "is_edited": m.is_edited,
            "created_at": str(m.created_at),
        })

    return {"room_id": room_id, "count": len(result), "messages": result}


@router.post("/rooms/{room_id}/messages")
def send_message(
    room_id: int,
    req: MessageSendRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """메시지 전송."""
    _check_membership(db, room_id, user.id)

    room = db.query(ChatRoom).filter(ChatRoom.id == room_id, ChatRoom.is_active == True).first()
    if not room:
        raise HTTPException(404, "채팅방을 찾을 수 없습니다.")

    msg = ChatRoomMessage(
        room_id=room_id,
        user_id=user.id,
        content=req.content,
        message_type=req.message_type or "text",
        reply_to=req.reply_to,
    )
    db.add(msg)
    room.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)

    # WebSocket으로 실시간 알림 (채팅방 멤버들에게)
    _notify_room_members(db, room_id, user, msg)

    return {
        "id": msg.id,
        "room_id": msg.room_id,
        "user_id": msg.user_id,
        "username": user.username,
        "content": msg.content,
        "message_type": msg.message_type,
        "reply_to": msg.reply_to,
        "created_at": str(msg.created_at),
    }


# ── Users list for invite ─────────────────────────────────────────────────────

@router.get("/users")
def list_users_for_invite(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """초대 가능한 사용자 목록."""
    users = db.query(User).filter(User.is_active == True).all()
    return [{"id": u.id, "username": u.username, "role": u.role} for u in users]


# ── Internal ───────────────────────────────────────────────────────────────────

# ── File Upload ─────────────────────────────────────────────────────────────

@router.post("/rooms/{room_id}/upload")
def upload_file(
    room_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """파일 업로드 → 자동으로 file 타입 메시지 전송."""
    _check_membership(db, room_id, user.id)

    room = db.query(ChatRoom).filter(ChatRoom.id == room_id, ChatRoom.is_active == True).first()
    if not room:
        raise HTTPException(404, "채팅방을 찾을 수 없습니다.")

    # 확장자 검증
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"허용되지 않는 파일 형식입니다: {ext}")

    # 크기 검증
    content = file.file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"파일 크기가 10MB를 초과합니다.")
    file.file.seek(0)

    # 저장
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(content)

    # 이미지인지 판별
    is_image = ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
    file_url = f"/api/messenger/files/{unique_name}"

    # 파일 메시지 생성
    msg = ChatRoomMessage(
        room_id=room_id,
        user_id=user.id,
        content=f"[file:{file.filename}]({file_url})",
        message_type="file",
    )
    db.add(msg)
    room.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)

    _notify_room_members(db, room_id, user, msg)

    return {
        "id": msg.id,
        "room_id": msg.room_id,
        "user_id": msg.user_id,
        "username": user.username,
        "content": msg.content,
        "message_type": "file",
        "file_url": file_url,
        "file_name": file.filename,
        "file_size": len(content),
        "is_image": is_image,
        "created_at": str(msg.created_at),
    }


@router.get("/files/{filename}")
def serve_file(filename: str):
    """업로드된 파일 서빙."""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return FileResponse(file_path)


# ── Read Receipt Endpoints ────────────────────────────────────────────────────

@router.post("/rooms/{room_id}/read")
def mark_read(
    room_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """현재 방의 마지막 메시지까지 읽음 처리."""
    _check_membership(db, room_id, user.id)

    last_msg = db.query(ChatRoomMessage).filter(
        ChatRoomMessage.room_id == room_id
    ).order_by(ChatRoomMessage.created_at.desc()).first()

    if not last_msg:
        return {"ok": True}

    status = db.query(MessageReadStatus).filter(
        MessageReadStatus.room_id == room_id,
        MessageReadStatus.user_id == user.id,
    ).first()

    if status:
        status.last_read_message_id = last_msg.id
        status.last_read_at = datetime.utcnow()
    else:
        status = MessageReadStatus(
            room_id=room_id,
            user_id=user.id,
            last_read_message_id=last_msg.id,
        )
        db.add(status)

    db.commit()

    # 읽음 상태를 다른 멤버에게 브로드캐스트
    try:
        from routers.notifications import manager as notif_manager
        members = db.query(ChatRoomMember).filter(
            ChatRoomMember.room_id == room_id,
            ChatRoomMember.user_id != user.id,
        ).all()
        for m in members:
            notif_manager.broadcast_messenger_sync(m.user_id, {
                "type": "messenger_read",
                "room_id": room_id,
                "user_id": user.id,
                "last_read_message_id": last_msg.id,
            })
    except Exception:
        pass

    return {"ok": True, "last_read_message_id": last_msg.id}


@router.get("/rooms/{room_id}/read-status")
def get_read_status(
    room_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """방 멤버별 마지막 읽은 메시지 ID 조회."""
    _check_membership(db, room_id, user.id)

    statuses = db.query(MessageReadStatus).filter(
        MessageReadStatus.room_id == room_id
    ).all()

    user_cache = {}
    result = []
    for s in statuses:
        if s.user_id not in user_cache:
            u = db.query(User).filter(User.id == s.user_id).first()
            user_cache[s.user_id] = u.username if u else f"User#{s.user_id}"
        result.append({
            "user_id": s.user_id,
            "username": user_cache[s.user_id],
            "last_read_message_id": s.last_read_message_id,
            "last_read_at": str(s.last_read_at) if s.last_read_at else None,
        })

    return result


def _notify_room_members(db: Session, room_id: int, sender: User, msg: ChatRoomMessage):
    """채팅방 멤버들에게 WebSocket 실시간 메시지 브로드캐스트."""
    try:
        from routers.notifications import manager as notif_manager
        members = db.query(ChatRoomMember).filter(
            ChatRoomMember.room_id == room_id,
            ChatRoomMember.user_id != sender.id,
        ).all()
        for m in members:
            notif_manager.broadcast_messenger_sync(m.user_id, {
                "room_id": room_id,
                "message_id": msg.id,
                "user_id": sender.id,
                "username": sender.username,
                "content": msg.content,
                "message_type": msg.message_type,
                "reply_to": msg.reply_to,
                "created_at": str(msg.created_at),
            })
    except Exception:
        pass  # 알림 실패해도 메시지 전송은 성공
