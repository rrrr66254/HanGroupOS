"""에이전트 자동 위임 체인 API."""
import asyncio
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db

router = APIRouter(prefix="/api/delegation", tags=["delegation"])


class DelegationRequest(BaseModel):
    question: str
    company_id: int


@router.post("/run")
async def run_delegation(req: DelegationRequest, db: Session = Depends(get_db)):
    """질문을 CEO → 전문가 → CEO 종합 위임 체인으로 처리."""
    from services.delegation_chain import run_delegation_chain, detect_delegation_targets, DELEGATION_RULES

    result = await run_delegation_chain(req.question, req.company_id, db)
    return {
        "question": result.question,
        "ceo_initial": result.ceo_initial,
        "delegated_to": [
            {"key": k, "role": DELEGATION_RULES[k]["role"]}
            for k in result.delegated_to
        ],
        "expert_responses": [
            {"role_key": k, "role": DELEGATION_RULES[k]["role"], "response": v}
            for k, v in result.expert_responses.items()
        ],
        "final_summary": result.final_summary,
        "created_at": result.created_at,
    }


@router.post("/detect")
def detect_targets(req: DelegationRequest):
    """질문에서 위임 대상 키워드를 분석 (미리보기)."""
    from services.delegation_chain import detect_delegation_targets, DELEGATION_RULES
    targets = detect_delegation_targets(req.question)
    return {
        "question": req.question,
        "targets": [
            {"key": k, "role": DELEGATION_RULES[k]["role"]}
            for k in targets
        ],
    }
