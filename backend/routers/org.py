from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.security import get_current_user
from models.models import OrgNode, OrgTemplate, OrgPatch, OrgProposal, User, Company
from services.ai_provider import get_provider_from_db
from schemas.schemas import (
    OrgNodeCreate, OrgNodeOut,
    OrgTemplateCreate, OrgTemplateOut,
    OrgProposalCreate, OrgProposalOut,
)
from services.org_service import (
    build_org_tree, get_group_org_tree,
    ensure_company_specialists, ensure_all_companies_specialists,
)

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


class NodeMoveRequest(BaseModel):
    parent_id: Optional[int] = None


@router.patch("/nodes/{node_id}/move", response_model=OrgNodeOut)
def move_node(
    node_id: int,
    body: NodeMoveRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """조직도 드래그앤드롭: parent_id만 변경 (순환 참조 방지 포함)."""
    node = db.query(OrgNode).filter(OrgNode.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")

    new_parent_id = body.parent_id

    # 순환 참조 방지: 새 부모가 자신의 자손이면 불가
    if new_parent_id is not None:
        def is_descendant(candidate_id: int, ancestor_id: int) -> bool:
            visited = set()
            current_id = candidate_id
            while current_id is not None:
                if current_id in visited:
                    break
                visited.add(current_id)
                current = db.query(OrgNode).filter(OrgNode.id == current_id).first()
                if not current:
                    break
                if current.parent_id == ancestor_id:
                    return True
                current_id = current.parent_id
            return False

        if new_parent_id == node_id or is_descendant(new_parent_id, node_id):
            raise HTTPException(400, "순환 참조: 자손 노드를 부모로 지정할 수 없습니다.")

    node.parent_id = new_parent_id
    db.commit()
    db.refresh(node)
    return node


@router.post("/nodes/{node_id}/test")
def test_node(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a one-shot test message using the node's configured AI provider/model."""
    node = db.query(OrgNode).filter(OrgNode.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")

    # Use the user's configured provider but override with node's model
    provider = get_provider_from_db(db, current_user.id)
    # Override model to match node's assignment
    provider.provider = node.ai_provider if node.ai_provider not in ("mock", "") else provider.provider
    provider.model = node.ai_model if node.ai_model else provider.model

    system = (
        f"당신은 {node.name}입니다. {node.role} 역할을 맡고 있습니다. "
        f"한 문장으로 짧고 명확하게 자기소개를 하세요."
    )
    response = provider.chat(
        [{"role": "user", "content": "안녕하세요! 간단히 자기소개 해주세요."}],
        system=system,
        session_type="ceo",
        max_tokens=200,
    )
    return {
        "node_id": node.id,
        "name": node.name,
        "role": node.role,
        "provider": provider.provider,
        "model": provider.model,
        "response": response,
    }


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


@router.post("/ensure-specialists/{company_id}")
def ensure_specialists(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Add missing specialists (up to 3 per team_lead) for a company."""
    created = ensure_company_specialists(db, company_id)
    return {"created": len(created), "company_id": company_id}


@router.post("/ensure-all-specialists")
def ensure_all_specialists(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Add missing specialists for ALL companies."""
    total = ensure_all_companies_specialists(db)
    return {"created": total}


@router.patch("/nodes/{node_id}/personality")
def update_node_personality(
    node_id: int,
    personality: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Update only the personality sub-object inside node.meta."""
    node = db.query(OrgNode).filter(OrgNode.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")
    meta = dict(node.meta or {})
    meta["personality"] = personality
    node.meta = meta
    db.commit()
    db.refresh(node)
    return {"ok": True, "node_id": node_id, "personality": personality}


@router.post("/migrate-mock")
def migrate_mock_nodes(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Replace 'mock' ai_provider with 'ollama' on all org nodes."""
    nodes = db.query(OrgNode).filter(OrgNode.ai_provider == "mock").all()
    for n in nodes:
        n.ai_provider = "ollama"
        if not n.ai_model:
            n.ai_model = "qwen2.5"
    db.commit()
    return {"migrated": len(nodes)}


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
