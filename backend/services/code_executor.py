"""
Python Code Executor
====================
AI가 코드를 직접 작성하고 실행 → 오류 시 자동 디버깅 → 성공까지 반복합니다.

- execute_python(): Python 코드 실행 (서브프로세스)
- install_package(): pip 패키지 설치
- WORKSPACE_DIR: 코드 파일 / 워크스페이스 데이터 저장 위치
"""
import os
import sys
import subprocess
import tempfile
import time

# 백엔드 루트 기준 workspace 디렉토리
WORKSPACE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "workspace")
WORKSPACE_DB_PATH = os.path.join(WORKSPACE_DIR, "workspace.db")

os.makedirs(WORKSPACE_DIR, exist_ok=True)

# 코드 실행 시 자동으로 주입되는 헬퍼 (편의 함수 + 경로 설정)
_PREAMBLE = f"""
import sys, os
WORKSPACE_DIR = {repr(WORKSPACE_DIR)}
WORKSPACE_DB  = {repr(WORKSPACE_DB_PATH)}
sys.path.insert(0, {repr(os.path.dirname(os.path.dirname(__file__)))})

import sqlite3 as _sqlite3

def get_db():
    \"\"\"워크스페이스 SQLite DB 연결 반환.\"\"\"""
    conn = _sqlite3.connect(WORKSPACE_DB)
    conn.row_factory = _sqlite3.Row
    return conn

def save_to_db(table, data, if_exists="append"):
    \"\"\"리스트[딕셔너리] 데이터를 DB 테이블에 저장. pandas 사용.\"\"\"""
    if not data:
        return 0
    import pandas as pd
    conn = _sqlite3.connect(WORKSPACE_DB)
    df = pd.DataFrame(data)
    df.to_sql(table, conn, if_exists=if_exists, index=False)
    conn.close()
    print(f"[DB 저장] {{table}} 에 {{len(df)}}행 저장 완료")
    return len(df)

def query_db(sql, params=()):
    \"\"\"SQL 쿼리 실행 후 DataFrame 반환.\"\"\"""
    import pandas as pd
    conn = _sqlite3.connect(WORKSPACE_DB)
    df = pd.read_sql_query(sql, conn, params=params)
    conn.close()
    return df

def run_sql(sql, params=()):
    \"\"\"SELECT 이외 SQL 실행 (INSERT/UPDATE/CREATE 등).\"\"\"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    conn.close()

print("[코드 실행 환경 초기화 완료]")
print(f"  워크스페이스: {repr(WORKSPACE_DIR)}")
print(f"  DB 경로: {repr(WORKSPACE_DB_PATH)}")
"""


def install_package(package: str, timeout: int = 180) -> dict:
    """
    pip으로 패키지 설치.
    여러 패키지를 공백으로 구분해 한 번에 설치 가능: "pandas requests beautifulsoup4"
    """
    packages = [p.strip() for p in package.strip().split() if p.strip()]
    if not packages:
        return {"success": False, "packages": [], "stdout": "", "stderr": "패키지 이름이 없습니다."}

    cmd = [sys.executable, "-m", "pip", "install", "--quiet"] + packages
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        return {
            "success": result.returncode == 0,
            "packages": packages,
            "stdout": result.stdout[-2000:] if result.stdout else "",
            "stderr": result.stderr[-1000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "packages": packages,
            "stdout": "",
            "stderr": f"설치 시간 초과 ({timeout}초). 네트워크를 확인하세요.",
        }
    except Exception as e:
        return {"success": False, "packages": packages, "stdout": "", "stderr": str(e)}


def execute_python(code: str, timeout: int = 120, inject_helpers: bool = True) -> dict:
    """
    Python 코드를 서브프로세스에서 실행하고 결과를 반환합니다.

    Returns:
        {
          "success": bool,
          "stdout": str,      # 표준 출력 (최대 5000자)
          "stderr": str,      # 표준 오류 (최대 3000자)
          "returncode": int,
          "elapsed_seconds": float,
        }
    """
    full_code = (_PREAMBLE + "\n\n# ─── 사용자 코드 ───\n" + code) if inject_helpers else code

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".py",
            dir=WORKSPACE_DIR,
            delete=False,
            encoding="utf-8",
        ) as f:
            f.write(full_code)
            tmp_path = f.name

        t0 = time.time()
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=WORKSPACE_DIR,
            env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"},
        )
        elapsed = round(time.time() - t0, 2)

        stdout = result.stdout or ""
        stderr = result.stderr or ""

        # 프리앰블 출력 제거 (사용자 코드 출력만 남김)
        # "[코드 실행 환경 초기화 완료]" 이후 내용만 유지
        if "[코드 실행 환경 초기화 완료]" in stdout:
            parts = stdout.split("  DB 경로:")
            if len(parts) > 1:
                stdout = parts[-1].strip()
                # 남은 첫 줄(경로 텍스트) 제거
                lines = stdout.split("\n")
                stdout = "\n".join(lines[1:]).strip() if lines else stdout

        return {
            "success": result.returncode == 0,
            "stdout": stdout[-5000:],
            "stderr": stderr[-3000:],
            "returncode": result.returncode,
            "elapsed_seconds": elapsed,
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "stdout": "",
            "stderr": (
                f"⏰ 실행 시간 초과 ({timeout}초).\n"
                "코드를 최적화하거나 데이터 범위를 줄여보세요."
            ),
            "returncode": -1,
            "elapsed_seconds": float(timeout),
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": f"실행 준비 오류: {e}",
            "returncode": -2,
            "elapsed_seconds": 0.0,
        }
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
