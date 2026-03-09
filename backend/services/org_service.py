"""
Org service: builds org tree, generates default org structures.
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from models.models import OrgNode, Company
from schemas.schemas import OrgNodeTree


# ── AI tier mapping: level → budget → (provider, model_id) ───────────────
AI_TIER: Dict[str, Dict[str, Tuple[str, str]]] = {
    "ceo": {
        "any":  ("anthropic", "claude-sonnet-4-6"),
        "low":  ("openai",    "gpt-4o-mini"),
        "free": ("ollama",    "llama3.2"),
    },
    "chief": {
        "any":  ("anthropic", "claude-haiku-4-5-20251001"),
        "low":  ("openai",    "gpt-4o-mini"),
        "free": ("ollama",    "llama3.2"),
    },
    "team_lead": {
        "any":  ("openai", "gpt-4o-mini"),
        "low":  ("ollama", "llama3.2"),
        "free": ("ollama", "qwen2.5"),
    },
    "specialist": {
        "any":  ("ollama", "qwen2.5"),
        "low":  ("ollama", "qwen2.5"),
        "free": ("ollama", "qwen2.5"),
    },
}

# ── Role-based specialization descriptions ────────────────────────────────
ROLE_DESC: Dict[str, str] = {
    "최고경영자":             "회사 전략 실행 및 전체 팀 총괄 — 의사결정 특화",
    "콘텐츠 총괄":            "AI 콘텐츠 전략·창작 총괄 — 창의적 판단 특화",
    "기술 총괄":              "기술 아키텍처 및 플랫폼 개발 총괄 — 기술 분석 특화",
    "제품 총괄":              "제품 로드맵 및 사용자 경험 총괄 — 제품 전략 특화",
    "개발 총괄":              "엔지니어링 조직 및 코드 품질 총괄 — 기술 구현 특화",
    "성장 총괄":              "성장 전략·마케팅·데이터 총괄 — 퍼포먼스 마케팅 특화",
    "데이터 총괄":            "데이터 파이프라인 및 분석 총괄 — 수치 분석 특화",
    "전략 총괄":              "비즈니스 전략 및 시장 분석 총괄 — 전략 수립 특화",
    "운영 총괄":              "운영 최적화 및 프로세스 관리 총괄 — 효율화 특화",
    "콘텐츠 제작 팀장":       "콘텐츠 제작 실무 리더 — 창작 및 편집 특화",
    "배포 전략 팀장":         "콘텐츠 배포·채널 전략 리더 — 유통 최적화 특화",
    "플랫폼 개발 팀장":       "플랫폼 개발 실무 리더 — 시스템 설계 특화",
    "제품 관리 팀장":         "제품 기획 및 스프린트 관리 리더 — 요구사항 분석 특화",
    "백엔드 팀장":            "서버·API 개발 실무 리더 — 서버사이드 로직 특화",
    "프론트엔드 팀장":        "UI/UX 개발 실무 리더 — 인터페이스 구현 특화",
    "마케팅 팀장":            "마케팅 캠페인 실무 리더 — 고객 획득 특화",
    "데이터 분석 팀장":       "데이터 분석 실무 리더 — 통계·시각화 특화",
    "데이터 엔지니어링 팀장": "데이터 인프라 실무 리더 — 파이프라인 구축 특화",
    "비즈니스 인사이트 팀장": "비즈니스 인사이트 실무 리더 — 의사결정 지원 특화",
    "운영 팀장":              "운영 실무 리더 — 프로세스 실행 특화",
}


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


def _get_ai_for_level(level: str, budget: str) -> Tuple[str, str]:
    """Return (provider, model_id) for the given org level and budget tier."""
    tier = AI_TIER.get(level, AI_TIER["specialist"])
    budget_key = budget if budget in ("any", "low", "free") else "any"
    return tier.get(budget_key, ("mock", "mock-model"))


def create_company_org(
    db: Session,
    company_id: int,
    industry: str = "general",
    ai_budget: str = "any",
) -> List[OrgNode]:
    template = get_org_template(industry)
    nodes_data = template["nodes"]
    name_to_id: Dict[str, int] = {}
    created: List[OrgNode] = []

    for nd in nodes_data:
        parent_id = name_to_id.get(nd.get("parent")) if nd.get("parent") else None
        provider, model_id = _get_ai_for_level(nd["level"], ai_budget)
        desc = ROLE_DESC.get(nd["role"], f"{nd['role']} 담당")

        node = OrgNode(
            company_id=company_id,
            name=nd["name"],
            role=nd["role"],
            level=nd["level"],
            parent_id=parent_id,
            ai_provider=provider,
            ai_model=model_id,
            description=desc,
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
