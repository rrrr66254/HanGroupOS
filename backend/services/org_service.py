"""
Org service: builds org tree, generates default org structures.
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from models.models import OrgNode, Company
from schemas.schemas import OrgNodeTree


DEFAULT_TEMPLATES = {
    "media": {
        "name": "미디어 기업 조직",
        "nodes": [
            {"name": "CEO", "role": "최고경영자", "level": "ceo"},
            {"name": "콘텐츠 Chief", "role": "콘텐츠 총괄", "level": "chief", "parent": "CEO"},
            {"name": "기술 Chief", "role": "기술 총괄", "level": "chief", "parent": "CEO"},
            {"name": "콘텐츠 팀장", "role": "콘텐츠 제작 팀장", "level": "team_lead", "parent": "콘텐츠 Chief"},
            {"name": "배포 팀장", "role": "배포 전략 팀장", "level": "team_lead", "parent": "콘텐츠 Chief"},
            {"name": "개발 팀장", "role": "플랫폼 개발 팀장", "level": "team_lead", "parent": "기술 Chief"},
        ],
    },
    "software": {
        "name": "소프트웨어 기업 조직",
        "nodes": [
            {"name": "CEO", "role": "최고경영자", "level": "ceo"},
            {"name": "Product Chief", "role": "제품 총괄", "level": "chief", "parent": "CEO"},
            {"name": "Engineering Chief", "role": "개발 총괄", "level": "chief", "parent": "CEO"},
            {"name": "Growth Chief", "role": "성장 총괄", "level": "chief", "parent": "CEO"},
            {"name": "PM 팀장", "role": "제품 관리 팀장", "level": "team_lead", "parent": "Product Chief"},
            {"name": "BE 팀장", "role": "백엔드 팀장", "level": "team_lead", "parent": "Engineering Chief"},
            {"name": "FE 팀장", "role": "프론트엔드 팀장", "level": "team_lead", "parent": "Engineering Chief"},
            {"name": "마케팅 팀장", "role": "마케팅 팀장", "level": "team_lead", "parent": "Growth Chief"},
        ],
    },
    "data": {
        "name": "데이터 기업 조직",
        "nodes": [
            {"name": "CEO", "role": "최고경영자", "level": "ceo"},
            {"name": "데이터 Chief", "role": "데이터 총괄", "level": "chief", "parent": "CEO"},
            {"name": "전략 Chief", "role": "전략 총괄", "level": "chief", "parent": "CEO"},
            {"name": "분석 팀장", "role": "데이터 분석 팀장", "level": "team_lead", "parent": "데이터 Chief"},
            {"name": "엔지니어링 팀장", "role": "데이터 엔지니어링 팀장", "level": "team_lead", "parent": "데이터 Chief"},
            {"name": "인사이트 팀장", "role": "비즈니스 인사이트 팀장", "level": "team_lead", "parent": "전략 Chief"},
        ],
    },
    "general": {
        "name": "기본 기업 조직",
        "nodes": [
            {"name": "CEO", "role": "최고경영자", "level": "ceo"},
            {"name": "운영 Chief", "role": "운영 총괄", "level": "chief", "parent": "CEO"},
            {"name": "성장 Chief", "role": "성장 총괄", "level": "chief", "parent": "CEO"},
            {"name": "운영 팀장", "role": "운영 팀장", "level": "team_lead", "parent": "운영 Chief"},
            {"name": "마케팅 팀장", "role": "마케팅 팀장", "level": "team_lead", "parent": "성장 Chief"},
        ],
    },
}


def get_org_template(industry: str) -> Dict:
    industry_map = {
        "미디어": "media", "media": "media",
        "소프트웨어": "software", "software": "software", "saas": "software",
        "데이터": "data", "data": "data",
    }
    key = industry_map.get(industry.lower(), "general")
    return DEFAULT_TEMPLATES.get(key, DEFAULT_TEMPLATES["general"])


def create_company_org(db: Session, company_id: int, industry: str = "general") -> List[OrgNode]:
    template = get_org_template(industry)
    nodes_data = template["nodes"]
    name_to_id: Dict[str, int] = {}
    created: List[OrgNode] = []

    for nd in nodes_data:
        parent_id = name_to_id.get(nd.get("parent")) if nd.get("parent") else None
        node = OrgNode(
            company_id=company_id,
            name=nd["name"],
            role=nd["role"],
            level=nd["level"],
            parent_id=parent_id,
            ai_provider="mock",
            ai_model="",
            description="",
        )
        db.add(node)
        db.flush()
        name_to_id[nd["name"]] = node.id
        created.append(node)

    db.commit()
    return created


def build_org_tree(nodes: List[OrgNode]) -> List[Dict]:
    node_map: Dict[int, Dict] = {}
    for n in nodes:
        node_map[n.id] = {
            "id": n.id,
            "name": n.name,
            "role": n.role,
            "level": n.level,
            "parent_id": n.parent_id,
            "ai_provider": n.ai_provider,
            "ai_model": n.ai_model,
            "description": n.description,
            "children": [],
        }

    roots = []
    for n in nodes:
        if n.parent_id is None or n.parent_id not in node_map:
            roots.append(node_map[n.id])
        else:
            node_map[n.parent_id]["children"].append(node_map[n.id])

    return roots


def get_company_org_tree(db: Session, company_id: int) -> List[Dict]:
    nodes = db.query(OrgNode).filter(OrgNode.company_id == company_id).all()
    return build_org_tree(nodes)


def get_group_org_tree(db: Session) -> List[Dict]:
    """Group-level nodes (company_id = None)."""
    nodes = db.query(OrgNode).filter(OrgNode.company_id == None).all()
    return build_org_tree(nodes)
