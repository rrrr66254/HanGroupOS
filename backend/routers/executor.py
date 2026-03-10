"""
Code Executor & Workspace DB Router
=====================================
AI가 Python 코드를 작성/실행하고, 워크스페이스 DB를 직접 관리하는 API.

엔드포인트:
  POST /api/executor/run          — Python 코드 실행
  POST /api/executor/install      — pip 패키지 설치
  POST /api/executor/query        — SQL 실행
  GET  /api/executor/tables       — 테이블 목록
  GET  /api/executor/tables/{name} — 테이블 데이터 조회
  DELETE /api/executor/tables/{name} — 테이블 삭제
  GET  /api/executor/stats        — DB 전체 통계
  GET  /api/executor/token-stats  — 세션 토큰 사용량 분석 (Context Engineer)
  GET  /api/executor/token-estimate — 텍스트 토큰 수 추정
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import get_current_user
from core.config import settings
from models.models import User
from services.code_executor import execute_python, install_package, WORKSPACE_DB_PATH
from services.workspace_db import (
    execute_sql, execute_sql_multi, list_tables,
    get_table_preview, drop_table, get_db_stats,
)

router = APIRouter(prefix="/api/executor", tags=["code-executor"])


@router.post("/run", summary="Python 코드 실행")
def run_code(
    payload: dict = Body(...),
    _: User = Depends(get_current_user),
):
    """
    Python 코드를 서브프로세스에서 실행합니다.
    헬퍼 함수(save_to_db, query_db, run_sql, get_db)가 자동 주입됩니다.

    Body: {"code": "...", "timeout": 120, "inject_helpers": true}
    """
    code = payload.get("code", "").strip()
    timeout = min(int(payload.get("timeout", 120)), 600)
    inject = payload.get("inject_helpers", True)

    if not code:
        raise HTTPException(400, "code 필드가 필요합니다.")

    return execute_python(code, timeout=timeout, inject_helpers=inject)


@router.post("/install", summary="pip 패키지 설치")
def install_pkg(
    payload: dict = Body(...),
    _: User = Depends(get_current_user),
):
    """
    pip으로 패키지를 설치합니다. 공백으로 구분해 여러 패키지 동시 설치 가능.

    Body: {"package": "pandas requests beautifulsoup4"}
    """
    package = payload.get("package", "").strip()
    if not package:
        raise HTTPException(400, "package 필드가 필요합니다.")

    result = install_package(package)
    return result


@router.post("/query", summary="워크스페이스 DB SQL 실행")
def run_query(
    payload: dict = Body(...),
    _: User = Depends(get_current_user),
):
    """
    워크스페이스 SQLite DB에서 SQL을 실행합니다.
    여러 문장은 세미콜론으로 구분하거나 multi=true 사용.

    Body: {"query": "SELECT ...", "multi": false}
    """
    query = payload.get("query", "").strip()
    multi = payload.get("multi", False)
    if not query:
        raise HTTPException(400, "query 필드가 필요합니다.")

    if multi:
        return {"results": execute_sql_multi(query)}
    return execute_sql(query)


@router.get("/tables", summary="테이블 목록 및 스키마")
def get_tables(_: User = Depends(get_current_user)):
    """워크스페이스 DB의 모든 테이블 목록과 스키마를 반환합니다."""
    return get_db_stats()


@router.get("/tables/{table_name}", summary="테이블 데이터 조회")
def get_table(
    table_name: str,
    limit: int = 100,
    _: User = Depends(get_current_user),
):
    """특정 테이블의 스키마와 데이터를 조회합니다."""
    result = get_table_preview(table_name, limit=limit)
    if not result.get("columns"):
        raise HTTPException(404, f"테이블 '{table_name}'을 찾을 수 없습니다.")
    return result


@router.delete("/tables/{table_name}", summary="테이블 삭제")
def delete_table(
    table_name: str,
    _: User = Depends(get_current_user),
):
    """테이블을 삭제합니다."""
    return drop_table(table_name)


@router.get("/stats", summary="워크스페이스 DB 전체 통계")
def db_stats(_: User = Depends(get_current_user)):
    """DB 파일 크기, 테이블 수, 행 수 등 전체 통계를 반환합니다."""
    return get_db_stats()


# ══════════════════════════════════════════════════════════════════════════════
# Context Engineer — 토큰 사용량 분석 API
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/token-stats", summary="세션 토큰 사용량 분석 (Context Engineer)")
def token_stats(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    지정한 채팅 세션의 현재 컨텍스트 토큰 사용량을 분석합니다.

    반환 정보:
    - 시스템 프롬프트 / 메시지 히스토리 / 합계 토큰 수
    - 예산 대비 사용률 (%)
    - 최적화 후 예상 절약량
    - 메시지별 토큰 분포
    """
    from models.models import ChatSession, ChatMessage
    from services.context_engineer import (
        get_context_stats, slim_system_prompt, optimize,
        DEFAULT_MAX_CONTEXT_TOKENS, DEFAULT_RESERVE_RESPONSE,
    )
    from services.ai_provider import CHAIRMAN_SYSTEM, CEO_SYSTEM
    from services.reality_engine import build_reality_context, build_api_key_context

    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(404, f"세션 {session_id}을 찾을 수 없습니다.")

    # 권한 확인
    if session.created_by != current_user.id:
        raise HTTPException(403, "이 세션에 대한 접근 권한이 없습니다.")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    msg_list = [{"role": m.role, "content": m.content} for m in messages]

    # 시스템 프롬프트 구성 (실제 요청과 동일하게)
    base_system = CHAIRMAN_SYSTEM if session.session_type == "chairman" else CEO_SYSTEM
    full_system = base_system + build_reality_context(db, session.session_type, session.company_id)
    if session.session_type == "chairman":
        full_system += build_api_key_context(db)

    max_ctx = getattr(settings, "CONTEXT_MAX_TOKENS", DEFAULT_MAX_CONTEXT_TOKENS)

    # 현재 상태 통계
    current_stats = get_context_stats(full_system, msg_list, max_ctx)

    # 슬리밍 후 예상 통계
    slimmed_sys, sys_saved = slim_system_prompt(full_system, len(msg_list))
    slimmed_stats = get_context_stats(slimmed_sys, msg_list, max_ctx)

    # 완전 최적화 후 예상 통계
    opt_messages, opt_system, opt_stats = optimize(
        msg_list, full_system, max_ctx, DEFAULT_RESERVE_RESPONSE
    )

    return {
        "session_id": session_id,
        "session_type": session.session_type,
        "budget_tokens": max_ctx,
        "current": current_stats,
        "after_system_slim": {
            **slimmed_stats,
            "system_tokens_saved": sys_saved,
            "slim_applicable": sys_saved > 0,
        },
        "after_full_optimize": {
            **get_context_stats(opt_system, opt_messages, max_ctx),
            **opt_stats,
        },
        "recommendations": _build_recommendations(current_stats, opt_stats, max_ctx),
    }


def _build_recommendations(current: dict, opt: dict, budget: int) -> list:
    """토큰 사용 현황 기반 최적화 권고사항 생성."""
    recs = []
    pct = current.get("budget_used_pct", 0)
    saved = opt.get("tokens_saved", 0)

    if pct >= 100:
        recs.append({
            "level": "critical",
            "message": f"⛔ 컨텍스트가 예산({budget:,}토큰)을 초과했습니다. "
                       "Context Engineer가 자동으로 히스토리를 압축합니다.",
        })
    elif pct >= 80:
        recs.append({
            "level": "warning",
            "message": f"⚠️ 컨텍스트가 예산의 {pct}%를 사용 중입니다. 곧 자동 압축이 시작됩니다.",
        })
    elif pct >= 50:
        recs.append({
            "level": "info",
            "message": f"📊 컨텍스트 {pct}% 사용 중 — 정상 범위입니다.",
        })
    else:
        recs.append({
            "level": "ok",
            "message": f"✅ 컨텍스트 {pct}% 사용 중 — 여유 있습니다.",
        })

    if saved > 200:
        recs.append({
            "level": "tip",
            "message": f"💡 Context Engineer가 약 {saved:,}토큰({opt.get('savings_pct', 0)}%)을 "
                       "자동 절약할 수 있습니다. (시스템 슬리밍 + 히스토리 압축)",
        })

    if opt.get("messages_removed", 0) > 0:
        recs.append({
            "level": "tip",
            "message": f"📝 히스토리 압축 시 가장 오래된 "
                       f"{opt['messages_removed']}개 메시지가 제거됩니다. "
                       "중요한 정보는 별도로 저장하세요.",
        })

    return recs


@router.post("/token-estimate", summary="텍스트 토큰 수 추정")
def token_estimate(
    payload: dict = Body(...),
    _: User = Depends(get_current_user),
):
    """
    텍스트의 예상 토큰 수를 반환합니다.

    Body: {"text": "추정할 텍스트"}
    """
    from services.context_engineer import estimate_tokens

    text = payload.get("text", "")
    if not text:
        raise HTTPException(400, "text 필드가 필요합니다.")

    tokens = estimate_tokens(text)
    return {
        "text_length": len(text),
        "estimated_tokens": tokens,
        "chars_per_token": 3.5,
        "note": "한국어+영어 혼합 텍스트 기준 보수적 추정값입니다.",
    }
