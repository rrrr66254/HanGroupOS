"""
Autonomous Work Loop Service + SSE Streaming + Weekly Report + Agent P2P.

Work chain: specialists → team_leads → chiefs → ceo → (chairman if cross-company)
Each agent generates a work report using their assigned AI, then summarizes up to their manager.
"""
import uuid
import json
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Generator
from sqlalchemy.orm import Session

from models.models import OrgNode, Company, WorkLog, CorporateMemory, ProviderConfig, AgentMessage
from services.ai_provider import AIProvider


# ── Personality context builder ───────────────────────────────────────────────
def build_personality_context(node: OrgNode) -> str:
    """Extract personality traits from node.meta and return as system prompt addendum."""
    meta = node.meta or {}
    personality = meta.get("personality", {})
    if not personality:
        return ""

    parts = []
    style = personality.get("style", "")
    traits = personality.get("traits", [])
    specialty = personality.get("specialty", "")

    if style:
        parts.append(f"커뮤니케이션 스타일: {style}")
    if traits:
        parts.append(f"성격 특성: {', '.join(traits)}")
    if specialty:
        parts.append(f"전문 분야: {specialty}")

    if not parts:
        return ""

    return "\n\n[에이전트 개성]\n" + "\n".join(parts)


def get_relevant_memories(db: Session, company_id: Optional[int], limit: int = 3) -> str:
    """Fetch top important memories for context injection."""
    if not company_id:
        return ""

    memories = (
        db.query(CorporateMemory)
        .filter(CorporateMemory.company_id == company_id)
        .order_by(CorporateMemory.importance.desc(), CorporateMemory.created_at.desc())
        .limit(limit)
        .all()
    )
    if not memories:
        return ""

    lines = ["[기업 기억]"]
    for m in memories:
        lines.append(f"- [{m.memory_type}] {m.title}: {m.content[:150]}")
    return "\n".join(lines)


def get_node_ai_provider(db: Session, node: OrgNode) -> AIProvider:
    """Build AIProvider for a given OrgNode using its stored provider/model."""
    provider_name = node.ai_provider or "ollama"
    if provider_name == "mock":
        provider_name = "ollama"

    # Try to find API key from DB (use admin user_id=1 as system user)
    api_key = ""
    base_url = ""
    config = (
        db.query(ProviderConfig)
        .filter(
            ProviderConfig.provider == provider_name,
            ProviderConfig.is_active == True,
        )
        .first()
    )
    if config:
        api_key = config.api_key or ""
        base_url = config.base_url or ""

    model = node.ai_model or ""
    return AIProvider(
        provider=provider_name,
        api_key=api_key or None,
        model=model or None,
        base_url=base_url or None,
    )


# ── Work task generators per level ───────────────────────────────────────────
SPECIALIST_TASKS = [
    "오늘의 핵심 업무를 수행하고 진행 상황을 보고하세요.",
    "현재 프로젝트의 주요 이슈와 해결 방안을 작성하세요.",
    "이번 주 목표 대비 달성도를 분석하고 다음 액션을 제안하세요.",
]

TEAM_LEAD_PROMPT = """아래는 팀원들의 업무 보고입니다. 이를 종합하여 팀장으로서
핵심 요약과 다음 우선순위 액션을 작성하세요. 간결하게 3~5문장으로 작성하세요.

팀원 보고:
{reports}"""

CHIEF_PROMPT = """아래는 팀장들의 보고입니다. C-레벨 임원으로서 부문 전체를
종합하고 경영진에 보고할 핵심 요약을 작성하세요. 2~4문장으로 간결하게 작성하세요.

팀장 보고:
{reports}"""

CEO_PROMPT = """아래는 각 부문장들의 보고입니다. CEO로서 회사 전체 상황을
종합하고 그룹 본사에 보고할 경영 요약을 작성하세요. 2~3문장으로 작성하세요.

부문 보고:
{reports}"""


def _create_log(
    db: Session,
    cycle_id: str,
    node: OrgNode,
    task: str,
    result: str,
    parent_log_id: Optional[int] = None,
) -> WorkLog:
    log = WorkLog(
        company_id=node.company_id,
        org_node_id=node.id,
        agent_name=node.name,
        agent_role=node.role,
        level=node.level,
        task=task,
        result=result,
        cycle_id=cycle_id,
        parent_log_id=parent_log_id,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def run_specialist(
    db: Session,
    node: OrgNode,
    cycle_id: str,
    memory_context: str,
) -> WorkLog:
    """Run a single specialist's work cycle."""
    import random
    task = random.choice(SPECIALIST_TASKS)
    personality_ctx = build_personality_context(node)

    system = (
        f"당신은 {node.role} {node.name}입니다.\n"
        f"회사의 전문 실무자로서 담당 업무를 성실히 수행합니다."
        f"{personality_ctx}"
        + (f"\n\n{memory_context}" if memory_context else "")
    )

    ai = get_node_ai_provider(db, node)
    result = ai.chat(
        messages=[{"role": "user", "content": task}],
        system=system,
        max_tokens=300,
    )

    return _create_log(db, cycle_id, node, task, result)


def run_team_lead(
    db: Session,
    node: OrgNode,
    cycle_id: str,
    specialist_logs: List[WorkLog],
    memory_context: str,
) -> WorkLog:
    """Team lead summarizes specialist reports."""
    personality_ctx = build_personality_context(node)

    reports_text = "\n\n".join(
        f"[{log.agent_name} / {log.agent_role}]\n{log.result}"
        for log in specialist_logs
    )
    task = "팀원 업무 보고 종합 및 팀장 보고서 작성"
    prompt = TEAM_LEAD_PROMPT.format(reports=reports_text)

    system = (
        f"당신은 {node.role} {node.name}입니다.\n"
        f"팀을 이끄는 팀장으로서 팀원 보고를 종합하여 윗선에 보고합니다."
        f"{personality_ctx}"
        + (f"\n\n{memory_context}" if memory_context else "")
    )

    ai = get_node_ai_provider(db, node)
    result = ai.chat(
        messages=[{"role": "user", "content": prompt}],
        system=system,
        max_tokens=400,
    )

    # Parent log = first specialist log for chain visualization
    parent_id = specialist_logs[0].id if specialist_logs else None
    return _create_log(db, cycle_id, node, task, result, parent_id)


def run_chief(
    db: Session,
    node: OrgNode,
    cycle_id: str,
    team_lead_logs: List[WorkLog],
    memory_context: str,
) -> WorkLog:
    """Chief summarizes team lead reports."""
    personality_ctx = build_personality_context(node)

    reports_text = "\n\n".join(
        f"[{log.agent_name} / {log.agent_role}]\n{log.result}"
        for log in team_lead_logs
    )
    task = "팀장 보고 종합 및 부문 보고서 작성"
    prompt = CHIEF_PROMPT.format(reports=reports_text)

    system = (
        f"당신은 {node.role} {node.name}입니다.\n"
        f"C레벨 임원으로서 부문 전체 성과를 종합하고 경영진에 보고합니다."
        f"{personality_ctx}"
        + (f"\n\n{memory_context}" if memory_context else "")
    )

    ai = get_node_ai_provider(db, node)
    result = ai.chat(
        messages=[{"role": "user", "content": prompt}],
        system=system,
        max_tokens=400,
    )

    parent_id = team_lead_logs[0].id if team_lead_logs else None
    return _create_log(db, cycle_id, node, task, result, parent_id)


def run_ceo(
    db: Session,
    node: OrgNode,
    cycle_id: str,
    chief_logs: List[WorkLog],
    memory_context: str,
) -> WorkLog:
    """CEO summarizes all chief reports."""
    personality_ctx = build_personality_context(node)

    reports_text = "\n\n".join(
        f"[{log.agent_name} / {log.agent_role}]\n{log.result}"
        for log in chief_logs
    )
    task = "부문 보고 종합 및 CEO 경영 보고서 작성"
    prompt = CEO_PROMPT.format(reports=reports_text)

    system = (
        f"당신은 {node.name} CEO입니다.\n"
        f"회사 전체 경영 상황을 종합하고 그룹 회장에게 보고합니다."
        f"{personality_ctx}"
        + (f"\n\n{memory_context}" if memory_context else "")
    )

    ai = get_node_ai_provider(db, node)
    result = ai.chat(
        messages=[{"role": "user", "content": prompt}],
        system=system,
        max_tokens=500,
    )

    parent_id = chief_logs[0].id if chief_logs else None
    return _create_log(db, cycle_id, node, task, result, parent_id)


# ── Main orchestrator ─────────────────────────────────────────────────────────
def run_work_cycle(db: Session, company_id: int) -> Dict[str, Any]:
    """
    Execute a full work cycle for a company.
    specialists → team_leads → chiefs → ceo
    Returns summary dict with cycle_id and log counts.
    """
    cycle_id = str(uuid.uuid4())[:8]

    # Fetch company
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return {"error": "Company not found", "cycle_id": cycle_id}

    memory_context = get_relevant_memories(db, company_id)

    # Build org tree for this company
    all_nodes = db.query(OrgNode).filter(OrgNode.company_id == company_id).all()
    nodes_by_id = {n.id: n for n in all_nodes}
    nodes_by_level: Dict[str, List[OrgNode]] = {}
    for n in all_nodes:
        nodes_by_level.setdefault(n.level, []).append(n)

    logs_by_node: Dict[int, List[WorkLog]] = {}
    all_logs: List[WorkLog] = []

    # Step 1: Specialists
    for spec in nodes_by_level.get("specialist", []):
        log = run_specialist(db, spec, cycle_id, memory_context)
        logs_by_node.setdefault(spec.parent_id, []).append(log)
        all_logs.append(log)

    # Step 2: Team Leads
    team_lead_logs: List[WorkLog] = []
    for tl in nodes_by_level.get("team_lead", []):
        child_logs = logs_by_node.get(tl.id, [])
        # If no specialists reported, TL still produces a log
        if not child_logs:
            child_logs = []
        log = run_team_lead(db, tl, cycle_id, child_logs, memory_context)
        logs_by_node.setdefault(tl.parent_id, []).append(log)
        team_lead_logs.append(log)
        all_logs.append(log)

    # Step 3: Chiefs
    chief_logs: List[WorkLog] = []
    for chief in nodes_by_level.get("chief", []):
        child_logs = logs_by_node.get(chief.id, [])
        log = run_chief(db, chief, cycle_id, child_logs, memory_context)
        logs_by_node.setdefault(chief.parent_id, []).append(log)
        chief_logs.append(log)
        all_logs.append(log)

    # Step 4: CEO
    ceo_log = None
    for ceo in nodes_by_level.get("ceo", []):
        child_logs = logs_by_node.get(ceo.id, [])
        log = run_ceo(db, ceo, cycle_id, child_logs, memory_context)
        all_logs.append(log)
        ceo_log = log

    return {
        "cycle_id": cycle_id,
        "company_id": company_id,
        "company_name": company.name,
        "total_logs": len(all_logs),
        "ceo_summary": ceo_log.result if ceo_log else "CEO 없음",
        "logs": [
            {
                "id": l.id,
                "agent_name": l.agent_name,
                "agent_role": l.agent_role,
                "level": l.level,
                "task": l.task,
                "result": l.result,
                "parent_log_id": l.parent_log_id,
                "created_at": l.created_at.isoformat(),
            }
            for l in all_logs
        ],
    }


# ── SSE Streaming Work Cycle ──────────────────────────────────────────────────
def _sse(event_type: str, data: Dict[str, Any]) -> str:
    payload = json.dumps({"type": event_type, **data}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def run_work_cycle_stream(db: Session, company_id: int) -> Generator[str, None, None]:
    """
    Same as run_work_cycle but yields SSE events after each agent completes.
    specialists → team_leads → chiefs → ceo
    """
    cycle_id = str(uuid.uuid4())[:8]

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        yield _sse("error", {"message": "Company not found"})
        return

    yield _sse("start", {"cycle_id": cycle_id, "company": company.name})

    memory_context = get_relevant_memories(db, company_id)

    all_nodes = db.query(OrgNode).filter(OrgNode.company_id == company_id).all()
    nodes_by_level: Dict[str, List[OrgNode]] = {}
    for n in all_nodes:
        nodes_by_level.setdefault(n.level, []).append(n)

    logs_by_node: Dict[int, List[WorkLog]] = {}
    all_logs: List[WorkLog] = []

    # Step 1: Specialists
    yield _sse("phase", {"phase": "specialist", "label": "스페셜리스트 업무 수행 중"})
    for spec in nodes_by_level.get("specialist", []):
        yield _sse("agent_start", {"name": spec.name, "role": spec.role, "level": "specialist"})
        log = run_specialist(db, spec, cycle_id, memory_context)
        logs_by_node.setdefault(spec.parent_id, []).append(log)
        all_logs.append(log)
        yield _sse("agent_done", {
            "id": log.id, "name": log.agent_name, "role": log.agent_role,
            "level": "specialist", "task": log.task, "result": log.result,
            "cycle_id": cycle_id,
        })

    # Step 2: Team Leads
    yield _sse("phase", {"phase": "team_lead", "label": "팀장 보고서 작성 중"})
    for tl in nodes_by_level.get("team_lead", []):
        yield _sse("agent_start", {"name": tl.name, "role": tl.role, "level": "team_lead"})
        child_logs = logs_by_node.get(tl.id, [])
        log = run_team_lead(db, tl, cycle_id, child_logs, memory_context)
        logs_by_node.setdefault(tl.parent_id, []).append(log)
        all_logs.append(log)
        yield _sse("agent_done", {
            "id": log.id, "name": log.agent_name, "role": log.agent_role,
            "level": "team_lead", "task": log.task, "result": log.result,
            "cycle_id": cycle_id,
        })

    # Step 3: Chiefs
    yield _sse("phase", {"phase": "chief", "label": "부문장 보고서 취합 중"})
    for chief in nodes_by_level.get("chief", []):
        yield _sse("agent_start", {"name": chief.name, "role": chief.role, "level": "chief"})
        child_logs = logs_by_node.get(chief.id, [])
        log = run_chief(db, chief, cycle_id, child_logs, memory_context)
        logs_by_node.setdefault(chief.parent_id, []).append(log)
        all_logs.append(log)
        yield _sse("agent_done", {
            "id": log.id, "name": log.agent_name, "role": log.agent_role,
            "level": "chief", "task": log.task, "result": log.result,
            "cycle_id": cycle_id,
        })

    # Step 4: CEO
    yield _sse("phase", {"phase": "ceo", "label": "CEO 경영 보고서 작성 중"})
    ceo_log = None
    for ceo in nodes_by_level.get("ceo", []):
        yield _sse("agent_start", {"name": ceo.name, "role": ceo.role, "level": "ceo"})
        child_logs = logs_by_node.get(ceo.id, [])
        log = run_ceo(db, ceo, cycle_id, child_logs, memory_context)
        all_logs.append(log)
        ceo_log = log
        yield _sse("agent_done", {
            "id": log.id, "name": log.agent_name, "role": log.agent_role,
            "level": "ceo", "task": log.task, "result": log.result,
            "cycle_id": cycle_id,
        })

    yield _sse("complete", {
        "cycle_id": cycle_id,
        "total_logs": len(all_logs),
        "ceo_summary": ceo_log.result if ceo_log else "",
    })


# ── Agent P2P Message ─────────────────────────────────────────────────────────
def run_agent_p2p(
    db: Session,
    from_node: OrgNode,
    to_node: OrgNode,
    topic: str,
) -> AgentMessage:
    """Have from_node send a message to to_node about a topic; to_node replies."""
    from_personality = build_personality_context(from_node)
    to_personality = build_personality_context(to_node)
    memory_ctx = get_relevant_memories(db, from_node.company_id)

    # from_node composes message
    sender_system = (
        f"당신은 {from_node.role} {from_node.name}입니다."
        f"{from_personality}"
        + (f"\n\n{memory_ctx}" if memory_ctx else "")
    )
    sender_prompt = (
        f"{to_node.role} {to_node.name}에게 다음 주제로 업무 메시지를 작성하세요: {topic}\n"
        f"3~5문장으로 간결하게 작성하세요."
    )
    sender_ai = get_node_ai_provider(db, from_node)
    message_text = sender_ai.chat(
        messages=[{"role": "user", "content": sender_prompt}],
        system=sender_system,
        max_tokens=300,
    )

    # to_node replies
    receiver_system = (
        f"당신은 {to_node.role} {to_node.name}입니다."
        f"{to_personality}"
        + (f"\n\n{memory_ctx}" if memory_ctx else "")
    )
    receiver_prompt = (
        f"{from_node.role} {from_node.name}으로부터 받은 메시지:\n{message_text}\n\n"
        f"위 메시지에 답장하세요. 3~5문장으로 간결하게 작성하세요."
    )
    receiver_ai = get_node_ai_provider(db, to_node)
    reply_text = receiver_ai.chat(
        messages=[{"role": "user", "content": receiver_prompt}],
        system=receiver_system,
        max_tokens=300,
    )

    msg = AgentMessage(
        company_id=from_node.company_id,
        from_node_id=from_node.id,
        to_node_id=to_node.id,
        from_name=f"{from_node.role} {from_node.name}",
        to_name=f"{to_node.role} {to_node.name}",
        topic=topic,
        message=message_text,
        reply=reply_text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


# ── Weekly Report Generation ──────────────────────────────────────────────────
WEEKLY_REPORT_SYSTEM = """당신은 한그룹 그룹전략실 AI 애널리스트입니다.
주간 업무 데이터를 분석하여 경영진에게 보고할 종합 주간 경영보고서를 작성합니다.
보고서는 마크다운 형식으로 작성하며, 구체적이고 실행 가능한 인사이트를 포함합니다."""


def generate_weekly_report(db: Session, company_id: int) -> Dict[str, Any]:
    """Aggregate last 7 days of work logs and produce AI weekly report."""
    from services.ai_provider import AIProvider

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return {"error": "Company not found"}

    since = datetime.utcnow() - timedelta(days=7)
    logs = (
        db.query(WorkLog)
        .filter(WorkLog.company_id == company_id, WorkLog.created_at >= since)
        .order_by(WorkLog.created_at)
        .all()
    )

    # Count cycles
    cycle_ids = list({l.cycle_id for l in logs if l.cycle_id})
    ceo_logs = [l for l in logs if l.level == "ceo"]

    # Build summary text
    if not logs:
        data_text = "이번 주 업무 기록이 없습니다."
    else:
        ceo_summaries = "\n\n".join(
            f"[사이클 {l.cycle_id} / {l.created_at.strftime('%m/%d %H:%M')}]\n{l.result}"
            for l in ceo_logs
        )
        agent_counts = {}
        for l in logs:
            agent_counts[l.level] = agent_counts.get(l.level, 0) + 1

        data_text = (
            f"회사: {company.name} ({company.industry})\n"
            f"기간: 최근 7일\n"
            f"총 업무 사이클: {len(cycle_ids)}회\n"
            f"총 AI 보고서: {len(logs)}건\n"
            f"레벨별 보고: {', '.join(f'{k} {v}건' for k, v in agent_counts.items())}\n\n"
            f"CEO 경영 보고 내역:\n{ceo_summaries if ceo_summaries else '없음'}"
        )

    # P2P messages this week
    p2p_msgs = (
        db.query(AgentMessage)
        .filter(AgentMessage.company_id == company_id, AgentMessage.created_at >= since)
        .all()
    )
    if p2p_msgs:
        data_text += f"\n\n에이전트 간 협업 메시지: {len(p2p_msgs)}건"

    prompt = (
        f"다음 데이터를 바탕으로 주간 경영보고서를 작성하세요.\n\n"
        f"{data_text}\n\n"
        f"보고서는 다음 항목을 포함하세요:\n"
        f"1. 주간 핵심 성과 요약\n"
        f"2. 부문별 업무 현황\n"
        f"3. 주요 이슈 및 리스크\n"
        f"4. 다음 주 우선순위 액션 3가지\n"
        f"5. 회장에게 드리는 한마디\n\n"
        f"마크다운 형식으로 작성하세요."
    )

    # Get provider config
    config = db.query(ProviderConfig).filter(ProviderConfig.is_active == True).first()
    ai = AIProvider(
        provider=config.provider if config else "ollama",
        api_key=config.api_key if config else None,
        model=config.model_override if config and config.model_override else None,
        base_url=config.base_url if config else None,
    )
    report_md = ai.chat(
        messages=[{"role": "user", "content": prompt}],
        system=WEEKLY_REPORT_SYSTEM,
        max_tokens=1500,
    )

    return {
        "company_id": company_id,
        "company_name": company.name,
        "company_industry": company.industry,
        "period_days": 7,
        "total_cycles": len(cycle_ids),
        "total_logs": len(logs),
        "p2p_messages": len(p2p_msgs),
        "report": report_md,
        "generated_at": datetime.utcnow().isoformat(),
    }
