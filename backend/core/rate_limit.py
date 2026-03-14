"""
API Rate Limiter
================
인메모리 슬라이딩 윈도우 기반 Rate Limiter.
Redis 없이 동작, FastAPI 미들웨어로 등록.
"""
import time
import threading
from collections import defaultdict
from typing import Optional
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from core.logging import get_logger

logger = get_logger("core.rate_limit")

_lock = threading.Lock()
_requests: dict[str, list[float]] = defaultdict(list)

# ── 기본 설정 ────────────────────────────────────────────────────────────────
DEFAULT_RATE = 60       # 기본: 분당 60회
DEFAULT_WINDOW = 60     # 윈도우: 60초

# 경로별 커스텀 제한 (method, path) 또는 path만 지정
# method가 None이면 모든 메소드에 적용
PATH_LIMITS: dict[str, tuple[int, int]] = {
    "/api/chat/send":              (20, 60),    # AI 호출 POST — 분당 20회
    "/api/chat/company-query":     (20, 60),    # AI 호출 POST
    "/api/chat/collaborate":       (10, 60),    # AI 호출 POST
    "/api/chat/multi-ceo-meeting": (10, 60),    # AI 호출 POST
    "/api/chat/board-meeting":     (10, 60),    # AI 호출 POST
    "/api/chat/brief-ceo":         (20, 60),    # AI 호출 POST
    "/api/chat":                   (120, 60),   # 읽기 GET (timeline, group-kpi 등) — 분당 120회
    "/api/news/briefing":          (10, 60),    # AI 호출
    "/api/game/ideas":             (10, 60),    # AI 호출
    "/api/video-gen":              (5, 60),     # GPU 집약
    "/api/docs/generate":          (10, 60),    # AI 호출
    "/api/financial":              (60, 60),    # 분당 60회
    "/api/notifications":          (120, 60),   # 알림 폴링 — 느슨하게
    "/api/approvals":              (120, 60),   # 대시보드 폴링
    "/api/companies":              (120, 60),   # 대시보드 폴링
    "/api/models":                 (120, 60),   # 상태 체크
    "/api/video":                  (120, 60),   # GPU 상태 폴링
    "/api/terminal":               (120, 60),   # 터미널 폴링
    "/health":                     (120, 60),   # 헬스체크
}

# Rate Limit 제외 경로
EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


def _get_client_key(request: Request) -> str:
    """클라이언트 식별 키 (IP + User-Agent 해시)."""
    ip = request.client.host if request.client else "unknown"
    # 인증된 사용자는 username으로 식별
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        try:
            from core.security import decode_token
            payload = decode_token(auth[7:])
            if payload:
                return f"user:{payload.get('sub', ip)}"
        except Exception:
            pass
    return f"ip:{ip}"


def _get_limit(path: str) -> tuple[int, int]:
    """경로에 맞는 (최대 요청 수, 윈도우 초) 반환. 가장 긴 prefix 우선 매칭."""
    best_match = ""
    best_limit = (DEFAULT_RATE, DEFAULT_WINDOW)
    for prefix, limit in PATH_LIMITS.items():
        if path.startswith(prefix) and len(prefix) > len(best_match):
            best_match = prefix
            best_limit = limit
    return best_limit


def _cleanup_old_entries():
    """5분 이상 지난 항목 정리."""
    cutoff = time.time() - 300
    with _lock:
        empty_keys = []
        for key, timestamps in _requests.items():
            _requests[key] = [t for t in timestamps if t > cutoff]
            if not _requests[key]:
                empty_keys.append(key)
        for k in empty_keys:
            del _requests[k]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """슬라이딩 윈도우 Rate Limiter 미들웨어."""

    _cleanup_counter = 0

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # WebSocket, 정적 파일, 제외 경로는 통과
        if (request.scope.get("type") == "websocket"
                or path in EXEMPT_PATHS
                or path.startswith("/sites/")):
            return await call_next(request)

        client_key = _get_client_key(request)
        max_requests, window = _get_limit(path)
        now = time.time()

        with _lock:
            # 윈도우 밖 요청 제거
            _requests[client_key] = [
                t for t in _requests[client_key] if t > now - window
            ]
            current_count = len(_requests[client_key])

            if current_count >= max_requests:
                # 429 Too Many Requests
                retry_after = int(window - (now - _requests[client_key][0])) + 1
                logger.warning(
                    f"Rate limit exceeded: {client_key} on {path} "
                    f"({current_count}/{max_requests} in {window}s)"
                )
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
                        "retry_after": retry_after,
                    },
                    headers={
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(max_requests),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(int(now + retry_after)),
                    },
                )

            _requests[client_key].append(now)
            remaining = max_requests - current_count - 1

        # 주기적 정리 (100번째 요청마다)
        RateLimitMiddleware._cleanup_counter += 1
        if RateLimitMiddleware._cleanup_counter % 100 == 0:
            threading.Thread(target=_cleanup_old_entries, daemon=True).start()

        response: Response = await call_next(request)

        # Rate limit 헤더 추가
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(max(0, remaining))
        response.headers["X-RateLimit-Reset"] = str(int(now + window))

        return response


def get_rate_limit_stats() -> dict:
    """Rate limit 통계."""
    with _lock:
        now = time.time()
        active_clients = 0
        total_tracked = 0
        for key, timestamps in _requests.items():
            recent = [t for t in timestamps if t > now - 60]
            if recent:
                active_clients += 1
                total_tracked += len(recent)
        return {
            "active_clients": active_clients,
            "tracked_requests_last_60s": total_tracked,
            "total_tracked_keys": len(_requests),
        }
