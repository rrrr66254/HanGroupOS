from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import OrgNode, OrgTemplate, OrgPatch, OrgProposal, User, Company
from schemas.schemas import (
    OrgNodeCreate, OrgNodeOut,
    OrgTemplateCreate, OrgTemplateOut,
    OrgProposalCreate, OrgProposalOut,
)
from services.org_service import build_org_tree, get_group_org_tree

router = APIRouter(prefix="/api/org", tags=["org"])


# ── Nodes ─────────────────────────────────────────────────────────────────────
@router.get("/nodes", response_model=List[OrgNodeOut])
def list_nodes(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(OrgNode)
    if company_id is not None:
        q = q.filter(OrgNode.company_id == company_id)
    return q.all()


@router.post("/nodes", response_model=OrgNodeOut)
def create_node(
    node_in: OrgNodeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    node = OrgNode(**node_in.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.patch("/nodes/{node_id}", response_model=OrgNodeOut)
def update_node(
    node_id: int,
    update: OrgNodeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    node = db.query(OrgNode).filter(OrgNode.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(node, field, value)
    db.commit()
    db.refresh(node)
    return node


@router.delete("/nodes/{node_id}")
def delete_node(
    node_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    node = db.query(OrgNode).filter(OrgNode.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")
    db.delete(node)
    db.commit()
    return {"ok": True}


@router.get("/graph")
def org_graph(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if company_id:
        nodes = db.query(OrgNode).filter(OrgNode.company_id == company_id).all()
    else:
        nodes = db.query(OrgNode).all()
    tree = build_org_tree(nodes)
    return {"graph": tree, "total_nodes": len(nodes)}


@router.get("/group-tree")
def group_tree(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    tree = get_group_org_tree(db)
    return {"tree": tree}


# ── Templates ─────────────────────────────────────────────────────────────────
@router.get("/templates", response_model=List[OrgTemplateOut])
def list_templates(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(OrgTemplate).all()


@router.post("/templates", response_model=OrgTemplateOut)
def create_template(
    template_in: OrgTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = OrgTemplate(
        name=template_in.name,
        description=template_in.description,
        template_json=template_in.template_json,
        industry=template_in.industry,
        created_by=current_user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.post("/templates/validate")
def validate_template(template_json: dict, _: User = Depends(get_current_user)):
    required_keys = ["nodes"]
    missing = [k for k in required_keys if k not in template_json]
    if missing:
        return {"valid": False, "errors": [f"Missing key: {k}" for k in missing]}
    nodes = template_json.get("nodes", [])
    errors = []
    for i, node in enumerate(nodes):
        for field in ["name", "role", "level"]:
            if field not in node:
                errors.append(f"Node {i}: missing '{field}'")
    return {"valid": len(errors) == 0, "errors": errors}


# ── Proposals ─────────────────────────────────────────────────────────────────
@router.get("/proposals", response_model=List[OrgProposalOut])
def list_proposals(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(OrgProposal)
    if company_id:
        q = q.filter(OrgProposal.company_id == company_id)
    return q.order_by(OrgProposal.created_at.desc()).all()


@router.post("/proposals", response_model=OrgProposalOut)
def create_proposal(
    proposal_in: OrgProposalCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proposal = OrgProposal(**proposal_in.model_dump())
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post("/proposals/{proposal_id}/approve")
def approve_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proposal = db.query(OrgProposal).filter(OrgProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    proposal.status = "approved"
    db.commit()
    return {"ok": True, "status": "approved"}


@router.post("/proposals/{proposal_id}/reject")
def reject_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proposal = db.query(OrgProposal).filter(OrgProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    proposal.status = "rejected"
    db.commit()
    return {"ok": True, "status": "rejected"}
