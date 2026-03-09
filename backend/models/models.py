from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from datetime import datetime
from core.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(20), default="user")  # admin | user
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    industry = Column(String(100), default="")
    status = Column(String(20), default="active")  # active | inactive | planning
    vision = Column(Text, default="")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OrgNode(Base):
    __tablename__ = "org_nodes"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    name = Column(String(100), nullable=False)
    role = Column(String(100), nullable=False)
    level = Column(String(50), nullable=False)
    # chairman | committee | ceo | chief | team_lead | specialist
    parent_id = Column(Integer, ForeignKey("org_nodes.id"), nullable=True)
    ai_provider = Column(String(50), default="mock")
    ai_model = Column(String(100), default="")
    description = Column(Text, default="")
    status = Column(String(20), default="active")
    meta = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)


class OrgTemplate(Base):
    __tablename__ = "org_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    template_json = Column(JSON, default={})
    status = Column(String(20), default="active")  # active | draft | archived
    industry = Column(String(100), default="")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    status = Column(String(20), default="open")  # open | closed
    tags = Column(JSON, default=[])
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class MeetingMessage(Base):
    __tablename__ = "meeting_messages"
    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    sender = Column(String(100), nullable=False)
    sender_role = Column(String(100), default="")
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, default="")
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    doc_type = Column(String(50), default="general")
    tags = Column(JSON, default=[])
    version = Column(Integer, default=1)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    request_type = Column(String(50), default="general")
    # company_create | org_change | strategy | general
    status = Column(String(20), default="pending")  # pending | approved | rejected
    requester = Column(String(100), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    meta = Column(JSON, default={})
    reviewer_note = Column(Text, default="")
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    session_type = Column(String(50), default="chairman")
    # chairman | ceo | committee | general
    title = Column(String(200), default="New Session")
    agent_name = Column(String(100), nullable=True)  # display name of the AI agent
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String(20), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    sender_name = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class OrgPatch(Base):
    __tablename__ = "org_patches"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    description = Column(Text, default="")
    patch_json = Column(JSON, default={})
    status = Column(String(20), default="pending")  # pending | applied | rejected
    proposed_by = Column(String(100), default="AI Chairman")
    created_at = Column(DateTime, default=datetime.utcnow)


class AISuggestion(Base):
    __tablename__ = "ai_suggestions"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    suggestion_type = Column(String(50), default="general")
    priority = Column(String(20), default="medium")  # low | medium | high | critical
    status = Column(String(20), default="open")  # open | accepted | dismissed
    created_at = Column(DateTime, default=datetime.utcnow)


class MarketReport(Base):
    __tablename__ = "market_reports"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    industry = Column(String(100), nullable=False)
    title = Column(String(200), nullable=False)
    summary = Column(Text, default="")
    opportunities = Column(JSON, default=[])
    threats = Column(JSON, default=[])
    competitors = Column(JSON, default=[])
    trends = Column(JSON, default=[])
    raw_analysis = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class CEOPerformance(Base):
    __tablename__ = "ceo_performance"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    period = Column(String(50), nullable=False)  # e.g. "2025-Q1"
    overall_score = Column(Float, default=0.0)
    metrics = Column(JSON, default={})
    strengths = Column(JSON, default=[])
    improvements = Column(JSON, default=[])
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Collaboration(Base):
    __tablename__ = "collaborations"
    id = Column(Integer, primary_key=True, index=True)
    company_a_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    company_b_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    collaboration_type = Column(String(50), default="project")
    status = Column(String(20), default="active")
    meta = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    scenario = Column(String(200), nullable=False)
    parameters = Column(JSON, default={})
    result = Column(JSON, default={})
    summary = Column(Text, default="")
    status = Column(String(20), default="completed")
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelCatalog(Base):
    __tablename__ = "model_catalog"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    provider = Column(String(50), nullable=False)
    model_id = Column(String(100), nullable=False)
    description = Column(Text, default="")
    is_free = Column(Boolean, default=False)
    context_window = Column(Integer, default=8000)
    strengths = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelAssignment(Base):
    __tablename__ = "model_assignments"
    id = Column(Integer, primary_key=True, index=True)
    org_role = Column(String(100), nullable=False)  # chairman, ceo, chief, etc.
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    model_catalog_id = Column(Integer, ForeignKey("model_catalog.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class OrgProposal(Base):
    __tablename__ = "org_proposals"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(200), nullable=False)
    proposal_json = Column(JSON, default={})
    rationale = Column(Text, default="")
    status = Column(String(20), default="pending")  # pending | approved | rejected
    proposed_by = Column(String(100), default="AI System")
    created_at = Column(DateTime, default=datetime.utcnow)


class Reference(Base):
    __tablename__ = "references"
    id = Column(Integer, primary_key=True, index=True)
    from_type = Column(String(50), nullable=False)  # document | meeting | company | etc
    from_id = Column(Integer, nullable=False)
    to_type = Column(String(50), nullable=False)
    to_id = Column(Integer, nullable=False)
    label = Column(String(100), default="related")
    created_at = Column(DateTime, default=datetime.utcnow)


class CorporateMemory(Base):
    __tablename__ = "corporate_memory"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    memory_type = Column(String(50), default="general")
    # decision | lesson | fact | event | general
    tags = Column(JSON, default=[])
    importance = Column(String(20), default="normal")  # low | normal | high | critical
    created_at = Column(DateTime, default=datetime.utcnow)


class StrategyItem(Base):
    __tablename__ = "strategy_items"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    item_type = Column(String(50), default="objective")
    # objective | initiative | milestone | kpi
    status = Column(String(20), default="active")  # active | completed | paused
    priority = Column(String(20), default="medium")
    parent_id = Column(Integer, ForeignKey("strategy_items.id"), nullable=True)
    progress = Column(Integer, default=0)  # 0-100
    due_date = Column(String(50), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class ProviderConfig(Base):
    __tablename__ = "provider_configs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider = Column(String(50), nullable=False)
    api_key = Column(String(500), default="")
    model_override = Column(String(100), default="")
    is_active = Column(Boolean, default=True)
    base_url = Column(String(200), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AgentActivity(Base):
    __tablename__ = "agent_activities"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    org_node_id = Column(Integer, ForeignKey("org_nodes.id"), nullable=True)
    agent_name = Column(String(100), nullable=False)
    agent_role = Column(String(100), nullable=False)
    activity = Column(String(200), nullable=False)
    status = Column(String(20), default="working")  # idle | working | thinking | done
    meta = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkLog(Base):
    __tablename__ = "work_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    org_node_id = Column(Integer, ForeignKey("org_nodes.id"), nullable=True)
    agent_name = Column(String(100), nullable=False)
    agent_role = Column(String(100), nullable=False)
    level = Column(String(50), nullable=False)  # specialist | team_lead | chief | ceo | chairman
    task = Column(String(500), nullable=False)
    result = Column(Text, nullable=False)
    cycle_id = Column(String(50), nullable=True)  # UUID groups logs from same work cycle
    parent_log_id = Column(Integer, ForeignKey("work_logs.id"), nullable=True)  # chain tracing
    created_at = Column(DateTime, default=datetime.utcnow)
