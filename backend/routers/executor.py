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
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from core.security import get_current_user
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
