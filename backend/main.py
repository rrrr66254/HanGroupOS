from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import init_db, SessionLocal
from routers import auth, companies, org, chat, approvals, meetings, market, simulation, ai_models, memory, strategy, knowledge, work, sites, events, terminal, data_collect, media, executor, capabilities, game, audit, video_gen


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
