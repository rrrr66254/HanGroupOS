"""대시보드 위젯 레이아웃 커스터마이징 API."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from models.models import DashboardLayout

router = APIRouter(prefix="/api/dashboard-layout", tags=["dashboard-layout"])

# 기본 위젯 목록
DEFAULT_WIDGETS = [
    {"widget_id": "stat_companies", "label": "계열사 수", "x": 0, "y": 0, "w": 1, "h": 1, "visible": True},
    {"widget_id": "stat_agents", "label": "AI 에이전트", "x": 1, "y": 0, "w": 1, "h": 1, "visible": True},
    {"widget_id": "stat_approvals", "label": "승인 대기", "x": 2, "y": 0, "w": 1, "h": 1, "visible": True},
    {"widget_id": "stat_memory", "label": "기업 메모리", "x": 3, "y": 0, "w": 1, "h": 1, "visible": True},
    {"widget_id": "health_scores", "label": "계열사 건강도", "x": 0, "y": 1, "w": 2, "h": 2, "visible": True},
    {"widget_id": "recent_approvals", "label": "최근 승인 요청", "x": 2, "y": 1, "w": 2, "h": 2, "visible": True},
    {"widget_id": "gpu_status", "label": "GPU 상태", "x": 0, "y": 3, "w": 2, "h": 1, "visible": True},
    {"widget_id": "ai_fallback", "label": "AI 폴백 로그", "x": 2, "y": 3, "w": 2, "h": 1, "visible": True},
    {"widget_id": "kpi_scoreboard", "label": "KPI 스코어보드", "x": 0, "y": 4, "w": 2, "h": 2, "visible": False},
    {"widget_id": "cost_summary", "label": "비용 요약", "x": 2, "y": 4, "w": 2, "h": 1, "visible": False},
    {"widget_id": "synergy_opportunities", "label": "시너지 기회", "x": 0, "y": 6, "w": 4, "h": 1, "visible": False},
]


class LayoutUpdate(BaseModel):
    layout: List[dict]


@router.get("")
def get_layout(user_id: int = 1, db: Session = Depends(get_db)):
    """사용자의 대시보드 레이아웃 조회."""
    row = db.query(DashboardLayout).filter(DashboardLayout.user_id == user_id).first()
    if row and row.layout:
        return {"layout": row.layout, "is_custom": True}
    return {"layout": DEFAULT_WIDGETS, "is_custom": False}


@router.put("")
def save_layout(req: LayoutUpdate, user_id: int = 1, db: Session = Depends(get_db)):
    """대시보드 레이아웃 저장."""
    row = db.query(DashboardLayout).filter(DashboardLayout.user_id == user_id).first()
    if row:
        row.layout = req.layout
    else:
        row = DashboardLayout(user_id=user_id, layout=req.layout)
        db.add(row)
    db.commit()
    return {"status": "ok"}


@router.delete("")
def reset_layout(user_id: int = 1, db: Session = Depends(get_db)):
    """레이아웃 초기화 (기본값으로)."""
    row = db.query(DashboardLayout).filter(DashboardLayout.user_id == user_id).first()
    if row:
        db.delete(row)
        db.commit()
    return {"status": "ok", "layout": DEFAULT_WIDGETS}


@router.get("/widgets")
def list_widgets():
    """사용 가능한 위젯 목록."""
    return {"widgets": DEFAULT_WIDGETS}
