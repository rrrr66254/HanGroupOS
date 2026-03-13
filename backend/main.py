import asyncio
import logging
import os
from logging.handlers import RotatingFileHandler
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import init_db, SessionLocal

# ── 파일 로깅 설정 ────────────────────────────────────────────────────────────
_LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "han.log")
_log_handler = RotatingFileHandler(_LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
_log_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
logging.getLogger().addHandler(_log_handler)
logging.getLogger("uvicorn.access").addHandler(_log_handler)
logging.getLogger("uvicorn.error").addHandler(_log_handler)
logging.getLogger().setLevel(logging.INFO)
from routers import auth, companies, org, chat, approvals, meetings, market, simulation, ai_models, memory, strategy, knowledge, work, sites, events, terminal, data_collect, media, executor, capabilities, game, audit, video_gen, notifications, docs, competitors, kpi_links, briefing, webhooks, group_settings, agent_metrics


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="AI Corporate Operating System",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(org.router)
app.include_router(chat.router)
app.include_router(approvals.router)
app.include_router(meetings.router)
app.include_router(market.router)
app.include_router(simulation.router)
app.include_router(ai_models.router)
app.include_router(memory.router)
app.include_router(strategy.router)
app.include_router(knowledge.router)
app.include_router(work.router)
app.include_router(sites.router)  # includes both /api/sites/* and public /sites/*
app.include_router(events.router)
app.include_router(terminal.router)
app.include_router(data_collect.router)   # 데이터 수집 (웹 검색/뉴스/스크래핑/무역)
app.include_router(media.router)          # 미디어 발행 (블로그/YouTube)
app.include_router(executor.router)       # 코드 실행 환경 (Python + pip + 워크스페이스 DB)
app.include_router(capabilities.router)   # 회사 역량 관리 (자동 분석 + 승인)
app.include_router(game.router)           # 게임 회사 전용 (트렌딩/분석/아이디어/프로젝트)
app.include_router(audit.router)          # 감사 로그 (승인/반려/터미널 이력 통합 조회)
app.include_router(video_gen.router)      # 영상 생성 (HuggingFace Inference API)
app.include_router(notifications.router)  # 알림 시스템 (DB 영속화)
app.include_router(docs.router)           # AI 문서 자동 생성기 (사업계획서/IR/시장분석)
app.include_router(competitors.router)    # 경쟁사 모니터링
app.include_router(kpi_links.router)      # KPI 데이터 연동
app.include_router(briefing.router)       # 그룹 주간 브리핑
app.include_router(webhooks.router)       # 외부 웹훅 수신 API
app.include_router(group_settings.router) # 그룹 설정 (이름, 슬로건 등)
app.include_router(agent_metrics.router)  # AI 에이전트 성과 분석


@app.get("/health")
def health():
    return {"status": "ok", "version": settings.VERSION, "system": settings.APP_NAME}


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    init_db()
    _seed_data()
    _check_ollama()
    _check_ktransformers()
    _start_scheduler()
    _restart_pending_video_jobs()


@app.on_event("startup")
async def _setup_ws_loop():
    """WebSocket ConnectionManager에 현재 이벤트 루프 주입."""
    from routers.notifications import manager as notif_manager
    notif_manager.set_loop(asyncio.get_running_loop())


# ── WebSocket: 실시간 알림 ─────────────────────────────────────────────────────
@app.websocket("/ws/notifications")
async def ws_notifications(ws: WebSocket, token: str = Query("")):
    from core.security import decode_token
    from models.models import Notification, User as UserModel
    from routers.notifications import manager as notif_manager

    payload = decode_token(token) if token else None
    if not payload:
        await ws.close(code=4001)
        return

    db = SessionLocal()
    try:
        user = db.query(UserModel).filter(UserModel.username == payload.get("sub")).first()
        if not user:
            await ws.close(code=4001)
            return

        await notif_manager.connect(user.id, ws)

        # 연결 즉시 미읽음 수 전송
        cnt = db.query(Notification).filter(
            (Notification.user_id == user.id) | (Notification.user_id == None),
            Notification.is_read == False,
        ).count()
        await ws.send_json({"type": "unread_count", "count": cnt})

        try:
            while True:
                await ws.receive_text()  # 클라이언트 ping 수신용
        except WebSocketDisconnect:
            notif_manager.disconnect(user.id, ws)
    except Exception:
        notif_manager.disconnect(user.id, ws) if user else None
    finally:
        db.close()


def _check_ollama():
    """Check Ollama connectivity and model responsiveness on startup."""
    import httpx

    base_url = settings.OLLAMA_BASE_URL or "http://localhost:11434"
    model = settings.OLLAMA_MODEL

    # Step 1: Check connectivity and list available models
    try:
        r = httpx.get(f"{base_url}/api/tags", timeout=3.0)
        if r.status_code != 200:
            print(f"⚠️  Ollama 응답 오류 (HTTP {r.status_code}) — Ollama 사용 불가")
            return
        models = [m["name"] for m in r.json().get("models", [])]
        print(f"✓ Ollama 연결 성공 ({base_url}) — 사용 가능 모델: {', '.join(models) if models else '없음'}")
    except Exception:
        print(f"⚠️  Ollama 미연결 ({base_url}) — `ollama serve` 로 실행하세요.")
        return

    # Step 2: 설정된 모델이 실제 설치 목록에 있는지 먼저 확인
    if not model:
        print("⚠️  OLLAMA_MODEL 미설정 — .env 또는 han config set OLLAMA_MODEL=<모델명>")
        return

    model_base = model.split(":")[0]  # "qwen2.5:14b" → "qwen2.5"
    exact_match = model in models
    similar = [m for m in models if m.startswith(model_base)] if not exact_match else []

    if not exact_match:
        if similar:
            print(f"⚠️  {model} 미설치 — 유사 모델: {', '.join(similar)}")
            print(f"    수정: han config set OLLAMA_MODEL={similar[0]}")
            print(f"    또는: ollama pull {model}")
        else:
            print(f"⚠️  {model} 미설치 — ollama pull {model}  또는  han config set OLLAMA_MODEL=<모델명>")
        return

    # Step 3: 설치된 모델로 실제 응답 테스트
    print(f"  → {model} 모델 응답 테스트 중...")
    try:
        r2 = httpx.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": [{"role": "user", "content": "응답 테스트: 네 라고만 답하세요."}],
                "stream": False,
                "options": {"num_predict": 10},
            },
            timeout=60.0,
        )
        r2.raise_for_status()
        reply = r2.json().get("message", {}).get("content", "").strip()
        if reply:
            print(f"✓ {model} 모델 정상 응답 확인 — \"{reply[:40]}\"")
        else:
            print(f"⚠️  {model} 모델이 빈 응답을 반환했습니다. 모델 상태를 확인하세요.")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            print(f"⚠️  {model} 모델 없음 (404) — ollama pull {model}")
        else:
            print(f"⚠️  {model} 모델 테스트 실패 (HTTP {e.response.status_code}): {e}")
    except httpx.TimeoutException:
        print(f"⚠️  {model} 모델 응답 시간 초과 (60초) — 모델 로딩이 오래 걸리거나 문제가 있습니다.")
    except Exception as e:
        print(f"⚠️  {model} 모델 테스트 실패: {e}")


def _check_ktransformers():
    """Check KTransformers server connectivity on startup."""
    import httpx

    base = settings.KTRANSFORMERS_BASE_URL.rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    try:
        r = httpx.get(f"{base}/health", timeout=2.0)
        if r.status_code == 200:
            print(f"✓ KTransformers 연결 성공 ({base})")
        else:
            print(f"⚠️  KTransformers 응답 오류 (HTTP {r.status_code}) → Ollama 폴백 활성")
    except Exception:
        print(f"⚠️  KTransformers 미실행 ({base}) → Ollama 자동 폴백 활성")
        print("    실행: ktransformers --model <model> --port 30000")


def _seed_data():
    from core.security import get_password_hash
    from models.models import (
        User, Company, OrgNode, ModelCatalog, CorporateMemory, StrategyItem, GroupSettings
    )
    from services.org_service import create_company_org

    db = SessionLocal()
    try:
        # ── Admin user ────────────────────────────────────────────────────────
        if not db.query(User).filter(User.username == "admin").first():
            admin = User(
                username="admin",
                email="admin@group.ai",
                hashed_password=get_password_hash("admin1234"),
                role="admin",
            )
            db.add(admin)
            db.flush()

        admin = db.query(User).filter(User.username == "admin").first()

        # ── Group name helper ─────────────────────────────────────────────────
        def _gname():
            row = db.query(GroupSettings).filter(GroupSettings.key == "group_name").first()
            return row.value if row else "Group"

        def _gname_ko():
            row = db.query(GroupSettings).filter(GroupSettings.key == "group_name_ko").first()
            return row.value if row else "그룹"

        # ── Model Catalog ─────────────────────────────────────────────────────
        if db.query(ModelCatalog).count() == 0:
            models = [
                ModelCatalog(name="Claude Opus 4.6", provider="anthropic", model_id="claude-opus-4-6",
                             description="최고 성능, 복잡한 전략 분석", is_free=False, context_window=200000,
                             strengths=["복잡 추론", "전략 분석", "창의적 문제 해결"]),
                ModelCatalog(name="Claude Sonnet 4.6", provider="anthropic", model_id="claude-sonnet-4-6",
                             description="균형잡힌 성능과 속도", is_free=False, context_window=200000,
                             strengths=["균형 성능", "빠른 응답", "비용 효율"]),
                ModelCatalog(name="Claude Haiku 4.5", provider="anthropic", model_id="claude-haiku-4-5-20251001",
                             description="빠르고 저렴한 모델", is_free=False, context_window=200000,
                             strengths=["빠른 응답", "비용 효율", "반복 작업"]),
                ModelCatalog(name="GPT-4o", provider="openai", model_id="gpt-4o",
                             description="OpenAI 최고 성능", is_free=False, context_window=128000,
                             strengths=["멀티모달", "코드 생성", "분석"]),
                ModelCatalog(name="GPT-4o Mini", provider="openai", model_id="gpt-4o-mini",
                             description="저렴하고 빠른 OpenAI 모델", is_free=False, context_window=128000,
                             strengths=["빠른 응답", "저비용", "일반 작업"]),
                ModelCatalog(name="Gemini 1.5 Flash", provider="gemini", model_id="gemini-1.5-flash",
                             description="Google 빠른 모델", is_free=False, context_window=1000000,
                             strengths=["긴 컨텍스트", "빠른 처리", "멀티모달"]),
                ModelCatalog(name="Llama 3.2 (Ollama)", provider="ollama", model_id="llama3.2",
                             description="로컬 실행 오픈소스 모델", is_free=True, context_window=128000,
                             strengths=["무료", "로컬 실행", "프라이버시"]),
                ModelCatalog(name="Mock AI", provider="mock", model_id="mock-model",
                             description="API 키 없이 테스트 가능한 모의 AI", is_free=True, context_window=999999,
                             strengths=["무료", "즉시 사용", "오프라인"]),
            ]
            for m in models:
                db.add(m)
            db.flush()

        # ── Group-level Org (Chairman + Committees) ───────────────────────────
        if db.query(OrgNode).filter(OrgNode.company_id == None).count() == 0:
            gn = _gname()
            gn_ko = _gname_ko()
            chairman = OrgNode(
                company_id=None,
                name="AI 회장",
                role=f"{gn} Chairman",
                level="chairman",
                parent_id=None,
                ai_provider="mock",
                ai_model="claude-opus-4-6",
                description=f"{gn_ko} 전략 총괄 AI 회장",
            )
            db.add(chairman)
            db.flush()

            committees = [
                ("전략위원회", "Strategy Committee", "전략 수립 및 투자 결정"),
                ("투자위원회", "Investment Committee", "투자 심사 및 포트폴리오 관리"),
                ("데이터위원회", "Data Committee", "데이터 거버넌스 및 분석 총괄"),
            ]
            for name, role, desc in committees:
                c = OrgNode(
                    company_id=None,
                    name=name,
                    role=role,
                    level="committee",
                    parent_id=chairman.id,
                    ai_provider="mock",
                    ai_model="claude-sonnet-4-6",
                    description=desc,
                )
                db.add(c)

        # ── Initial Corporate Memory ──────────────────────────────────────────
        if db.query(CorporateMemory).count() == 0:
            gn_ko = _gname_ko()
            memories = [
                CorporateMemory(
                    title=f"{gn_ko} 창립 헌장",
                    content=f"AI와 인간이 협력하여 새로운 기업 생태계를 만드는 것이 {gn_ko}의 핵심 목표다.",
                    memory_type="fact",
                    importance="critical",
                    tags=["창립", "헌장", "비전"],
                ),
                CorporateMemory(
                    title="AI 운영 원칙",
                    content="AI는 실행과 분석을 담당하고 인간은 방향과 책임을 담당한다. AI가 제안 → 인간이 승인 → 실행하는 구조를 따른다.",
                    memory_type="decision",
                    importance="high",
                    tags=["원칙", "AI", "협력"],
                ),
            ]
            for m in memories:
                db.add(m)

        # ── Initial Strategy ──────────────────────────────────────────────────
        if db.query(StrategyItem).count() == 0:
            strategies = [
                StrategyItem(title="AI 회사 100개 구축", item_type="objective",
                             description="글로벌 AI 기업 생태계 형성을 위해 100개 이상의 AI 계열사 구축",
                             priority="high", progress=3),
                StrategyItem(title="글로벌 AI 기업 생태계 형성", item_type="objective",
                             description="콘텐츠 · 소프트웨어 · 데이터 · 교육 · 커뮤니티를 하나의 AI 생태계로 통합",
                             priority="high", progress=5),
                StrategyItem(title="첫 번째 AI 계열사 설립", item_type="milestone",
                             description="수출입 데이터를 저장·가공하는 첫 번째 AI 계열사 설립",
                             priority="high", progress=0, due_date="2026-Q2"),
            ]
            for s in strategies:
                db.add(s)

        db.commit()
        print(f"✓ Group OS v{settings.VERSION} started. DB seeded.")

    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
    finally:
        db.close()


# ── Background Scheduler ──────────────────────────────────────────────────────
def _update_source_status(db, source: str, success: bool, error: str = ""):
    """DataSourceStatus 업데이트. 연속 3회 실패 시 알림 발송."""
    from datetime import datetime, timedelta
    from models.models import DataSourceStatus, User as UserModel
    from routers.notifications import create_notification

    now = datetime.utcnow()
    status = db.query(DataSourceStatus).filter(DataSourceStatus.source == source).first()
    if not status:
        status = DataSourceStatus(source=source)
        db.add(status)

    if success:
        status.consecutive_failures = 0
        status.total_successes = (status.total_successes or 0) + 1
        status.last_success_at = now
    else:
        status.consecutive_failures = (status.consecutive_failures or 0) + 1
        status.total_failures = (status.total_failures or 0) + 1
        status.last_failure_at = now
        status.last_error = error

        # 연속 3회 이상 실패하고 24시간 내 알림 미발송이면 알림
        if status.consecutive_failures >= 3:
            alert_cutoff = now - timedelta(hours=24)
            if not status.alert_sent_at or status.alert_sent_at < alert_cutoff:
                admin = db.query(UserModel).filter(UserModel.username == "admin").first()
                admin_id = admin.id if admin else None
                create_notification(
                    db=db,
                    user_id=admin_id,
                    title=f"[수집 실패 알림] {source}",
                    body=f"연속 {status.consecutive_failures}회 실패\n최근 오류: {error[:200]}",
                    notif_type="error",
                    icon="🚨",
                    link="/data",
                )
                status.alert_sent_at = now

    db.commit()


def _auto_collect_news():
    """6시간마다 전체 계열사 업종 관련 뉴스 + 글로벌 데이터 자동 수집 (스마트 필터링 적용)."""
    from datetime import datetime
    from models.models import Company, ExternalApiKey, CollectedData, MarketKeywordAlert
    from services.data_collector import DataCollector
    from services.data_quality import compute_hash, check_quality, should_save, cleanup_old_data
    from routers.notifications import create_notification

    db = SessionLocal()
    try:
        companies = db.query(Company).filter(Company.status == "active").all()

        # API 키 로드
        api_keys = {}
        extra_configs = {}
        for row in db.query(ExternalApiKey).filter(ExternalApiKey.is_active == True).all():
            api_keys[row.service] = row.api_key
            if row.extra_config:
                extra_configs[row.service] = row.extra_config

        collector = DataCollector(api_keys=api_keys, extra_configs=extra_configs)
        saved_total = 0
        skipped_total = 0

        def _smart_save(title: str, content: str, data_type: str, source: str,
                        query: str, structured: dict, tags: list,
                        company_id=None, keywords=None):
            """중복·용량·품질 필터 통과 시에만 저장."""
            nonlocal saved_total, skipped_total
            from services.data_quality import compute_relevance
            c_hash = compute_hash(title, content)
            q_flag = check_quality(title, content, c_hash, db)
            ok, reason = should_save(db, source, data_type, company_id, q_flag)
            if not ok:
                skipped_total += 1
                return None
            rel_score = compute_relevance(content, keywords or []) if keywords else None
            obj = CollectedData(
                company_id=company_id, data_type=data_type, source=source,
                query=query, title=title[:500], content=content[:10000],
                structured=structured, tags=tags, status="raw",
                content_hash=c_hash, relevance_score=rel_score, quality_flag=q_flag,
            )
            db.add(obj)
            saved_total += 1
            return obj

        # ── 1. 회사별 업종 뉴스 수집 ─────────────────────────────────────────
        for company in companies[:5]:
            try:
                industry = company.industry or company.name
                keywords = [kw.strip() for kw in (company.industry or "").split(",") if kw.strip()]
                keywords += [company.name]
                result = collector.news_search(query=industry, language="ko", days_back=1)
                articles = result.get("articles", [])
                if articles:
                    content = "\n".join(
                        f"{a.get('title','')}: {a.get('description','')}"
                        for a in articles[:10]
                    )
                    _smart_save(
                        title=f"[자동수집] {industry} 뉴스",
                        content=content,
                        data_type="news",
                        source=result.get("source", "auto"),
                        query=industry,
                        structured=result,
                        tags=["news", "auto_collected"],
                        company_id=company.id,
                        keywords=keywords,
                    )
                _update_source_status(db, "company_news", True)
            except Exception as e:
                print(f"[Scheduler] {company.name} 뉴스 수집 실패: {e}")
                _update_source_status(db, "company_news", False, str(e))

        # ── 2. HackerNews 글로벌 테크 트렌드 수집 ───────────────────────────
        try:
            hn_result = collector.collect_hackernews(limit=15)
            if hn_result.get("stories"):
                content = "\n".join(
                    f"{s.get('title','')}: {s.get('url','')}"
                    for s in hn_result["stories"]
                )
                _smart_save(
                    title=f"[HackerNews] 글로벌 테크 트렌드 ({datetime.utcnow().strftime('%Y-%m-%d')})",
                    content=content,
                    data_type="tech_trend",
                    source="hackernews",
                    query="hackernews_top",
                    structured=hn_result,
                    tags=["hackernews", "tech", "trend", "free", "auto"],
                )
                print(f"[Scheduler] HackerNews {len(hn_result['stories'])}개 스토리 수집")
            _update_source_status(db, "hackernews", True)
        except Exception as e:
            print(f"[Scheduler] HackerNews 수집 실패: {e}")
            _update_source_status(db, "hackernews", False, str(e))

        # ── 3. World Bank 한국 GDP 성장률 수집 ───────────────────────────────
        try:
            wb_result = collector.collect_worldbank(indicator="NY.GDP.MKTP.KD.ZG", country="KR")
            if wb_result.get("data"):
                content = "\n".join(
                    f"{d.get('year','')}: {d.get('value','')}%"
                    for d in wb_result["data"]
                )
                _smart_save(
                    title="[World Bank] 한국 GDP 성장률",
                    content=content,
                    data_type="economic",
                    source="worldbank",
                    query="KR:NY.GDP.MKTP.KD.ZG",
                    structured=wb_result,
                    tags=["worldbank", "economic", "korea", "gdp", "auto"],
                )
                print(f"[Scheduler] World Bank GDP 데이터 {len(wb_result['data'])}건 수집")
            _update_source_status(db, "worldbank", True)
        except Exception as e:
            print(f"[Scheduler] World Bank 수집 실패: {e}")
            _update_source_status(db, "worldbank", False, str(e))

        # ── 4. 경쟁사 뉴스 수집 ───────────────────────────────────────────────
        from models.models import Company as CompanyModel
        competitor_companies = db.query(CompanyModel).filter(CompanyModel.is_competitor == True).all()
        for comp in competitor_companies[:5]:
            try:
                keywords = comp.competitor_keywords or [comp.name]
                query = " ".join(keywords[:3]) if keywords else comp.name
                result = collector.news_search(query=query, language="ko", days_back=1)
                articles = result.get("articles", [])
                if articles:
                    content = "\n".join(
                        f"{a.get('title','')}: {a.get('description','')}"
                        for a in articles[:10]
                    )
                    _smart_save(
                        title=f"[경쟁사] {comp.name} 뉴스",
                        content=content,
                        data_type="news",
                        source=result.get("source", "auto"),
                        query=query,
                        structured=result,
                        tags=["competitor", "news", "auto_collected"],
                        company_id=comp.id,
                        keywords=keywords,
                    )
                _update_source_status(db, "competitor_news", True)
            except Exception as e:
                print(f"[Scheduler] 경쟁사 {comp.name} 뉴스 수집 실패: {e}")
                _update_source_status(db, "competitor_news", False, str(e))

        db.commit()
        print(f"[Scheduler] 수집 완료 — 저장 {saved_total}건 / 스킵 {skipped_total}건 (중복·용량·품질 필터)")

        # ── 5. 활성 회사별 자동 인사이트 생성 ────────────────────────────────
        try:
            _auto_generate_insights(db, companies[:5])
        except Exception as e:
            print(f"[Scheduler] 자동 인사이트 생성 실패: {e}")

        # ── 5. 시장 모니터링 알림 키워드 매칭 ────────────────────────────────
        try:
            _check_market_alerts(db, create_notification)
        except Exception as e:
            print(f"[Scheduler] 시장 알림 체크 실패: {e}")

    except Exception as e:
        print(f"[Scheduler] 자동 수집 오류: {e}")
    finally:
        db.close()


def _auto_generate_insights(db, companies):
    """
    자동 인사이트 스케줄링 — 수집 완료 후 각 회사별 최신 데이터 분석.
    최근 6시간 내 수집 데이터가 3건 이상일 때만 AI 인사이트 생성.
    생성된 인사이트는 StrategyItem으로 저장.
    """
    from datetime import datetime, timedelta
    from sqlalchemy import func
    from models.models import CollectedData, StrategyItem, User as UserModel
    from services.ai_provider import get_provider_from_db, MARKET_ANALYST_SYSTEM

    # Admin 유저로 AI 호출
    admin = db.query(UserModel).filter(UserModel.username == "admin").first()
    if not admin:
        return

    now = datetime.utcnow()
    six_hours_ago = now - timedelta(hours=6)
    generated = 0

    for company in companies:
        try:
            # 최근 6시간 내 수집된 데이터 조회
            recent_data = (
                db.query(CollectedData)
                .filter(
                    CollectedData.company_id == company.id,
                    CollectedData.created_at >= six_hours_ago,
                )
                .order_by(CollectedData.created_at.desc())
                .limit(15)
                .all()
            )

            # 글로벌 데이터 (company_id=None) 도 포함
            global_data = (
                db.query(CollectedData)
                .filter(
                    CollectedData.company_id == None,
                    CollectedData.created_at >= six_hours_ago,
                )
                .order_by(CollectedData.created_at.desc())
                .limit(5)
                .all()
            )

            all_data = recent_data + global_data
            if len(all_data) < 3:
                print(f"[Scheduler] {company.name} 인사이트 스킵 (데이터 {len(all_data)}건 < 3건)")
                continue

            # 이미 오늘 인사이트가 생성되었는지 확인
            today_insight = (
                db.query(StrategyItem)
                .filter(
                    StrategyItem.company_id == company.id,
                    StrategyItem.item_type == "initiative",
                    StrategyItem.title.like("[자동인사이트]%"),
                    func.date(StrategyItem.created_at) == now.date(),
                )
                .first()
            )
            if today_insight:
                print(f"[Scheduler] {company.name} 오늘 인사이트 이미 생성됨, 스킵")
                continue

            # 데이터 텍스트 직렬화
            data_text = ""
            for i, row in enumerate(all_data, 1):
                data_text += f"\n[{i}] [{row.data_type}] {row.title}\n{row.content[:400]}\n"

            prompt = (
                f"{company.name} ({company.industry or '미지정 업종'}) 관련 최신 데이터 {len(all_data)}건입니다.\n"
                f"이 데이터를 바탕으로 전략적 인사이트 3가지를 도출하고, "
                f"각각 구체적 액션 아이템을 한 줄씩 제안해주세요.\n\n"
                f"{data_text}"
            )

            provider = get_provider_from_db(db, admin.id)
            insights = provider.chat(
                [{"role": "user", "content": prompt}],
                system=MARKET_ANALYST_SYSTEM,
                session_type="general",
            )

            item = StrategyItem(
                company_id=company.id,
                title=f"[자동인사이트] {company.name} — {now.strftime('%Y-%m-%d')}",
                description=insights,
                item_type="initiative",
                status="active",
                priority="medium",
            )
            db.add(item)
            db.commit()
            generated += 1
            print(f"[Scheduler] {company.name} 자동 인사이트 생성 완료")

        except Exception as e:
            print(f"[Scheduler] {company.name} 인사이트 생성 실패: {e}")

    if generated:
        print(f"[Scheduler] 자동 인사이트 {generated}건 생성 완료")


def _check_market_alerts(db, create_notification):
    """시장 키워드 알림 매칭 — 새로 수집된 데이터에서 키워드 발견 시 알림 생성."""
    from models.models import MarketKeywordAlert
    from datetime import timedelta

    alerts = db.query(MarketKeywordAlert).filter(MarketKeywordAlert.is_active == True).all()
    if not alerts:
        return

    now = datetime.utcnow()
    triggered = 0

    for alert in alerts:
        try:
            # 마지막 트리거 이후 수집된 데이터만 검색
            since = alert.last_triggered_at or (now - timedelta(hours=7))
            from models.models import CollectedData
            matches = (
                db.query(CollectedData)
                .filter(
                    CollectedData.created_at > since,
                    CollectedData.company_id == alert.company_id
                    if alert.company_id else True,
                )
                .filter(
                    (CollectedData.title.ilike(f"%{alert.keyword}%")) |
                    (CollectedData.content.ilike(f"%{alert.keyword}%"))
                )
                .limit(3)
                .all()
            )
            if matches:
                match_titles = ", ".join(m.title[:50] for m in matches[:2])
                create_notification(
                    db=db,
                    user_id=alert.user_id,
                    title=f"🔔 시장 알림: '{alert.keyword}'",
                    body=f"관련 데이터 {len(matches)}건 수집됨\n{match_titles}",
                    notif_type="info",
                    icon="📊",
                    link="/market",
                )
                alert.last_triggered_at = now
                triggered += 1
        except Exception as e:
            print(f"[Scheduler] 알림 {alert.id} 처리 실패: {e}")

    if triggered:
        db.commit()
        print(f"[Scheduler] 시장 알림 {triggered}건 발송")


def _weekly_competitor_collect():
    """주 1회 경쟁사 뉴스 자동 수집 + WebSocket 알림."""
    from models.models import Company as _Company, ExternalApiKey as _ExtKey, CollectedData as _CD
    from services.data_collector import DataCollector as _DC
    from services.data_quality import compute_hash, check_quality, should_save
    from routers.notifications import create_notification

    db = SessionLocal()
    try:
        competitors = db.query(_Company).filter(_Company.is_competitor == True).all()
        api_keys = {r.service: r.api_key for r in db.query(_ExtKey).filter(_ExtKey.is_active == True).all()}
        extra_configs = {r.service: r.extra_config for r in db.query(_ExtKey).filter(_ExtKey.is_active == True, _ExtKey.extra_config != None).all()}
        collector = _DC(api_keys=api_keys, extra_configs=extra_configs)

        saved_total = 0
        for comp in competitors:
            try:
                keywords = comp.competitor_keywords or [comp.name]
                query = " ".join(keywords[:3]) if keywords else comp.name
                result = collector.news_search(query=query, language="ko", days_back=7)
                articles = result.get("articles", [])
                if articles:
                    content = "\n".join(
                        f"{a.get('title','')}: {a.get('description','')}"
                        for a in articles[:10]
                    )
                    c_hash = compute_hash(f"[경쟁사 주간] {comp.name}", content)
                    q_flag = check_quality(f"[경쟁사 주간] {comp.name}", content, c_hash, db)
                    ok, _ = should_save(db, result.get("source", "auto"), "news", comp.id, q_flag)
                    if ok:
                        db.add(_CD(
                            company_id=comp.id,
                            data_type="news",
                            source=result.get("source", "auto"),
                            query=query,
                            title=f"[경쟁사 주간] {comp.name} 뉴스",
                            content=content[:10000],
                            structured=result,
                            tags=["competitor", "news", "weekly"],
                            status="raw",
                            content_hash=c_hash,
                            quality_flag=q_flag,
                        ))
                        saved_total += 1
                _update_source_status(db, "competitor_news", True)
            except Exception as e:
                _update_source_status(db, "competitor_news", False, str(e))
        db.commit()

        if saved_total > 0:
            create_notification(
                db,
                title="경쟁사 주간 뉴스 수집 완료",
                body=f"{len(competitors)}개 경쟁사, {saved_total}건 저장",
                notif_type="success",
                icon="🎯",
                link="/competitors",
            )
            # WebSocket 브로드캐스트
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(notif_manager.broadcast({
                        "type": "competitor_collect",
                        "title": "경쟁사 주간 뉴스 수집 완료",
                        "saved": saved_total,
                        "competitors": len(competitors),
                    }))
            except Exception:
                pass
        print(f"[WeeklyScheduler] 경쟁사 수집 완료 — {saved_total}건 저장")
    except Exception as e:
        print(f"[WeeklyScheduler] 경쟁사 수집 오류: {e}")
    finally:
        db.close()


def _kpi_sync_all():
    """6시간마다 모든 활성 KPI 링크 자동 동기화 + 변화량 알림."""
    from models.models import KpiDataLink as _KpiLink, CollectedData as _CD, StrategyItem as _SI
    from routers.notifications import create_notification

    db = SessionLocal()
    try:
        links = db.query(_KpiLink).filter(_KpiLink.is_active == True).all()
        changed = []
        for lnk in links:
            row = (
                db.query(_CD)
                .filter(_CD.source == lnk.source, _CD.query.contains(lnk.series_id))
                .order_by(_CD.created_at.desc())
                .first()
            )
            if not row or not row.structured:
                continue
            try:
                data = row.structured
                parts = lnk.field_path.replace("]", "").replace("[", ".").split(".")
                cur = data
                for part in parts:
                    if part.isdigit():
                        cur = cur[int(part)]
                    elif part and isinstance(cur, dict):
                        cur = cur.get(part)
                    if cur is None:
                        break
                if cur is None:
                    continue
                value = float(cur)
            except Exception:
                continue

            prev = lnk.last_value
            item = db.query(_SI).filter(_SI.id == lnk.strategy_item_id).first()
            if item:
                item.kpi_current = value
            lnk.last_value = value
            lnk.last_updated_at = __import__("datetime").datetime.utcnow()
            if prev is not None and abs(value - prev) > 0.001:
                changed.append({"series": lnk.series_id, "prev": prev, "new": value})

        db.commit()
        if changed:
            body = " | ".join(f"{c['series']}: {c['prev']:.3f}→{c['new']:.3f}" for c in changed[:5])
            create_notification(
                db,
                title="KPI 데이터 변화 감지",
                body=body,
                notif_type="info",
                icon="📊",
                link="/strategy",
            )
        print(f"[KpiScheduler] KPI 동기화 완료 — {len(links)}개 링크, {len(changed)}개 변화")
    except Exception as e:
        print(f"[KpiScheduler] KPI 동기화 오류: {e}")
    finally:
        db.close()


def _start_scheduler():
    """APScheduler 백그라운드 스케줄러 시작."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler(timezone="Asia/Seoul")
        # 6시간마다 회사 뉴스 + 글로벌 데이터 자동 수집
        scheduler.add_job(_auto_collect_news, "interval", hours=6, id="auto_news")
        # 매주 월요일 09:00 경쟁사 뉴스 수집
        scheduler.add_job(_weekly_competitor_collect, "cron", day_of_week="mon", hour=9, id="weekly_competitor")
        # 6시간마다 KPI 링크 자동 동기화
        scheduler.add_job(_kpi_sync_all, "interval", hours=6, id="kpi_sync")
        # 1분마다 GPU 상태 수집 (nvidia-smi 있을 때만 실제 동작)
        from routers.video_gen import _record_gpu_history
        scheduler.add_job(_record_gpu_history, "interval", minutes=1, id="gpu_history")
        scheduler.start()
        print("✓ 데이터 수집 스케줄러 시작 (뉴스 6h · 경쟁사 주1회 · KPI 6h · GPU 1min)")
    except Exception as e:
        print(f"⚠️  스케줄러 시작 실패 (무시): {e}")


# ── Video Job Recovery ────────────────────────────────────────────────────────
def _restart_pending_video_jobs():
    """서버 재시작 시 pending/running 상태 영상 잡을 재시도."""
    from models.models import VideoJob

    db = SessionLocal()
    try:
        stuck_jobs = (
            db.query(VideoJob)
            .filter(VideoJob.status.in_(["pending", "running"]))
            .all()
        )
        if not stuck_jobs:
            return

        from routers.video_gen import _start_video_job
        restarted = 0
        for job in stuck_jobs:
            job.status = "pending"  # running → pending 으로 리셋
            db.commit()
            started = _start_video_job(job.id, db)
            if started:
                restarted += 1
        print(f"✓ 미완료 영상 잡 {restarted}/{len(stuck_jobs)}개 재시작")
    except Exception as e:
        print(f"⚠️  영상 잡 재시작 실패 (무시): {e}")
    finally:
        db.close()


# ── Data Collection Schedule API ─────────────────────────────────────────────
@app.post("/api/scheduler/collect-now")
def trigger_collection(_=None):
    """수동으로 즉시 뉴스 수집 트리거."""
    import threading
    t = threading.Thread(target=_auto_collect_news, daemon=True)
    t.start()
    return {"ok": True, "message": "뉴스 수집 작업이 백그라운드에서 시작되었습니다."}
