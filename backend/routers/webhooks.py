"""
외부 웹훅 수신 API
Slack, Zapier 등 외부 시스템에서 데이터 수집을 트리거할 수 있습니다.
"""
import secrets
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.models import WebhookToken, CollectedData, ExternalApiKey, User

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


class TokenCreateRequest(BaseModel):
    name: str
    source: str = "custom"           # slack | zapier | custom
    trigger_source: str = "hackernews"  # hackernews | worldbank | reddit | custom


# ── 토큰 관리 (인증 필요) ──────────────────────────────────────────────────────

@router.get("/tokens", summary="웹훅 토큰 목록")
def list_tokens(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tokens = db.query(WebhookToken).order_by(WebhookToken.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "token": t.token[:8] + "••••••••",  # 앞 8자만 노출
            "source": t.source,
            "trigger_source": t.trigger_source,
            "is_active": t.is_active,
            "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tokens
    ]


@router.post("/tokens", summary="웹훅 토큰 생성")
def create_token(
    req: TokenCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    token_value = secrets.token_hex(32)  # 64자 hex 토큰
    token = WebhookToken(
        name=req.name,
        token=token_value,
        source=req.source,
        trigger_source=req.trigger_source,
        is_active=True,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return {
        "id": token.id,
        "name": token.name,
        "token": token_value,  # 최초 생성 시만 전체 값 반환
        "source": token.source,
        "trigger_source": token.trigger_source,
        "created_at": token.created_at.isoformat() if token.created_at else None,
    }


@router.patch("/tokens/{token_id}/toggle", summary="웹훅 토큰 활성화/비활성화")
def toggle_token(
    token_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    token = db.query(WebhookToken).filter(WebhookToken.id == token_id).first()
    if not token:
        raise HTTPException(404, "토큰을 찾을 수 없습니다.")
    token.is_active = not token.is_active
    db.commit()
    return {"id": token.id, "is_active": token.is_active}


@router.delete("/tokens/{token_id}", summary="웹훅 토큰 삭제")
def delete_token(
    token_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    token = db.query(WebhookToken).filter(WebhookToken.id == token_id).first()
    if not token:
        raise HTTPException(404, "토큰을 찾을 수 없습니다.")
    db.delete(token)
    db.commit()
    return {"ok": True}


# ── 웹훅 수신 엔드포인트 (토큰 인증) ──────────────────────────────────────────

class WebhookCollectRequest(BaseModel):
    data_type: Optional[str] = None      # 커스텀 데이터 유형 (선택)
    title: Optional[str] = None
    content: Optional[str] = None
    company_id: Optional[int] = None


@router.post("/collect", summary="외부 웹훅 수집 트리거 (토큰 인증)")
def webhook_collect(
    req: WebhookCollectRequest,
    x_webhook_token: str = Header(..., alias="X-Webhook-Token"),
    db: Session = Depends(get_db),
):
    """X-Webhook-Token 헤더로 인증하여 데이터 수집을 트리거합니다.
    - trigger_source가 hackernews/worldbank/reddit이면 해당 소스를 즉시 수집
    - trigger_source가 custom이면 body의 title+content를 직접 저장
    """
    token = db.query(WebhookToken).filter(
        WebhookToken.token == x_webhook_token,
        WebhookToken.is_active == True,
    ).first()
    if not token:
        raise HTTPException(401, "유효하지 않은 웹훅 토큰입니다.")

    token.last_used_at = datetime.utcnow()

    saved_id = None
    collected_count = 0
    trigger = token.trigger_source

    if trigger == "custom" and req.title and req.content:
        obj = CollectedData(
            company_id=req.company_id,
            data_type=req.data_type or "custom",
            source=f"webhook:{token.source}",
            query="webhook",
            title=req.title,
            content=req.content[:10000],
            structured={},
            tags=["webhook", token.source],
            status="raw",
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        saved_id = obj.id
        collected_count = 1
    else:
        # 무료 소스 즉시 수집
        from services.data_collector import DataCollector
        api_keys = {r.service: r.api_key for r in db.query(ExternalApiKey).filter(ExternalApiKey.is_active == True).all()}
        collector = DataCollector(api_keys=api_keys)

        try:
            if trigger == "hackernews":
                result = collector.collect_hackernews(limit=10)
                stories = result.get("stories", [])
                if stories:
                    content = "\n".join(f"{s.get('title','')}: {s.get('url','')}" for s in stories)[:10000]
                    obj = CollectedData(
                        company_id=req.company_id,
                        data_type="tech_trend",
                        source="hackernews",
                        query="hackernews_top",
                        title=f"[Webhook/HN] Top Stories {datetime.utcnow().strftime('%Y-%m-%d')}",
                        content=content,
                        structured=result,
                        tags=["hackernews", "webhook"],
                        status="raw",
                    )
                    db.add(obj)
                    collected_count = len(stories)
            elif trigger == "worldbank":
                result = collector.collect_worldbank(indicator="NY.GDP.MKTP.KD.ZG", country="KR")
                if result.get("data"):
                    obj = CollectedData(
                        company_id=req.company_id,
                        data_type="economic",
                        source="worldbank",
                        query="KR:NY.GDP.MKTP.KD.ZG",
                        title=f"[Webhook/WB] GDP {datetime.utcnow().strftime('%Y-%m-%d')}",
                        content=str(result.get("data", []))[:10000],
                        structured=result,
                        tags=["worldbank", "webhook"],
                        status="raw",
                    )
                    db.add(obj)
                    collected_count = len(result.get("data", []))
            elif trigger == "reddit":
                result = collector.collect_reddit(subreddit="technology", limit=10)
                if result.get("posts"):
                    content = "\n".join(f"{p.get('title','')}: {p.get('url','')}" for p in result["posts"])[:10000]
                    obj = CollectedData(
                        company_id=req.company_id,
                        data_type="community",
                        source="reddit",
                        query="r/technology",
                        title=f"[Webhook/Reddit] Hot Posts {datetime.utcnow().strftime('%Y-%m-%d')}",
                        content=content,
                        structured=result,
                        tags=["reddit", "webhook"],
                        status="raw",
                    )
                    db.add(obj)
                    collected_count = len(result.get("posts", []))
        except Exception as e:
            db.commit()
            raise HTTPException(500, f"수집 실패: {e}")

        db.commit()

    return {
        "ok": True,
        "trigger": trigger,
        "collected_count": collected_count,
        "saved_id": saved_id,
        "triggered_at": datetime.utcnow().isoformat(),
    }
