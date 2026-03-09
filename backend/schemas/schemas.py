from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any, Dict
from datetime import datetime


# ── Auth ────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


# ── Company ──────────────────────────────────────────────────────────────────
class CompanyCreate(BaseModel):
    name: str
    description: str = ""
    industry: str = ""
    vision: str = ""
    status: str = "active"


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None
    vision: Optional[str] = None
    status: Optional[str] = None


class CompanyOut(BaseModel):
    id: int
    name: str
    description: str
    industry: str
    status: str
    vision: str
    created_by: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── OrgNode ──────────────────────────────────────────────────────────────────
class OrgNodeCreate(BaseModel):
    company_id: Optional[int] = None
    name: str
    role: str
    level: str
    parent_id: Optional[int] = None
    ai_provider: str = "mock"
    ai_model: str = ""
    description: str = ""
    meta: Dict[str, Any] = {}


class OrgNodeOut(BaseModel):
    id: int
    company_id: Optional[int]
    name: str
    role: str
    level: str
    parent_id: Optional[int]
    ai_provider: str
    ai_model: str
    description: str
    status: str
    meta: Dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class OrgNodeTree(BaseModel):
    id: int
    name: str
    role: str
    level: str
    parent_id: Optional[int]
    ai_provider: str
    ai_model: str
    description: str
    children: List["OrgNodeTree"] = []

    model_config = {"from_attributes": True}


# ── OrgTemplate ──────────────────────────────────────────────────────────────
class OrgTemplateCreate(BaseModel):
    name: str
    description: str = ""
    template_json: Dict[str, Any] = {}
    industry: str = ""


class OrgTemplateOut(BaseModel):
    id: int
    name: str
    description: str
    template_json: Dict[str, Any]
    status: str
    industry: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Meeting ──────────────────────────────────────────────────────────────────
class MeetingCreate(BaseModel):
    company_id: Optional[int] = None
    title: str
    description: str = ""
    tags: List[str] = []


class MeetingMessageCreate(BaseModel):
    sender: str
    sender_role: str = ""
    content: str


class MeetingMessageOut(BaseModel):
    id: int
    meeting_id: int
    sender: str
    sender_role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MeetingOut(BaseModel):
    id: int
    company_id: Optional[int]
    title: str
    description: str
    status: str
    tags: List[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Document ─────────────────────────────────────────────────────────────────
class DocumentCreate(BaseModel):
    title: str
    content: str = ""
    company_id: Optional[int] = None
    doc_type: str = "general"
    tags: List[str] = []


class DocumentOut(BaseModel):
    id: int
    title: str
    content: str
    company_id: Optional[int]
    doc_type: str
    tags: List[str]
    version: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Approval ─────────────────────────────────────────────────────────────────
class ApprovalCreate(BaseModel):
    title: str
    description: str = ""
    request_type: str = "general"
    requester: str
    company_id: Optional[int] = None
    meta: Dict[str, Any] = {}


class ApprovalReview(BaseModel):
    status: str  # approved | rejected
    reviewer_note: str = ""


class ApprovalOut(BaseModel):
    id: int
    title: str
    description: str
    request_type: str
    status: str
    requester: str
    company_id: Optional[int]
    meta: Dict[str, Any]
    reviewer_note: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Chat ─────────────────────────────────────────────────────────────────────
class ChatSessionCreate(BaseModel):
    company_id: Optional[int] = None
    session_type: str = "chairman"
    title: str = "New Session"
    agent_name: Optional[str] = None


class ChatSessionOut(BaseModel):
    id: int
    company_id: Optional[int]
    session_type: str
    title: str
    agent_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageCreate(BaseModel):
    content: str
    provider_override: Optional[str] = None
    model_override: Optional[str] = None


class ChatMessageOut(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    sender_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
    session_id: int
    content: str
    provider_override: Optional[str] = None
    model_override: Optional[str] = None


class CompanyQueryRequest(BaseModel):
    company_id: int
    question: str


class ConfirmCompanyRequest(BaseModel):
    name: str
    industry: str
    description: str = ""
    vision: str = ""


class BriefCeoRequest(BaseModel):
    company_id: int


class CollaborateRequest(BaseModel):
    company_a_id: int
    company_b_id: int
    task: str


# ── Market ───────────────────────────────────────────────────────────────────
class MarketAnalyzeRequest(BaseModel):
    industry: str
    company_id: Optional[int] = None
    focus: str = ""


class MarketReportOut(BaseModel):
    id: int
    company_id: Optional[int]
    industry: str
    title: str
    summary: str
    opportunities: List[Any]
    threats: List[Any]
    competitors: List[Any]
    trends: List[Any]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── CEO Performance ───────────────────────────────────────────────────────────
class CEOEvaluateRequest(BaseModel):
    company_id: int
    period: str


class CEOPerformanceOut(BaseModel):
    id: int
    company_id: int
    period: str
    overall_score: float
    metrics: Dict[str, Any]
    strengths: List[str]
    improvements: List[str]
    notes: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Collaboration ─────────────────────────────────────────────────────────────
class CollaborationCreate(BaseModel):
    company_a_id: int
    company_b_id: int
    title: str
    description: str = ""
    collaboration_type: str = "project"


class CollaborationOut(BaseModel):
    id: int
    company_a_id: int
    company_b_id: int
    title: str
    description: str
    collaboration_type: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Simulation ────────────────────────────────────────────────────────────────
class SimulationRequest(BaseModel):
    company_id: Optional[int] = None
    scenario: str
    parameters: Dict[str, Any] = {}


class SimulationOut(BaseModel):
    id: int
    company_id: Optional[int]
    scenario: str
    parameters: Dict[str, Any]
    result: Dict[str, Any]
    summary: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Model Catalog ─────────────────────────────────────────────────────────────
class ModelCatalogOut(BaseModel):
    id: int
    name: str
    provider: str
    model_id: str
    description: str
    is_free: bool
    context_window: int
    strengths: List[str]

    model_config = {"from_attributes": True}


class ModelAssignRequest(BaseModel):
    org_role: str
    model_catalog_id: int
    company_id: Optional[int] = None


class ModelRecommendRequest(BaseModel):
    org_role: str
    budget: str = "any"  # free | low | any


# ── Org Proposal ──────────────────────────────────────────────────────────────
class OrgProposalCreate(BaseModel):
    company_id: int
    title: str
    proposal_json: Dict[str, Any] = {}
    rationale: str = ""


class OrgProposalOut(BaseModel):
    id: int
    company_id: int
    title: str
    proposal_json: Dict[str, Any]
    rationale: str
    status: str
    proposed_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Reference ─────────────────────────────────────────────────────────────────
class ReferenceCreate(BaseModel):
    from_type: str
    from_id: int
    to_type: str
    to_id: int
    label: str = "related"


class ReferenceOut(BaseModel):
    id: int
    from_type: str
    from_id: int
    to_type: str
    to_id: int
    label: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Corporate Memory ──────────────────────────────────────────────────────────
class MemoryCreate(BaseModel):
    company_id: Optional[int] = None
    title: str
    content: str
    memory_type: str = "general"
    tags: List[str] = []
    importance: str = "normal"


class MemoryOut(BaseModel):
    id: int
    company_id: Optional[int]
    title: str
    content: str
    memory_type: str
    tags: List[str]
    importance: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Strategy ──────────────────────────────────────────────────────────────────
class StrategyItemCreate(BaseModel):
    company_id: Optional[int] = None
    title: str
    description: str = ""
    item_type: str = "objective"
    priority: str = "medium"
    parent_id: Optional[int] = None
    due_date: str = ""


class StrategyItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None


class StrategyItemOut(BaseModel):
    id: int
    company_id: Optional[int]
    title: str
    description: str
    item_type: str
    status: str
    priority: str
    parent_id: Optional[int]
    progress: int
    due_date: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Provider Config ───────────────────────────────────────────────────────────
class ProviderConfigCreate(BaseModel):
    provider: str
    api_key: str = ""
    model_override: str = ""
    base_url: str = ""


class ProviderConfigOut(BaseModel):
    id: int
    provider: str
    model_override: str
    is_active: bool
    base_url: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Agent Activity ────────────────────────────────────────────────────────────
class AgentActivityOut(BaseModel):
    id: int
    company_id: Optional[int]
    org_node_id: Optional[int]
    agent_name: str
    agent_role: str
    activity: str
    status: str
    meta: Dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Dashboard ─────────────────────────────────────────────────────────────────
class DashboardStats(BaseModel):
    total_companies: int
    active_companies: int
    total_org_nodes: int
    pending_approvals: int
    open_meetings: int
    total_memories: int
    recent_simulations: int
    total_strategies: int
