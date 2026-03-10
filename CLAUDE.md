# HAN Group OS — Claude 작업 규칙

## 구현 완료 후 필수 수행 사항

새로운 기능 구현이 완료될 때마다 **반드시 아래 두 가지를 순서대로 수행**하세요.

### 1. Git Push

구현된 변경 사항을 즉시 커밋하고 원격 저장소에 push합니다.

```
cd /home/user/han-group-os
git add <변경된 파일들>
git commit -m "feat: <구현 내용 요약>"
git push -u origin master
```

Push 완료 후 반드시 다음 형식으로 사용자에게 알립니다:

```
✅ Push 완료
브랜치: master
커밋: <commit hash> — <커밋 메시지>
변경 파일: <파일 목록>
```

### 2. 다음 추천 3가지

Push 완료 메시지 바로 다음에 **반드시** 아래 형식으로 추천 3가지를 출력합니다:

```
---
💡 다음 추천 작업

1. **[추천1 제목]** — 설명
2. **[추천2 제목]** — 설명
3. **[추천3 제목]** — 설명
```

추천 항목은 방금 구현한 내용과 연관된 자연스러운 다음 단계여야 합니다.

---

## 프로젝트 개요

- **프로젝트명**: HAN Group AI Corporate Operating System
- **버전**: V27+
- **스택**: FastAPI (Python) + React (TypeScript) + SQLite/SQLAlchemy
- **경로**: `/home/user/han-group-os`
  - 백엔드: `backend/`
  - 프론트엔드: `frontend/`

## 주요 모듈

| 모듈 | 경로 | 설명 |
|------|------|------|
| AI Provider | `backend/services/ai_provider.py` | KTransformers→Ollama 폴백, Anthropic/OpenAI/Gemini 지원 |
| Team Agent | `backend/services/team_agent.py` | 같은 레벨 간 병렬 토론 (asyncio.gather) |
| 역량 분석기 | `backend/services/capability_analyzer.py` | 회사 생성 시 자동 역량 분석 + 승인 요청 |
| 게임 플랫폼 | `backend/services/game_platform.py` | 트렌딩 검색, AI 아이디어 생성 |
| 조직 서비스 | `backend/services/org_service.py` | 회사 조직 자동 생성 |

## AI 구조 원칙

- **같은 레벨 (CEO ↔ CEO)**: Team Agent (병렬, 공유 컨텍스트)
- **상하 보고 (CEO → 회장)**: Sub Agent (순차 계층 보고)

## 역량 자동 분석 흐름

1. 회사 생성 → `create_company_org()` → `analyze_and_request_capabilities()` 자동 실행
2. 업종 키워드 매칭 → `CompanyCapability(status=pending)` + `ApprovalRequest` 생성
3. 회장 승인 → `activate_capabilities()` → `CompanyCapability(status=active)`

## 게임 회사 API

- `GET /api/game/trending` — SerpAPI/RSS 트렌딩 게임 검색
- `POST /api/game/ideas/generate` — AI 게임 아이디어 자동 생성
- `GET /api/game/permits` — 한국 게임 사업 필수 허가 목록
- `GET /api/capabilities/company/{id}` — 회사 역량 목록

## 작업 시 주의 사항

- 모델 추가 시 `backend/models/models.py`에 정의 후 `init_db()`가 자동 테이블 생성
- 새 라우터는 `backend/main.py`에 import + `app.include_router()` 등록 필요
- AirLLM은 완전 제거됨 — 사용 금지
- SerpAPI 키는 `ExternalApiKey` 테이블 (service="serpapi")에서 조회
