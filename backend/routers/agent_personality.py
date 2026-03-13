"""AI 에이전트 성격 커스터마이징 API."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from core.database import get_db
from models.models import AgentPersonality, OrgNode

router = APIRouter(prefix="/api/agent-personality", tags=["agent-personality"])

# 프리셋 정의
PRESETS = {
    "conservative": {
        "label": "보수적",
        "description": "신중하고 데이터 중심, 리스크 최소화 관점",
        "instruction": "항상 근거를 제시하고 보수적으로 판단하세요. 리스크 요인을 먼저 분석하고 안전한 방안을 우선 권고하세요.",
        "tone": "formal",
        "response_length": "long",
    },
    "aggressive": {
        "label": "공격적",
        "description": "과감한 성장 전략, 기회 중심 사고",
        "instruction": "기회를 적극적으로 포착하고 과감한 전략을 제안하세요. 성장과 시장 선점을 최우선으로 판단하세요.",
        "tone": "professional",
        "response_length": "medium",
    },
    "creative": {
        "label": "창의적",
        "description": "혁신적 아이디어, 틀을 깨는 사고",
        "instruction": "기존 방식에 얽매이지 않고 창의적인 해결책을 제시하세요. 새로운 관점과 혁신적 아이디어를 우선시하세요.",
        "tone": "casual",
        "response_length": "medium",
    },
    "balanced": {
        "label": "균형적",
        "description": "리스크와 기회를 균형있게 분석",
        "instruction": "",
        "tone": "professional",
        "response_length": "medium",
    },
}


class PersonalityUpdate(BaseModel):
    org_node_id: int
    preset: Optional[str] = None
    tone: Optional[str] = None
    expertise: Optional[str] = None
    custom_instruction: Optional[str] = None
    response_length: Optional[str] = None


@router.get("/presets")
def get_presets():
    """사용 가능한 성격 프리셋 목록."""
    return {"presets": {k: {"key": k, **v} for k, v in PRESETS.items()}}


@router.get("/node/{org_node_id}")
def get_personality(org_node_id: int, db: Session = Depends(get_db)):
    """특정 에이전트의 성격 설정 조회."""
    p = db.query(AgentPersonality).filter(
        AgentPersonality.org_node_id == org_node_id
    ).first()
    node = db.query(OrgNode).get(org_node_id)
    if not node:
        raise HTTPException(404, "에이전트를 찾을 수 없습니다.")

    if not p:
        return {
            "org_node_id": org_node_id,
            "agent_name": node.name,
            "role": node.role,
            "preset": "balanced",
            "tone": "professional",
            "expertise": "",
            "custom_instruction": "",
            "response_length": "medium",
        }
    return {
        "org_node_id": org_node_id,
        "agent_name": node.name,
        "role": node.role,
        "preset": p.preset,
        "tone": p.tone,
        "expertise": p.expertise,
        "custom_instruction": p.custom_instruction,
        "response_length": p.response_length,
    }


@router.put("/node/{org_node_id}")
def update_personality(org_node_id: int, req: PersonalityUpdate, db: Session = Depends(get_db)):
    """에이전트 성격 설정 업데이트."""
    node = db.query(OrgNode).get(org_node_id)
    if not node:
        raise HTTPException(404, "에이전트를 찾을 수 없습니다.")

    p = db.query(AgentPersonality).filter(
        AgentPersonality.org_node_id == org_node_id
    ).first()

    if not p:
        p = AgentPersonality(org_node_id=org_node_id)
        db.add(p)

    if req.preset:
        p.preset = req.preset
        # 프리셋 적용 시 기본값 설정
        if req.preset in PRESETS:
            preset = PRESETS[req.preset]
            if not req.tone:
                p.tone = preset["tone"]
            if not req.custom_instruction and preset["instruction"]:
                p.custom_instruction = preset["instruction"]
            if not req.response_length:
                p.response_length = preset["response_length"]

    if req.tone is not None:
        p.tone = req.tone
    if req.expertise is not None:
        p.expertise = req.expertise
    if req.custom_instruction is not None:
        p.custom_instruction = req.custom_instruction
    if req.response_length is not None:
        p.response_length = req.response_length

    db.commit()
    return {"status": "ok", "org_node_id": org_node_id, "preset": p.preset}


@router.get("/company/{company_id}")
def get_company_personalities(company_id: int, db: Session = Depends(get_db)):
    """계열사의 모든 에이전트 성격 설정 목록."""
    nodes = db.query(OrgNode).filter(
        OrgNode.company_id == company_id, OrgNode.is_active == True
    ).all()

    result = []
    for n in nodes:
        p = db.query(AgentPersonality).filter(
            AgentPersonality.org_node_id == n.id
        ).first()
        result.append({
            "org_node_id": n.id,
            "agent_name": n.name,
            "role": n.role,
            "level": n.level,
            "preset": p.preset if p else "balanced",
            "tone": p.tone if p else "professional",
            "expertise": p.expertise if p else "",
            "response_length": p.response_length if p else "medium",
        })
    return {"agents": result}


def get_personality_instruction(org_node_id: int, db) -> str:
    """에이전트 성격에 따른 추가 시스템 지시문 생성 (chat에서 호출)."""
    p = db.query(AgentPersonality).filter(
        AgentPersonality.org_node_id == org_node_id
    ).first()
    if not p:
        return ""

    parts = []
    if p.preset in PRESETS and PRESETS[p.preset]["instruction"]:
        parts.append(PRESETS[p.preset]["instruction"])
    if p.custom_instruction:
        parts.append(p.custom_instruction)
    if p.expertise:
        parts.append(f"전문 분야: {p.expertise}")

    tone_map = {
        "casual": "친근하고 캐주얼한 말투로 대화하세요.",
        "formal": "격식체를 사용하여 정중하게 답변하세요.",
        "friendly": "따뜻하고 친근한 어조로 소통하세요.",
    }
    if p.tone in tone_map:
        parts.append(tone_map[p.tone])

    length_map = {
        "short": "간결하게 핵심만 답변하세요 (3~5문장).",
        "long": "상세하고 구체적으로 분석하세요 (문단 구분 포함).",
    }
    if p.response_length in length_map:
        parts.append(length_map[p.response_length])

    return "\n".join(parts)
