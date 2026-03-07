from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import Company, OrgNode, User
from schemas.schemas import CompanyCreate, CompanyUpdate, CompanyOut
from services.org_service import create_company_org, get_company_org_tree

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("", response_model=List[CompanyOut])
def list_companies(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Company)
    if status:
        q = q.filter(Company.status == status)
    return q.order_by(Company.created_at.desc()).all()


@router.post("", response_model=CompanyOut)
def create_company(
    company_in: CompanyCreate,
    auto_org: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = Company(
        name=company_in.name,
        description=company_in.description,
        industry=company_in.industry,
        vision=company_in.vision,
        status=company_in.status,
        created_by=current_user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    if auto_org:
        create_company_org(db, company.id, company_in.industry or "general")

    return company


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    return company


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: int,
    update: CompanyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.delete("/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    db.delete(company)
    db.commit()
    return {"ok": True}


@router.get("/{company_id}/org-tree")
def get_company_org(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tree = get_company_org_tree(db, company_id)
    return {"tree": tree}
