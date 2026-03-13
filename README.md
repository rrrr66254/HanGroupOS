# Group OS v37
**AI 기반 기업 운영 시스템 (AI Corporate Operating System)**

<p align="center">
  <img src="frontend/public/logo.png" alt="Group Logo" width="220" />
</p>

그룹사 전체를 AI 에이전트로 운영하는 통합 플랫폼입니다. 회장 AI부터 각 위원회까지 역할별 AI 에이전트를 배치하고, 경영 의사결정·승인·회의·전략·시장분석을 하나의 시스템에서 처리합니다.

> **v31부터 그룹 이름을 자유롭게 설정할 수 있습니다.** 관리자 > 그룹 설정에서 영문/한국어 이름과 슬로건을 변경하면 전체 UI에 즉시 반영됩니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **동적 그룹 이름 설정** | 관리자 > 그룹 설정에서 그룹 이름/슬로건을 자유롭게 변경 (전체 UI 즉시 반영) |
| **AI 허브 (다중 AI 대화)** | 회장·위원회·CEO 등 AI 구성원 각자와 1:1 대화 |
| **AI 에이전트 성과 분석** | 에이전트별 응답 품질, 토큰 사용량, 처리 시간 대시보드 (자동 수집) |
| **픽셀 AI 오피스** | AI 캐릭터가 실시간으로 움직이는 픽셀아트 사무실 |
| **역할별 AI 자동 배정** | 계열사 설립 시 직급·역할에 맞는 AI 모델 자동 배정 |
| **실시간 대시보드** | WebSocket 기반 실시간 KPI 변동, 승인 알림, 이벤트 반영 |
| **다국어 지원 (i18n)** | 한국어·영어·일본어 UI 전환 (사이드바, 대시보드, 로그인 전체 적용) |
| **CI/CD 파이프라인** | GitHub Actions — pytest + TypeScript 빌드 + Playwright E2E + Docker 빌드 |
| **Docker Compose 배포** | 백엔드+프론트엔드+Ollama 원클릭 컨테이너 배포 |
| **E2E 테스트 (Playwright)** | 로그인·대시보드·회장·계열사 시나리오별 브라우저 테스트 |
| **pytest 테스트** | 인증·회사·승인·그룹설정 API 테스트 코드 |
| **조직도 관리** | 회장 → 위원회 → 계열사 → 직책 계층 구조 |
| **결재 워크플로우 + AI 사전 검토** | 요청 → AI 위험도 분석 → 승인/반려 파이프라인 |
| **시장 분석 + 경쟁사 트렌드** | 산업별 기회/위협 리포트, 경쟁사 주간 뉴스량 차트 |
| **전략 트래킹 + AI 진단** | 목표·이니셔티브·마일스톤·KPI 관리, AI 건강 진단 |
| **자동 위임 체인** | CEO→전문가 자동 위임 + 병렬 분석 + 종합 보고 체인 워크플로우 |
| **KPI 스코어보드** | 계열사별 KPI 랭킹, Gold/Silver/Bronze 트로피, 게이미피케이션 대시보드 |
| **에이전트 성격 설정** | 프리셋(보수적/공격적/창의적) + 말투/전문분야 커스터마이징 |
| **외부 데이터 허브** | RSS/뉴스/환율/주가 자동 수집 파이프라인 + 에이전트 컨텍스트 주입 |
| **Slack/Discord 웹훅 알림** | 승인 요청·품질 알림·KPI 변동 등 실시간 웹훅 발송 |
| **AI 대화 요약 자동 생성** | 긴 세션 자동 요약 → 기업 기억 저장 |
| **계열사 시너지 매칭** | 키워드 + AI 분석으로 계열사 간 협업 기회 자동 발굴 |
| **대시보드 위젯 커스터마이징** | 사용자별 대시보드 위젯 표시/숨김/순서 설정 |
| **AI 피드백 루프** | 좋아요/싫어요 피드백 + 에이전트별 만족도 통계 |
| **멀티 AI 프로바이더** | Claude, GPT-4o, Gemini, Ollama (무료 로컬), Mock |
| **뉴스 수집 + AI 브리핑** | NewsAPI/RSS 기반 산업별 뉴스 자동 수집, AI 경영진 브리핑 생성, 구독 관리 |
| **API Rate Limiter** | 경로별 분당 요청 제한, 슬라이딩 윈도우, Rate Limit 헤더 자동 부여 |
| **인메모리 캐싱** | 외부 API 호출 결과 TTL 기반 캐시, 뉴스/트렌딩 10분 캐시 |
| **고급 헬스체크** | DB/Ollama/KTransformers/AI키/캐시/Rate Limit 상태 통합 진단 |
| **그룹 메신저** | 프로젝트/팀별 채팅방, 실시간 메시지, 멤버 관리, WebSocket 알림 |
| **모바일 반응형** | 햄버거 메뉴, 오버레이 사이드바, 반응형 그리드, 터치 최적화 |

---

## v37 업데이트 내역

### 1. API Rate Limiter
- 인메모리 슬라이딩 윈도우 기반 요청 제한 (Redis 불필요)
- 경로별 커스텀 제한: AI 호출 20req/min, 영상 생성 5req/min, 일반 60req/min
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` 헤더 자동 부여
- 인증 사용자는 username 기반, 미인증은 IP 기반 식별
- 429 Too Many Requests 응답 + `Retry-After` 헤더

### 2. 헬스체크 고도화
- `GET /health?detail=true` 시 전체 시스템 상태 진단:
  - Database (SQLite 연결), Ollama (모델 목록), KTransformers
  - AI Provider 키 설정 여부 (Anthropic/OpenAI/Gemini)
  - 외부 API 키 현황 (ExternalApiKey 테이블)
  - 캐시 통계, Rate Limit 통계

### 3. API 응답 캐싱 레이어
- 인메모리 TTL 캐시 (`core/cache.py`) — 스레드 세이프
- 뉴스 검색, 트렌딩 게임 검색 결과 10분 캐시
- `@cached(ttl=600)` 데코레이터 제공
- APScheduler 10분마다 만료 항목 자동 정리
- `cache_stats()` / `cache_cleanup()` 유틸리티

### 4. 그룹 내부 메신저
- 채팅방 생성/삭제/멤버 관리 (admin/member 역할)
- 실시간 메시지 전송 + 5초 폴링 갱신
- 시스템 메시지 (입장/퇴장/초대)
- WebSocket 실시간 알림 (채팅방 멤버에게)
- `ChatRoom`, `ChatRoomMember`, `ChatRoomMessage` DB 모델
- 메신저 UI: 카카오톡 스타일 채팅 버블, 검색, 모달
- API: `POST/GET/DELETE /api/messenger/rooms`, `/messages`

### 5. 모바일 반응형 UI 개선
- **햄버거 메뉴**: md 이하에서 사이드바 → 오버레이 드로어 (backdrop 터치 닫기)
- **컴팩트 헤더**: 모바일에서 높이 축소, 언어선택 숨김, 프로바이더 배너 숨김
- **반응형 그리드**: grid-cols-2/3/4 → 모바일 단일 컬럼 자동 변환
- **축소 패딩**: p-6 → p-3(모바일) / p-4(태블릿) / p-6(데스크톱)
- **메신저 모바일**: 채팅방 목록 ↔ 대화 화면 전환 (뒤로가기 버튼)

---

## v36 업데이트 내역

### 1. 뉴스 수집 + AI 브리핑 시스템 (NewsAPI 연동)
- **NewsAPI** 연동: 키워드/카테고리/국가별 뉴스 실시간 검색
- API 키 없을 시 **Google News RSS** 자동 폴백 (무료 사용 가능)
- **산업별 뉴스 피드**: IT, 게임, 금융, 제조, 미디어, 바이오, 에너지 등 9개 산업 + 키워드 자동 매핑
- **AI 뉴스 브리핑**: 수집된 뉴스를 AI가 분석 → 요약/트렌드/기회/리스크/조치사항 보고서 자동 생성
- **뉴스 구독 관리**: 회사별 뉴스 구독 생성/삭제/즉시 수집 기능
- 수집된 뉴스 → `CollectedData` 테이블 자동 저장 (중복 방지, SHA256 해시)
- `NewsFeedSubscription` DB 모델
- API 엔드포인트:
  - `GET /api/news/search` — 키워드/카테고리 뉴스 검색
  - `GET /api/news/industry/{industry}` — 산업별 뉴스 조회
  - `POST /api/news/briefing` — AI 뉴스 브리핑 생성
  - `GET /api/news/categories` — 지원 카테고리 목록
  - `GET /api/news/industries` — 지원 산업 + 키워드 목록
  - `POST/GET/DELETE /api/news/subscriptions` — 구독 CRUD
  - `POST /api/news/subscriptions/{id}/fetch` — 구독 기반 뉴스 즉시 수집

---

## v35 업데이트 내역

### 1. 실시간 알림 센터 (인앱)
- Header 알림 벨 클릭 시 슬라이드 드로어로 알림 목록 표시
- WebSocket 기반 실시간 알림 수신 + 자동 목록 갱신
- 전체/미읽음 필터, 개별 읽음 처리, 전체 읽음, 삭제 지원
- 알림 타입별 컬러 배지 (info/success/warning/error/approval/video/work/form)
- 클릭 시 해당 페이지로 자동 이동 (link 필드 기반)

### 2. AI 에이전트 워크플로우 빌더
- 노드 기반 비주얼 편집기로 AI 처리 파이프라인 설계
- 10종 노드 타입: AI 대화, AI 분석, 데이터 조회, 필터, 변환, 알림, 승인, 웹훅, 대기, 병합
- 토폴로지 정렬 기반 자동 실행 순서 결정
- 노드 드래그, 연결선, 설정 패널, 실행 이력 UI
- `WorkflowDefinition` + `WorkflowExecution` DB 모델
- `GET/POST/PATCH/DELETE /api/workflows`, `POST /api/workflows/{id}/execute` API

### 3. 계열사 재무제표 자동 생성
- 매출/비용/손익/자산/부채 데이터 입력 → AI 경영 분석 리포트 자동 생성
- 수익성 분석 (영업이익률, 순이익률), 안정성 분석 (부채비율), A~F 등급 평가
- 계열사별 종합 재무 리포트 (성장 추이, 리스크, 추천사항)
- `FinancialStatement` DB 모델
- `GET/POST /api/financial`, `POST /api/financial/{id}/analyze`, `POST /api/financial/company/{id}/report` API

### 4. 멀티테넌트 권한 관리 시스템
- 사용자별 역할 기반 접근 제어: 회장/CEO/관리자/뷰어 4단계
- 계열사별 데이터 격리 (company_id 기반)
- 사용자별 보기 / 계열사별 보기 UI
- 권한 부여/변경/제거 + admin 또는 해당 계열사 chairman/ceo만 관리 가능
- `UserCompanyRole` DB 모델 + `check_permission()` 유틸리티
- `GET/POST/PATCH/DELETE /api/permissions`, `GET /api/permissions/company/{id}/check` API

---

## v34 업데이트 내역

### 1. Slack/Discord 웹훅 알림 연동
- 승인 요청, 품질 알림, KPI 변동 등 이벤트별 웹훅 자동 발송
- Slack Incoming Webhooks / Discord Webhooks 동시 지원
- GroupSettings 기반 설정 저장 + 알림 타입별 필터링
- `/webhook-settings` 페이지: URL 등록, 필터 설정, 테스트 발송
- `PUT /api/webhook-notify/config`, `POST /api/webhook-notify/test` API
- 시스템 어디서든 `send_webhook_alert()` 호출로 알림 발송 가능

### 2. AI 에이전트 대화 요약 자동 생성
- 7일 이내 10건 이상 메시지가 있는 세션 자동 요약
- AI 기반 핵심 요약 생성 → CorporateMemory에 자동 저장
- 중복 요약 방지 (세션별 1회)
- `POST /api/chat-summary/auto` (일괄), `GET /api/chat-summary/session/{id}` (개별)

### 3. 계열사 간 시너지 매칭 AI
- 키워드 매칭 규칙: 기술-데이터, 콘텐츠-플랫폼, 재무-운영, 고객-교차
- AI 심층 분석: 2개 회사 간 시너지 기회를 AI가 상세 분석
- `/synergy-match` 페이지: 기회 목록 + AI 분석 결과 시각화
- `GET /api/synergy-match/opportunities`, `POST /api/synergy-match/ai-analyze` API

### 4. 관리자 대시보드 위젯 커스터마이징
- 11종 기본 위젯: 계열사 수, AI 조직원, 승인 대기, 기업 기억 등
- 사용자별 위젯 표시/숨김 토글 + 순서 드래그 앤 드롭
- DashboardLayout DB 모델로 사용자별 레이아웃 영구 저장
- `/dashboard-customize` 페이지 + 초기화 기능
- `GET/PUT/DELETE /api/dashboard-layout` API

### 5. AI 에이전트 학습 피드백 루프
- 메시지별 좋아요(+1) / 싫어요(-1) 피드백 제출
- 에이전트별 만족도 통계 (긍정률, 부정률, 총 피드백 수)
- 싫어요 피드백 시 자동 웹훅 알림 (품질 경고)
- `/ai-feedback` 페이지: 최근 피드백 이력 + 에이전트별 만족도 차트
- `POST /api/ai-feedback`, `GET /api/ai-feedback/stats` API

---

## v33 업데이트 내역

### 1. 스트리밍 채팅 메트릭 수집
- `/api/chat/stream` SSE 스트리밍 엔드포인트에 `_record_metric()` 자동 호출 추가
- 스트리밍 응답 시간(ms), 토큰 수(추정), 세션 타입 자동 기록
- DB 세션 닫힌 후에도 안전하게 동작하도록 로컬 변수 캡처 적용

### 2. E2E 테스트 (Playwright)
- `frontend/playwright.config.ts` — Vite 연동 + 스크린샷/트레이스 자동 수집
- `frontend/e2e/auth.spec.ts` — 로그인 페이지, 성공 로그인, 잘못된 자격증명 테스트
- `frontend/e2e/dashboard.spec.ts` — 통계 카드, 사이드바 네비게이션 테스트
- `frontend/e2e/chairman.spec.ts` — 임원 목록, 채팅 UI 테스트
- `frontend/e2e/companies.spec.ts` — 계열사 목록, 신규 생성 버튼 테스트
- `npm run test:e2e` / `npm run test:e2e:ui` 스크립트 추가

### 3. i18n 나머지 페이지 확장
- `Chairman.tsx`, `Companies.tsx`, `Approvals.tsx`, `Admin.tsx`에 `useT()` 적용
- ko/en/ja 번역 파일에 chairman, admin, companies, approvals 섹션 대폭 추가
- Admin 페이지 탭 렌더링 변수 충돌 해결 (`t` → `tb`)

### 4. 셸 스크립트 동적화 (완전 탈 하드코딩)
- `han`, `install.sh`, `start.sh`, `start.ps1`, `install.ps1` 모든 사용자 문자열 동적화
- `GROUP_DISPLAY_NAME="${GROUP_NAME:-Group OS}"` 환경변수 기반 설정
- PowerShell: `$GroupDisplayName = if ($env:GROUP_NAME) { $env:GROUP_NAME } else { "Group OS" }`
- "HAN Group OS" 하드코딩 0건 달성

### 5. AI 메트릭 품질 점수 자동 평가
- `_calc_quality_score()` 함수 추가 — 응답 길이·속도·입출력 비율 기반 0.0~1.0 자동 점수
- `_record_metric()` 호출 시 `quality_score` 자동 계산 후 DB 저장
- `AiAgentMetrics.quality_score` 컬럼 활용 (기존 nullable Float)
- 성과 대시보드에서 품질 추이 확인 가능

### 6. 성과 대시보드 품질 점수 시각화
- 일별 품질 추이 라인 차트 추가 (0~100% 범위, 녹색 라인)
- 에이전트 품질 랭킹 수평 바 차트 추가 (상위 8개 에이전트)
- 백엔드 `by_day` API 응답에 `avg_quality` 필드 추가
- Award 아이콘 활용, 기존 요청 추이·프로바이더 차트와 동일 스타일

### 7. E2E 테스트 CI 통합
- GitHub Actions `ci.yml`에 `frontend-e2e` 잡 추가
- `frontend-build` 성공 후 Playwright Chromium 헤드리스 실행
- 테스트 실패 시 `test-results/` 아티팩트 자동 업로드 (7일 보관)

### 8. 프로바이더별 비용 추적 대시보드
- `/cost-analytics` 페이지 신규 생성 — 일별 비용 추이, 프로바이더 비율 파이, 모델별 바 차트
- Anthropic/OpenAI/Gemini 최신 토큰 단가표 내장 (Ollama/로컬은 무료 처리)
- `GET /api/agent-metrics/cost-summary` — 기간별 비용 집계 API
- `GET /api/agent-metrics/pricing` — 현재 단가표 조회 API
- 월 예상 비용 자동 산출 (일 평균 × 30일)
- 사이드바 조직 그룹에 "비용 분석" 메뉴 추가, ko/en/ja i18n 대응

### 9. 에이전트 자동 위임 체인
- CEO → CTO/CFO/CMO/COO/CPO 전문가 자동 위임 워크플로우
- 키워드 기반 위임 대상 자동 감지 (`detect_delegation_targets`)
- 전문가 병렬 응답 후 CEO 종합 보고 생성
- `/delegation` 페이지: 위임 미리보기 + 실행 + 결과 시각화
- `POST /api/delegation/run`, `POST /api/delegation/detect` API

### 10. KPI 스코어보드 (게이미피케이션)
- 계열사별 종합 점수 자동 산출 (KPI 달성률 + AI 활용도 + 품질 + 속도)
- Gold/Silver/Bronze 트로피 자동 부여 + 랭킹 차트
- 수동 KPI 등록/업데이트 + AI 메트릭 기반 자동 점수 계산
- `/kpi-scoreboard` 페이지: 상위 3 트로피 카드 + 바 차트 + 상세 테이블
- `GET /api/kpi-scoreboard/ranking`, `POST /api/kpi-scoreboard/kpi` API

### 11. AI 에이전트 성격 커스터마이징
- 에이전트별 프리셋(보수적/공격적/창의적/균형), 말투, 응답 길이, 전문분야 설정
- 관리자 UI에서 편집 모달로 에이전트 성격 직접 커스터마이징
- `get_personality_instruction()` — 채팅 시스템 프롬프트에 성격 지시문 자동 주입
- `/agent-personality` 페이지 + `AgentPersonality` DB 모델
- `GET/PUT /api/agent-personality/node/{id}`, `GET /api/agent-personality/presets` API

### 12. 외부 데이터 소스 통합 허브
- RSS/뉴스API/환율/주가 외부 데이터 자동 수집 파이프라인
- 피드 등록/관리/즉시 수집/삭제 + 수집 데이터 캐시 뷰어
- `inject_to_context` 설정으로 에이전트 컨텍스트에 최신 데이터 자동 주입
- RSS 2.0/Atom 파싱, NewsAPI, frankfurter.app 환율 지원
- `/data-feeds` 페이지 + `ExternalDataFeed`/`ExternalDataCache` DB 모델
- `GET/POST/PUT/DELETE /api/data-feeds`, `GET /api/data-feeds/context-data` API

---

## v32 업데이트 내역

### 1. AI 시스템 프롬프트 동적화
- 모든 AI 시스템 프롬프트(CHAIRMAN, CEO, CFO, CMO, CTO, COO, CPO, MARKET_ANALYST)에서 하드코딩 그룹명 제거
- `__GROUP__`/`__GROUP_EN__` 플레이스홀더 → DB GroupSettings 기반 런타임 치환
- `get_chairman_system(db)`, `get_system_for_role(role, level, db)` 동적 함수 제공
- `_resolve_group()` 헬퍼로 모든 역할 프롬프트 자동 그룹명 적용

### 2. 백엔드 하드코딩 완전 제거
- `chat.py` — 브리핑, 이사회, 주간 리포트, 추천 액션 등 모든 "한그룹" 참조 제거
- `strategy.py` — 시너지 분석, CEO 토론 요약 프롬프트 동적화
- `ir_service.py` — IR 페이지 기본 텍스트 동적화
- `site_service.py` — 사이트 빌더 푸터 동적화
- `work_service.py` — 주간 보고서 시스템 프롬프트 동적화
- `platform_guides.py` — 앱 이름 예시 동적화
- `config.py` — APP_NAME 기본값 "Group OS"
- 프론트엔드 `Chairman.tsx`, `VideoStudio.tsx` — `useGroupStore` 연동

### 3. i18n 전체 페이지 적용
- 번역 키 대폭 확장: 공통(30+), 네비게이션, 대시보드, 승인, 회장, 관리자, 계열사, 영상, 성과, 인증
- `Sidebar.tsx` — 전체 네비게이션(5개 그룹 + 30개 메뉴) `useT()` 적용
- `Dashboard.tsx` — 8개 통계 카드 i18n 적용
- `Login.tsx` — 폼 라벨/버튼 i18n 적용
- 일본어(ja) 번역 전체 키 동기화

### 4. AI 성과 메트릭 자동 수집
- `AIProvider.chat()` → `_chat_inner()` 래핑으로 모든 AI 호출 자동 계측
- 응답 시간(ms), 토큰 수(추정), 프로바이더/모델 자동 기록
- `_record_metric()` — `AiAgentMetrics` DB 자동 저장 (실패 시 무시)
- `chat.py` 주요 엔드포인트에 `agent_name`, `company_id`, `org_node_id` 전달
- 성과 대시보드 (`/agent-performance`)에서 실시간 데이터 확인 가능

### 5. CI/CD 파이프라인 (GitHub Actions)
- `.github/workflows/ci.yml` 생성
- **backend-test** 잡: Python 3.11 + pytest 자동 실행
- **frontend-build** 잡: Node 20 + TypeScript 타입 체크 + Vite 빌드
- **docker-build** 잡: push 시 backend/frontend Docker 이미지 빌드 검증
- `requirements.txt`에 pytest 의존성 추가

---

## 기술 스택

**Backend**
- Python 3.11+
- FastAPI 0.115 + Uvicorn
- SQLAlchemy 2.0 (SQLite)
- Pydantic v2
- JWT 인증 (python-jose)
- pytest (테스트)

**Frontend**
- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3
- Zustand (상태관리)
- Recharts (차트)
- Axios + React Router v6

**AI 프로바이더**
- Anthropic Claude (Opus/Sonnet/Haiku)
- OpenAI GPT-4o / GPT-4o-mini
- Google Gemini 1.5 Flash
- Ollama (로컬 — 무료, API 키 불필요)
- Mock (API 키 없이 테스트)

**배포 / CI**
- Docker Compose (backend + frontend + Ollama)
- Nginx (프론트엔드 서빙 + API 프록시)
- GitHub Actions (pytest + TypeScript 빌드 + Docker 빌드)

---

## 실행 방법

### 방법 0: Docker Compose (가장 간편)

```bash
git clone https://github.com/rrrr66254/HanGroupOS.git
cd HanGroupOS
docker compose up -d
```

접속: `http://localhost:5173`

### 방법 1: han CLI (원라인 설치)

```bash
curl -fsSL https://raw.githubusercontent.com/rrrr66254/HanGroupOS/master/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://raw.githubusercontent.com/rrrr66254/HanGroupOS/master/install.ps1 | iex
```

### 방법 2: 수동 실행

**백엔드** (터미널 1)
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**프론트엔드** (터미널 2)
```bash
cd frontend
npm install && npm run dev
```

접속: `http://localhost:5173`

---

## 테스트 실행

**백엔드 (pytest)**
```bash
cd backend
pip install pytest httpx
pytest tests/ -v
```

**프론트엔드 E2E (Playwright)**
```bash
cd frontend
npx playwright install
npm run test:e2e
```

---

## 초기 설정

### 기본 로그인
```
ID:       admin
Password: admin1234
```

### 그룹 이름 설정
1. 로그인 후 **관리자** 페이지 접속
2. **그룹 설정** 탭 선택
3. 영문/한국어 이름과 슬로건 입력 → 저장
4. 전체 UI에 즉시 반영

### AI 프로바이더 설정
`backend/.env` 파일 수정 또는 관리자 UI에서 설정:

```env
DEFAULT_PROVIDER=mock        # API 키 없이 테스트
ANTHROPIC_API_KEY=sk-ant-... # Claude 사용 시
OPENAI_API_KEY=sk-...        # GPT 사용 시
OLLAMA_BASE_URL=http://localhost:11434  # 로컬 AI
OLLAMA_MODEL=llama3.2
```

---

## 프로젝트 구조

```
HanGroupOS/
├── .github/workflows/ci.yml  # CI/CD 파이프라인
├── docker-compose.yml         # 컨테이너 배포 설정
├── frontend/
│   ├── Dockerfile             # 프론트엔드 컨테이너
│   ├── nginx.conf             # Nginx 설정
│   ├── src/
│   │   ├── i18n/              # 다국어 번역 (ko/en/ja)
│   │   ├── pages/
│   │   │   ├── AgentPerformance.tsx  # AI 성과 분석
│   │   │   └── ...
│   │   └── store/useStore.ts  # Zustand (인증+앱+그룹설정)
│   └── ...
└── backend/
    ├── Dockerfile             # 백엔드 컨테이너
    ├── tests/                 # pytest 테스트
    │   ├── conftest.py
    │   ├── test_auth.py
    │   ├── test_companies.py
    │   ├── test_approvals.py
    │   └── test_group_settings.py
    ├── routers/
    │   ├── group_settings.py  # 그룹 설정 API
    │   ├── agent_metrics.py   # AI 성과 분석 API
    │   └── ...
    ├── services/
    │   └── ai_provider.py     # 동적 시스템 프롬프트 + 자동 메트릭 수집
    └── models/models.py       # GroupSettings, AiAgentMetrics 모델
```

---

## API 문서

서버 실행 후: `http://localhost:8000/docs`

### 신규 API (v31-34)

| 경로 | 설명 |
|------|------|
| `GET /api/group-settings` | 그룹 설정 조회 |
| `PATCH /api/group-settings` | 그룹 설정 변경 (이름, 슬로건) |
| `GET /api/agent-metrics/summary` | AI 에이전트 성과 요약 (자동 수집 데이터) |
| `GET /api/agent-metrics/recent` | 최근 AI 호출 이력 |
| `GET /api/agent-metrics/cost-summary` | 프로바이더별 비용 추적 요약 |
| `GET /api/agent-metrics/pricing` | 토큰 단가표 조회 |
| `POST /api/delegation/run` | 자동 위임 체인 실행 |
| `GET /api/kpi-scoreboard/ranking` | 계열사 KPI 랭킹 |
| `GET/PUT /api/agent-personality/node/{id}` | 에이전트 성격 조회/수정 |
| `GET/POST /api/data-feeds` | 외부 데이터 피드 관리 |
| `PUT /api/webhook-notify/config` | 웹훅 알림 설정 |
| `POST /api/webhook-notify/test` | 웹훅 테스트 발송 |
| `POST /api/chat-summary/auto` | 대화 요약 일괄 생성 |
| `GET /api/synergy-match/opportunities` | 시너지 매칭 기회 조회 |
| `GET/PUT /api/dashboard-layout` | 대시보드 위젯 레이아웃 |
| `POST /api/ai-feedback` | AI 피드백 제출 |
| `GET /api/ai-feedback/stats` | 에이전트별 만족도 통계 |
| `GET/POST /api/workflows` | AI 워크플로우 관리 |
| `POST /api/workflows/{id}/execute` | 워크플로우 실행 |
| `GET/POST /api/financial` | 재무제표 관리 |
| `POST /api/financial/{id}/analyze` | AI 재무 분석 |
| `POST /api/financial/company/{id}/report` | 종합 재무 리포트 |
| `GET/POST /api/permissions` | 권한 관리 |
| `GET /api/permissions/company/{id}/check` | 접근 권한 확인 |

---

## 문제 해결

**Docker 실행 오류**
```bash
docker compose down && docker compose up --build -d
```

**DB 초기화 (데이터 리셋)**
```bash
rm backend/han_group.db
# 서버 재시작하면 자동으로 재생성됩니다
```

**테스트 실패 시**
```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v --tb=short
```
