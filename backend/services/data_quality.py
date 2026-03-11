"""
데이터 품질 관리 서비스

- 콘텐츠 해시 기반 중복 감지
- 관련성 점수 계산 (키워드 매칭)
- 자동 정리 (오래된 raw 데이터, 저품질 데이터)
- 용량 제한 (소스/타입별 최대 레코드 수)
"""
import hashlib
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func


# ── 기본 용량 정책 ─────────────────────────────────────────────────────────────
DEFAULT_POLICY = {
    # 소스별 최대 레코드 수 (전체)
    "max_per_source": {
        "hackernews": 200,
        "worldbank": 100,
        "reddit": 300,
        "kosis": 200,
        "ecos": 200,
        "fred": 200,
        "alphavantage": 200,
        "dart": 500,
        "serpapi": 500,
        "newsapi": 1000,
        "google_news_rss_free": 2000,
        "auto": 500,
    },
    # 타입별 최대 레코드 수 (회사당)
    "max_per_type_per_company": {
        "news": 500,
        "tech_trend": 300,
        "economic": 200,
        "community": 300,
        "disclosure": 1000,
        "stock": 200,
        "statistics": 300,
        "web_search": 500,
        "trade": 300,
    },
    # 콘텐츠 최소 길이 (이 이하는 저품질로 분류)
    "min_content_length": 50,
    # raw 상태 데이터 보관 기간 (일)
    "raw_retention_days": 30,
    # processed 상태 데이터 보관 기간 (일)
    "processed_retention_days": 90,
}


def get_policy(db: Session, source: str, company_id: Optional[int] = None) -> dict:
    """DB에서 수집 정책 조회. 회사별 > 글로벌 > 하드코딩 순으로 폴백."""
    from models.models import DataCollectionPolicy

    # 1) 회사별 정책
    if company_id:
        p = db.query(DataCollectionPolicy).filter(
            DataCollectionPolicy.source == source,
            DataCollectionPolicy.company_id == company_id,
            DataCollectionPolicy.is_active == True,
        ).first()
        if p:
            return {
                "max_records": p.max_records,
                "retention_days": p.retention_days,
            }

    # 2) 글로벌 정책 (company_id=None)
    p = db.query(DataCollectionPolicy).filter(
        DataCollectionPolicy.source == source,
        DataCollectionPolicy.company_id == None,
        DataCollectionPolicy.is_active == True,
    ).first()
    if p:
        return {
            "max_records": p.max_records,
            "retention_days": p.retention_days,
        }

    # 3) 하드코딩 기본값
    return {
        "max_records": DEFAULT_POLICY["max_per_source"].get(source),
        "retention_days": DEFAULT_POLICY["raw_retention_days"],
    }


def compute_hash(title: str, content: str) -> str:
    """제목+내용 앞 500자를 SHA256 해싱."""
    text = f"{title}|{content[:500]}"
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_duplicate(db: Session, content_hash: str, company_id: Optional[int] = None) -> bool:
    """동일 해시가 DB에 이미 존재하는지 확인."""
    from models.models import CollectedData
    q = db.query(CollectedData).filter(CollectedData.content_hash == content_hash)
    return q.first() is not None


def compute_relevance(content: str, keywords: List[str]) -> float:
    """
    키워드 매칭 기반 관련성 점수 계산 (0.0~1.0).
    keywords: 회사 업종, 이름, 커스텀 키워드 등
    """
    if not keywords or not content:
        return 0.5  # 키워드 없으면 중립

    content_lower = content.lower()
    matched = sum(1 for kw in keywords if kw.lower() in content_lower)
    score = min(1.0, matched / max(len(keywords), 1))
    return round(score, 3)


def check_quality(title: str, content: str, content_hash: str, db: Session) -> str:
    """
    데이터 품질 플래그 반환.
    Returns: 'ok' | 'short' | 'duplicate' | 'empty'
    """
    if not title and not content:
        return "empty"
    if len(content.strip()) < DEFAULT_POLICY["min_content_length"]:
        return "short"
    if is_duplicate(db, content_hash):
        return "duplicate"
    return "ok"


def should_save(
    db: Session,
    source: str,
    data_type: str,
    company_id: Optional[int],
    quality_flag: str,
) -> tuple[bool, str]:
    """
    저장 여부 판단. (should_save: bool, reason: str)
    - 중복이면 저장 안 함
    - 용량 초과면 저장 안 함
    - 저품질(short)은 저장하되 플래그만
    DB에서 정책 조회 (get_policy), 없으면 하드코딩 기본값 사용.
    """
    from models.models import CollectedData

    # 중복은 항상 스킵
    if quality_flag == "duplicate":
        return False, "duplicate"
    if quality_flag == "empty":
        return False, "empty"

    # 소스별 용량 제한 (DB 정책 우선)
    policy = get_policy(db, source, company_id)
    max_src = policy.get("max_records") or DEFAULT_POLICY["max_per_source"].get(source)
    if max_src:
        cnt = db.query(func.count(CollectedData.id)).filter(
            CollectedData.source == source
        ).scalar() or 0
        if cnt >= max_src:
            # 오래된 것 1건 삭제 후 허용
            oldest = (
                db.query(CollectedData)
                .filter(CollectedData.source == source, CollectedData.status == "raw")
                .order_by(CollectedData.created_at.asc())
                .first()
            )
            if oldest:
                db.delete(oldest)
                db.commit()
            else:
                return False, f"source_limit({max_src})"

    # 회사별 타입 용량 제한
    if company_id:
        max_type = DEFAULT_POLICY["max_per_type_per_company"].get(data_type)
        if max_type:
            cnt = db.query(func.count(CollectedData.id)).filter(
                CollectedData.company_id == company_id,
                CollectedData.data_type == data_type,
            ).scalar() or 0
            if cnt >= max_type:
                oldest = (
                    db.query(CollectedData)
                    .filter(
                        CollectedData.company_id == company_id,
                        CollectedData.data_type == data_type,
                        CollectedData.status == "raw",
                    )
                    .order_by(CollectedData.created_at.asc())
                    .first()
                )
                if oldest:
                    db.delete(oldest)
                    db.commit()
                else:
                    return False, f"type_limit({max_type})"

    return True, "ok"


# ── 자동 정리 ──────────────────────────────────────────────────────────────────

def cleanup_old_data(db: Session, raw_days: int = None, processed_days: int = None) -> dict:
    """
    오래된 raw/processed 데이터 정리.
    Returns: 삭제 통계
    """
    from models.models import CollectedData

    raw_days = raw_days or DEFAULT_POLICY["raw_retention_days"]
    processed_days = processed_days or DEFAULT_POLICY["processed_retention_days"]

    raw_cutoff = datetime.utcnow() - timedelta(days=raw_days)
    proc_cutoff = datetime.utcnow() - timedelta(days=processed_days)

    # raw 오래된 것 삭제
    raw_deleted = (
        db.query(CollectedData)
        .filter(CollectedData.status == "raw", CollectedData.created_at < raw_cutoff)
        .count()
    )
    db.query(CollectedData).filter(
        CollectedData.status == "raw", CollectedData.created_at < raw_cutoff
    ).delete(synchronize_session=False)

    # processed 오래된 것 삭제
    proc_deleted = (
        db.query(CollectedData)
        .filter(CollectedData.status == "processed", CollectedData.created_at < proc_cutoff)
        .count()
    )
    db.query(CollectedData).filter(
        CollectedData.status == "processed", CollectedData.created_at < proc_cutoff
    ).delete(synchronize_session=False)

    # 저품질(empty) 전량 삭제
    empty_deleted = (
        db.query(CollectedData)
        .filter(CollectedData.quality_flag == "empty")
        .count()
    )
    db.query(CollectedData).filter(
        CollectedData.quality_flag == "empty"
    ).delete(synchronize_session=False)

    db.commit()
    return {
        "raw_deleted": raw_deleted,
        "processed_deleted": proc_deleted,
        "empty_deleted": empty_deleted,
        "total_deleted": raw_deleted + proc_deleted + empty_deleted,
    }


def dedup_data(db: Session) -> dict:
    """
    content_hash 기반 중복 레코드 제거 (최신 것 남기고 오래된 것 삭제).
    """
    from models.models import CollectedData
    from sqlalchemy import text

    # 중복 해시 찾기 (hash가 있는 것만)
    dup_rows = (
        db.query(CollectedData.content_hash, func.count(CollectedData.id).label("cnt"))
        .filter(CollectedData.content_hash != None)
        .group_by(CollectedData.content_hash)
        .having(func.count(CollectedData.id) > 1)
        .all()
    )

    removed = 0
    for hash_val, cnt in dup_rows:
        # 같은 해시의 레코드들 — 최신 id만 남김
        records = (
            db.query(CollectedData)
            .filter(CollectedData.content_hash == hash_val)
            .order_by(CollectedData.created_at.desc())
            .all()
        )
        for r in records[1:]:  # 첫 번째(최신) 제외 나머지 삭제
            db.delete(r)
            removed += 1

    db.commit()
    return {"duplicates_removed": removed, "hash_groups_found": len(dup_rows)}


def get_quality_report(db: Session) -> dict:
    """데이터 품질 리포트 생성."""
    from models.models import CollectedData

    total = db.query(func.count(CollectedData.id)).scalar() or 0

    # 플래그별 집계
    flag_rows = (
        db.query(CollectedData.quality_flag, func.count(CollectedData.id))
        .group_by(CollectedData.quality_flag)
        .all()
    )
    by_flag = {(f or "unscored"): c for f, c in flag_rows}

    # 상태별 집계
    status_rows = (
        db.query(CollectedData.status, func.count(CollectedData.id))
        .group_by(CollectedData.status)
        .all()
    )
    by_status = {s: c for s, c in status_rows}

    # 해시 있는 것 vs 없는 것
    hashed = db.query(func.count(CollectedData.id)).filter(CollectedData.content_hash != None).scalar() or 0
    unhashed = total - hashed

    # 오래된 raw 데이터 (30일 초과)
    raw_cutoff = datetime.utcnow() - timedelta(days=DEFAULT_POLICY["raw_retention_days"])
    stale_raw = (
        db.query(func.count(CollectedData.id))
        .filter(CollectedData.status == "raw", CollectedData.created_at < raw_cutoff)
        .scalar() or 0
    )

    # 중복 추정 (hash 중복)
    dup_hashes = (
        db.query(func.count(CollectedData.content_hash))
        .filter(CollectedData.content_hash != None)
        .group_by(CollectedData.content_hash)
        .having(func.count(CollectedData.id) > 1)
        .count()
    )

    # 소스별 용량 사용률
    source_rows = (
        db.query(CollectedData.source, func.count(CollectedData.id))
        .group_by(CollectedData.source)
        .all()
    )
    source_usage = []
    for src, cnt in source_rows:
        max_val = DEFAULT_POLICY["max_per_source"].get(src)
        source_usage.append({
            "source": src,
            "count": cnt,
            "limit": max_val,
            "usage_pct": round(cnt / max_val * 100) if max_val else None,
        })
    source_usage.sort(key=lambda x: x["count"], reverse=True)

    # 평균 관련성 점수
    avg_rel = (
        db.query(func.avg(CollectedData.relevance_score))
        .filter(CollectedData.relevance_score != None)
        .scalar()
    )

    return {
        "total": total,
        "by_status": by_status,
        "by_flag": by_flag,
        "hashed": hashed,
        "unhashed": unhashed,
        "stale_raw": stale_raw,
        "duplicate_hash_groups": dup_hashes,
        "source_usage": source_usage[:15],
        "avg_relevance_score": round(float(avg_rel), 3) if avg_rel else None,
        "policy": {
            "raw_retention_days": DEFAULT_POLICY["raw_retention_days"],
            "processed_retention_days": DEFAULT_POLICY["processed_retention_days"],
            "min_content_length": DEFAULT_POLICY["min_content_length"],
        },
    }
