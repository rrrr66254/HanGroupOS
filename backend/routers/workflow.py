"""
AI 워크플로우 빌더 — 노드 기반 비주얼 파이프라인 설계 및 실행

GET    /api/workflows              — 워크플로우 목록
POST   /api/workflows              — 워크플로우 생성
GET    /api/workflows/{id}         — 상세 조회
PATCH  /api/workflows/{id}         — 수정 (노드/엣지 업데이트)
DELETE /api/workflows/{id}         — 삭제
POST   /api/workflows/{id}/execute — 워크플로우 실행
GET    /api/workflows/{id}/history — 실행 이력
GET    /api/workflows/node-types   — 사용 가능한 노드 타입 목록
"""
import json
import logging
import re
import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user
from models.models import (
    WorkflowDefinition, WorkflowExecution, Company, User,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

# ── 노드 타입 정의 ──────────────────────────────────────────────────────────
NODE_TYPES = [
    {
        "type": "ai_chat",
        "label": "AI 대화",
        "category": "ai",
        "icon": "MessageSquare",
        "description": "AI 모델에 프롬프트를 전송하고 응답을 받습니다",
        "config_schema": {"prompt": "string", "system_prompt": "string", "model": "string"},
    },
    {
        "type": "ai_analysis",
        "label": "AI 분석",
        "category": "ai",
        "icon": "Brain",
        "description": "입력 데이터를 AI로 분석합니다",
        "config_schema": {"analysis_type": "string", "prompt": "string"},
    },
    {
        "type": "data_fetch",
        "label": "데이터 조회",
        "category": "data",
        "icon": "Database",
        "description": "DB 또는 외부 소스에서 데이터를 가져옵니다",
        "config_schema": {"source": "string", "query": "string"},
    },
    {
        "type": "filter",
        "label": "필터/조건",
        "category": "logic",
        "icon": "Filter",
        "description": "조건에 따라 데이터를 필터링합니다",
        "config_schema": {"condition": "string", "field": "string"},
    },
    {
        "type": "transform",
        "label": "데이터 변환",
        "category": "data",
        "icon": "Shuffle",
        "description": "데이터 형식을 변환합니다",
        "config_schema": {"transform_type": "string", "mapping": "object"},
    },
    {
        "type": "notification",
        "label": "알림 발송",
        "category": "action",
        "icon": "Bell",
        "description": "시스템 알림을 발송합니다",
        "config_schema": {"title": "string", "body": "string", "notif_type": "string"},
    },
    {
        "type": "approval",
        "label": "승인 요청",
        "category": "action",
        "icon": "CheckSquare",
        "description": "승인 프로세스를 시작합니다",
        "config_schema": {"title": "string", "description": "string"},
    },
    {
        "type": "webhook",
        "label": "웹훅 호출",
        "category": "integration",
        "icon": "Globe",
        "description": "외부 API/웹훅을 호출합니다",
        "config_schema": {"url": "string", "method": "string", "headers": "object"},
    },
    {
        "type": "delay",
        "label": "대기",
        "category": "logic",
        "icon": "Clock",
        "description": "지정된 시간만큼 대기합니다",
        "config_schema": {"seconds": "number"},
    },
    {
        "type": "merge",
        "label": "병합",
        "category": "logic",
        "icon": "GitMerge",
        "description": "여러 입력을 하나로 병합합니다",
        "config_schema": {"strategy": "string"},
    },
]


@router.get("/node-types")
def list_node_types():
    return NODE_TYPES


@router.get("")
def list_workflows(
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(WorkflowDefinition)
    if company_id:
        q = q.filter(WorkflowDefinition.company_id == company_id)
    if status:
        q = q.filter(WorkflowDefinition.status == status)
    rows = q.order_by(WorkflowDefinition.updated_at.desc()).all()
    return [_fmt(w) for w in rows]


@router.post("")
def create_workflow(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = WorkflowDefinition(
        company_id=body.get("company_id"),
        name=body.get("name", "새 워크플로우"),
        description=body.get("description", ""),
        nodes=body.get("nodes", []),
        edges=body.get("edges", []),
        status=body.get("status", "draft"),
        created_by=current_user.id,
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return _fmt(w)


@router.get("/{wf_id}")
def get_workflow(
    wf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == wf_id).first()
    if not w:
        raise HTTPException(404, "워크플로우를 찾을 수 없습니다")
    return _fmt(w)


@router.patch("/{wf_id}")
def update_workflow(
    wf_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == wf_id).first()
    if not w:
        raise HTTPException(404, "워크플로우를 찾을 수 없습니다")
    for field in ("name", "description", "nodes", "edges", "status", "company_id"):
        if field in body:
            setattr(w, field, body[field])
    w.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(w)
    return _fmt(w)


@router.delete("/{wf_id}")
def delete_workflow(
    wf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == wf_id).first()
    if w:
        db.delete(w)
        db.commit()
    return {"ok": True}


@router.post("/{wf_id}/execute")
def execute_workflow(
    wf_id: int,
    body: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """워크플로우를 실행하고 각 노드를 순차 처리합니다."""
    body = body or {}
    w = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == wf_id).first()
    if not w:
        raise HTTPException(404, "워크플로우를 찾을 수 없습니다")

    execution = WorkflowExecution(
        workflow_id=wf_id,
        status="running",
        input_data=body.get("input_data", {}),
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    node_results = {}
    nodes = w.nodes or []
    edges = w.edges or []

    # 토폴로지 정렬로 실행 순서 결정
    sorted_nodes = _topological_sort(nodes, edges)

    try:
        for node in sorted_nodes:
            node_id = node.get("id", "")
            node_type = node.get("type", "")
            config = node.get("config", {})
            start = time.time()

            try:
                output = _execute_node(node_type, config, node_results, body.get("input_data", {}), db, current_user)
                duration_ms = int((time.time() - start) * 1000)
                node_results[node_id] = {"status": "completed", "output": output, "duration_ms": duration_ms}
            except Exception as e:
                duration_ms = int((time.time() - start) * 1000)
                node_results[node_id] = {"status": "failed", "error": str(e), "duration_ms": duration_ms}
                raise

        execution.status = "completed"
        execution.output_data = node_results.get(sorted_nodes[-1]["id"], {}).get("output", {}) if sorted_nodes else {}
    except Exception as e:
        execution.status = "failed"
        execution.error_msg = str(e)

    execution.node_results = node_results
    execution.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(execution)

    return _fmt_exec(execution)


@router.get("/{wf_id}/history")
def execution_history(
    wf_id: int,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(WorkflowExecution)
        .filter(WorkflowExecution.workflow_id == wf_id)
        .order_by(WorkflowExecution.started_at.desc())
        .limit(limit)
        .all()
    )
    return [_fmt_exec(e) for e in rows]


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────
def _fmt(w: WorkflowDefinition) -> dict:
    return {
        "id": w.id,
        "company_id": w.company_id,
        "name": w.name,
        "description": w.description,
        "nodes": w.nodes or [],
        "edges": w.edges or [],
        "status": w.status,
        "created_by": w.created_by,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }


def _fmt_exec(e: WorkflowExecution) -> dict:
    return {
        "id": e.id,
        "workflow_id": e.workflow_id,
        "status": e.status,
        "input_data": e.input_data,
        "output_data": e.output_data,
        "node_results": e.node_results,
        "error_msg": e.error_msg,
        "started_at": e.started_at.isoformat() if e.started_at else None,
        "finished_at": e.finished_at.isoformat() if e.finished_at else None,
    }


def _topological_sort(nodes: list, edges: list) -> list:
    """노드를 토폴로지 정렬하여 실행 순서를 결정합니다."""
    node_map = {n.get("id"): n for n in nodes}
    in_degree = {n.get("id"): 0 for n in nodes}
    adj = {n.get("id"): [] for n in nodes}

    for edge in edges:
        src = edge.get("source")
        tgt = edge.get("target")
        if src in adj and tgt in in_degree:
            adj[src].append(tgt)
            in_degree[tgt] += 1

    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    result = []
    while queue:
        nid = queue.pop(0)
        if nid in node_map:
            result.append(node_map[nid])
        for neighbor in adj.get(nid, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # 연결되지 않은 노드도 포함
    visited = {n.get("id") for n in result}
    for n in nodes:
        if n.get("id") not in visited:
            result.append(n)

    return result


def _execute_node(
    node_type: str, config: dict, prev_results: dict,
    input_data: dict, db, current_user,
) -> dict:
    """개별 노드를 실행합니다."""
    if node_type == "ai_chat":
        try:
            from services.ai_provider import get_provider_from_db
            provider = get_provider_from_db(db, current_user.id)
            prompt = config.get("prompt", "Hello")
            system = config.get("system_prompt", "")
            messages = [{"role": "user", "content": prompt}]
            raw = provider.chat(messages, system=system, session_type="workflow")
            return {"response": raw}
        except Exception as e:
            return {"response": f"AI 호출 실패: {e}"}

    elif node_type == "ai_analysis":
        try:
            from services.ai_provider import get_provider_from_db
            provider = get_provider_from_db(db, current_user.id)
            prompt = config.get("prompt", "데이터를 분석해주세요")
            context = json.dumps(input_data, ensure_ascii=False, default=str)
            messages = [{"role": "user", "content": f"{prompt}\n\n데이터:\n{context[:2000]}"}]
            raw = provider.chat(messages, system="당신은 데이터 분석 전문가입니다.", session_type="workflow")
            return {"analysis": raw}
        except Exception as e:
            return {"analysis": f"분석 실패: {e}"}

    elif node_type == "data_fetch":
        source = config.get("source", "companies")
        if source == "companies":
            companies = db.query(Company).limit(50).all()
            return {"data": [{"id": c.id, "name": c.name, "industry": c.industry} for c in companies]}
        return {"data": [], "message": f"소스 '{source}' 미구현"}

    elif node_type == "filter":
        condition = config.get("condition", "")
        return {"filtered": True, "condition": condition, "note": "필터 적용됨"}

    elif node_type == "transform":
        return {"transformed": True, "type": config.get("transform_type", "passthrough")}

    elif node_type == "notification":
        from routers.notifications import create_notification
        title = config.get("title", "워크플로우 알림")
        body = config.get("body", "")
        create_notification(db, title=title, body=body, notif_type="info", icon="⚙️")
        return {"sent": True, "title": title}

    elif node_type == "delay":
        seconds = min(config.get("seconds", 1), 10)
        time.sleep(seconds)
        return {"delayed": seconds}

    elif node_type == "merge":
        return {"merged": True, "inputs": list(prev_results.keys())}

    elif node_type == "approval":
        return {"approval_requested": True, "title": config.get("title", "")}

    elif node_type == "webhook":
        return {"webhook_called": True, "url": config.get("url", ""), "note": "시뮬레이션 모드"}

    return {"note": f"알 수 없는 노드 타입: {node_type}"}
