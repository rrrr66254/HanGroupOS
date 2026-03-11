"""
KPI 데이터 연동 라우터 — StrategyItem KPI를 외부 데이터 소스와 자동 연결
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.models import KpiDataLink, StrategyItem, ExternalApiKey, User

router = APIRouter(prefix="/api/kpi-links", tags=["kpi-links"])


class KpiLinkCreateRequest(BaseModel):
    strategy_item_id: int
    source: str
    series_id: str
    field_path: str = "data[0].value"
    transform: str = "latest"
    unit: str = ""


def _extract_value(data: dict, field_path: str):
    """field_path (e.g. 'data[0].value') 로 JSON에서 값 추출."""
    try:
        parts = field_path.split(".")
        current = data
        for part in parts:
            if "[" in part:
                key = part[:part.index("[")]
                idx = int(part[part.index("[") + 1:part.index("]")])
                if key:
                    current = current[key]
                current = current[idx]
            else:
                current = current[part]
        return current
    except Exception:
        return None


def _collect_for_source(db: Session, source: str, series_id: str) -> dict:
    """소스에 맞는 수집기를 호출하고 결과 dict 반환."""
    from services.data_collector import DataCollector

    api_keys = {}
    extra_configs = {}
    for row in db.query(ExternalApiKey).filter(ExternalApiKey.is_active == True).all():
        api_keys[row.service] = row.api_key
        if row.extra_config:
            extra_configs[row.service] = row.extra_config

    collector = DataCollector(api_keys=api_keys, extra_configs=extra_configs)

    if source == "fred":
        return collector.collect_fred(series_id=series_id)
    elif source == "worldbank":
        # series_id 형식: "KR:NY.GDP.MKTP.KD.ZG"
        if ":" in series_id:
            country, indicator = series_id.split(":", 1)
        else:
            country, indicator = "KR", series_id
        return collector.collect_worldbank(indicator=indicator, country=country)
    elif source == "ecos":
        return collector.collect_ecos(stat_code=series_id)
    elif source == "kosis":
        parts = series_id.split("/")
        org_id = parts[0] if len(parts) > 0 else ""
        tbl_id = parts[1] if len(parts) > 1 else ""
        return collector.collect_kosis(org_id=org_id, tbl_id=tbl_id)
    else:
        raise ValueError(f"지원하지 않는 소스: {source}")


def _sync_link(db: Session, link: KpiDataLink) -> dict:
    """단일 KpiDataLink 동기화. 값 추출 후 KpiDataLink + StrategyItem 업데이트."""
    result = _collect_for_source(db, link.source, link.series_id)
    value = _extract_value(result, link.field_path)

    if value is None:
        raise ValueError(f"field_path '{link.field_path}'로 값을 추출할 수 없습니다.")

    try:
        numeric_value = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"추출된 값 '{value}'을 숫자로 변환할 수 없습니다.")

    # KpiDataLink 업데이트
    link.last_value = numeric_value
    link.last_updated_at = datetime.utcnow()

    # StrategyItem 업데이트
    item = db.query(StrategyItem).filter(StrategyItem.id == link.strategy_item_id).first()
    if item:
        unit_str = f" {link.unit}" if link.unit else ""
        note = f"\n[KPI 자동 업데이트 {datetime.utcnow().strftime('%Y-%m-%d')}] {link.source}/{link.series_id}: {numeric_value}{unit_str}"
        item.description = (item.description or "") + note

    db.commit()
    return {"link_id": link.id, "value": numeric_value, "unit": link.unit}


@router.get("", summary="KPI 연동 목록")
def list_kpi_links(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    links = db.query(KpiDataLink).order_by(KpiDataLink.id).all()
    result = []
    for link in links:
        item = db.query(StrategyItem).filter(StrategyItem.id == link.strategy_item_id).first()
        result.append({
            "id": link.id,
            "strategy_item_id": link.strategy_item_id,
            "strategy_item_title": item.title if item else None,
            "source": link.source,
            "series_id": link.series_id,
            "field_path": link.field_path,
            "transform": link.transform,
            "unit": link.unit,
            "last_value": link.last_value,
            "last_updated_at": link.last_updated_at.isoformat() if link.last_updated_at else None,
            "is_active": link.is_active,
            "created_at": link.created_at.isoformat() if link.created_at else None,
        })
    return result


@router.post("", summary="KPI 연동 생성")
def create_kpi_link(
    req: KpiLinkCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(StrategyItem).filter(StrategyItem.id == req.strategy_item_id).first()
    if not item:
        raise HTTPException(404, "전략 항목을 찾을 수 없습니다.")

    link = KpiDataLink(
        strategy_item_id=req.strategy_item_id,
        source=req.source,
        series_id=req.series_id,
        field_path=req.field_path,
        transform=req.transform,
        unit=req.unit,
        is_active=True,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return {
        "id": link.id,
        "strategy_item_id": link.strategy_item_id,
        "strategy_item_title": item.title,
        "source": link.source,
        "series_id": link.series_id,
        "field_path": link.field_path,
        "transform": link.transform,
        "unit": link.unit,
        "is_active": link.is_active,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


@router.delete("/{link_id}", summary="KPI 연동 삭제")
def delete_kpi_link(
    link_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    link = db.query(KpiDataLink).filter(KpiDataLink.id == link_id).first()
    if not link:
        raise HTTPException(404, "KPI 연동을 찾을 수 없습니다.")
    db.delete(link)
    db.commit()
    return {"message": "삭제되었습니다."}


@router.post("/{link_id}/sync", summary="KPI 연동 수동 동기화")
def sync_kpi_link(
    link_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    link = db.query(KpiDataLink).filter(KpiDataLink.id == link_id).first()
    if not link:
        raise HTTPException(404, "KPI 연동을 찾을 수 없습니다.")
    if not link.is_active:
        raise HTTPException(400, "비활성화된 연동입니다.")

    try:
        result = _sync_link(db, link)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"동기화 실패: {e}")

    return {**result, "synced_at": datetime.utcnow().isoformat()}


@router.post("/sync-all", summary="모든 활성 KPI 연동 동기화")
def sync_all_kpi_links(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    links = db.query(KpiDataLink).filter(KpiDataLink.is_active == True).all()
    results = []
    errors = []

    for link in links:
        try:
            result = _sync_link(db, link)
            results.append(result)
        except Exception as e:
            errors.append({"link_id": link.id, "error": str(e)})

    return {
        "synced": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
        "synced_at": datetime.utcnow().isoformat(),
    }
