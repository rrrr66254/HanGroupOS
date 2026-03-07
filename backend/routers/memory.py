from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import CorporateMemory, User
from schemas.schemas import MemoryCreate, MemoryOut

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("", response_model=List[MemoryOut])
def list_memories(
    company_id: Optional[int] = None,
    memory_type: Optional[str] = None,
    importance: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(CorporateMemory)
    if company_id is not None:
        q = q.filter(CorporateMemory.company_id == company_id)
    if memory_type:
        q = q.filter(CorporateMemory.memory_type == memory_type)
    if importance:
        q = q.filter(CorporateMemory.importance == importance)
    if search:
        q = q.filter(
            CorporateMemory.title.ilike(f"%{search}%")
            | CorporateMemory.content.ilike(f"%{search}%")
        )
    return q.order_by(CorporateMemory.created_at.desc()).all()


@router.post("", response_model=MemoryOut)
def create_memory(
    memory_in: MemoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    memory = CorporateMemory(**memory_in.model_dump())
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


@router.get("/{memory_id}", response_model=MemoryOut)
def get_memory(
    memory_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    memory = db.query(CorporateMemory).filter(CorporateMemory.id == memory_id).first()
    if not memory:
        raise HTTPException(404, "Memory not found")
    return memory


@router.delete("/{memory_id}")
def delete_memory(
    memory_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    memory = db.query(CorporateMemory).filter(CorporateMemory.id == memory_id).first()
    if not memory:
        raise HTTPException(404, "Memory not found")
    db.delete(memory)
    db.commit()
    return {"ok": True}


@router.get("/stats/summary")
def memory_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    total = db.query(CorporateMemory).count()
    by_type = {}
    for mt in ["decision", "lesson", "fact", "event", "general"]:
        count = db.query(CorporateMemory).filter(CorporateMemory.memory_type == mt).count()
        by_type[mt] = count
    critical = db.query(CorporateMemory).filter(CorporateMemory.importance == "critical").count()
    return {"total": total, "by_type": by_type, "critical": critical}
