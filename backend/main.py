import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import init_db, SessionLocal
from routers import auth, companies, org, chat, approvals, meetings, market, simulation, ai_models, memory, strategy, knowledge, work, sites, events, terminal, data_collect, media, executor, capabilities, game, audit, video_gen, notifications, docs


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="HAN Group AI Corporate Operating System — V27",
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

    # Step 2: Send a test prompt to verify the model actually responds
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
        User, Company, OrgNode, ModelCatalog, CorporateMemory, StrategyItem
    )
    from services.org_service import create_company_org

    db = SessionLocal()
    try:
        # ── Admin user ────────────────────────────────────────────────────────
        if not db.query(User).filter(User.username == "admin").first():
            admin = User(
                username="admin",
                email="admin@hangroup.ai",
                hashed_password=get_password_hash("admin1234"),
                role="admin",
            )
            db.add(admin)
            db.flush()

        admin = db.query(User).filter(User.username == "admin").first()

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
            chairman = OrgNode(
                company_id=None,
                name="AI 회장",
                role="HAN Group Chairman",
                level="chairman",
                parent_id=None,
                ai_provider="mock",
                ai_model="claude-opus-4-6",
                description="한그룹 전략 총괄 AI 회장",
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
            memories = [
                CorporateMemory(
                    title="한그룹 창립 헌장",
                    content="AI와 인간이 협력하여 새로운 기업 생태계를 만드는 것이 한그룹의 핵심 목표다.",
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
        print(f"✓ HAN Group OS v{settings.VERSION} started. DB seeded.")

    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
    finally:
        db.close()


# ── Background Scheduler ──────────────────────────────────────────────────────
def _auto_collect_news():
    """6시간마다 전체 계열사 업종 관련 뉴스 + 글로벌 데이터 자동 수집."""
    from datetime import datetime
    from models.models import Company, ExternalApiKey, CollectedData, MarketKeywordAlert
    from services.data_collector import DataCollector
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

        # ── 1. 회사별 업종 뉴스 수집 ─────────────────────────────────────────
        for company in companies[:5]:
            try:
                industry = company.industry or company.name
                result = collector.news_search(query=industry, language="ko", days_back=1)
                articles = result.get("articles", [])
                if articles:
                    content = "\n".join(
                        f"{a.get('title','')}: {a.get('description','')}"
                        for a in articles[:10]
                    )
                    obj = CollectedData(
                        company_id=company.id,
                        data_type="news",
                        source=result.get("source", "auto"),
                        query=industry,
                        title=f"[자동수집] {industry} 뉴스",
                        content=content[:10000],
                        structured=result,
                        tags=["news", "auto_collected"],
                        status="raw",
                    )
                    db.add(obj)
            except Exception as e:
                print(f"[Scheduler] {company.name} 뉴스 수집 실패: {e}")

        # ── 2. HackerNews 글로벌 테크 트렌드 수집 ───────────────────────────
        try:
            hn_result = collector.collect_hackernews(limit=15)
            if hn_result.get("stories"):
                content = "\n".join(
                    f"{s.get('title','')}: {s.get('url','')}"
                    for s in hn_result["stories"]
                )
                db.add(CollectedData(
                    company_id=None,
                    data_type="tech_trend",
                    source="hackernews",
                    query="hackernews_top",
                    title=f"[HackerNews] 글로벌 테크 트렌드 ({datetime.utcnow().strftime('%Y-%m-%d')})",
                    content=content[:10000],
                    structured=hn_result,
                    tags=["hackernews", "tech", "trend", "free", "auto"],
                    status="raw",
                ))
                print(f"[Scheduler] HackerNews {len(hn_result['stories'])}개 스토리 수집")
        except Exception as e:
            print(f"[Scheduler] HackerNews 수집 실패: {e}")

        # ── 3. World Bank 한국 GDP 성장률 수집 (일 1회 정도) ─────────────────
        try:
            wb_result = collector.collect_worldbank(indicator="NY.GDP.MKTP.KD.ZG", country="KR")
            if wb_result.get("data"):
                content = "\n".join(
                    f"{d.get('year','')}: {d.get('value','')}%"
                    for d in wb_result["data"]
                )
                db.add(CollectedData(
                    company_id=None,
                    data_type="economic",
                    source="worldbank",
                    query="KR:NY.GDP.MKTP.KD.ZG",
                    title="[World Bank] 한국 GDP 성장률",
                    content=content[:5000],
                    structured=wb_result,
                    tags=["worldbank", "economic", "korea", "gdp", "auto"],
                    status="raw",
                ))
                print(f"[Scheduler] World Bank GDP 데이터 {len(wb_result['data'])}건 수집")
        except Exception as e:
            print(f"[Scheduler] World Bank 수집 실패: {e}")

        db.commit()
        print(f"[Scheduler] 데이터 자동 수집 완료 ({len(companies[:5])}개 회사 + HN + WB)")

        # ── 4. 활성 회사별 자동 인사이트 생성 ────────────────────────────────
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


def _start_scheduler():
    """APScheduler 백그라운드 스케줄러 시작."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler(timezone="Asia/Seoul")
        # 6시간마다 뉴스 자동 수집
        scheduler.add_job(_auto_collect_news, "interval", hours=6, id="auto_news")
        scheduler.start()
        print("✓ 데이터 수집 스케줄러 시작 (6시간 간격 뉴스 자동 수집)")
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
