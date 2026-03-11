"""
KPI 데이터 링크 라우터
수집 데이터(FRED/World Bank/ECOS 등) → StrategyItem KPI 자동 갱신
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.models import KpiDataLink, StrategyItem, CollectedData, User

router = APIRouter(prefix="/api/kpi-links", tags=["kpi-links"])


class KpiLinkCreateRequest(BaseModel):
    strategy_item_id: int
    source: str
    series_id: str
    field_path: str = "data[0].value"
    transform: str = "latest"
    unit: str = ""


@router.get("", summary="KPI 링크 목록")
def list_kpi_links(
    strategy_item_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(KpiDataLink)
    if strategy_item_id:
        q = q.filter(KpiDataLink.strategy_item_id == strategy_item_id)
    links = q.order_by(KpiDataLink.id.desc()).all()
    return [
        {
            "id": lnk.id,
            "strategy_item_id": lnk.strategy_item_id,
            "source": lnk.source,
            "series_id": lnk.series_id,
            "field_path": lnk.field_path,
            "transform": lnk.transform,
            "unit": lnk.unit,
            "last_value": lnk.last_value,
            "last_updated_at": lnk.last_updated_at.isoformat() if lnk.last_updated_at else None,
            "is_active": lnk.is_active,
            "created_at": lnk.created_at.isoformat() if lnk.created_at else None,
        }
        for lnk in links
    ]


@router.post("", summary="KPI 링크 생성")
def create_kpi_link(
    req: KpiLinkCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(StrategyItem).filter(StrategyItem.id == req.strategy_item_id).first()
    if not item:
        raise HTTPException(404, "전략 아이템을 찾을 수 없습니다.")

    lnk = KpiDataLink(
        strategy_item_id=req.strategy_item_id,
        source=req.source,
        series_id=req.series_id,
        field_path=req.field_path,
        transform=req.transform,
        unit=req.unit,
        is_active=True,
    )
    db.add(lnk)
    db.commit()
    db.refresh(lnk)
    return {"id": lnk.id, "message": "KPI 링크가 생성되었습니다."}


@router.delete("/{link_id}", summary="KPI 링크 삭제")
def delete_kpi_link(
    link_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lnk = db.query(KpiDataLink).filter(KpiDataLink.id == link_id).first()
    if not lnk:
        raise HTTPException(404, "링크를 찾을 수 없습니다.")
    db.delete(lnk)
    db.commit()
    return {"message": "KPI 링크가 삭제되었습니다."}


@router.patch("/{link_id}/toggle", summary="KPI 링크 활성화/비활성화")
def toggle_kpi_link(
    link_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lnk = db.query(KpiDataLink).filter(KpiDataLink.id == link_id).first()
    if not lnk:
        raise HTTPException(404, "링크를 찾을 수 없습니다.")
    lnk.is_active = not lnk.is_active
    db.commit()
    return {"id": lnk.id, "is_active": lnk.is_active}


@router.post("/{link_id}/sync", summary="KPI 링크 즉시 동기화")
def sync_kpi_link(
    link_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lnk = db.query(KpiDataLink).filter(KpiDataLink.id == link_id).first()
    if not lnk:
        raise HTTPException(404, "링크를 찾을 수 없습니다.")

    row = (
        db.query(CollectedData)
        .filter(
            CollectedData.source == lnk.source,
            CollectedData.query.contains(lnk.series_id),
        )
        .order_by(CollectedData.created_at.desc())
        .first()
    )

    value = None
    if row and row.structured:
        try:
            data = row.structured
            parts = lnk.field_path.replace("]", "").replace("[", ".").split(".")
            cur = data
            for part in parts:
                if part.isdigit():
                    cur = cur[int(part)]
                elif part and isinstance(cur, dict):
                    cur = cur.get(part)
                if cur is None:
                    break
            if cur is not None:
                value = float(cur)
        except Exception:
            pass

    if value is None:
        raise HTTPException(422, f"소스 '{lnk.source}'에서 값을 추출할 수 없습니다.")

    item = db.query(StrategyItem).filter(StrategyItem.id == lnk.strategy_item_id).first()
    if item:
        item.kpi_current = value

    lnk.last_value = value
    lnk.last_updated_at = datetime.utcnow()
    db.commit()

    return {
        "link_id": link_id,
        "strategy_item_id": lnk.strategy_item_id,
        "source": lnk.source,
        "series_id": lnk.series_id,
        "value": value,
        "unit": lnk.unit,
        "synced_at": lnk.last_updated_at.isoformat(),
    }


@router.post("/sync-all", summary="모든 활성 KPI 링크 일괄 동기화")
def sync_all_kpi_links(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    links = db.query(KpiDataLink).filter(KpiDataLink.is_active == True).all()
    results = []
    for lnk in links:
        row = (
            db.query(CollectedData)
            .filter(
                CollectedData.source == lnk.source,
                CollectedData.query.contains(lnk.series_id),
            )
            .order_by(CollectedData.created_at.desc())
            .first()
        )
        value = None
        if row and row.structured:
            try:
                data = row.structured
                parts = lnk.field_path.replace("]", "").replace("[", ".").split(".")
                cur = data
                for part in parts:
                    if part.isdigit():
                        cur = cur[int(part)]
                    elif part and isinstance(cur, dict):
                        cur = cur.get(part)
                    if cur is None:
                        break
                if cur is not None:
                    value = float(cur)
            except Exception:
                pass

        if value is not None:
            item = db.query(StrategyItem).filter(StrategyItem.id == lnk.strategy_item_id).first()
            if item:
                item.kpi_current = value
            lnk.last_value = value
            lnk.last_updated_at = datetime.utcnow()
            results.append({"link_id": lnk.id, "value": value, "status": "ok"})
        else:
            results.append({"link_id": lnk.id, "value": None, "status": "no_data"})

    db.commit()
    return {
        "synced": sum(1 for r in results if r["status"] == "ok"),
        "failed": sum(1 for r in results if r["status"] != "ok"),
        "results": results,
    }
