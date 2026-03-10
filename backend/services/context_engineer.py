"""
Context Engineer
================
토큰 효율을 극대화하여 API 비용과 응답 속도를 개선합니다.

## 최적화 전략 (3단계 파이프라인)

1. 시스템 프롬프트 슬리밍
   - 대화가 10개 이상 쌓이면 초기 튜토리얼/가이드 섹션 제거
   - 액션 형식(<<CREATE_COMPANY>> 등)은 항상 유지
   - 평균 20~30% 절약

2. 메시지 히스토리 윈도잉
   - 토큰 예산 초과 시 오래된 메시지부터 제거
   - user/assistant 쌍 단위로 제거 (메시지 흐름 보존)
   - 최소 MIN_MESSAGES_TO_KEEP개는 항상 유지

3. 통계 추적
   - 요청마다 원본/최적화 후 토큰 수 비교
   - 서버 로그에 절약량 출력
   - /api/executor/token-stats API로 외부에서 조회 가능

## 토큰 추정 방식
tiktoken 없이 문자 길이 기반 추정 (의존성 최소화):
  - 한국어: ~2자 ≈ 1토큰
  - 영어/코드: ~4자 ≈ 1토큰
  - 혼합 텍스트: 3.5자 ≈ 1토큰 (보수적 추정, 약간 과다 추정이 안전)
"""
from __future__ import annotations

from typing import List, Dict, Tuple

# ── 상수 ─────────────────────────────────────────────────────────────────────
CHARS_PER_TOKEN: float = 3.5          # 혼합 텍스트 보수적 추정
DEFAULT_MAX_CONTEXT_TOKENS: int = 6000 # 기본 컨텍스트 예산 (응답 reserved 제외)
DEFAULT_RESERVE_RESPONSE: int = 1024   # 응답에 확보할 토큰
MIN_MESSAGES_TO_KEEP: int = 4          # 예산 초과 시에도 최소 보존 메시지 수
SLIM_AFTER_MESSAGES: int = 10          # 시스템 프롬프트 슬리밍 시작 메시지 수

# 시스템 프롬프트 슬리밍 마커 — 이 문자열이 나타나면 여기서 잘라냄
# (이 섹션 이후의 내용은 초기 설정 가이드/튜토리얼이라 장기 대화에서 불필요)
_SLIM_CUT_MARKERS = [
    "【플랫폼 설정 튜토리얼 안내 원칙】",   # 플랫폼 설정 가이드 (약 2KB)
    "[Tistory 튜토리얼 — 사용자가 해야 할 것]",  # fallback marker
]

# 슬리밍 후 항상 추가할 최소 안내 (액션 형식 상기)
_SLIM_REMINDER = "\n\n[요약] API 키 등록·코드 실행·SQL·계열사 설립 액션을 직접 실행 가능합니다."


# ── 핵심 함수 ─────────────────────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """텍스트의 토큰 수를 문자 길이 기반으로 추정합니다."""
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def get_context_stats(
    system: str,
    messages: List[Dict],
    budget: int = DEFAULT_MAX_CONTEXT_TOKENS,
) -> dict:
    """
    현재 컨텍스트의 토큰 사용 현황을 반환합니다.

    Returns:
        {
            "system_tokens": int,
            "history_tokens": int,
            "total_tokens": int,
            "budget_tokens": int,
            "message_count": int,
            "budget_used_pct": float,
            "is_over_budget": bool,
            "per_message": list[{"role", "tokens"}],
        }
    """
    system_tokens = estimate_tokens(system)
    per_message = [
        {"role": m.get("role", "?"), "tokens": estimate_tokens(m.get("content", ""))}
        for m in messages
    ]
    history_tokens = sum(p["tokens"] for p in per_message)
    total = system_tokens + history_tokens

    return {
        "system_tokens": system_tokens,
        "history_tokens": history_tokens,
        "total_tokens": total,
        "budget_tokens": budget,
        "message_count": len(messages),
        "budget_used_pct": round(total / budget * 100, 1) if budget > 0 else 0.0,
        "is_over_budget": total > budget,
        "per_message": per_message,
    }


def slim_system_prompt(system: str, message_count: int) -> Tuple[str, int]:
    """
    대화가 길어지면 시스템 프롬프트에서 튜토리얼 섹션을 제거합니다.

    - message_count < SLIM_AFTER_MESSAGES: 원본 그대로 유지
    - message_count >= SLIM_AFTER_MESSAGES: 마커 이후 내용 제거

    Returns:
        (slimmed_system, tokens_saved)
    """
    if message_count < SLIM_AFTER_MESSAGES:
        return system, 0

    for marker in _SLIM_CUT_MARKERS:
        idx = system.find(marker)
        if idx > 100:  # 너무 앞쪽이면 잘못된 매칭
            slimmed = system[:idx].rstrip() + _SLIM_REMINDER
            saved = estimate_tokens(system) - estimate_tokens(slimmed)
            return slimmed, max(0, saved)

    return system, 0  # 마커 없으면 원본 유지


def trim_messages(
    messages: List[Dict],
    system: str,
    max_context_tokens: int = DEFAULT_MAX_CONTEXT_TOKENS,
    reserve_response: int = DEFAULT_RESERVE_RESPONSE,
) -> Tuple[List[Dict], dict]:
    """
    토큰 예산 초과 시 오래된 메시지부터 제거합니다.

    규칙:
    - 시스템 프롬프트는 절대 건드리지 않음
    - 마지막 MIN_MESSAGES_TO_KEEP개는 항상 보존
    - user/assistant가 교대로 나타나는 쌍 단위로 제거 (대화 흐름 보존)
    - 가장 오래된 메시지부터 제거

    Returns:
        (trimmed_messages, stats)
    """
    available = max_context_tokens - reserve_response - estimate_tokens(system)

    if available <= 0:
        # 시스템 프롬프트만으로 이미 예산 초과 → 최소 메시지만 유지
        kept = messages[-MIN_MESSAGES_TO_KEEP:] if len(messages) > MIN_MESSAGES_TO_KEEP else messages[:]
        tokens_removed = sum(estimate_tokens(m.get("content", "")) for m in messages) - \
                         sum(estimate_tokens(m.get("content", "")) for m in kept)
        return kept, {
            "original_count": len(messages),
            "trimmed_count": len(kept),
            "messages_removed": len(messages) - len(kept),
            "tokens_removed": max(0, tokens_removed),
            "reason": "system_over_budget",
        }

    # 뒤에서부터 메시지를 추가하며 예산 확인
    kept: List[Dict] = []
    used_tokens = 0

    for msg in reversed(messages):
        t = estimate_tokens(msg.get("content", ""))
        # 최소 보존 개수가 채워지기 전엔 강제 포함
        must_keep = len(kept) < MIN_MESSAGES_TO_KEEP
        if not must_keep and used_tokens + t > available:
            break
        kept.insert(0, msg)
        used_tokens += t

    messages_removed = len(messages) - len(kept)
    original_hist_tokens = sum(estimate_tokens(m.get("content", "")) for m in messages)
    tokens_removed = original_hist_tokens - used_tokens

    stats = {
        "original_count": len(messages),
        "trimmed_count": len(kept),
        "messages_removed": messages_removed,
        "tokens_removed": max(0, tokens_removed),
        "history_tokens_used": used_tokens,
        "reason": "trim" if messages_removed > 0 else "none",
    }

    if messages_removed > 0:
        print(
            f"[ContextEngineer] 히스토리 압축: "
            f"{len(messages)}개 → {len(kept)}개 메시지 "
            f"({messages_removed}개 제거, ~{max(0, tokens_removed):,}토큰 절약)"
        )

    return kept, stats


def optimize(
    messages: List[Dict],
    system: str,
    max_context_tokens: int = DEFAULT_MAX_CONTEXT_TOKENS,
    reserve_response: int = DEFAULT_RESERVE_RESPONSE,
) -> Tuple[List[Dict], str, dict]:
    """
    메인 최적화 파이프라인. ai_provider.chat() 에서 호출됩니다.

    실행 순서:
    1. 시스템 프롬프트 슬리밍 (메시지 수 기반)
    2. 메시지 히스토리 윈도잉 (토큰 예산 기반)
    3. 통계 집계 및 로그 출력

    Args:
        messages:           전체 메시지 히스토리
        system:             시스템 프롬프트 (원본)
        max_context_tokens: 컨텍스트 토큰 예산 (응답 제외)
        reserve_response:   응답에 예약할 토큰 수

    Returns:
        (optimized_messages, optimized_system, stats_dict)
    """
    original_sys_tokens = estimate_tokens(system)
    original_hist_tokens = sum(estimate_tokens(m.get("content", "")) for m in messages)
    original_total = original_sys_tokens + original_hist_tokens

    # ── 1단계: 시스템 프롬프트 슬리밍 ────────────────────────────────────────
    slimmed_system, sys_tokens_saved = slim_system_prompt(system, len(messages))

    # ── 2단계: 메시지 히스토리 윈도잉 ────────────────────────────────────────
    trimmed_messages, trim_stats = trim_messages(
        messages, slimmed_system, max_context_tokens, reserve_response
    )

    # ── 3단계: 통계 집계 ─────────────────────────────────────────────────────
    final_sys_tokens = estimate_tokens(slimmed_system)
    final_hist_tokens = sum(estimate_tokens(m.get("content", "")) for m in trimmed_messages)
    final_total = final_sys_tokens + final_hist_tokens
    total_saved = original_total - final_total

    stats = {
        # 원본
        "original_system_tokens": original_sys_tokens,
        "original_history_tokens": original_hist_tokens,
        "original_total_tokens": original_total,
        # 최적화 후
        "final_system_tokens": final_sys_tokens,
        "final_history_tokens": final_hist_tokens,
        "final_total_tokens": final_total,
        # 절약량
        "tokens_saved": max(0, total_saved),
        "savings_pct": round(total_saved / original_total * 100, 1) if original_total > 0 else 0.0,
        "system_tokens_saved": sys_tokens_saved,
        "history_tokens_saved": trim_stats.get("tokens_removed", 0),
        "messages_removed": trim_stats.get("messages_removed", 0),
        # 예산 현황
        "budget_tokens": max_context_tokens,
        "budget_used_pct": round(final_total / max_context_tokens * 100, 1) if max_context_tokens > 0 else 0.0,
        "is_over_budget": final_total > max_context_tokens,
    }

    # 로그 출력
    if total_saved > 100:
        print(
            f"[ContextEngineer] ✂ 최적화: {original_total:,} → {final_total:,} 토큰 "
            f"({max(0, total_saved):,} 절약, {stats['savings_pct']}%↓) | "
            f"예산 {stats['budget_used_pct']}% 사용"
        )
    else:
        print(
            f"[ContextEngineer] 📊 {final_total:,}/{max_context_tokens:,} 토큰 사용 "
            f"({stats['budget_used_pct']}%)"
        )

    return trimmed_messages, slimmed_system, stats
