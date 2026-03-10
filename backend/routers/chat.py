import re
import json
import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db, SessionLocal
from core.security import get_current_user
from models.models import ChatSession, ChatMessage, User, AISuggestion, Company, OrgNode, StrategyItem, TerminalRequest, ApprovalRequest, VideoJob
from schemas.schemas import (
    ChatSessionCreate, ChatSessionOut,
    ChatMessageOut, ChatRequest, CompanyQueryRequest,
    ConfirmCompanyRequest, BriefCeoRequest, CollaborateRequest,
    MultiCeoMeetingRequest, BoardMeetingRequest,
)
from services.ai_provider import (
    get_provider_from_db,
    CHAIRMAN_SYSTEM, CEO_SYSTEM,
)
from services.org_service import create_company_org
from services.work_service import (
    build_personality_context, get_relevant_memories, get_node_ai_provider,
)
from services.reality_engine import build_reality_context, build_api_key_context


def _execute_actions(ai_response: str, db: Session, user_id: int) -> tuple:
    """Parse <<CREATE_COMPANY:...>> blocks, execute them, return (clean_text, result_lines)."""
    results = []
    pattern = re.compile(r'<<CREATE_COMPANY:(.*?)>>', re.DOTALL)

    for match in pattern.finditer(ai_response):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
            company = Company(
                name=data.get("name", "신규 계열사"),
                description=data.get("description", ""),
                industry=data.get("industry", "일반"),
                vision=data.get("vision", ""),
                status="active",
                created_by=user_id,
            )
            db.add(company)
            db.flush()
            create_company_org(db, company.id, data.get("industry", "general"), "any")
            db.flush()
            org_plan = data.get("org_plan", [])
            org_summary = " → ".join([f"{o.get('role','')}" for o in org_plan[:4]]) if org_plan else "표준 조직"
            results.append(
                f"\n\n✅ **계열사 설립 완료** — {company.name} (ID #{company.id})\n"
                f"산업: {company.industry} | 조직: {org_summary}"
            )
        except Exception as exc:
            results.append(f"\n\n❌ 계열사 설립 오류: {exc}")

    clean = pattern.sub("", ai_response).strip()
    return clean, results

def _process_api_key_saves(content: str, db) -> tuple:
    """
    <<SAVE_API_KEY:{...}>> 블록을 파싱하여 DB에 저장합니다.
    반환: (clean_text, save_results)
    """
    from models.models import ExternalApiKey
    from datetime import datetime as _dt
    results = []
    pattern = re.compile(r'<<SAVE_API_KEY:(.*?)>>', re.DOTALL)

    for match in pattern.finditer(content):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
            service = data.get("service", "").strip()
            api_key = data.get("api_key", "").strip()
            label = data.get("label", service)
            extra_config = data.get("extra_config", {})

            if not service:
                results.append("\n\n❌ API 키 저장 실패: service 값이 없습니다.")
                continue

            # 기존 키가 있으면 업데이트, 없으면 신규 생성
            existing = db.query(ExternalApiKey).filter(
                ExternalApiKey.service == service
            ).first()

            if existing:
                existing.api_key = api_key
                existing.label = label or existing.label
                if extra_config:
                    merged = dict(existing.extra_config or {})
                    merged.update(extra_config)
                    existing.extra_config = merged
                existing.is_active = True
                existing.updated_at = _dt.utcnow()
                action = "업데이트"
            else:
                existing = ExternalApiKey(
                    service=service,
                    label=label,
                    api_key=api_key,
                    extra_config=extra_config,
                    is_active=True,
                )
                db.add(existing)
                action = "등록"

            db.flush()
            key_preview = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else "****"
            results.append(
                f"\n\n✅ **{label} API 키 {action} 완료**\n"
                f"서비스: `{service}` | 키: `{key_preview}`"
                + (f" | 추가 설정: {extra_config}" if extra_config else "")
            )
        except json.JSONDecodeError as exc:
            results.append(f"\n\n❌ API 키 저장 실패 (JSON 파싱 오류): {exc}")
        except Exception as exc:
            results.append(f"\n\n❌ API 키 저장 실패: {exc}")

    clean = pattern.sub("", content).strip()
    return clean, results


def _process_code_actions(content: str, provider, system_prompt: str, max_retries: int = 5) -> tuple:
    """
    응답에서 코드 실행 관련 액션 블록을 처리합니다.

    처리 순서 (응답에 등장하는 순서대로):
      <<INSTALL_PACKAGE:{...}>>  — pip 패키지 설치
      <<SQL_QUERY:{...}>>        — 워크스페이스 DB SQL 실행
      <<EXECUTE_CODE:{...}>>     — Python 코드 실행 (실패 시 자동 디버깅 루프)

    EXECUTE_CODE 실패 시 AI에게 오류를 전달하여 코드를 수정받고 최대 max_retries회 재시도합니다.
    """
    from services.code_executor import execute_python, install_package
    from services.workspace_db import execute_sql

    results = []

    # ── 1. INSTALL_PACKAGE ────────────────────────────────────────────────────
    install_pat = re.compile(r'<<INSTALL_PACKAGE:(.*?)>>', re.DOTALL)
    for m in install_pat.finditer(content):
        try:
            data = json.loads(m.group(1).strip())
            pkg = data.get("package", "").strip()
            desc = data.get("description", pkg)
            if not pkg:
                continue
            res = install_package(pkg)
            if res["success"]:
                results.append(f"\n\n📦 **패키지 설치 완료**: `{pkg}`")
            else:
                results.append(f"\n\n❌ **패키지 설치 실패** `{pkg}`\n```\n{res['stderr'][:500]}\n```")
        except Exception as e:
            results.append(f"\n\n❌ INSTALL_PACKAGE 파싱 오류: {e}")
    content = install_pat.sub("", content)

    # ── 2. SQL_QUERY ──────────────────────────────────────────────────────────
    sql_pat = re.compile(r'<<SQL_QUERY:(.*?)>>', re.DOTALL)
    for m in sql_pat.finditer(content):
        try:
            data = json.loads(m.group(1).strip())
            query = data.get("query", "").strip()
            desc = data.get("description", "SQL 실행")
            if not query:
                continue
            res = execute_sql(query)
            if res["success"]:
                if "rows" in res:
                    preview = str(res["rows"][:5])[:400]
                    results.append(
                        f"\n\n✅ **{desc}** 완료 — {res['count']}행 반환\n```\n{preview}\n```"
                    )
                else:
                    results.append(
                        f"\n\n✅ **{desc}** 완료 — 영향 행: {res.get('affected_rows', 0)}"
                    )
            else:
                results.append(f"\n\n❌ **SQL 오류**: `{res.get('error', '알 수 없음')}`")
        except Exception as e:
            results.append(f"\n\n❌ SQL_QUERY 파싱 오류: {e}")
    content = sql_pat.sub("", content)

    # ── 3. EXECUTE_CODE (with debug loop) ─────────────────────────────────────
    code_pat = re.compile(r'<<EXECUTE_CODE:(.*?)>>', re.DOTALL)
    code_matches = list(code_pat.finditer(content))

    for m in code_matches:
        try:
            data = json.loads(m.group(1).strip())
        except Exception as e:
            results.append(f"\n\n❌ EXECUTE_CODE JSON 파싱 오류: {e}")
            continue

        desc = data.get("description", "코드 실행")
        current_code = data.get("code", "").strip()
        if not current_code:
            continue

        attempt_logs = []
        success = False

        for attempt in range(1, max_retries + 1):
            exec_res = execute_python(current_code)

            if exec_res["success"]:
                output = exec_res["stdout"] or "(출력 없음)"
                results.append(
                    f"\n\n✅ **[{desc}]** 실행 성공 (시도 {attempt}/{max_retries})"
                    f" — {exec_res['elapsed_seconds']}초\n"
                    f"```\n{output[:3000]}\n```"
                )
                success = True
                break
            else:
                # 실패 기록
                err = exec_res["stderr"] or exec_res.get("stdout", "알 수 없는 오류")
                attempt_logs.append(f"시도 {attempt}: {err[:300]}")
                results.append(
                    f"\n\n⚠️ **[{desc}]** 시도 {attempt} 실패 — AI가 코드 수정 중...\n"
                    f"```\n{err[:500]}\n```"
                )

                if attempt >= max_retries:
                    results.append(
                        f"\n\n❌ **[{desc}]** {max_retries}회 시도 후 최종 실패.\n"
                        f"마지막 오류:\n```\n{err[:800]}\n```"
                    )
                    break

                # AI에게 오류 전달 → 수정된 코드 요청
                fix_prompt = (
                    f"Python 코드 실행 중 오류가 발생했습니다. 코드를 수정해주세요.\n\n"
                    f"**작업**: {desc}\n\n"
                    f"**오류 메시지**:\n```\n{err[:1500]}\n```\n\n"
                    f"**실패한 코드**:\n```python\n{current_code[:3000]}\n```\n\n"
                    f"오류 원인을 분석하고 수정된 전체 코드를 아래 형식으로만 제출하세요:\n"
                    f"<<EXECUTE_CODE:{{\"language\":\"python\",\"code\":\"수정된코드\",\"description\":\"{desc}\"}}>>\n\n"
                    f"필요한 패키지가 없다면 먼저:\n"
                    f"<<INSTALL_PACKAGE:{{\"package\":\"패키지명\"}}>>"
                )
                try:
                    fix_response = provider.chat(
                        [{"role": "user", "content": fix_prompt}],
                        system=system_prompt,
                    )

                    # INSTALL_PACKAGE 먼저 처리
                    fix_install = re.search(r'<<INSTALL_PACKAGE:(.*?)>>', fix_response, re.DOTALL)
                    if fix_install:
                        try:
                            pkg_data = json.loads(fix_install.group(1).strip())
                            pkg = pkg_data.get("package", "")
                            if pkg:
                                install_res = install_package(pkg)
                                if install_res["success"]:
                                    results.append(f"\n\n📦 **자동 설치**: `{pkg}`")
                        except Exception:
                            pass

                    # 수정된 코드 추출
                    new_match = re.search(r'<<EXECUTE_CODE:(.*?)>>', fix_response, re.DOTALL)
                    if new_match:
                        try:
                            new_data = json.loads(new_match.group(1).strip())
                            current_code = new_data.get("code", current_code).strip()
                        except Exception:
                            pass  # 파싱 실패 시 기존 코드 유지
                except Exception as call_err:
                    results.append(f"\n\n❌ AI 코드 수정 호출 실패: {call_err}")
                    break

    content = code_pat.sub("", content)
    return content.strip(), results


def _process_approval_actions(content: str, db, user_id: int) -> tuple:
    """Parse <<APPROVE_REQUEST:...>>, <<REJECT_REQUEST:...>>,
    <<APPROVE_TERMINAL:...>>, <<REJECT_TERMINAL:...>> blocks."""
    from datetime import datetime as _dt
    import subprocess
    results = []

    # ApprovalRequest handling
    for action, is_approve in [("APPROVE_REQUEST", True), ("REJECT_REQUEST", False)]:
        pattern = re.compile(rf'<<{action}:(.*?)>>', re.DOTALL)
        for match in pattern.finditer(content):
            try:
                data = json.loads(match.group(1).strip())
                req_id = int(data.get("id", 0))
                note = data.get("note", "")
                approval = db.query(ApprovalRequest).filter(
                    ApprovalRequest.id == req_id, ApprovalRequest.status == "pending"
                ).first()
                if not approval:
                    results.append(f"\n\n⚠️ 승인 요청 #{req_id} 를 찾을 수 없거나 이미 처리됐습니다.")
                    continue
                approval.status = "approved" if is_approve else "rejected"
                approval.reviewer_note = note
                approval.reviewed_by = user_id
                approval.reviewed_at = _dt.utcnow()
                db.flush()
                if is_approve and approval.request_type == "capability_update":
                    try:
                        from services.capability_analyzer import activate_capabilities
                        activate_capabilities(approval.id, db)
                    except Exception:
                        pass
                status_label = "✅ 승인" if is_approve else "❌ 반려"
                results.append(f"\n\n{status_label} — [{approval.request_type}] {approval.title} (#{req_id})")
            except Exception as exc:
                results.append(f"\n\n❌ {action} 처리 오류: {exc}")
        content = pattern.sub("", content)

    # Bulk ApprovalRequest handling
    for action, is_approve in [("APPROVE_ALL_REQUESTS", True), ("REJECT_ALL_REQUESTS", False)]:
        pattern = re.compile(rf'<<{action}:(.*?)>>', re.DOTALL)
        for match in pattern.finditer(content):
            try:
                data = json.loads(match.group(1).strip())
                req_type = data.get("type", "")
                note = data.get("note", "일괄 처리")
                q = db.query(ApprovalRequest).filter(ApprovalRequest.status == "pending")
                if req_type:
                    q = q.filter(ApprovalRequest.request_type == req_type)
                pending_list = q.all()
                count = 0
                for approval in pending_list:
                    approval.status = "approved" if is_approve else "rejected"
                    approval.reviewer_note = note
                    approval.reviewed_by = user_id
                    approval.reviewed_at = _dt.utcnow()
                    if is_approve and approval.request_type == "capability_update":
                        try:
                            from services.capability_analyzer import activate_capabilities
                            activate_capabilities(approval.id, db)
                        except Exception:
                            pass
                    count += 1
                db.flush()
                label = "✅ 일괄 승인" if is_approve else "❌ 일괄 반려"
                type_label = f" [{req_type}]" if req_type else ""
                results.append(f"\n\n{label}{type_label} — {count}건 처리 완료")
            except Exception as exc:
                results.append(f"\n\n❌ {action} 처리 오류: {exc}")
        content = pattern.sub("", content)

    # Bulk TerminalRequest handling
    approve_all_term_pat = re.compile(r'<<APPROVE_ALL_TERMINALS:(.*?)>>', re.DOTALL)
    for match in approve_all_term_pat.finditer(content):
        try:
            pending_terms = db.query(TerminalRequest).filter(TerminalRequest.status == "pending").all()
            count = 0
            for tr in pending_terms:
                tr.status = "approved"; tr.approved_by = user_id; tr.decided_at = _dt.utcnow()
                db.flush()
                result = subprocess.run(tr.command, shell=True, capture_output=True, text=True,
                    timeout=30, cwd=os.path.expanduser("~"))
                tr.output = (result.stdout or "") + (("\n[stderr]\n" + result.stderr) if result.stderr else "")
                tr.exit_code = result.returncode; tr.status = "executed"; tr.executed_at = _dt.utcnow()
                db.flush()
                count += 1
            results.append(f"\n\n✅ 터미널 일괄 승인 & 실행 — {count}건 완료")
        except Exception as exc:
            results.append(f"\n\n❌ APPROVE_ALL_TERMINALS 처리 오류: {exc}")
    content = approve_all_term_pat.sub("", content)

    # TerminalRequest handling
    for action, is_approve in [("APPROVE_TERMINAL", True), ("REJECT_TERMINAL", False)]:
        pattern = re.compile(rf'<<{action}:(.*?)>>', re.DOTALL)
        for match in pattern.finditer(content):
            try:
                data = json.loads(match.group(1).strip())
                req_id = int(data.get("id", 0))
                note = data.get("note", "")
                tr = db.query(TerminalRequest).filter(
                    TerminalRequest.id == req_id, TerminalRequest.status == "pending"
                ).first()
                if not tr:
                    results.append(f"\n\n⚠️ 터미널 요청 #{req_id} 를 찾을 수 없거나 이미 처리됐습니다.")
                    continue
                if is_approve:
                    tr.status = "approved"
                    tr.approved_by = user_id
                    tr.decided_at = _dt.utcnow()
                    db.flush()
                    result = subprocess.run(
                        tr.command, shell=True, capture_output=True, text=True,
                        timeout=30, cwd=os.path.expanduser("~")
                    )
                    tr.output = (result.stdout or "") + (("\n[stderr]\n" + result.stderr) if result.stderr else "")
                    tr.exit_code = result.returncode
                    tr.status = "executed"
                    tr.executed_at = _dt.utcnow()
                    db.flush()
                    output_preview = (tr.output or "")[:300]
                    results.append(
                        f"\n\n✅ 터미널 #{req_id} 승인 & 실행 완료 (exit {tr.exit_code})\n"
                        f"`{tr.command}`\n```\n{output_preview}\n```"
                    )
                else:
                    tr.status = "rejected"
                    tr.output = note or "AI 회장에 의해 거부됨"
                    tr.decided_at = _dt.utcnow()
                    db.flush()
                    results.append(f"\n\n❌ 터미널 #{req_id} 거부됨\n`{tr.command}`")
            except Exception as exc:
                results.append(f"\n\n❌ {action} 처리 오류: {exc}")
        content = pattern.sub("", content)

    return content.strip(), results


def _process_model_updates(content: str, db) -> tuple:
    """Parse <<UPDATE_MODEL:...>> blocks, update OrgNode AI model/provider, return (clean_text, result_lines).
    Format: <<UPDATE_MODEL:{"node_id":1,"provider":"openai","model":"gpt-4o-mini"}>>
    Or by name: <<UPDATE_MODEL:{"name":"CEO","company":"한테크","provider":"anthropic","model":"claude-sonnet-4-6"}>>
    """
    results = []
    pattern = re.compile(r'<<UPDATE_MODEL:(.*?)>>', re.DOTALL)
    for match in pattern.finditer(content):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
            node = None
            # Find by node_id
            if "node_id" in data:
                node = db.query(OrgNode).filter(OrgNode.id == int(data["node_id"])).first()
            # Find by name + company name
            elif "name" in data:
                q = db.query(OrgNode).filter(OrgNode.name.ilike(f"%{data['name']}%"))
                if "company" in data:
                    comp = db.query(Company).filter(Company.name.ilike(f"%{data['company']}%")).first()
                    if comp:
                        q = q.filter(OrgNode.company_id == comp.id)
                node = q.first()
            if not node:
                results.append(f"\n\n⚠️ 모델 변경 실패: 해당 조직원을 찾을 수 없습니다 ({data})")
                continue
            old_provider = node.ai_provider
            old_model = node.ai_model
            if "provider" in data:
                node.ai_provider = data["provider"]
            if "model" in data:
                node.ai_model = data["model"]
            db.flush()
            results.append(
                f"\n\n✅ **모델 변경 완료** — {node.name} ({node.role})\n"
                f"{old_provider}/{old_model} → {node.ai_provider}/{node.ai_model}"
            )
        except Exception as exc:
            results.append(f"\n\n❌ 모델 변경 오류: {exc}")
    clean = pattern.sub("", content).strip()
    return clean, results


def _process_terminal_requests(content: str, db, company_id, user_id: int) -> tuple:
    """Parse <<TERMINAL_REQUEST:...>> blocks, create DB records, return (clean_text, req_ids)."""
    req_ids = []
    pattern = re.compile(r'<<TERMINAL_REQUEST:(.*?)>>', re.DOTALL)
    for match in pattern.finditer(content):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
            tr = TerminalRequest(
                company_id=company_id,
                requested_by_name="AI CEO",
                command=data.get("cmd", "").strip(),
                reason=data.get("reason", ""),
                status="pending",
            )
            db.add(tr)
            db.flush()
            req_ids.append(tr.id)
        except Exception:
            pass
    clean = pattern.sub("", content).strip()
    return clean, req_ids


def _process_video_requests(content: str, db, company_id, user_id: int, session_id: int = 0) -> tuple:
    """Parse <<VIDEO_REQUEST:...>> blocks → pending VideoJob + ApprovalRequest."""
    from datetime import datetime as _dt

    req_ids = []
    pattern = re.compile(r'<<VIDEO_REQUEST:(.*?)>>', re.DOTALL)
    for match in pattern.finditer(content):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
            prompt = data.get("prompt", "").strip()
            model_id = data.get("model_id", "Lightricks/LTX-Video-0.9.8-13B-distilled")
            reason = data.get("reason", "")
            if not prompt:
                continue

            # VideoJob in pending state — actual generation starts after HF token check
            job = VideoJob(
                company_id=company_id,
                prompt=prompt,
                model_id=model_id,
                status="pending",
                meta={"requested_by": "AI CEO", "reason": reason, "session_id": session_id},
                created_by=user_id,
            )
            db.add(job)
            db.flush()

            # ApprovalRequest so admin can confirm before generation
            approval = ApprovalRequest(
                title=f"영상 생성 요청: {prompt[:60]}",
                description=f"AI CEO가 영상 생성을 요청했습니다.\n\n프롬프트: {prompt}\n\n이유: {reason}",
                request_type="video_gen",
                status="pending",
                requester="AI CEO",
                company_id=company_id,
                meta={"video_job_id": job.id, "model_id": model_id, "session_id": session_id},
            )
            db.add(approval)
            db.flush()
            req_ids.append((job.id, prompt))
        except Exception:
            pass
    clean = pattern.sub("", content).strip()
    return clean, req_ids


router = APIRouter(prefix="/api/chat", tags=["chat"])


def _get_system(session_type: str) -> str:
    if session_type == "chairman":
        return CHAIRMAN_SYSTEM
    elif session_type == "ceo":
        return CEO_SYSTEM
    return "당신은 한그룹의 AI 어시스턴트입니다."


@router.get("/sessions", response_model=List[ChatSessionOut])
def list_sessions(
    session_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ChatSession).filter(ChatSession.created_by == current_user.id)
    if session_type:
        q = q.filter(ChatSession.session_type == session_type)
    return q.order_by(ChatSession.created_at.desc()).all()


@router.post("/sessions", response_model=ChatSessionOut)
def create_session(
    session_in: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ChatSession(
        company_id=session_in.company_id,
        session_type=session_in.session_type,
        title=session_in.title,
        agent_name=session_in.agent_name,
        created_by=current_user.id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageOut])
def get_messages(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )


@router.post("/send", response_model=ChatMessageOut)
def send_message(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Save user message
    user_msg = ChatMessage(
        session_id=req.session_id,
        role="user",
        content=req.content,
        sender_name=current_user.username,
    )
    db.add(user_msg)
    db.flush()

    # Build message history
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == req.session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    messages = [{"role": m.role, "content": m.content} for m in history]

    # Call AI
    provider = get_provider_from_db(db, current_user.id, req.provider_override)
    if req.model_override:
        provider.model = req.model_override

    system_prompt = _get_system(session.session_type)
    system_prompt += build_reality_context(db, session.session_type, session.company_id)
    if session.session_type == "chairman":
        system_prompt += build_api_key_context(db)
    ai_response = provider.chat(
        messages, system=system_prompt, session_type=session.session_type
    )

    # Execute any embedded action blocks
    clean_response, api_key_results = _process_api_key_saves(ai_response, db)
    clean_response, terminal_req_ids = _process_terminal_requests(clean_response, db, session.company_id, current_user.id)
    clean_response, video_reqs = _process_video_requests(clean_response, db, session.company_id, current_user.id, session_id=session.id)
    clean_response, model_update_results = _process_model_updates(clean_response, db)
    clean_response, approval_results = _process_approval_actions(clean_response, db, current_user.id)
    clean_response, action_results = _execute_actions(clean_response, db, current_user.id)
    # Code execution actions (INSTALL_PACKAGE / SQL_QUERY / EXECUTE_CODE with debug loop)
    clean_response, code_results = _process_code_actions(clean_response, provider, system_prompt)
    # Terminal request notifications
    terminal_notes = ""
    for rid in terminal_req_ids:
        tr = db.query(TerminalRequest).filter(TerminalRequest.id == rid).first()
        if tr:
            terminal_notes += f"\n\n📋 **터미널 명령 요청 제출됨** (요청 #{tr.id})\n`{tr.command}`\n사유: {tr.reason}\nAdmin이 승인하면 터미널 페이지에서 실행됩니다."
    # Video request notifications
    video_notes = ""
    for job_id, prompt in video_reqs:
        video_notes += f"\n\n🎬 **영상 생성 요청 제출됨** (작업 #{job_id})\n프롬프트: `{prompt[:80]}`\n승인함에서 확인 후 영상 스튜디오에서 생성됩니다."
    final_content = clean_response + "".join(action_results) + "".join(api_key_results) + "".join(model_update_results) + "".join(approval_results) + "".join(code_results) + terminal_notes + video_notes

    # Save AI response
    ai_name = session.agent_name or {
        "chairman": "AI 회장",
        "ceo": "AI CEO",
        "committee": "AI 위원회",
    }.get(session.session_type, "AI 어시스턴트")

    ai_msg = ChatMessage(
        session_id=req.session_id,
        role="assistant",
        content=final_content,
        sender_name=ai_name,
    )
    db.add(ai_msg)

    # Auto-generate suggestion if content triggers keywords
    trigger_words = ["새로운", "신규", "만들", "추가", "설립", "시작"]
    if any(w in req.content for w in trigger_words):
        suggestion = AISuggestion(
            company_id=session.company_id,
            title="AI 제안: 새로운 기회 탐지",
            description=f"대화 분석 결과: {req.content[:100]}... 관련 기회가 감지되었습니다.",
            suggestion_type="opportunity",
            priority="medium",
        )
        db.add(suggestion)

    db.commit()
    db.refresh(ai_msg)
    return ai_msg


@router.post("/stream")
def stream_message(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream AI response via Server-Sent Events (Ollama only; others fall back to single chunk)."""
    session = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Save user message
    user_msg = ChatMessage(
        session_id=req.session_id,
        role="user",
        content=req.content,
        sender_name=current_user.username,
    )
    db.add(user_msg)
    db.flush()

    # Build history
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == req.session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    messages_list = [{"role": m.role, "content": m.content} for m in history]

    provider = get_provider_from_db(db, current_user.id, req.provider_override)
    if req.model_override:
        provider.model = req.model_override

    system_prompt = _get_system(session.session_type)
    # Inject real DB data into system prompt to prevent AI hallucination
    reality_ctx = build_reality_context(db, session.session_type, session.company_id)
    system_prompt = system_prompt + reality_ctx
    if session.session_type == "chairman":
        system_prompt += build_api_key_context(db)

    ai_name = session.agent_name or {
        "chairman": "AI 회장",
        "ceo": "AI CEO",
        "committee": "AI 위원회",
    }.get(session.session_type, "AI 어시스턴트")

    # Capture values needed inside generator (DB session will be closed by then)
    session_id = req.session_id
    company_id = session.company_id
    user_id = current_user.id
    prov = provider
    sys_prompt = system_prompt
    msgs = messages_list
    name = ai_name
    db.commit()

    def generate():
        import httpx
        full_content = ""

        try:
            if prov.provider == "ollama":
                base_url = prov.base_url or __import__("core.config", fromlist=["settings"]).settings.OLLAMA_BASE_URL
                full_msgs = []
                if sys_prompt:
                    full_msgs.append({"role": "system", "content": sys_prompt})
                full_msgs.extend(msgs)

                with httpx.stream(
                    "POST",
                    f"{base_url}/api/chat",
                    json={"model": prov.model, "messages": full_msgs, "stream": True},
                    timeout=120,
                ) as r:
                    for line in r.iter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            chunk = data.get("message", {}).get("content", "")
                            done = data.get("done", False)
                            if chunk:
                                full_content += chunk
                                yield f"data: {json.dumps({'chunk': chunk, 'done': False}, ensure_ascii=False)}\n\n"
                            if done:
                                break
                        except json.JSONDecodeError:
                            continue
            elif prov.provider == "anthropic":
                import anthropic as _anthropic

                client = _anthropic.Anthropic(api_key=prov.api_key)
                # extended thinking is only supported on claude-3-7-sonnet models
                supports_thinking = prov.model and "claude-3-7-sonnet" in prov.model
                stream_kwargs: dict = {
                    "model": prov.model,
                    "max_tokens": 16000 if supports_thinking else 4096,
                    "system": sys_prompt or "You are an AI executive assistant for HAN Group.",
                    "messages": msgs,
                }
                if supports_thinking:
                    stream_kwargs["thinking"] = {"type": "enabled", "budget_tokens": 8000}
                with client.messages.stream(**stream_kwargs) as stream:
                    for event in stream:
                        if event.type == "content_block_delta":
                            if supports_thinking and event.delta.type == "thinking_delta":
                                yield f"data: {json.dumps({'thinking_chunk': event.delta.thinking, 'done': False}, ensure_ascii=False)}\n\n"
                            elif event.delta.type == "text_delta":
                                full_content += event.delta.text
                                yield f"data: {json.dumps({'chunk': event.delta.text, 'done': False}, ensure_ascii=False)}\n\n"
            else:
                # Non-streaming providers: call normally and emit as single chunk
                response = prov.chat(msgs, system=sys_prompt, session_type="chairman")
                full_content = response
                yield f"data: {json.dumps({'chunk': response, 'done': False}, ensure_ascii=False)}\n\n"

        except Exception as e:
            full_content = f"⚠️ 스트리밍 오류: {e}\n\nOllama가 실행 중인지 확인해주세요: `ollama serve`"
            yield f"data: {json.dumps({'chunk': full_content, 'done': False}, ensure_ascii=False)}\n\n"

        # Check for CREATE_COMPANY — emit preview event instead of executing
        preview_match = re.search(r'<<CREATE_COMPANY:(.*?)>>', full_content, re.DOTALL)
        if preview_match:
            raw = preview_match.group(1).strip()
            try:
                preview_data = json.loads(raw)
                clean_text = re.sub(r'<<CREATE_COMPANY:.*?>>', '', full_content, flags=re.DOTALL).strip()
                with SessionLocal() as new_db:
                    ai_msg = ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=clean_text,
                        sender_name=name,
                    )
                    new_db.add(ai_msg)
                    new_db.commit()
                    new_db.refresh(ai_msg)
                yield f"data: {json.dumps({'type': 'preview', 'company_data': preview_data, 'chunk': '', 'done': True, 'message_id': ai_msg.id, 'final_content': clean_text}, ensure_ascii=False)}\n\n"
                return
            except (json.JSONDecodeError, Exception):
                pass  # fall through to normal execution

        # Save complete AI message (new DB session since original is closed)
        with SessionLocal() as new_db:
            # Handle API key saves first
            content_after_apikey, api_key_results = _process_api_key_saves(full_content, new_db)
            # Handle terminal requests
            content_after_terminal, terminal_req_ids = _process_terminal_requests(content_after_apikey, new_db, company_id, user_id)
            # Handle video requests
            content_after_video, video_reqs = _process_video_requests(content_after_terminal, new_db, company_id, user_id)
            # Handle model updates
            content_after_model, model_update_results = _process_model_updates(content_after_video, new_db)
            # Handle approval actions (APPROVE_REQUEST / REJECT_REQUEST / APPROVE_TERMINAL / REJECT_TERMINAL)
            content_after_approval, approval_results = _process_approval_actions(content_after_model, new_db, user_id)
            # Handle company creation
            clean, action_results = _execute_actions(content_after_approval, new_db, user_id)
            # Handle code execution (INSTALL_PACKAGE / SQL_QUERY / EXECUTE_CODE + debug loop)
            clean, code_results = _process_code_actions(clean, prov, sys_prompt)
            # Append terminal request notifications
            terminal_notes = ""
            for rid in terminal_req_ids:
                tr = new_db.query(TerminalRequest).filter(TerminalRequest.id == rid).first()
                if tr:
                    terminal_notes += f"\n\n⏳ **터미널 명령 요청 제출됨** (ID #{tr.id})\n`{tr.command}`\n사유: {tr.reason}\n관리자 승인 대기 중..."
            # Append video request notifications
            video_notes = ""
            for job_id, prompt in video_reqs:
                video_notes += f"\n\n🎬 **영상 생성 요청 제출됨** (작업 #{job_id})\n프롬프트: `{prompt[:80]}`\n승인함 확인 후 영상 스튜디오에서 생성됩니다."
            final = clean + "".join(action_results) + "".join(model_update_results) + "".join(approval_results) + terminal_notes + video_notes + "".join(api_key_results) + "".join(code_results)
            ai_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=final,
                sender_name=name,
            )
            new_db.add(ai_msg)
            new_db.commit()
            new_db.refresh(ai_msg)
            extra = {"terminal_requests": terminal_req_ids} if terminal_req_ids else {}
            yield f"data: {json.dumps({'chunk': '', 'done': True, 'message_id': ai_msg.id, 'final_content': final, **extra}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/company-query")
def company_query(
    req: CompanyQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Query a company through its CEO — returns delegation steps + AI answer."""
    company = db.query(Company).filter(Company.id == req.company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    # Find CEO node for this company
    ceo_node = (
        db.query(OrgNode)
        .filter(OrgNode.company_id == req.company_id, OrgNode.level == "ceo")
        .first()
    )
    ceo_name = ceo_node.name if ceo_node else f"{company.name} CEO"

    # Build company context and call CEO AI
    context = (
        f"회사: {company.name}\n"
        f"산업: {company.industry}\n"
        f"설명: {company.description}\n"
        f"비전: {company.vision}\n\n"
        f"회장 질문: {req.question}"
    )

    provider = get_provider_from_db(db, current_user.id)
    answer = provider.chat(
        [{"role": "user", "content": context}],
        system=CEO_SYSTEM,
        session_type="ceo",
    )

    delegation = [
        {"from": "Admin", "to": ceo_name, "message": f"질문 전달: {req.question[:40]}…", "status": "done"},
        {"from": ceo_name, "to": "운영팀", "message": "데이터 수집 및 현황 파악", "status": "done"},
        {"from": "운영팀", "to": ceo_name, "message": "보고 완료", "status": "done"},
        {"from": ceo_name, "to": "Admin", "message": "최종 보고 전달", "status": "done"},
    ]

    return {
        "company": {"id": company.id, "name": company.name, "industry": company.industry},
        "ceo_name": ceo_name,
        "delegation": delegation,
        "answer": answer,
    }


@router.post("/confirm-company")
def confirm_company(
    req: ConfirmCompanyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actually create a company that was previewed but not yet confirmed."""
    company = Company(
        name=req.name,
        description=req.description,
        industry=req.industry,
        vision=req.vision,
        status="active",
        created_by=current_user.id,
    )
    db.add(company)
    db.flush()
    create_company_org(db, company.id, req.industry, "any")
    db.commit()
    db.refresh(company)
    return {"id": company.id, "name": company.name, "industry": company.industry}


@router.post("/brief-ceo")
def brief_ceo(
    req: BriefCeoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send an initial strategy briefing from chairman to newly founded company's CEO."""
    company = db.query(Company).filter(Company.id == req.company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    ceo_node = (
        db.query(OrgNode)
        .filter(OrgNode.company_id == req.company_id, OrgNode.level == "ceo")
        .first()
    )
    ceo_name = ceo_node.name if ceo_node else f"{company.name} CEO"

    briefing = (
        f"안녕하세요 {ceo_name}님. 한그룹 Admin입니다.\n\n"
        f"'{company.name}' 설립을 진심으로 축하합니다.\n\n"
        f"회사 개요:\n"
        f"- 산업: {company.industry}\n"
        f"- 비전: {company.vision or '미정'}\n"
        f"- 설명: {company.description or '미정'}\n\n"
        f"초기 전략 방향을 수립하고 첫 100일 실행 계획을 간략히 보고해 주세요.\n"
        f"(보고 시 저를 'Admin'이라고 호칭해 주세요.)"
    )

    provider = get_provider_from_db(db, current_user.id)
    answer = provider.chat(
        [{"role": "user", "content": briefing}],
        system=CEO_SYSTEM,
        session_type="ceo",
    )

    # Find or create CEO session for this company
    ceo_session = (
        db.query(ChatSession)
        .filter(ChatSession.company_id == req.company_id, ChatSession.session_type == "ceo")
        .first()
    )
    if not ceo_session:
        ceo_session = ChatSession(
            company_id=req.company_id,
            session_type="ceo",
            title=f"{company.name} CEO 브리핑",
            agent_name=ceo_name,
            created_by=current_user.id,
        )
        db.add(ceo_session)
        db.flush()

    db.add(ChatMessage(session_id=ceo_session.id, role="user", content=briefing, sender_name="Admin"))
    db.add(ChatMessage(session_id=ceo_session.id, role="assistant", content=answer, sender_name=ceo_name))
    db.commit()

    return {
        "company": {"id": company.id, "name": company.name},
        "ceo_name": ceo_name,
        "ceo_session_id": ceo_session.id,
        "answer": answer,
        "delegation": [
            {"from": "Admin", "to": ceo_name, "message": "설립 축하 및 초기 전략 브리핑 전달", "status": "done"},
            {"from": ceo_name, "to": "경영팀", "message": "전략 방향 수립 착수", "status": "done"},
            {"from": ceo_name, "to": "Admin", "message": "100일 실행 계획 보고 완료", "status": "done"},
        ],
    }


@router.get("/group-kpi")
def group_kpi(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return AI activity KPI metrics for every active company."""
    companies = db.query(Company).filter(Company.status == "active").all()
    result = []
    for company in companies:
        sessions = db.query(ChatSession).filter(ChatSession.company_id == company.id).all()
        session_ids = [s.id for s in sessions]
        msg_count = (
            db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).count()
            if session_ids else 0
        )
        node_count = db.query(OrgNode).filter(OrgNode.company_id == company.id).count()
        strategy_count = db.query(StrategyItem).filter(StrategyItem.company_id == company.id).count()
        ai_score = min(100, msg_count * 5 + node_count * 3 + strategy_count * 10)
        result.append({
            "id": company.id,
            "name": company.name,
            "industry": company.industry,
            "ai_messages": msg_count,
            "org_nodes": node_count,
            "strategies": strategy_count,
            "ai_score": ai_score,
        })

    total_msgs = sum(r["ai_messages"] for r in result)
    avg_score = round(sum(r["ai_score"] for r in result) / len(result), 1) if result else 0
    return {
        "companies": sorted(result, key=lambda r: r["ai_score"], reverse=True),
        "totals": {
            "total_companies": len(result),
            "total_ai_messages": total_msgs,
            "avg_ai_score": avg_score,
        },
    }


@router.post("/collaborate")
def collaborate(
    req: CollaborateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Have two company CEOs collaborate using Team Agent (parallel, shared context), then report to Chairman (Sub Agent)."""
    import asyncio
    from services.team_agent import run_team_discussion, format_team_discussion

    company_a = db.query(Company).filter(Company.id == req.company_a_id).first()
    company_b = db.query(Company).filter(Company.id == req.company_b_id).first()
    if not company_a or not company_b:
        raise HTTPException(404, "Company not found")

    ceo_a = db.query(OrgNode).filter(OrgNode.company_id == req.company_a_id, OrgNode.level == "ceo").first()
    ceo_b = db.query(OrgNode).filter(OrgNode.company_id == req.company_b_id, OrgNode.level == "ceo").first()
    ceo_a_name = ceo_a.name if ceo_a else f"{company_a.name} CEO"
    ceo_b_name = ceo_b.name if ceo_b else f"{company_b.name} CEO"

    # ── 1단계: CEO들 팀 토론 (Team Agent — 병렬, 공유 컨텍스트) ─────────────────
    ceo_a_provider = get_node_ai_provider(db, ceo_a) if ceo_a else get_provider_from_db(db, current_user.id)
    ceo_b_provider = get_node_ai_provider(db, ceo_b) if ceo_b else get_provider_from_db(db, current_user.id)

    agents = [
        {
            "name": ceo_a_name,
            "provider": ceo_a_provider,
            "system": CEO_SYSTEM + f"\n\n당신은 {company_a.name}({company_a.industry})의 CEO입니다.",
        },
        {
            "name": ceo_b_name,
            "provider": ceo_b_provider,
            "system": CEO_SYSTEM + f"\n\n당신은 {company_b.name}({company_b.industry})의 CEO입니다.",
        },
    ]

    topic = f"한그룹 회장의 협업 과제: {req.task}"
    team_result = asyncio.run(run_team_discussion(agents, topic, max_rounds=2))

    # 각 CEO의 발언 취합 (하위 호환 필드)
    response_a = "\n\n".join(
        m["content"] for m in team_result["all_messages"] if m["agent_name"] == ceo_a_name
    )
    response_b = "\n\n".join(
        m["content"] for m in team_result["all_messages"] if m["agent_name"] == ceo_b_name
    )

    # ── 2단계: 회장에게 보고 (Sub Agent — 계층 보고) ────────────────────────────
    chairman_provider = get_provider_from_db(db, current_user.id)
    team_summary = format_team_discussion(team_result)
    combined = chairman_provider.chat(
        [{"role": "user", "content": f"{team_summary}\n\n명확하고 실행 가능한 공동 계획을 번호 목록으로 작성해주세요."}],
        system=CHAIRMAN_SYSTEM,
        session_type="chairman",
    )

    return {
        "company_a": {"id": company_a.id, "name": company_a.name},
        "company_b": {"id": company_b.id, "name": company_b.name},
        "ceo_a_name": ceo_a_name,
        "ceo_b_name": ceo_b_name,
        "response_a": response_a,
        "response_b": response_b,
        "combined": combined,
        "team_discussion": team_result,
        "delegation": [
            {"from": "Admin", "to": f"{ceo_a_name} + {ceo_b_name}", "message": f"팀 협업 과제 전달: {req.task[:28]}…", "status": "done"},
            {"from": f"{ceo_a_name} ↔ {ceo_b_name}", "to": f"{ceo_a_name} ↔ {ceo_b_name}", "message": f"팀 토론 ({team_result['total_rounds']}라운드 병렬 협의)", "status": "done"},
            {"from": f"{ceo_a_name} + {ceo_b_name}", "to": "Admin", "message": "최종 공동 실행 계획 보고", "status": "done"},
        ],
    }


@router.get("/timeline")
def timeline(
    limit: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Aggregate recent events across the group into a chronological activity feed."""
    from datetime import timezone
    events = []

    # Company creations
    for c in db.query(Company).order_by(Company.created_at.desc()).limit(15).all():
        events.append({
            "type": "company_created", "icon": "🏢",
            "title": f"계열사 설립: {c.name}",
            "description": f"{c.industry}" + (f" · {c.description[:40]}" if c.description else ""),
            "created_at": c.created_at.isoformat(),
        })

    # CEO sessions (new CEO briefings)
    for s in db.query(ChatSession).filter(ChatSession.session_type == "ceo").order_by(ChatSession.created_at.desc()).limit(15).all():
        co_name = ""
        if s.company_id:
            co = db.query(Company).filter(Company.id == s.company_id).first()
            co_name = co.name if co else ""
        events.append({
            "type": "ceo_briefing", "icon": "🤵",
            "title": f"CEO 브리핑: {co_name}",
            "description": s.title or "CEO 세션 시작",
            "created_at": s.created_at.isoformat(),
        })

    # Chairman directives (user messages in chairman sessions)
    rows = (
        db.query(ChatMessage)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .filter(ChatSession.session_type == "chairman", ChatMessage.role == "user")
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
        .all()
    )
    for m in rows:
        snippet = m.content[:55] + "…" if len(m.content) > 55 else m.content
        events.append({
            "type": "directive", "icon": "👔",
            "title": "회장 지시",
            "description": snippet,
            "created_at": m.created_at.isoformat(),
        })

    # Strategy items
    for s in db.query(StrategyItem).order_by(StrategyItem.created_at.desc()).limit(10).all():
        events.append({
            "type": "strategy", "icon": "🎯",
            "title": f"전략 수립: {s.title}",
            "description": f"{s.item_type} · 우선순위 {s.priority}",
            "created_at": s.created_at.isoformat(),
        })

    events.sort(key=lambda e: e["created_at"], reverse=True)
    return events[:limit]


@router.post("/multi-ceo-meeting")
def multi_ceo_meeting(
    req: MultiCeoMeetingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Multi-CEO strategy meeting using Team Agent (parallel per round, shared context) + Chairman minutes (Sub Agent)."""
    import asyncio
    from services.team_agent import run_team_discussion, format_team_discussion

    companies = [db.query(Company).filter(Company.id == int(cid)).first() for cid in req.company_ids]
    companies = [c for c in companies if c]
    if len(companies) < 2:
        raise HTTPException(400, "최소 2개 회사가 필요합니다")

    # 각 CEO 에이전트 구성 (개별 AI 프로바이더 사용)
    participants = []
    agents = []
    for company in companies:
        node = db.query(OrgNode).filter(OrgNode.company_id == company.id, OrgNode.level == "ceo").first()
        ceo_name = node.name if node else f"{company.name} CEO"
        participants.append({"company": company.name, "ceo_name": ceo_name})

        ceo_provider = get_node_ai_provider(db, node) if node else get_provider_from_db(db, current_user.id)
        agents.append({
            "name": ceo_name,
            "provider": ceo_provider,
            "system": CEO_SYSTEM + f"\n\n당신은 {company.name}({company.industry})의 CEO입니다. 3~4문장으로 간결하게 발언해주세요.",
        })

    # ── Team Agent: 모든 CEO 병렬 토론 (라운드별 공유 컨텍스트) ──────────────────
    max_rounds = getattr(req, "rounds", None) or 2
    team_result = asyncio.run(run_team_discussion(agents, req.topic, max_rounds=max_rounds))

    # 트랜스크립트 구성 (하위 호환 형식)
    transcript = []
    for msg in team_result["all_messages"]:
        # 참가자 정보 매칭
        co_info = next((p for p in participants if p["ceo_name"] == msg["agent_name"]), None)
        transcript.append({
            "ceo_name": msg["agent_name"],
            "company": co_info["company"] if co_info else "",
            "speech": msg["content"],
            "round": msg["round_num"],
        })

    # ── Sub Agent: 회장이 회의록 작성 (계층 보고) ─────────────────────────────
    chairman_provider = get_provider_from_db(db, current_user.id)
    team_summary = format_team_discussion(team_result)
    minutes_prompt = (
        f"다음 경영진 팀 회의 내용을 바탕으로 공식 회의록을 작성해주세요.\n\n{team_summary}\n\n"
        f"주요 결정사항, 각사 역할 분담, 후속 액션 아이템을 포함하여 "
        f"구체적이고 실행 가능한 회의록을 작성해주세요."
    )
    minutes = chairman_provider.chat(
        [{"role": "user", "content": minutes_prompt}],
        system=CHAIRMAN_SYSTEM,
        session_type="chairman",
    )

    return {
        "topic": req.topic,
        "transcript": transcript,
        "minutes": minutes,
        "participants": participants,
        "team_discussion": team_result,
    }


@router.get("/performance-report")
def performance_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate AI-powered weekly performance ranking and analysis for all companies."""
    companies = db.query(Company).filter(Company.status == "active").all()
    rankings = []
    for company in companies:
        sessions = db.query(ChatSession).filter(ChatSession.company_id == company.id).all()
        session_ids = [s.id for s in sessions]
        msg_count = (
            db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).count()
            if session_ids else 0
        )
        node_count = db.query(OrgNode).filter(OrgNode.company_id == company.id).count()
        strategy_count = db.query(StrategyItem).filter(StrategyItem.company_id == company.id).count()
        ai_score = min(100, msg_count * 5 + node_count * 3 + strategy_count * 10)
        rankings.append({
            "name": company.name,
            "industry": company.industry,
            "ai_messages": msg_count,
            "org_nodes": node_count,
            "strategies": strategy_count,
            "ai_score": ai_score,
        })

    rankings.sort(key=lambda x: x["ai_score"], reverse=True)

    analysis = "계열사 데이터가 없습니다."
    if rankings:
        report_lines = "\n".join(
            f"{i+1}위. {r['name']} ({r['industry']}): 점수 {r['ai_score']}, "
            f"AI 대화 {r['ai_messages']}회, 조직 {r['org_nodes']}명, 전략 {r['strategies']}개"
            for i, r in enumerate(rankings)
        )
        prompt = (
            f"다음은 한그룹 계열사 AI 활동 주간 현황입니다.\n\n{report_lines}\n\n"
            f"각 계열사의 성과를 분석하고 강점과 개선점을 포함한 주간 성과 보고서를 작성해주세요. "
            f"상위 계열사의 성공 요인과 하위 계열사에 대한 구체적인 권고사항을 포함해주세요."
        )
        provider = get_provider_from_db(db, current_user.id)
        analysis = provider.chat([{"role": "user", "content": prompt}], system=CHAIRMAN_SYSTEM, session_type="chairman")

    return {"rankings": rankings, "analysis": analysis}


@router.post("/board-meeting")
def board_meeting(
    req: BoardMeetingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI 이사회 — CEOs + independent directors vote on an agenda with reasoning."""
    companies = [db.query(Company).filter(Company.id == int(cid)).first() for cid in req.company_ids]
    companies = [c for c in companies if c]

    # Build voter list: company CEOs
    voters = []
    for company in companies:
        node = db.query(OrgNode).filter(OrgNode.company_id == company.id, OrgNode.level == "ceo").first()
        ceo_name = node.name if node else f"{company.name} CEO"
        voters.append({"name": ceo_name, "title": f"{company.name} CEO", "type": "ceo", "company": company.name})

    # Independent directors
    if req.include_independent:
        voters += [
            {"name": "한지수 사외이사", "title": "독립 사외이사 (재무전문)", "type": "independent", "company": ""},
            {"name": "박현우 사외이사", "title": "독립 사외이사 (전략전문)", "type": "independent", "company": ""},
        ]

    provider = get_provider_from_db(db, current_user.id)
    DIRECTOR_SYSTEM = (
        "당신은 한그룹 이사회 구성원입니다. 안건에 대해 찬성/반대/보류 중 하나를 선택하고 "
        "2~3문장으로 근거를 설명하세요. 반드시 첫 줄에 '투표: 찬성', '투표: 반대', '투표: 보류' 중 하나로 시작하세요."
    )

    votes = []
    context = f"한그룹 이사회 안건: {req.agenda}\n\n참석자: {', '.join(v['name'] for v in voters)}"
    for voter in voters:
        prompt = (
            f"{context}\n\n[{voter['name']} / {voter['title']}] 발언 차례입니다. "
            f"위 안건에 대해 투표하고 의견을 밝혀주세요."
        )
        response = provider.chat([{"role": "user", "content": prompt}], system=DIRECTOR_SYSTEM, session_type="ceo")
        vote_type = "보류"
        if "투표: 찬성" in response:
            vote_type = "찬성"
        elif "투표: 반대" in response:
            vote_type = "반대"
        votes.append({**voter, "vote": vote_type, "reasoning": response})

    tally = {"찬성": sum(1 for v in votes if v["vote"] == "찬성"),
             "반대": sum(1 for v in votes if v["vote"] == "반대"),
             "보류": sum(1 for v in votes if v["vote"] == "보류")}
    result = "가결" if tally["찬성"] > tally["반대"] else "부결" if tally["반대"] > tally["찬성"] else "보류"

    vote_summary = "\n".join(f"[{v['name']}] {v['vote']}: {v['reasoning'][:80]}…" for v in votes)
    summary_prompt = (
        f"이사회 안건: {req.agenda}\n\n투표 결과 ({result}): 찬성 {tally['찬성']}, 반대 {tally['반대']}, 보류 {tally['보류']}\n\n"
        f"이사 의견:\n{vote_summary}\n\n"
        f"이사회 결의 내용과 후속 조치를 공식 이사회 결의문 형식으로 작성해주세요."
    )
    resolution = provider.chat([{"role": "user", "content": summary_prompt}], system=CHAIRMAN_SYSTEM, session_type="chairman")

    return {
        "agenda": req.agenda,
        "votes": votes,
        "tally": tally,
        "result": result,
        "resolution": resolution,
    }


@router.get("/recommended-actions")
def recommended_actions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate today's AI-recommended actions for the chairman based on group status."""
    company_count = db.query(Company).filter(Company.status == "active").count()
    recent_msgs = (
        db.query(ChatMessage)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .filter(ChatSession.session_type == "chairman", ChatMessage.role == "user")
        .order_by(ChatMessage.created_at.desc())
        .limit(5)
        .all()
    )
    recent_directives = [m.content[:60] for m in recent_msgs]

    prompt = (
        f"현재 한그룹 현황:\n"
        f"- 활성 계열사: {company_count}개\n"
        f"- 최근 회장 지시: {'; '.join(recent_directives) if recent_directives else '없음'}\n\n"
        f"오늘 회장이 취해야 할 중요 액션 3가지를 JSON 배열로 제시하세요. "
        f'형식: [{{"action":"액션명","reason":"이유","priority":"high/medium/low"}}]'
    )
    provider = get_provider_from_db(db, current_user.id)
    raw = provider.chat([{"role": "user", "content": prompt}], system=CHAIRMAN_SYSTEM, session_type="chairman")

    actions = []
    try:
        import re as _re
        m = _re.search(r'\[.*?\]', raw, _re.DOTALL)
        if m:
            actions = json.loads(m.group())
    except Exception:
        actions = [
            {"action": "계열사 현황 점검", "reason": "정기 성과 모니터링", "priority": "high"},
            {"action": "신규 사업 기회 검토", "reason": "시장 변화 대응", "priority": "medium"},
            {"action": "CEO 브리핑 일정 확인", "reason": "전략 정렬 확인", "priority": "low"},
        ]

    return {"actions": actions, "company_count": company_count}


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.created_by == current_user.id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/suggestions")
def get_suggestions(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(AISuggestion).filter(AISuggestion.status == "open")
    if company_id:
        q = q.filter(AISuggestion.company_id == company_id)
    return q.order_by(AISuggestion.created_at.desc()).limit(20).all()


@router.post("/suggestions/{suggestion_id}/dismiss")
def dismiss_suggestion(
    suggestion_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = db.query(AISuggestion).filter(AISuggestion.id == suggestion_id).first()
    if s:
        s.status = "dismissed"
        db.commit()
    return {"ok": True}


@router.post("/agent-chat")
def agent_chat(
    req: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Direct chat with a specific agent — injects personality + company memory."""
    node_id = req.get("node_id")
    message = req.get("message", "")
    if not node_id or not message:
        raise HTTPException(400, "node_id and message required")

    node = db.query(OrgNode).filter(OrgNode.id == node_id).first()
    if not node:
        raise HTTPException(404, "Agent not found")

    personality_ctx = build_personality_context(node)
    memory_ctx = get_relevant_memories(db, node.company_id)

    system = (
        f"당신은 {node.role} {node.name}입니다.\n"
        f"{node.description or '한그룹 계열사의 AI 임직원입니다.'}"
        f"{personality_ctx}"
        + (f"\n\n{memory_ctx}" if memory_ctx else "")
    )

    ai = get_node_ai_provider(db, node)
    response = ai.chat(
        messages=[{"role": "user", "content": message}],
        system=system,
        max_tokens=600,
    )

    return {
        "agent_name": node.name,
        "agent_role": node.role,
        "level": node.level,
        "provider": ai.provider,
        "model": ai.model,
        "response": response,
    }
