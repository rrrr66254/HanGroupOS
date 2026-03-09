"""
Terminal router: CEO가 명령 실행을 요청하고 admin이 승인/거부한 후 실행.

보안 정책:
- admin만 승인/거부 가능
- 승인된 명령만 실행
- 모든 명령, 출력, 결과를 DB에 기록
- 위험 명령 패턴은 차단 (rm -rf /, shutdown, 등)
"""
import subprocess
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from core.database import get_db
from core.security import get_current_user
from models.models import TerminalRequest, User, Company, OrgNode

router = APIRouter(prefix="/api/terminal", tags=["terminal"])

# 위험한 명령 패턴 차단 목록
BLOCKED_PATTERNS = [
    r"rm\s+-[rRf]{2,}.*\/",      # rm -rf /
    r"rm\s+-rf\s+/",              # rm -rf /
    r":\(\)\{.*\}",               # fork bomb
    r">\s*/dev/sda",              # disk wipe
    r"mkfs\.",                    # filesystem format
    r"dd\s+.*of=/dev/",           # disk dd
    r"shutdown",                  # shutdown
    r"halt\b",                    # halt
    r"reboot\b",                  # reboot
    r"poweroff\b",                # poweroff
    r"passwd\b",                  # change password
    r"sudo\s+su",                 # privilege escalation
    r"chmod\s+777\s+/",           # dangerous chmod
]

def _is_dangerous(cmd: str) -> bool:
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return True
    return False


class TerminalRequestCreate(BaseModel):
    company_id: Optional[int] = None
    org_node_id: Optional[int] = None
    requested_by_name: str
    command: str
    reason: str = ""


class TerminalDecision(BaseModel):
    action: str  # "approve" | "reject"
    note: str = ""


@router.post("/request")
def create_terminal_request(
    data: TerminalRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """CEO가 터미널 명령 실행 요청을 제출합니다."""
    if not data.command.strip():
        raise HTTPException(400, "명령어를 입력해주세요")

    if _is_dangerous(data.command):
        raise HTTPException(400, "위험한 명령어는 요청할 수 없습니다")

    req = TerminalRequest(
        company_id=data.company_id,
        org_node_id=data.org_node_id,
        requested_by_name=data.requested_by_name,
        command=data.command.strip(),
        reason=data.reason,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _format(req)


@router.get("/requests")
def list_requests(
    status: Optional[str] = None,
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """터미널 요청 목록 조회. admin은 전체, 일반 사용자는 자신의 회사만."""
    q = db.query(TerminalRequest)
    if current_user.role != "admin" and company_id:
        q = q.filter(TerminalRequest.company_id == company_id)
    if status:
        q = q.filter(TerminalRequest.status == status)
    reqs = q.order_by(TerminalRequest.created_at.desc()).limit(100).all()
    return [_format(r) for r in reqs]


@router.post("/requests/{req_id}/decide")
def decide_request(
    req_id: int,
    decision: TerminalDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """admin이 요청을 승인하거나 거부합니다."""
    if current_user.role != "admin":
        raise HTTPException(403, "관리자만 승인/거부할 수 있습니다")

    req = db.query(TerminalRequest).filter(TerminalRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "요청을 찾을 수 없습니다")
    if req.status != "pending":
        raise HTTPException(400, f"이미 처리된 요청입니다 (상태: {req.status})")

    if decision.action == "approve":
        req.status = "approved"
    elif decision.action == "reject":
        req.status = "rejected"
        req.output = decision.note or "관리자에 의해 거부되었습니다"
    else:
        raise HTTPException(400, "action은 'approve' 또는 'reject'여야 합니다")

    req.approved_by = current_user.id
    req.decided_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    return _format(req)


@router.post("/requests/{req_id}/execute")
def execute_request(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """승인된 요청을 실제로 실행합니다. admin만 가능."""
    if current_user.role != "admin":
        raise HTTPException(403, "관리자만 명령을 실행할 수 있습니다")

    req = db.query(TerminalRequest).filter(TerminalRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "요청을 찾을 수 없습니다")
    if req.status != "approved":
        raise HTTPException(400, f"승인된 요청만 실행할 수 있습니다 (상태: {req.status})")

    # Double-check for dangerous patterns
    if _is_dangerous(req.command):
        req.status = "rejected"
        req.output = "안전 점검 실패: 위험한 명령어가 감지되었습니다"
        db.commit()
        raise HTTPException(400, req.output)

    try:
        result = subprocess.run(
            req.command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            cwd="/home/user/han-group-os",
        )
        req.output = (result.stdout or "") + (("\n[stderr]\n" + result.stderr) if result.stderr else "")
        req.exit_code = result.returncode
        req.status = "executed"
    except subprocess.TimeoutExpired:
        req.output = "오류: 명령 실행 시간이 초과되었습니다 (30초)"
        req.exit_code = -1
        req.status = "executed"
    except Exception as e:
        req.output = f"실행 오류: {e}"
        req.exit_code = -1
        req.status = "executed"

    req.executed_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    return _format(req)


def _format(req: TerminalRequest) -> dict:
    return {
        "id": req.id,
        "company_id": req.company_id,
        "org_node_id": req.org_node_id,
        "requested_by_name": req.requested_by_name,
        "command": req.command,
        "reason": req.reason,
        "status": req.status,
        "output": req.output,
        "exit_code": req.exit_code,
        "created_at": req.created_at.isoformat(),
        "decided_at": req.decided_at.isoformat() if req.decided_at else None,
        "executed_at": req.executed_at.isoformat() if req.executed_at else None,
    }
