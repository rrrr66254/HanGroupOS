"""
Workspace Database Manager
==========================
AI가 동적으로 테이블을 생성하고 데이터를 저장/조회/관리합니다.
main app DB와 분리된 SQLite workspace DB 사용.
"""
import os
import sqlite3
from typing import Any, Optional

from services.code_executor import WORKSPACE_DIR, WORKSPACE_DB_PATH


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(WORKSPACE_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def execute_sql(query: str, params: tuple = ()) -> dict:
    """
    임의 SQL 실행.
    SELECT / PRAGMA → {"rows": [...], "columns": [...], "count": N}
    그 외 (CREATE/INSERT/UPDATE/DELETE) → {"affected_rows": N, "lastrowid": N}
    """
    q = query.strip()
    q_upper = q.upper().lstrip()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(q, params)
        if q_upper.startswith("SELECT") or q_upper.startswith("PRAGMA") or q_upper.startswith("WITH"):
            rows = cur.fetchall()
            columns = [d[0] for d in cur.description] if cur.description else []
            data = [dict(zip(columns, row)) for row in rows]
            return {"success": True, "rows": data, "columns": columns, "count": len(data)}
        else:
            conn.commit()
            return {
                "success": True,
                "affected_rows": cur.rowcount,
                "lastrowid": cur.lastrowid,
            }
    except Exception as e:
        return {"success": False, "error": str(e), "query": q[:200]}
    finally:
        conn.close()


def execute_sql_multi(script: str) -> list[dict]:
    """세미콜론으로 구분된 여러 SQL 문장 순서대로 실행."""
    statements = [s.strip() for s in script.split(";") if s.strip()]
    return [execute_sql(stmt) for stmt in statements]


def list_tables() -> list[dict]:
    """워크스페이스 DB의 모든 테이블 목록과 스키마 반환."""
    res = execute_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    tables = []
    for row in res.get("rows", []):
        name = row["name"]
        schema = execute_sql(f"PRAGMA table_info({name})")
        cnt = execute_sql(f"SELECT COUNT(*) AS cnt FROM [{name}]")
        row_count = cnt["rows"][0]["cnt"] if cnt.get("rows") else 0
        tables.append({
            "name": name,
            "row_count": row_count,
            "columns": schema.get("rows", []),
        })
    return tables


def get_table_preview(table_name: str, limit: int = 100) -> dict:
    """테이블 스키마 + 데이터 미리보기 반환."""
    schema = execute_sql(f"PRAGMA table_info([{table_name}])")
    cnt = execute_sql(f"SELECT COUNT(*) AS cnt FROM [{table_name}]")
    data = execute_sql(f"SELECT * FROM [{table_name}] LIMIT {limit}")
    return {
        "name": table_name,
        "row_count": cnt["rows"][0]["cnt"] if cnt.get("rows") else 0,
        "columns": schema.get("rows", []),
        "rows": data.get("rows", []),
    }


def drop_table(table_name: str) -> dict:
    return execute_sql(f"DROP TABLE IF EXISTS [{table_name}]")


def get_db_stats() -> dict:
    """DB 전체 통계 (파일 크기, 테이블 수, 총 행 수)."""
    tables = list_tables()
    total_rows = sum(t["row_count"] for t in tables)
    size_bytes = os.path.getsize(WORKSPACE_DB_PATH) if os.path.exists(WORKSPACE_DB_PATH) else 0
    return {
        "db_path": WORKSPACE_DB_PATH,
        "size_bytes": size_bytes,
        "size_kb": round(size_bytes / 1024, 1),
        "table_count": len(tables),
        "total_rows": total_rows,
        "tables": tables,
    }
