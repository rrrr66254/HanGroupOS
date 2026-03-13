"""Slack/Discord 웹훅 알림 서비스."""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List
from core.database import get_db, SessionLocal
from models.models import GroupSettings, Notification
from core.logging import get_logger

logger = get_logger("webhook_notify")

router = APIRouter(prefix="/api/webhook-notify", tags=["webhook-notify"])


class WebhookConfig(BaseModel):
    slack_url: Optional[str] = None
    discord_url: Optional[str] = None
    notify_approvals: bool = True
    notify_quality_alert: bool = True
    notify_kpi_change: bool = True
    min_quality_threshold: float = 0.3


class TestWebhookRequest(BaseModel):
    target: str  # slack | discord


# ── 설정 저장/조회 (GroupSettings 활용) ──────────────────────────────────────

def _get_webhook_config(db: Session) -> dict:
    row = db.query(GroupSettings).filter(GroupSettings.key == "webhook_config").first()
    if row and row.value:
        try:
            return json.loads(row.value)
        except Exception:
            pass
    return {
        "slack_url": "", "discord_url": "",
        "notify_approvals": True, "notify_quality_alert": True,
        "notify_kpi_change": True, "min_quality_threshold": 0.3,
    }


def _save_webhook_config(db: Session, config: dict):
    row = db.query(GroupSettings).filter(GroupSettings.key == "webhook_config").first()
    if row:
        row.value = json.dumps(config, ensure_ascii=False)
    else:
        db.add(GroupSettings(key="webhook_config", value=json.dumps(config, ensure_ascii=False)))
    db.commit()


@router.get("/config")
def get_config(db: Session = Depends(get_db)):
    return _get_webhook_config(db)


@router.put("/config")
def update_config(req: WebhookConfig, db: Session = Depends(get_db)):
    config = req.dict()
    _save_webhook_config(db, config)
    return {"status": "ok"}


@router.post("/test")
def test_webhook(req: TestWebhookRequest, db: Session = Depends(get_db)):
    """테스트 메시지 발송."""
    config = _get_webhook_config(db)
    msg = "Group OS 웹훅 연동 테스트 메시지입니다."
    if req.target == "slack":
        ok = _send_slack(config.get("slack_url", ""), msg)
    elif req.target == "discord":
        ok = _send_discord(config.get("discord_url", ""), msg)
    else:
        raise HTTPException(400, "target must be 'slack' or 'discord'")
    return {"status": "ok" if ok else "failed"}


# ── 발송 함수 ────────────────────────────────────────────────────────────────

def _send_slack(url: str, text: str) -> bool:
    if not url:
        return False
    try:
        import httpx
        r = httpx.post(url, json={"text": text}, timeout=10)
        return r.status_code == 200
    except Exception as e:
        logger.warning("Slack 발송 실패: %s", e)
        return False


def _send_discord(url: str, text: str) -> bool:
    if not url:
        return False
    try:
        import httpx
        r = httpx.post(url, json={"content": text}, timeout=10)
        return r.status_code in (200, 204)
    except Exception as e:
        logger.warning("Discord 발송 실패: %s", e)
        return False


def send_webhook_alert(title: str, body: str, alert_type: str = "info"):
    """시스템 이벤트 발생 시 웹훅 알림 전송 (비동기 안전).

    alert_type: approval | quality_alert | kpi_change | info
    """
    try:
        db = SessionLocal()
        config = _get_webhook_config(db)
        db.close()
    except Exception:
        return

    # 타입별 필터
    if alert_type == "approval" and not config.get("notify_approvals", True):
        return
    if alert_type == "quality_alert" and not config.get("notify_quality_alert", True):
        return
    if alert_type == "kpi_change" and not config.get("notify_kpi_change", True):
        return

    # 이모지 매핑
    emoji_map = {
        "approval": "📋", "quality_alert": "⚠️",
        "kpi_change": "📊", "info": "ℹ️",
    }
    emoji = emoji_map.get(alert_type, "🔔")
    message = f"{emoji} **{title}**\n{body}"

    slack_url = config.get("slack_url", "")
    discord_url = config.get("discord_url", "")

    if slack_url:
        _send_slack(slack_url, message)
    if discord_url:
        _send_discord(discord_url, message)
