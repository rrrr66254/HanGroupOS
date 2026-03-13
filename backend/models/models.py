from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey, JSON
)
from sqlalchemy.types import TypeDecorator, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime
from core.database import Base
import zlib


class CompressedText(TypeDecorator):
    """텍스트를 zlib으로 압축해 BLOB으로 저장 — 저장 시 자동 압축/해제."""
    impl = LargeBinary
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            return zlib.compress(value.encode("utf-8"), level=6)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        try:
            return zlib.decompress(value).decode("utf-8")
        except Exception:
            # 압축되지 않은 기존 데이터 그대로 반환
            if isinstance(value, (bytes, bytearray)):
                return value.decode("utf-8", errors="replace")
            return value


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
    is_competitor = Column(Boolean, default=False)          # True=경쟁사
    competitor_keywords = Column(JSON, default=[])          # 경쟁사 모니터링 키워드
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OrgNode(Base):
    __tablename__ = "org_nodes"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    role = Column(String(100), nullable=False)
    level = Column(String(50), nullable=False)
    # chairman | committee | ceo | chief | team_lead | specialist
    parent_id = Column(Integer, ForeignKey("org_nodes.id"), nullable=True, index=True)
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
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False, index=True)
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
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    meta = Column(JSON, default={})
    reviewer_note = Column(Text, default="")
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    session_type = Column(String(50), default="chairman")
    # chairman | ceo | committee | general
    title = Column(String(200), default="New Session")
    agent_name = Column(String(100), nullable=True)  # display name of the AI agent
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False, index=True)
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
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    item_type = Column(String(50), default="objective")
    # objective | initiative | milestone | kpi
    status = Column(String(20), default="active")  # active | completed | paused
    priority = Column(String(20), default="medium")
    parent_id = Column(Integer, ForeignKey("strategy_items.id"), nullable=True)
    progress = Column(Integer, default=0)  # 0-100
    due_date = Column(String(50), default="")
    kpi_current = Column(Float, nullable=True)      # KPI 최신 동기화 값
    source_insight_id = Column(Integer, nullable=True)  # 인사이트 격상 원본 ID 추적
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
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    org_node_id = Column(Integer, ForeignKey("org_nodes.id"), nullable=True)
    agent_name = Column(String(100), nullable=False)
    agent_role = Column(String(100), nullable=False)
    level = Column(String(50), nullable=False)  # specialist | team_lead | chief | ceo | chairman
    task = Column(String(500), nullable=False)
    result = Column(Text, nullable=False)
    cycle_id = Column(String(50), nullable=True)  # UUID groups logs from same work cycle
    parent_log_id = Column(Integer, ForeignKey("work_logs.id"), nullable=True)  # chain tracing
    created_at = Column(DateTime, default=datetime.utcnow)


class AgentMessage(Base):
    __tablename__ = "agent_messages"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    from_node_id = Column(Integer, ForeignKey("org_nodes.id"), nullable=False)
    to_node_id = Column(Integer, ForeignKey("org_nodes.id"), nullable=False)
    from_name = Column(String(100), nullable=False)
    to_name = Column(String(100), nullable=False)
    topic = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)   # sender's message
    reply = Column(Text, default="")         # receiver's reply
    created_at = Column(DateTime, default=datetime.utcnow)


class CompanySite(Base):
    __tablename__ = "company_sites"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)       # URL: /sites/{slug}
    description = Column(Text, default="")
    html_content = Column(Text, default="")                       # full HTML page
    status = Column(String(20), default="draft")                  # draft | live | archived
    template_type = Column(String(50), default="corporate")       # corporate | product | portfolio | landing
    ai_score = Column(Float, default=0.0)                         # chairman evaluation score
    ai_feedback = Column(Text, default="")                        # chairman evaluation text
    visits = Column(Integer, default=0)                           # page view count
    created_at = Column(DateTime, default=datetime.utcnow)
    deployed_at = Column(DateTime, nullable=True)


class SiteSubmission(Base):
    __tablename__ = "site_submissions"
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("company_sites.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    form_data = Column(JSON, default={})                          # submitted form fields
    source = Column(String(100), default="contact")               # contact | newsletter | inquiry
    created_at = Column(DateTime, default=datetime.utcnow)


class SitePage(Base):
    """멀티페이지 사이트의 개별 페이지."""
    __tablename__ = "site_pages"
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("company_sites.id"), nullable=False)
    slug = Column(String(100), nullable=False)          # "home" | "about" | "services" | "contact"
    title = Column(String(200), nullable=False)
    html_content = Column(Text, default="")
    page_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TerminalRequest(Base):
    """CEO가 admin 승인 후 실행할 터미널 명령 요청."""
    __tablename__ = "terminal_requests"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    org_node_id = Column(Integer, ForeignKey("org_nodes.id"), nullable=True)
    requested_by_name = Column(String(100), default="")      # CEO name
    command = Column(Text, nullable=False)                   # shell command to run
    reason = Column(Text, default="")                        # why it's needed
    working_dir = Column(String(500), default="")            # working directory for execution
    status = Column(String(20), default="pending")           # pending | approved | rejected | executed
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    output = Column(Text, default="")                        # stdout/stderr after execution
    exit_code = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    decided_at = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True)


# ── External API Keys ─────────────────────────────────────────────────────────
class ExternalApiKey(Base):
    """외부 서비스 API 키 및 인증 정보 관리."""
    __tablename__ = "external_api_keys"
    id = Column(Integer, primary_key=True, index=True)
    service = Column(String(50), nullable=False, index=True)
    # serpapi | newsapi | comtrade | wordpress | tistory | blogger | youtube
    label = Column(String(100), default="")          # 사용자 지정 이름
    api_key = Column(Text, default="")               # API key / access token
    extra_config = Column(JSON, default={})          # url, username, blog_id 등 추가 설정
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Collected Data ────────────────────────────────────────────────────────────
class CollectedData(Base):
    """인터넷에서 수집한 데이터 저장."""
    __tablename__ = "collected_data"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    data_type = Column(String(50), nullable=False, index=True)
    # web_search | news | rss | scraped | trade | custom
    source = Column(String(200), default="")         # URL or API name
    query = Column(String(500), default="")          # 검색어 또는 요청 파라미터
    title = Column(String(500), default="")
    content = Column(CompressedText, default="")     # 원본 텍스트 (zlib 압축 저장)
    structured = Column(JSON, default={})            # 구조화된 데이터 (articles, results 등)
    tags = Column(JSON, default=[])
    status = Column(String(20), default="raw")       # raw | processed | analyzed
    content_hash = Column(String(64), nullable=True, index=True)  # SHA256 중복 감지
    relevance_score = Column(Float, nullable=True)   # 0.0~1.0 관련성 점수
    quality_flag = Column(String(20), nullable=True) # ok | short | duplicate | low_quality
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


# ── Media Posts ───────────────────────────────────────────────────────────────
class CompanyCapability(Base):
    """회사별 활성화된 역량 목록."""
    __tablename__ = "company_capabilities"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    capability_type = Column(String(100), nullable=False)
    # game_upload | game_analytics | game_trend_search | game_idea_generator | blog_publish | ...
    status = Column(String(20), default="pending")  # pending | active | inactive
    config = Column(JSON, default={})               # 역량별 설정 (메타, API 안내 등)
    approval_id = Column(Integer, ForeignKey("approval_requests.id"), nullable=True)
    activated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class GameProject(Base):
    """게임 프로젝트."""
    __tablename__ = "game_projects"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(200), nullable=False)
    genre = Column(String(100), default="")         # RPG | Puzzle | Action | Strategy | ...
    platform = Column(String(100), default="")      # PC | Mobile | Console | Web
    status = Column(String(50), default="concept")  # concept | development | released | archived
    description = Column(Text, default="")
    idea_source = Column(String(50), default="manual")  # ai_generated | manual
    game_data = Column(JSON, default={})            # 외부 플랫폼 ID, 업로드 URL, 메트릭 등
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VideoJob(Base):
    """HuggingFace 영상 생성 작업 기록."""
    __tablename__ = "video_jobs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    prompt = Column(Text, nullable=False)              # 텍스트 프롬프트
    model_id = Column(String(200), default="")         # HF 모델 ID
    provider = Column(String(50), default="hf-inference")
    status = Column(String(20), default="pending")     # pending | running | done | failed
    video_path = Column(String(500), default="")       # 저장된 영상 파일 경로
    error_msg = Column(Text, default="")               # 실패 시 오류 메시지
    duration_sec = Column(Float, nullable=True)        # 영상 길이 (초)
    meta = Column(JSON, default={})                    # 기타 파라미터
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)


class Notification(Base):
    """시스템 알림 — DB 영속화."""
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # None = 전체
    title = Column(String(200), nullable=False)
    body = Column(Text, default="")
    notif_type = Column(String(50), default="info")
    # info | success | warning | error | approval | video | work | form
    icon = Column(String(10), default="🔔")
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    link = Column(String(300), default="")           # 클릭 시 이동할 URL
    is_read = Column(Boolean, default=False)
    meta = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)


class MarketKeywordAlert(Base):
    """시장 모니터링 키워드 알림 구독."""
    __tablename__ = "market_keyword_alerts"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)  # None=전체
    keyword = Column(String(100), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MediaPost(Base):
    """발행된 블로그 포스트 및 YouTube 영상 트래킹."""
    __tablename__ = "media_posts"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    platform = Column(String(50), nullable=False, index=True)
    # wordpress | tistory | blogger | youtube
    title = Column(String(500), nullable=False)
    content = Column(Text, default="")               # 본문 (블로그) 또는 설명 (유튜브)
    external_id = Column(String(200), default="")    # 플랫폼 내 ID
    external_url = Column(String(500), default="")   # 발행된 URL
    status = Column(String(20), default="draft")     # draft | published | failed
    platform_meta = Column(JSON, default={})         # 플랫폼별 추가 정보
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── 데이터 수집 정책 ───────────────────────────────────────────────────────────
class DataCollectionPolicy(Base):
    """소스별·회사별 데이터 수집 용량 정책 (DB 기반, 코드 상수 오버라이드)."""
    __tablename__ = "data_collection_policies"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)  # None=전체 기본값
    source = Column(String(100), nullable=False)     # hackernews|worldbank|reddit 등
    max_records = Column(Integer, nullable=True)     # None=기본 정책 사용
    retention_days = Column(Integer, nullable=True)  # raw 데이터 보관 기간
    is_active = Column(Boolean, default=True)
    memo = Column(String(200), default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── 수집 소스 상태 (실패 감지) ────────────────────────────────────────────────
class DataSourceStatus(Base):
    """소스별 수집 성공/실패 카운터 — 연속 실패 감지 + 알림용."""
    __tablename__ = "data_source_statuses"
    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(100), unique=True, nullable=False, index=True)
    consecutive_failures = Column(Integer, default=0)
    total_failures = Column(Integer, default=0)
    total_successes = Column(Integer, default=0)
    last_success_at = Column(DateTime, nullable=True)
    last_failure_at = Column(DateTime, nullable=True)
    last_error = Column(Text, default="")
    alert_sent_at = Column(DateTime, nullable=True)   # 마지막 알림 발송 시각
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── KPI ↔ 데이터 소스 연동 ────────────────────────────────────────────────────
class KpiDataLink(Base):
    """수집 데이터 소스를 StrategyItem KPI에 자동 연동하는 규칙."""
    __tablename__ = "kpi_data_links"
    id = Column(Integer, primary_key=True, index=True)
    strategy_item_id = Column(Integer, ForeignKey("strategy_items.id"), nullable=False)
    source = Column(String(100), nullable=False)      # fred | worldbank | ecos | kosis
    series_id = Column(String(200), nullable=False)   # DEXKOUS | NY.GDP.MKTP.KD.ZG 등
    field_path = Column(String(200), default="data[0].value")  # JSON 경로로 값 추출
    transform = Column(String(50), default="latest")  # latest | avg | sum | pct_change
    unit = Column(String(50), default="")
    last_value = Column(Float, nullable=True)
    last_updated_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class KpiSyncHistory(Base):
    """KPI 동기화 이력 — 스파크라인 차트에 활용."""
    __tablename__ = "kpi_sync_history"
    id = Column(Integer, primary_key=True, index=True)
    kpi_link_id = Column(Integer, ForeignKey("kpi_data_links.id"), nullable=False)
    value = Column(Float, nullable=False)
    synced_at = Column(DateTime, default=datetime.utcnow)


class WebhookToken(Base):
    """외부 시스템(Slack, Zapier 등) 수집 트리거용 웹훅 토큰."""
    __tablename__ = "webhook_tokens"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    token = Column(String(64), unique=True, nullable=False, index=True)
    source = Column(String(50), default="custom")   # slack | zapier | custom
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True)
    trigger_source = Column(String(100), default="hackernews")  # 트리거할 수집 소스
    created_at = Column(DateTime, default=datetime.utcnow)


class GpuHistory(Base):
    """GPU VRAM / 온도 / 사용률 1분 단위 수집 이력 (최근 24시간)."""
    __tablename__ = "gpu_history"
    id = Column(Integer, primary_key=True, index=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)
    vram_used_mb = Column(Integer, default=0)
    vram_total_mb = Column(Integer, default=0)
    temp_c = Column(Integer, default=0)
    util_pct = Column(Integer, default=0)


class AiProviderFallbackLog(Base):
    """AI Provider 자동 폴백 이벤트 로그."""
    __tablename__ = "ai_provider_fallback_log"
    id = Column(Integer, primary_key=True, index=True)
    occurred_at = Column(DateTime, default=datetime.utcnow, index=True)
    from_provider = Column(String(50), default="ollama")
    to_provider = Column(String(50), default="")
    reason = Column(String(500), default="")
    user_id = Column(Integer, nullable=True)
