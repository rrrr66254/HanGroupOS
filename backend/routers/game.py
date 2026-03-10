"""
게임 회사 전용 API
==================
GET  /api/game/trending              — 트렌딩 게임 검색
POST /api/game/analytics             — 특정 게임 메트릭 조회
POST /api/game/ideas/generate        — AI 게임 아이디어 생성
POST /api/game/ideas/save            — 아이디어를 GameProject로 저장
GET  /api/game/projects/{company_id} — 게임 프로젝트 목록
POST /api/game/projects              — 게임 프로젝트 신규 등록
PATCH /api/game/projects/{id}        — 프로젝트 상태/정보 업데이트
GET  /api/game/permits               — 게임 사업 필수 허가 목록
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from models.models import GameProject, User
from services.game_platform import (
    search_trending_games,
    get_game_analytics,
    generate_game_idea,
    get_required_permits,
)

router = APIRouter(prefix="/api/game", tags=["game"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class AnalyticsRequest(BaseModel):
    game_title: str
    company_id: Optional[int] = None


class IdeaGenerateRequest(BaseModel):
    company_id: int
    genre: Optional[str] = ""
    platform: Optional[str] = ""
    count: Optional[int] = 3


class IdeaSaveRequest(BaseModel):
    company_id: int
    title: str
    genre: Optional[str] = ""
    platform: Optional[str] = ""
    description: Optional[str] = ""
    game_data: Optional[dict] = {}


class ProjectCreateRequest(BaseModel):
    company_id: int
    title: str
    genre: Optional[str] = ""
    platform: Optional[str] = ""
    status: Optional[str] = "concept"
    description: Optional[str] = ""
    game_data: Optional[dict] = {}


class ProjectPatchRequest(BaseModel):
    title: Optional[str] = None
    genre: Optional[str] = None
    platform: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    game_data: Optional[dict] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/trending")
def trending(
    query: str = Query(default="", description="추가 검색어"),
    platform: str = Query(default="all", description="steam | itch | all"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """트렌딩 게임 검색 (SerpAPI 또는 Google News RSS)."""
    return search_trending_games(db=db, query=query, platform=platform)


@router.post("/analytics")
def analytics(
    req: AnalyticsRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """특정 게임의 메트릭 정보 수집."""
    return get_game_analytics(game_title=req.game_title, db=db)


@router.post("/ideas/generate")
def idea_generate(
    req: IdeaGenerateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """트렌드 기반 AI 게임 아이디어 생성."""
    # 트렌드 먼저 수집 후 아이디어 생성
    trend_result = search_trending_games(db=db, query="", platform="all")
    trends = trend_result.get("results", [])

    return generate_game_idea(
        db=db,
        trends=trends,
        genre=req.genre or "",
        platform=req.platform or "",
        count=req.count or 3,
    )


@router.post("/ideas/save")
def idea_save(
    req: IdeaSaveRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """AI 생성 아이디어를 GameProject로 저장."""
    project = GameProject(
        company_id=req.company_id,
        title=req.title,
        genre=req.genre or "",
        platform=req.platform or "",
        status="concept",
        description=req.description or "",
        idea_source="ai_generated",
        game_data=req.game_data or {},
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return {
        "id": project.id,
        "company_id": project.company_id,
        "title": project.title,
        "genre": project.genre,
        "platform": project.platform,
        "status": project.status,
        "idea_source": project.idea_source,
        "created_at": project.created_at,
    }


@router.get("/projects/{company_id}")
def list_projects(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """게임 프로젝트 목록."""
    projects = db.query(GameProject).filter(
        GameProject.company_id == company_id
    ).order_by(GameProject.created_at.desc()).all()
    return [
        {
            "id": p.id,
            "company_id": p.company_id,
            "title": p.title,
            "genre": p.genre,
            "platform": p.platform,
            "status": p.status,
            "description": p.description,
            "idea_source": p.idea_source,
            "game_data": p.game_data,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        }
        for p in projects
    ]


@router.post("/projects")
def create_project(
    req: ProjectCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """게임 프로젝트 신규 등록."""
    project = GameProject(
        company_id=req.company_id,
        title=req.title,
        genre=req.genre or "",
        platform=req.platform or "",
        status=req.status or "concept",
        description=req.description or "",
        idea_source="manual",
        game_data=req.game_data or {},
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return {
        "id": project.id,
        "company_id": project.company_id,
        "title": project.title,
        "genre": project.genre,
        "platform": project.platform,
        "status": project.status,
        "idea_source": project.idea_source,
        "created_at": project.created_at,
    }


@router.patch("/projects/{project_id}")
def update_project(
    project_id: int,
    req: ProjectPatchRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """프로젝트 상태/정보 업데이트."""
    project = db.query(GameProject).filter(GameProject.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    if req.title is not None:
        project.title = req.title
    if req.genre is not None:
        project.genre = req.genre
    if req.platform is not None:
        project.platform = req.platform
    if req.status is not None:
        project.status = req.status
    if req.description is not None:
        project.description = req.description
    if req.game_data is not None:
        project.game_data = req.game_data

    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return {
        "id": project.id,
        "title": project.title,
        "genre": project.genre,
        "platform": project.platform,
        "status": project.status,
        "updated_at": project.updated_at,
    }


@router.get("/permits")
def permits(
    country: str = Query(default="KR", description="국가 코드 (KR | US)"),
    _: User = Depends(get_current_user),
):
    """게임 사업 필수 허가 목록."""
    return {
        "country": country.upper(),
        "permits": get_required_permits(country),
    }
