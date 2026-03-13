"""AI 에이전트 성과 분석 API."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from core.database import get_db
from models.models import AiAgentMetrics, OrgNode, Company

router = APIRouter(prefix="/api/agent-metrics", tags=["agent-metrics"])

# ── 토큰당 단가 (USD per 1K tokens) ─────────────────────────────────────────
# 2024-2025 기준 공개 가격표. 관리자 설정 확장 가능.
TOKEN_PRICING: dict = {
    # Anthropic
    "claude-opus-4-6":              {"prompt": 0.015,  "completion": 0.075},
    "claude-sonnet-4-6":            {"prompt": 0.003,  "completion": 0.015},
    "claude-haiku-4-5-20251001":    {"prompt": 0.001,  "completion": 0.005},
    "claude-3-5-sonnet-20241022":   {"prompt": 0.003,  "completion": 0.015},
    "claude-3-haiku-20240307":      {"prompt": 0.00025,"completion": 0.00125},
    # OpenAI
    "gpt-4o":                       {"prompt": 0.005,  "completion": 0.015},
    "gpt-4o-mini":                  {"prompt": 0.00015,"completion": 0.0006},
    "o1-mini":                      {"prompt": 0.003,  "completion": 0.012},
    # Gemini
    "gemini-1.5-flash":             {"prompt": 0.000075,"completion": 0.0003},
    "gemini-1.5-pro":               {"prompt": 0.00125,"completion": 0.005},
    # 로컬 (무료)
    "_default_free":                {"prompt": 0.0,    "completion": 0.0},
}

_FREE_PROVIDERS = {"ollama", "ktransformers", "mock"}


def _get_pricing(provider: str, model: str) -> dict:
    """모델별 토큰 단가 조회. 매칭 안 되면 프로바이더 기본값."""
    if provider in _FREE_PROVIDERS:
        return TOKEN_PRICING["_default_free"]
    if model in TOKEN_PRICING:
        return TOKEN_PRICING[model]
    # 부분 매칭 시도 (모델명 prefix)
    for key, val in TOKEN_PRICING.items():
        if key != "_default_free" and model.startswith(key.rsplit("-", 1)[0]):
            return val
    return TOKEN_PRICING["_default_free"]


def _calc_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """단건 호출 비용 (USD) 계산."""
    p = _get_pricing(provider, model)
    return (prompt_tokens * p["prompt"] + completion_tokens * p["completion"]) / 1000


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


@router.get("/cost-summary")
def cost_summary(
    days: int = Query(30, ge=1, le=365),
    company_id: int = None,
    db: Session = Depends(get_db),
):
    """프로바이더별 비용 추적 요약."""
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(AiAgentMetrics).filter(AiAgentMetrics.created_at >= since)
    if company_id:
        q = q.filter(AiAgentMetrics.company_id == company_id)
    metrics = q.all()

    if not metrics:
        return {
            "total_cost_usd": 0, "total_requests": 0,
            "by_provider": [], "by_model": [], "by_day": [],
            "budget_monthly_usd": None,
        }

    total_cost = 0.0

    # 프로바이더별 비용
    provider_costs: dict = {}
    # 모델별 비용
    model_costs: dict = {}
    # 일별 비용
    day_costs: dict = {}

    for m in metrics:
        cost = _calc_cost(m.provider or "", m.model or "", m.prompt_tokens, m.completion_tokens)
        total_cost += cost

        # by provider
        prov = m.provider or "unknown"
        if prov not in provider_costs:
            provider_costs[prov] = {"provider": prov, "requests": 0, "tokens": 0, "cost_usd": 0.0}
        provider_costs[prov]["requests"] += 1
        provider_costs[prov]["tokens"] += m.total_tokens
        provider_costs[prov]["cost_usd"] += cost

        # by model
        mdl = m.model or "unknown"
        key = f"{prov}/{mdl}"
        if key not in model_costs:
            model_costs[key] = {"provider": prov, "model": mdl, "requests": 0, "tokens": 0, "cost_usd": 0.0}
        model_costs[key]["requests"] += 1
        model_costs[key]["tokens"] += m.total_tokens
        model_costs[key]["cost_usd"] += cost

        # by day
        day = m.created_at.strftime("%Y-%m-%d")
        if day not in day_costs:
            day_costs[day] = {"date": day, "cost_usd": 0.0, "requests": 0}
        day_costs[day]["cost_usd"] += cost
        day_costs[day]["requests"] += 1

    # 금액 반올림
    for v in provider_costs.values():
        v["cost_usd"] = round(v["cost_usd"], 4)
    for v in model_costs.values():
        v["cost_usd"] = round(v["cost_usd"], 4)
    for v in day_costs.values():
        v["cost_usd"] = round(v["cost_usd"], 4)

    by_provider = sorted(provider_costs.values(), key=lambda x: x["cost_usd"], reverse=True)
    by_model = sorted(model_costs.values(), key=lambda x: x["cost_usd"], reverse=True)
    by_day = sorted(day_costs.values(), key=lambda x: x["date"])

    return {
        "total_cost_usd": round(total_cost, 4),
        "total_requests": len(metrics),
        "by_provider": by_provider,
        "by_model": by_model[:20],
        "by_day": by_day,
        "budget_monthly_usd": None,  # 추후 설정 기능 확장
    }


@router.get("/pricing")
def get_pricing():
    """현재 적용 중인 토큰 단가표 조회."""
    result = []
    for model, prices in TOKEN_PRICING.items():
        if model == "_default_free":
            continue
        result.append({
            "model": model,
            "prompt_per_1k": prices["prompt"],
            "completion_per_1k": prices["completion"],
        })
    return {"pricing": result, "free_providers": list(_FREE_PROVIDERS)}
