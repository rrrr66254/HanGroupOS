"""AI 에이전트 성과 분석 API."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from core.database import get_db
from models.models import AiAgentMetrics, OrgNode, Company

router = APIRouter(prefix="/api/agent-metrics", tags=["agent-metrics"])


@router.get("/summary")
def metrics_summary(
    days: int = Query(7, ge=1, le=90),
    company_id: int = None,
    db: Session = Depends(get_db),
):
    """에이전트 성과 요약 대시보드 데이터."""
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(AiAgentMetrics).filter(AiAgentMetrics.created_at >= since)
    if company_id:
        q = q.filter(AiAgentMetrics.company_id == company_id)
    metrics = q.all()

    if not metrics:
        return {
            "total_requests": 0, "total_tokens": 0,
            "avg_response_ms": 0, "avg_quality": 0,
            "by_agent": [], "by_provider": [], "by_day": [],
        }

    total_requests = len(metrics)
    total_tokens = sum(m.total_tokens for m in metrics)
    avg_response = sum(m.response_time_ms for m in metrics) / total_requests
    scored = [m for m in metrics if m.quality_score is not None]
    avg_quality = sum(m.quality_score for m in scored) / len(scored) if scored else 0

    # 에이전트별 집계
    agent_map: dict = {}
    for m in metrics:
        key = m.agent_name
        if key not in agent_map:
            agent_map[key] = {
                "agent_name": key, "agent_role": m.agent_role,
                "requests": 0, "total_tokens": 0, "total_response_ms": 0,
                "quality_scores": [],
            }
        agent_map[key]["requests"] += 1
        agent_map[key]["total_tokens"] += m.total_tokens
        agent_map[key]["total_response_ms"] += m.response_time_ms
        if m.quality_score is not None:
            agent_map[key]["quality_scores"].append(m.quality_score)

    by_agent = []
    for a in agent_map.values():
        by_agent.append({
            "agent_name": a["agent_name"],
            "agent_role": a["agent_role"],
            "requests": a["requests"],
            "total_tokens": a["total_tokens"],
            "avg_response_ms": round(a["total_response_ms"] / a["requests"]),
            "avg_quality": round(
                sum(a["quality_scores"]) / len(a["quality_scores"]), 2
            ) if a["quality_scores"] else None,
        })
    by_agent.sort(key=lambda x: x["requests"], reverse=True)

    # 프로바이더별 집계
    provider_map: dict = {}
    for m in metrics:
        key = m.provider or "unknown"
        if key not in provider_map:
            provider_map[key] = {"provider": key, "requests": 0, "total_tokens": 0}
        provider_map[key]["requests"] += 1
        provider_map[key]["total_tokens"] += m.total_tokens
    by_provider = sorted(provider_map.values(), key=lambda x: x["requests"], reverse=True)

    # 일별 트렌드 (품질 추이 포함)
    day_map: dict = {}
    for m in metrics:
        day = m.created_at.strftime("%Y-%m-%d")
        if day not in day_map:
            day_map[day] = {"date": day, "requests": 0, "tokens": 0, "_quality_scores": []}
        day_map[day]["requests"] += 1
        day_map[day]["tokens"] += m.total_tokens
        if m.quality_score is not None:
            day_map[day]["_quality_scores"].append(m.quality_score)
    by_day = []
    for d in sorted(day_map.values(), key=lambda x: x["date"]):
        qs = d.pop("_quality_scores")
        d["avg_quality"] = round(sum(qs) / len(qs), 3) if qs else None
        by_day.append(d)

    return {
        "total_requests": total_requests,
        "total_tokens": total_tokens,
        "avg_response_ms": round(avg_response),
        "avg_quality": round(avg_quality, 2),
        "by_agent": by_agent[:20],
        "by_provider": by_provider,
        "by_day": by_day,
    }


@router.get("/recent")
def recent_metrics(
    limit: int = Query(50, ge=1, le=200),
    company_id: int = None,
    db: Session = Depends(get_db),
):
    """최근 에이전트 호출 이력."""
    q = db.query(AiAgentMetrics).order_by(AiAgentMetrics.created_at.desc())
    if company_id:
        q = q.filter(AiAgentMetrics.company_id == company_id)
    rows = q.limit(limit).all()
    return [
        {
            "id": r.id,
            "agent_name": r.agent_name,
            "agent_role": r.agent_role,
            "provider": r.provider,
            "model": r.model,
            "prompt_tokens": r.prompt_tokens,
            "completion_tokens": r.completion_tokens,
            "total_tokens": r.total_tokens,
            "response_time_ms": r.response_time_ms,
            "quality_score": r.quality_score,
            "session_type": r.session_type,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
