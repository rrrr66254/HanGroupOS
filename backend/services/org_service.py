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
# ── Specialist definitions per team_lead role ────────────────────────────────
SPECIALIST_DEFS: Dict[str, List[Dict]] = {
    "게임 디렉터": [
        {"name": "시니어 기획자",   "role": "게임 기획자"},
        {"name": "레벨 디자이너",   "role": "레벨 디자이너"},
        {"name": "내러티브 작가",   "role": "스토리 작가"},
    ],
    "클라이언트 개발 팀장": [
        {"name": "클라이언트 개발자 A", "role": "클라이언트 개발자"},
        {"name": "클라이언트 개발자 B", "role": "클라이언트 개발자"},
        {"name": "그래픽 엔지니어",     "role": "그래픽 엔지니어"},
    ],
    "서버 개발 팀장": [
        {"name": "백엔드 개발자 A",  "role": "게임 서버 개발자"},
        {"name": "백엔드 개발자 B",  "role": "게임 서버 개발자"},
        {"name": "DB 엔지니어",      "role": "데이터베이스 엔지니어"},
    ],
    "QA 팀장": [
        {"name": "QA 테스터 A",     "role": "QA 테스터"},
        {"name": "QA 테스터 B",     "role": "QA 테스터"},
        {"name": "자동화 엔지니어", "role": "QA 자동화 엔지니어"},
    ],
    "아트 팀장": [
        {"name": "2D 아티스트",   "role": "2D 아티스트"},
        {"name": "3D 모델러",     "role": "3D 모델러"},
        {"name": "UI/UX 디자이너", "role": "게임 UI/UX 디자이너"},
    ],
    "콘텐츠 제작 팀장": [
        {"name": "콘텐츠 작가",  "role": "콘텐츠 작가"},
        {"name": "에디터",       "role": "콘텐츠 에디터"},
        {"name": "크리에이터",   "role": "크리에이티브 디자이너"},
    ],
    "배포 전략 팀장": [
        {"name": "SNS 마케터",   "role": "SNS 마케터"},
        {"name": "SEO 전문가",   "role": "SEO 전문가"},
        {"name": "채널 분석가",  "role": "채널 분석가"},
    ],
    "플랫폼 개발 팀장": [
        {"name": "시스템 개발자",  "role": "시스템 개발자"},
        {"name": "인프라 엔지니어", "role": "인프라 엔지니어"},
        {"name": "QA 엔지니어",   "role": "QA 엔지니어"},
    ],
    "제품 관리 팀장": [
        {"name": "제품 기획자",   "role": "제품 기획자"},
        {"name": "UX 리서처",    "role": "UX 리서처"},
        {"name": "제품 분석가",   "role": "제품 데이터 분석가"},
    ],
    "백엔드 팀장": [
        {"name": "백엔드 개발자 A", "role": "백엔드 개발자"},
        {"name": "백엔드 개발자 B", "role": "백엔드 개발자"},
        {"name": "DevOps 엔지니어", "role": "DevOps 엔지니어"},
    ],
    "프론트엔드 팀장": [
        {"name": "FE 개발자 A",  "role": "프론트엔드 개발자"},
        {"name": "FE 개발자 B",  "role": "프론트엔드 개발자"},
        {"name": "UI 디자이너",  "role": "UI 디자이너"},
    ],
    "마케팅 팀장": [
        {"name": "그로스 해커",     "role": "그로스 해커"},
        {"name": "콘텐츠 마케터",   "role": "콘텐츠 마케터"},
        {"name": "퍼포먼스 마케터", "role": "퍼포먼스 마케터"},
    ],
    "데이터 분석 팀장": [
        {"name": "데이터 분석가 A", "role": "데이터 분석가"},
        {"name": "데이터 분석가 B", "role": "데이터 분석가"},
        {"name": "BI 개발자",       "role": "BI 개발자"},
    ],
    "데이터 엔지니어링 팀장": [
        {"name": "데이터 엔지니어 A", "role": "데이터 엔지니어"},
        {"name": "데이터 엔지니어 B", "role": "데이터 엔지니어"},
        {"name": "ML 엔지니어",       "role": "ML 엔지니어"},
    ],
    "비즈니스 인사이트 팀장": [
        {"name": "전략 분석가 A", "role": "전략 분석가"},
        {"name": "전략 분석가 B", "role": "전략 분석가"},
        {"name": "리서처",        "role": "비즈니스 리서처"},
    ],
    "운영 팀장": [
        {"name": "운영 담당자 A",   "role": "운영 담당자"},
        {"name": "운영 담당자 B",   "role": "운영 담당자"},
        {"name": "프로세스 개선가", "role": "프로세스 개선가"},
    ],
}
GENERIC_SPECIALISTS = [
    {"name": "스페셜리스트 A", "role": "스페셜리스트"},
    {"name": "스페셜리스트 B", "role": "스페셜리스트"},
    {"name": "스페셜리스트 C", "role": "스페셜리스트"},
]


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
    "게임 디렉터":            "게임 기획 총괄 리더 — 게임플레이 및 내러티브 특화",
    "클라이언트 개발 팀장":   "클라이언트(앱/PC) 개발 실무 리더 — 렌더링·최적화 특화",
    "서버 개발 팀장":         "게임 서버 및 인프라 실무 리더 — 대규모 동시접속 특화",
    "QA 팀장":                "게임 품질 보증 실무 리더 — 버그 탐지·자동화 특화",
    "아트 팀장":              "게임 아트 실무 리더 — 2D/3D 그래픽·UI 특화",
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
    "game": {
        "name": "게임 기업 조직",
        "nodes": [
            {"name": "CEO",          "role": "최고경영자",       "level": "ceo"},
            {"name": "게임 Chief",   "role": "게임 디렉터",      "level": "chief",     "parent": "CEO"},
            {"name": "기술 Chief",   "role": "기술 총괄",        "level": "chief",     "parent": "CEO"},
            {"name": "성장 Chief",   "role": "성장 총괄",        "level": "chief",     "parent": "CEO"},
            {"name": "클라이언트 팀장", "role": "클라이언트 개발 팀장", "level": "team_lead", "parent": "기술 Chief"},
            {"name": "서버 팀장",    "role": "서버 개발 팀장",   "level": "team_lead", "parent": "기술 Chief"},
            {"name": "QA 팀장",      "role": "QA 팀장",          "level": "team_lead", "parent": "기술 Chief"},
            {"name": "아트 팀장",    "role": "아트 팀장",        "level": "team_lead", "parent": "게임 Chief"},
            {"name": "마케팅 팀장",  "role": "마케팅 팀장",      "level": "team_lead", "parent": "성장 Chief"},
        ],
    },
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
        "게임": "game", "게임개발": "game", "게임 개발": "game", "game": "game",
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

        # Auto-create 3 specialists under each team_lead
        if nd["level"] == "team_lead":
            spec_list = SPECIALIST_DEFS.get(nd["role"], GENERIC_SPECIALISTS)
            sp_provider, sp_model = _get_ai_for_level("specialist", ai_budget)
            for sp in spec_list:
                sp_node = OrgNode(
                    company_id=company_id,
                    name=sp["name"],
                    role=sp["role"],
                    level="specialist",
                    parent_id=node.id,
                    ai_provider=sp_provider,
                    ai_model=sp_model,
                    description=f"{sp['role']} 담당",
                )
                db.add(sp_node)
                db.flush()
                created.append(sp_node)

    db.commit()

    # 신규: 역량 분석 + 승인 요청 자동 생성
    try:
        from services.capability_analyzer import analyze_and_request_capabilities
        analyze_and_request_capabilities(company_id, db)
    except Exception as e:
        print(f"[CapabilityAnalyzer] 역량 분석 실패 (무시): {e}")

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


def ensure_company_specialists(
    db: Session,
    company_id: int,
    ai_budget: str = "any",
) -> List[OrgNode]:
    """Add up to 3 specialists under each team_lead that currently has fewer than 3."""
    team_leads = (
        db.query(OrgNode)
        .filter(OrgNode.company_id == company_id, OrgNode.level == "team_lead")
        .all()
    )
    created: List[OrgNode] = []
    sp_provider, sp_model = _get_ai_for_level("specialist", ai_budget)

    for tl in team_leads:
        existing_count = (
            db.query(OrgNode)
            .filter(OrgNode.parent_id == tl.id, OrgNode.level == "specialist")
            .count()
        )
        if existing_count >= 3:
            continue

        spec_list = SPECIALIST_DEFS.get(tl.role, GENERIC_SPECIALISTS)
        needed = 3 - existing_count

        for sp in spec_list[:needed]:
            sp_node = OrgNode(
                company_id=company_id,
                name=sp["name"],
                role=sp["role"],
                level="specialist",
                parent_id=tl.id,
                ai_provider=sp_provider,
                ai_model=sp_model,
                description=f"{sp['role']} 담당",
            )
            db.add(sp_node)
            db.flush()
            created.append(sp_node)

    db.commit()
    return created


def ensure_all_companies_specialists(db: Session, ai_budget: str = "any") -> int:
    """Ensure 3 specialists per team_lead for all companies. Returns total created count."""
    companies = db.query(OrgNode.company_id).filter(
        OrgNode.company_id != None, OrgNode.level == "team_lead"
    ).distinct().all()
    total = 0
    for (company_id,) in companies:
        created = ensure_company_specialists(db, company_id, ai_budget)
        total += len(created)
    return total
