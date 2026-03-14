"""
알림 시스템 라우터 — DB 영속화 + WebSocket 실시간 푸시 (통합 허브)
GET  /api/notifications          — 내 알림 목록
POST /api/notifications/read/{id} — 읽음 처리
POST /api/notifications/read-all  — 전체 읽음
GET  /api/notifications/unread-count — 미읽음 수
DELETE /api/notifications/{id}   — 삭제
WS   /ws/notifications?token=    — 실시간 푸시 (통합: 알림/배지/메신저/터미널/GPU)
"""
import asyncio
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import Notification, User


# ── WebSocket 통합 연결 관리자 ────────────────────────────────────────────────

class ConnectionManager:
    """
    통합 WebSocket 허브.
    이벤트 타입: unread_count, badge_update, messenger_message,
                terminal_update, provider_status, gpu_status
    """
    def __init__(self):
        self.connections: Dict[int, List[WebSocket]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: int, ws: WebSocket):
        conns = self.connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)

    def get_connected_user_ids(self) -> List[int]:
        """현재 연결된 사용자 ID 목록."""
        return [uid for uid, conns in self.connections.items() if conns]

    async def broadcast_to(self, user_id: int, data: dict):
        dead = []
        for ws in list(self.connections.get(user_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast_all(self, data: dict):
        for uid in list(self.connections.keys()):
            await self.broadcast_to(uid, data)

    def notify_sync(self, user_id: Optional[int], data: dict):
        """동기 컨텍스트(백그라운드 스레드)에서 WebSocket 브로드캐스트."""
        if not self._loop or self._loop.is_closed():
            return
        try:
            if user_id:
                asyncio.run_coroutine_threadsafe(self.broadcast_to(user_id, data), self._loop)
            else:
                asyncio.run_coroutine_threadsafe(self.broadcast_all(data), self._loop)
        except Exception:
            pass

    def broadcast_badge_sync(self, user_id: int, approvals: int, terminals: int):
        """사이드바 배지 카운트 업데이트 브로드캐스트 (동기)."""
        self.notify_sync(user_id, {
            "type": "badge_update",
            "approvals": approvals,
            "terminals": terminals,
        })

    def broadcast_terminal_sync(self, user_id: int, request_data: dict):
        """터미널 요청 상태 변경 브로드캐스트 (동기)."""
        self.notify_sync(user_id, {
            "type": "terminal_update",
            **request_data,
        })

    def broadcast_provider_sync(self, data: dict):
        """AI 프로바이더 상태 변경 브로드캐스트 (동기, 전체)."""
        self.notify_sync(None, {
            "type": "provider_status",
            **data,
        })

    def broadcast_messenger_sync(self, user_id: int, message_data: dict):
        """메신저 메시지 브로드캐스트 (동기)."""
        self.notify_sync(user_id, {
            "type": "messenger_message",
            **message_data,
        })


manager = ConnectionManager()

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    limit: int = 50,
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """내 알림 목록 (user_id 일치 또는 전체 공지)."""
    q = db.query(Notification).filter(
        (Notification.user_id == current_user.id) | (Notification.user_id == None)
    )
    if unread_only:
        q = q.filter(Notification.is_read == False)
    notifs = q.order_by(Notification.created_at.desc()).limit(limit).all()
    return [_fmt(n) for n in notifs]


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cnt = db.query(Notification).filter(
        (Notification.user_id == current_user.id) | (Notification.user_id == None),
        Notification.is_read == False,
    ).count()
    return {"count": cnt}


@router.post("/read/{notif_id}")
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = db.query(Notification).filter(Notification.id == notif_id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        (Notification.user_id == current_user.id) | (Notification.user_id == None),
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


@router.delete("/{notif_id}")
def delete_notification(
    notif_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    n = db.query(Notification).filter(Notification.id == notif_id).first()
    if n:
        db.delete(n)
        db.commit()
    return {"ok": True}


def _fmt(n: Notification) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "notif_type": n.notif_type,
        "icon": n.icon,
        "company_id": n.company_id,
        "link": n.link,
        "is_read": n.is_read,
        "meta": n.meta,
        "created_at": n.created_at.isoformat(),
    }


def create_notification(
    db,
    title: str,
    body: str = "",
    notif_type: str = "info",
    icon: str = "🔔",
    company_id: Optional[int] = None,
    link: str = "",
    user_id: Optional[int] = None,
    meta: dict = None,
):
    """다른 모듈에서 알림을 생성하는 헬퍼. 생성 후 WebSocket으로 즉시 푸시."""
    n = Notification(
        user_id=user_id,
        title=title,
        body=body,
        notif_type=notif_type,
        icon=icon,
        company_id=company_id,
        link=link,
        meta=meta or {},
    )
    db.add(n)
    db.commit()

    # 미읽음 수 계산 후 WebSocket 브로드캐스트
    try:
        q = db.query(Notification).filter(Notification.is_read == False)
        if user_id:
            q = q.filter((Notification.user_id == user_id) | (Notification.user_id == None))
        cnt = q.count()
        manager.notify_sync(user_id, {"type": "unread_count", "count": cnt})
    except Exception:
        pass

    return n
