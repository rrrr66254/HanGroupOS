"""
자율 파이프라인 엔진
===================
6단계 자율 파이프라인:
  0. 데이터 스캔 & AI 태깅     — 미태깅 수집 데이터 자동 분석
  1. 인사이트 추출              — 위원회 AI 병렬 분석 → AISuggestion 생성
  2. 전략 진단                  — KPI 트렌드 + 전략 아이템 위험도 체크
  3. 계열사 건강 체크            — 건강 스코어 계산 + 위험 계열사 식별
  4. 회장 종합 보고서           — 앞 4단계 결과를 종합하여 회장 AI가 최종 보고서 작성
  5. 액션 아이템 생성           — 보고서 기반 AISuggestion 자동 생성

흐름: 각 단계 출력이 다음 단계 입력으로 자동 전달됨.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from models.models import (
    AISuggestion, CollectedData, Company, KpiDataLink, KpiSyncHistory,
    Notification, OrgNode, PipelineRun, PipelineStageLog, StrategyItem,
)
from services.ai_provider import get_provider_from_db

logger = logging.getLogger(__name__)

STAGE_NAMES = [
    "데이터 스캔 & AI 태깅",
    "인사이트 추출",
    "전략 진단",
    "계열사 건강 체크",
    "회장 종합 보고서",
    "액션 아이템 생성",
]


def _update_stage(
    db: Session,
    stage_log: PipelineStageLog,
    status: str,
    output: str = "",
    stats: dict = None,
    error: str = "",
):
    stage_log.status = status
    if output:
        stage_log.output = output
    if stats:
        stage_log.stats = stats
    if error:
        stage_log.error = error
    if status == "running":
        stage_log.started_at = datetime.utcnow()
    elif status in ("done", "failed"):
        stage_log.finished_at = datetime.utcnow()
    db.commit()


def _add_notification(db: Session, run_id: int, title: str, body: str, notif_type: str = "info"):
    notif = Notification(
        title=title,
        body=body,
        notif_type=notif_type,
        icon="🤖",
        link=f"/pipeline/{run_id}",
    )
    db.add(notif)
    db.commit()


# ── Stage 0: 데이터 스캔 & AI 태깅 ───────────────────────────────────────────

def _stage_data_scan(db: Session, provider, stage_log: PipelineStageLog) -> dict:
    """미태깅 수집 데이터 AI 자동 분석 + 태깅."""
    _update_stage(db, stage_log, "running")

    untagged = (
        db.query(CollectedData)
        .filter(CollectedData.tags == [], CollectedData.status == "raw")
        .order_by(CollectedData.created_at.desc())
        .limit(30)
        .all()
    )
    tagged_count = 0
    topics_found = []

    for item in untagged:
        text = f"{item.title}\n{(item.content or '')[:300]}"
        try:
            resp = provider.chat(
                messages=[{"role": "user", "content": (
                    f"다음 텍스트를 분석해 JSON으로만 답하세요:\n"
                    f"{{\"industry\": \"산업분류\", \"sentiment\": \"positive|neutral|negative\", "
                    f"\"topics\": [\"토픽1\", \"토픽2\"]}}\n\n텍스트:\n{text}"
                )}],
                system="텍스트 분류 전문가. 반드시 JSON만 출력.",
                max_tokens=150,
            )
            data = json.loads(resp.strip().strip("```json").strip("```"))
            tags = [
                f"industry:{data.get('industry', 'general')}",
                f"sentiment:{data.get('sentiment', 'neutral')}",
            ] + [f"topic:{t}" for t in data.get("topics", [])[:3]]
            item.tags = tags
            item.status = "analyzed"
            topics_found.extend(data.get("topics", []))
            tagged_count += 1
        except Exception:
            item.tags = ["auto_tag_failed"]
            item.status = "analyzed"

    db.commit()

    top_topics = list(dict.fromkeys(topics_found))[:5]
    output = (
        f"총 {tagged_count}건 AI 태깅 완료.\n"
        f"주요 토픽: {', '.join(top_topics) if top_topics else '없음'}"
    )
    _update_stage(db, stage_log, "done", output=output,
                  stats={"tagged": tagged_count, "top_topics": top_topics})
    return {"tagged": tagged_count, "top_topics": top_topics}


# ── Stage 1: 인사이트 추출 ────────────────────────────────────────────────────

def _stage_insight_extract(db: Session, provider, stage_log: PipelineStageLog, prev: dict) -> dict:
    """위원회 관점별 AI 병렬 분석 → AISuggestion 자동 생성."""
    _update_stage(db, stage_log, "running",
                  input_summary=f"태깅 완료 데이터 {prev.get('tagged', 0)}건 기반")

    recent = (
        db.query(CollectedData)
        .filter(CollectedData.status == "analyzed")
        .order_by(CollectedData.created_at.desc())
        .limit(20)
        .all()
    )
    if not recent:
        _update_stage(db, stage_log, "done", output="분석할 수집 데이터 없음.", stats={"created": 0})
        return {"insights_created": 0}

    data_text = "\n".join(
        f"- [{d.data_type}] {d.title}: {(d.content or '')[:120]}"
        for d in recent
    )

    committees = [
        ("전략위원회", "그룹 중장기 전략 관점에서 기회/위협을 분석하는 전략 위원입니다."),
        ("투자위원회", "투자 수익성과 리스크 관점에서 비즈니스 기회를 분석하는 투자 위원입니다."),
        ("데이터위원회", "데이터 트렌드와 디지털 혁신 관점에서 인사이트를 도출하는 데이터 위원입니다."),
    ]

    prompt = (
        f"다음 수집 데이터를 검토하고, 그룹에 중요한 인사이트 2가지를 JSON 배열로만 답하세요:\n"
        f"[{{\"title\":\"인사이트 제목\",\"description\":\"상세 설명\",\"priority\":\"high|medium|low\"}}]\n\n"
        f"수집 데이터:\n{data_text}"
    )

    created_count = 0
    outputs = []

    for committee_name, system_prompt in committees:
        try:
            resp = provider.chat(
                messages=[{"role": "user", "content": prompt}],
                system=system_prompt,
                max_tokens=500,
            )
            items = json.loads(resp.strip().strip("```json").strip("```"))
            for item in items[:2]:
                suggestion = AISuggestion(
                    title=f"[{committee_name}] {item.get('title', '인사이트')}",
                    description=item.get("description", ""),
                    suggestion_type="insight",
                    priority=item.get("priority", "medium"),
                    status="open",
                )
                db.add(suggestion)
                created_count += 1
                outputs.append(f"• [{committee_name}] {item.get('title')}")
        except Exception as e:
            outputs.append(f"• [{committee_name}] 분석 실패: {e}")

    db.commit()

    output = f"{created_count}개 인사이트 생성:\n" + "\n".join(outputs)
    _update_stage(db, stage_log, "done", output=output, stats={"insights_created": created_count})
    return {"insights_created": created_count, "outputs": outputs}


# ── Stage 2: 전략 진단 ────────────────────────────────────────────────────────

def _stage_strategy_check(db: Session, provider, stage_log: PipelineStageLog, prev: dict) -> dict:
    """현재 전략 아이템 AI 진단 + KPI 트렌드 체크."""
    _update_stage(db, stage_log, "running",
                  input_summary=f"인사이트 {prev.get('insights_created', 0)}개 생성 후 전략 점검")

    active_items = (
        db.query(StrategyItem)
        .filter(StrategyItem.status == "active")
        .order_by(StrategyItem.progress.asc())
        .limit(10)
        .all()
    )
    if not active_items:
        _update_stage(db, stage_log, "done", output="진행 중인 전략 없음.", stats={"at_risk": 0})
        return {"at_risk": [], "strategy_summary": "전략 없음"}

    items_text = "\n".join(
        f"- {item.title} (진척도 {item.progress}%, 우선순위 {item.priority}, 마감 {item.due_date or '미정'})"
        for item in active_items
    )

    resp = provider.chat(
        messages=[{"role": "user", "content": (
            f"다음 전략 아이템들을 분석해 위험 항목을 JSON으로만 답하세요:\n"
            f"{{\"at_risk\": [\"제목1\", \"제목2\"], \"overall_health\": \"good|warning|critical\", "
            f"\"summary\": \"한 줄 요약\"}}\n\n전략 목록:\n{items_text}"
        )}],
        system="그룹 전략 총괄 AI. 진척도와 우선순위를 기반으로 위험도를 평가합니다.",
        max_tokens=400,
    )

    at_risk = []
    overall_health = "warning"
    strategy_summary = ""
    try:
        data = json.loads(resp.strip().strip("```json").strip("```"))
        at_risk = data.get("at_risk", [])
        overall_health = data.get("overall_health", "warning")
        strategy_summary = data.get("summary", "")
    except Exception:
        strategy_summary = resp[:200]

    output = (
        f"전략 건강도: {overall_health}\n"
        f"위험 항목 ({len(at_risk)}개): {', '.join(at_risk) if at_risk else '없음'}\n"
        f"요약: {strategy_summary}"
    )
    _update_stage(db, stage_log, "done", output=output,
                  stats={"at_risk_count": len(at_risk), "overall_health": overall_health})
    return {"at_risk": at_risk, "overall_health": overall_health, "strategy_summary": strategy_summary}


# ── Stage 3: 계열사 건강 체크 ─────────────────────────────────────────────────

def _stage_health_check(db: Session, stage_log: PipelineStageLog, prev: dict) -> dict:
    """계열사별 건강 스코어 자동 계산."""
    _update_stage(db, stage_log, "running",
                  input_summary="전략 진단 결과 기반 계열사 건강 체크")

    companies = (
        db.query(Company)
        .filter(Company.is_competitor == False, Company.status == "active")
        .all()
    )

    health_scores = []
    danger_companies = []

    for company in companies:
        items = db.query(StrategyItem).filter(
            StrategyItem.company_id == company.id,
            StrategyItem.status == "active",
        ).all()
        avg_progress = (
            sum(i.progress for i in items) / len(items) if items else 50
        )
        kpi_links = db.query(KpiDataLink).all()
        kpi_count = len([lnk for lnk in kpi_links if lnk.last_value is not None])
        kpi_rate = min(kpi_count * 20, 100)

        score = avg_progress * 0.5 + kpi_rate * 0.3 + 50 * 0.2
        score = round(min(max(score, 0), 100), 1)

        if score < 40:
            status = "위험"
            danger_companies.append(company.name)
        elif score < 65:
            status = "주의"
        else:
            status = "양호"

        health_scores.append({
            "company": company.name,
            "score": score,
            "status": status,
            "avg_progress": round(avg_progress, 1),
        })

    health_scores.sort(key=lambda x: x["score"])
    lines = [f"• {h['company']}: {h['score']}점 ({h['status']})" for h in health_scores]
    output = f"계열사 {len(health_scores)}개 건강 체크 완료:\n" + "\n".join(lines)

    _update_stage(db, stage_log, "done", output=output,
                  stats={"total": len(health_scores), "danger_count": len(danger_companies)})
    return {"health_scores": health_scores, "danger_companies": danger_companies}


# ── Stage 4: 회장 종합 보고서 ─────────────────────────────────────────────────

def _stage_chairman_report(
    db: Session, provider, stage_log: PipelineStageLog,
    scan_result: dict, insight_result: dict,
    strategy_result: dict, health_result: dict,
) -> str:
    """앞 4단계 결과를 종합하여 회장 AI가 최종 보고서 작성."""
    _update_stage(db, stage_log, "running",
                  input_summary="전 단계 결과 종합")

    health_lines = "\n".join(
        f"- {h['company']}: {h['score']}점 ({h['status']})"
        for h in health_result.get("health_scores", [])
    ) or "(계열사 없음)"

    prompt = f"""당신은 한 그룹 회장 AI입니다. 자율 파이프라인 분석 결과를 바탕으로 경영진 보고서를 작성하세요.

## 분석 결과 요약

### 데이터 수집 현황
- AI 태깅 완료: {scan_result.get('tagged', 0)}건
- 주요 토픽: {', '.join(scan_result.get('top_topics', [])) or '없음'}

### 신규 인사이트
- 생성된 인사이트: {insight_result.get('insights_created', 0)}개
{chr(10).join(insight_result.get('outputs', [])[:5])}

### 전략 진단
- 전략 건강도: {strategy_result.get('overall_health', '미확인')}
- 위험 항목: {', '.join(strategy_result.get('at_risk', [])) or '없음'}
- 요약: {strategy_result.get('strategy_summary', '')}

### 계열사 건강
{health_lines}
- 위험 계열사: {', '.join(health_result.get('danger_companies', [])) or '없음'}

---

다음 형식으로 보고서를 작성하세요:

# 자율 파이프라인 경영 보고서
## 핵심 현황 (3줄)
## 주요 발견 사항
## 즉시 조치 필요 사항
## 중기 권고 사항
## 기회 요인"""

    report = provider.chat(
        messages=[{"role": "user", "content": prompt}],
        system="당신은 한 그룹 회장 AI입니다. 전략적 통찰과 실행 가능한 지시를 내리는 보고서를 작성합니다.",
        max_tokens=1200,
    )

    _update_stage(db, stage_log, "done", output=report[:500] + "...(전문 저장됨)")
    return report


# ── Stage 5: 액션 아이템 생성 ─────────────────────────────────────────────────

def _stage_action_items(db: Session, provider, stage_log: PipelineStageLog, report: str) -> list:
    """보고서 기반 AISuggestion 자동 생성."""
    _update_stage(db, stage_log, "running",
                  input_summary="회장 보고서 기반 액션 아이템 추출")

    resp = provider.chat(
        messages=[{"role": "user", "content": (
            f"다음 경영 보고서에서 즉시 실행 가능한 액션 아이템 3~5개를 JSON 배열로만 추출하세요:\n"
            f"[{{\"title\":\"액션 제목\",\"description\":\"구체적 실행 방법\",\"priority\":\"high|medium|low\"}}]\n\n"
            f"보고서:\n{report[:1500]}"
        )}],
        system="실행 계획 수립 전문가. 보고서에서 구체적이고 실행 가능한 액션을 추출합니다.",
        max_tokens=600,
    )

    actions = []
    created = []
    try:
        actions = json.loads(resp.strip().strip("```json").strip("```"))
        for action in actions[:5]:
            suggestion = AISuggestion(
                title=f"[파이프라인 액션] {action.get('title', '조치 필요')}",
                description=action.get("description", ""),
                suggestion_type="action",
                priority=action.get("priority", "medium"),
                status="open",
            )
            db.add(suggestion)
            created.append(action.get("title", ""))
        db.commit()
    except Exception as e:
        logger.warning(f"액션 아이템 파싱 실패: {e}")

    output = f"{len(created)}개 액션 아이템 생성:\n" + "\n".join(f"• {a}" for a in created)
    _update_stage(db, stage_log, "done", output=output, stats={"created": len(created)})
    return created


# ── 메인 파이프라인 실행기 ─────────────────────────────────────────────────────

def run_pipeline(db: Session, user_id: int, trigger: str = "manual") -> PipelineRun:
    """자율 파이프라인 전체 실행.

    동기 함수 — FastAPI BackgroundTasks 또는 스케줄러에서 호출.
    각 단계 결과가 다음 단계로 자동 전달됨.
    """
    provider = get_provider_from_db(db, user_id)

    run = PipelineRun(
        status="running",
        trigger=trigger,
        triggered_by=user_id,
        current_stage=0,
        total_stages=6,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    stage_logs = []
    for i, name in enumerate(STAGE_NAMES):
        sl = PipelineStageLog(
            run_id=run.id,
            stage_index=i,
            stage_name=name,
            status="pending",
        )
        db.add(sl)
    db.commit()

    # 단계별 로그 재조회
    stage_logs = (
        db.query(PipelineStageLog)
        .filter(PipelineStageLog.run_id == run.id)
        .order_by(PipelineStageLog.stage_index)
        .all()
    )

    _add_notification(db, run.id, "자율 파이프라인 시작", "6단계 자율 분석 파이프라인이 시작됩니다.", "info")

    context = {}
    try:
        # Stage 0
        run.current_stage = 0
        db.commit()
        context["scan"] = _stage_data_scan(db, provider, stage_logs[0])

        # Stage 1
        run.current_stage = 1
        db.commit()
        context["insight"] = _stage_insight_extract(db, provider, stage_logs[1], context["scan"])

        # Stage 2
        run.current_stage = 2
        db.commit()
        context["strategy"] = _stage_strategy_check(db, provider, stage_logs[2], context["insight"])

        # Stage 3
        run.current_stage = 3
        db.commit()
        context["health"] = _stage_health_check(db, stage_logs[3], context["strategy"])

        # Stage 4
        run.current_stage = 4
        db.commit()
        report = _stage_chairman_report(
            db, provider, stage_logs[4],
            context["scan"], context["insight"],
            context["strategy"], context["health"],
        )

        # Stage 5
        run.current_stage = 5
        db.commit()
        actions = _stage_action_items(db, provider, stage_logs[5], report)

        run.status = "completed"
        run.current_stage = 6
        run.summary = report
        run.action_items = actions
        run.meta = {
            "tagged": context["scan"].get("tagged", 0),
            "insights": context["insight"].get("insights_created", 0),
            "at_risk_count": len(context["strategy"].get("at_risk", [])),
            "danger_companies": context["health"].get("danger_companies", []),
            "actions_created": len(actions),
        }
        run.finished_at = datetime.utcnow()
        db.commit()

        _add_notification(
            db, run.id,
            "자율 파이프라인 완료",
            f"인사이트 {context['insight'].get('insights_created', 0)}개 · "
            f"액션 아이템 {len(actions)}개 생성 완료",
            "success",
        )

    except Exception as e:
        logger.error(f"Pipeline run {run.id} failed: {e}", exc_info=True)
        run.status = "failed"
        run.finished_at = datetime.utcnow()
        db.commit()
        _add_notification(db, run.id, "파이프라인 오류", str(e)[:200], "error")

    return run
