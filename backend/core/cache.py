"""
인메모리 TTL 캐시 레이어
========================
외부 API 호출(뉴스, 환율, 트렌딩 등) 결과를 인메모리 캐시하여
반복 호출 시 속도 향상 + API 할당량 절약.

Redis 없이 동작하며, 단일 프로세스 환경(SQLite)에 적합.
"""
import time
import threading
import hashlib
import json
from typing import Any, Optional, Callable
from functools import wraps
from core.logging import get_logger

logger = get_logger("core.cache")

_lock = threading.Lock()
_store: dict[str, tuple[Any, float]] = {}  # key → (value, expire_at)


def cache_get(key: str) -> Optional[Any]:
    """키로 캐시 조회. 만료되었으면 None."""
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        value, expire_at = entry
        if time.time() > expire_at:
            del _store[key]
            return None
        return value


def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    """키-값 저장. ttl은 초 단위 (기본 5분)."""
    with _lock:
        _store[key] = (value, time.time() + ttl)


def cache_delete(key: str) -> None:
    """키 삭제."""
    with _lock:
        _store.pop(key, None)


def cache_clear() -> None:
    """전체 캐시 초기화."""
    with _lock:
        _store.clear()


def cache_stats() -> dict:
    """캐시 통계."""
    now = time.time()
    with _lock:
        total = len(_store)
        expired = sum(1 for _, (__, exp) in _store.items() if now > exp)
        return {
            "total_entries": total,
            "active_entries": total - expired,
            "expired_entries": expired,
        }


def cache_cleanup() -> int:
    """만료된 항목 정리. 제거된 수 반환."""
    now = time.time()
    removed = 0
    with _lock:
        keys_to_remove = [k for k, (_, exp) in _store.items() if now > exp]
        for k in keys_to_remove:
            del _store[k]
            removed += 1
    return removed


def _make_key(prefix: str, args: tuple, kwargs: dict) -> str:
    """함수 인자 기반 캐시 키 생성."""
    # DB 세션 등 직렬화 불가 객체는 제외
    safe_args = []
    for a in args:
        if hasattr(a, '__tablename__') or hasattr(a, 'execute'):
            continue
        safe_args.append(str(a))
    safe_kwargs = {k: str(v) for k, v in kwargs.items()
                   if not hasattr(v, '__tablename__') and not hasattr(v, 'execute')}
    raw = f"{prefix}:{':'.join(safe_args)}:{json.dumps(safe_kwargs, sort_keys=True)}"
    return hashlib.md5(raw.encode()).hexdigest()


def cached(ttl: int = 300, prefix: str = ""):
    """
    데코레이터: 함수 결과를 TTL 캐시.

    @cached(ttl=600, prefix="news")
    def search_news(db, query): ...
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = _make_key(prefix or func.__name__, args, kwargs)
            hit = cache_get(key)
            if hit is not None:
                return hit
            result = func(*args, **kwargs)
            cache_set(key, result, ttl)
            return result
        return wrapper
    return decorator
