# HAN Group OS v30
**AI 기반 기업 운영 시스템 (AI Corporate Operating System)**

<p align="center">
  <img src="frontend/public/logo.png" alt="HAN Group Logo" width="220" />
</p>

그룹사 전체를 AI 에이전트로 운영하는 통합 플랫폼입니다. 회장 AI부터 각 위원회까지 역할별 AI 에이전트를 배치하고, 경영 의사결정·승인·회의·전략·시장분석을 하나의 시스템에서 처리합니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **AI 허브 (다중 AI 대화)** | 회장·위원회·CEO 등 AI 구성원 각자와 1:1 대화 |
| **픽셀 AI 오피스** | AI 캐릭터가 실시간으로 움직이는 픽셀아트 사무실, 회의 시 회의실 자동 활성화 |
| **역할별 AI 자동 배정** | 계열사 설립 시 직급·역할에 맞는 AI 모델 자동 배정 (CEO → Claude Sonnet, 팀장 → GPT-4o-mini 등) |
| **조직도 관리** | 회장 → 위원회 → 계열사 → 직책 계층 구조 |
| **결재 워크플로우 + AI 사전 검토** | 요청 → AI 위험도 분석 → 승인/반려 파이프라인 |
| **회의 관리** | 일정 수립, AI 참여, 회의실 픽셀 오피스 반영 |
| **시장 분석 + 경쟁사 트렌드** | 산업별 기회/위협 리포트, 경쟁사 주간 뉴스량 차트 |
| **전략 트래킹 + AI 진단** | 목표·이니셔티브·마일스톤·KPI 관리, 항목별 AI 건강 진단 |
| **KPI 이력 + 스파크라인** | KPI 동기화 이력 추적, SVG 스파크라인 시각화 |
| **계열사 건강 스코어카드** | 진척률·KPI·데이터 종합 건강 점수 (양호/주의/위험) |
| **그룹 주간 브리핑** | 최근 7일 데이터 기반 AI 자동 마크다운 브리핑 생성 |
| **수집 데이터 AI 자동 태깅** | 수집 데이터 AI 분석 → 산업·감성·토픽 태그 자동 부여 |
| **인사이트 격상 계보 뷰** | 인사이트→전략 격상 이력 트리 시각화 |
| **외부 웹훅 수신 API** | 토큰 인증으로 외부 시스템에서 데이터 수집 트리거 |
| **비즈니스 시뮬레이션** | What-if 시나리오 분석 |
| **기업 메모리** | 의사결정·사실·교훈 등 기관 지식 축적 |
| **멀티 AI 프로바이더** | Claude, GPT-4o, Gemini, **Ollama (무료 로컬)**, Mock 전환 가능 |

---

## v30 업데이트 내역

### AI 자동화 & 데이터 인텔리전스 10종 기능 추가

#### 1. KPI 이력 추적 + 스파크라인
- KPI 값 동기화 시마다 `KpiSyncHistory` 테이블에 이력 저장
- 전략 페이지에서 KPI 링크별 순수 SVG 스파크라인 차트 표시
- `GET /kpi-links/{id}/history` 엔드포인트로 이력 조회

#### 2. 경쟁사 트렌드 차트
- 경쟁사별 주간 뉴스 수집량을 SVG 바 차트로 시각화
- `GET /competitors/trend?weeks=N` 엔드포인트
- Competitors 페이지에 "트렌드 분석" 버튼 추가

#### 3. 수집 데이터 AI 자동 태깅
- CollectedData 항목 자동 분석 → `industry:*`, `sentiment:*`, 토픽 태그 부여
- `POST /data/auto-tag` (limit, data_type, source, force 파라미터)
- DataAnalytics 페이지에 "AI 자동 태깅" 버튼 추가

#### 4. 전략 아이템 AI 진단
- 전략 항목 클릭 → AI 건강도 진단 (health, risks, improvements, next_actions, score 0-100)
- `POST /strategy/items/{id}/diagnose`
- Strategy 페이지 카드에 "AI 진단" 버튼 + 결과 패널

#### 5. 계열사 건강 스코어카드
- 계열사별 종합 건강 점수 자동 산출 (양호/주의/위험)
- 공식: `score = avg_progress×0.5 + kpi_rate×0.3 + data_score×0.2`
- `GET /companies/health-scores` 엔드포인트
- Dashboard 메인 화면에 진행바 + 상태 배지 표시

#### 6. 그룹 주간 브리핑 자동 생성
- 최근 7일 데이터·전략·KPI를 종합 분석해 마크다운 브리핑 AI 생성
- `POST /briefing/generate`
- WeeklyReport 페이지에 "그룹 브리핑" 탭 추가

#### 7. 결재 요청 AI 사전 검토
- 결재 상세 모달에서 AI 위험도 분석 요청 가능
- risk_level(low/medium/high/critical), 위험 요소, 권고 사항, 핵심 질문 반환
- `POST /approvals/{id}/ai-review` + 결과 `approval.meta["ai_review"]` 저장

#### 8. 전략 맵 PDF 내보내기
- Strategy 페이지 상단 "PDF 저장" 버튼 → `window.print()` 기반 인쇄/저장
- 인쇄용 CSS 자동 적용 (배경색 보존, 불필요 UI 숨김)

#### 9. 격상 이력 배지 + 계보 뷰
- 인사이트 → 전략 항목으로 격상 시 `source_insight_id` 연결 체인 추적
- `GET /strategy/items/{id}/genealogy` 재귀 트리 반환
- InsightsDashboard에 "계보 보기" 버튼 + 트리 모달

#### 10. 외부 웹훅 수신 API
- `X-Webhook-Token` 헤더 인증으로 외부 시스템에서 데이터 수집 트리거 가능
- `POST /webhooks/collect` (hackernews/worldbank/reddit/custom)
- `WebhookToken` 테이블: 토큰 생성·조회·활성화/비활성화·삭제
- Admin 관리자 페이지에 "웹훅 토큰" 탭 추가

#### 기타 버그 수정
- APScheduler `No module named 'apscheduler'` 오류 수정 (`apscheduler>=3.10.0` 추가)
- 무료 데이터 수집 UI: 수집량 표시 개선 (실제 아이템 수), "방금 수집됨" 피드백 추가

---

## v29 업데이트 내역

### 계열사 설립 시 역할별 특화 AI 자동 배정
- **직급 기반 모델 티어** — CEO는 고성능 모델, 팀장은 경량 모델 자동 배정
- **AI 예산 설정** — 설립 모달에서 무료 / 절약 / 최고 성능 3단계 선택
- **배정 미리보기** — 설립 전 직급별 배정될 모델 미리 확인
- **역할 전문성 설명** — 각 직위에 맞는 특화 설명 자동 생성 (예: "데이터 총괄 — 수치 분석 특화")
- **AI 편집 탭** — 계열사 조직도 옆에 "AI 편집" 탭 추가, 조직원별 모델 개별 변경 가능

| 직급 | 무료 | 절약 | 최고 성능 |
|------|------|------|---------|
| CEO | llama3.2 (ollama) | gpt-4o-mini | claude-sonnet-4-6 |
| Chief | llama3.2 (ollama) | gpt-4o-mini | claude-haiku-4-5 |
| 팀장 | mock-model | llama3.2 | gpt-4o-mini |
| 전문가 | mock-model | mock-model | llama3.2 |

### HAN Group 공식 로고 적용
- 사이드바 상단에 HAN Group 3D 로고 표시 (투명 배경 PNG)
- 브라우저 파비콘도 로고로 변경
- 로고 로드 실패 시 Zap 아이콘으로 자동 폴백

---

## v28 업데이트 내역

- **Ollama 로컬 LLM 지원 강화** — API 키 없이 Ollama 설정 가능, 무료로 LLM 활용
- **픽셀 AI 오피스** — AI 캐릭터가 실시간 애니메이션으로 근무 현황 표시, 회의 시 회의실 활성화
- **AI 허브** — AI 회장 전용 채팅 → 회장·위원회 각자와 개별 대화 가능한 멀티 AI 허브로 개편
- **대시보드 카드 클릭** — 모든 통계 카드 클릭 시 해당 페이지로 이동
- **계열사 초기 데이터 제거** — 빈 상태에서 시작, 필요에 따라 계열사 직접 설립

---

## 기술 스택

**Backend**
- Python 3.11+
- FastAPI 0.115 + Uvicorn
- SQLAlchemy 2.0 (SQLite)
- Pydantic v2
- JWT 인증 (python-jose)

**Frontend**
- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3
- Zustand (상태관리)
- Axios + React Router v6

**AI 프로바이더**
- Anthropic Claude (Opus/Sonnet/Haiku)
- OpenAI GPT-4o / GPT-4o-mini
- Google Gemini 1.5 Flash
- **Ollama (로컬 Llama, Mistral 등 — 무료, API 키 불필요)**
- Mock (API 키 없이 테스트)

---

## 실행 방법

### 방법 0: han CLI (원라인 설치, 권장)

터미널 한 줄로 설치하고 `han` 명령어로 관리합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/rrrr66254/HanGroupOS/master/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://raw.githubusercontent.com/rrrr66254/HanGroupOS/master/install.ps1 | iex
```

설치 완료 후 사용 가능한 명령어:

```bash
# 서버 관리
han start           # 서버 시작 (포그라운드)
han start --daemon  # 백그라운드 시작
han stop            # 서버 종료
han restart         # 재시작
han status          # 실행 상태 + 버전 + 설정 요약

# 진단 & 로그
han init_check      # 환경 사전 점검 (Python/Node/포트/Ollama 연결 등)
han logs            # 실시간 로그 보기
han logs backend    # 백엔드 로그만

# 업데이트 & 유지보수
han update          # GitHub 업데이트 확인 → 변경 내역 출력 → 적용
han reset           # DB 초기화
han backup          # DB 백업 (~/.han/backups/)
han restore         # 백업 목록에서 선택해 복원

# 설정 & 기타
han config          # 현재 .env 보기 (API 키 마스킹)
han open            # 브라우저 열기
han --version       # 버전 + 커밋 해시
han help            # 전체 도움말
```

---

### 방법 1: WSL2 (Windows 권장)

> Windows에서 Linux 환경을 사용하는 가장 안정적인 방법입니다.

**1단계 — WSL2 설치** (PowerShell 관리자 권한)
```powershell
wsl --install
```
설치 후 PC 재부팅

**2단계 — Ubuntu 터미널에서 실행**
```bash
git clone https://github.com/rrrr66254/HanGroupOS.git
cd HanGroupOS
chmod +x start.sh
./start.sh
```

**3단계 — 브라우저 접속**
```
http://localhost:5173
```

---

### 방법 2: Windows 직접 실행

**사전 설치 필요**
- [Python 3.11+](https://www.python.org/downloads/) — 설치 시 **"Add Python to PATH"** 체크 필수
- [Node.js 20+](https://nodejs.org/)
- [Git](https://git-scm.com/)

설치 확인:
```powershell
python --version   # Python 3.11.x
node --version     # v20.x.x
git --version
```

**코드 받기**
```powershell
git clone https://github.com/rrrr66254/HanGroupOS.git
cd HanGroupOS
```

**백엔드 실행** (터미널 1)
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**프론트엔드 실행** (터미널 2 — 새 창)
```powershell
cd frontend
npm install
npm run dev
```

**접속**
```
앱:       http://localhost:5173
API 문서: http://localhost:8000/docs
```

---

### 방법 3: macOS / Linux

```bash
git clone https://github.com/rrrr66254/HanGroupOS.git
cd HanGroupOS
chmod +x start.sh
./start.sh
```

`start.sh`가 가상환경 생성, 패키지 설치, 서버 실행을 자동으로 처리합니다.

---

## 초기 설정

### 기본 로그인 정보
```
ID:       admin
Password: admin1234
```

### AI 프로바이더 설정

`backend/.env` 파일을 수정하세요. (최초 실행 시 자동 생성)

```env
# 기본 프로바이더 (api key 없이 테스트 가능)
DEFAULT_PROVIDER=mock

# 실제 AI 연동 시 아래 키 입력
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...

# 로컬 AI (Ollama 사용 시 — API 키 불필요)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

API 키 없이 시작하려면 `DEFAULT_PROVIDER=mock` 상태로 두면 됩니다.

### Ollama 로컬 LLM 사용법 (무료)

1. [Ollama 설치](https://ollama.com/download)
2. 모델 다운로드:
   ```bash
   ollama pull llama3.2      # 추천 (2GB)
   ollama pull mistral       # 대안
   ollama pull phi3          # 경량화 (1.7GB)
   ```
3. 앱 실행 후 **관리자 > AI Provider 설정** 에서:
   - Provider: `Ollama (로컬)` 선택
   - API Key: 비워두기 (불필요)
   - Base URL: `http://localhost:11434`
   - 모델: `llama3.2` (또는 설치한 모델명)
   - 저장

---

## 프로젝트 구조

```
HanGroupOS/
├── start.sh                  # 통합 실행 스크립트 (Linux/Mac)
│
├── frontend/
│   ├── public/
│   │   └── logo.png          # HAN Group 로고 (투명 배경 PNG)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx            # 라우팅
│       ├── api/client.ts      # Axios 클라이언트
│       ├── store/useStore.ts  # Zustand 전역 상태
│       ├── components/        # 공통 컴포넌트
│       │   ├── Sidebar.tsx    # 로고 + 네비게이션
│       │   └── ...
│       └── pages/             # 12개 페이지
│           ├── Dashboard.tsx  # 클릭 가능한 통계 카드
│           ├── Chairman.tsx   # AI 허브 (다중 AI 대화)
│           ├── Companies.tsx  # 계열사 설립 + AI 자동 배정
│           ├── LiveOffice.tsx # 픽셀 AI 오피스
│           └── ...
│
└── backend/
    ├── main.py               # FastAPI 진입점
    ├── requirements.txt      # Python 의존성
    ├── core/
    │   ├── config.py         # 환경변수 설정
    │   ├── database.py       # DB 초기화
    │   └── security.py       # JWT 인증
    ├── models/
    │   └── models.py         # 27개 DB 모델 (KpiSyncHistory, WebhookToken 추가)
    ├── schemas/
    │   └── schemas.py        # Pydantic 스키마
    ├── services/
    │   ├── ai_provider.py    # AI 프로바이더 추상화 (Ollama 포함)
    │   └── org_service.py    # 조직 생성 + AI 자동 배정 로직
    └── routers/              # API 엔드포인트 (15개+)
```

---

## API 문서

서버 실행 후 아래 주소에서 Swagger UI로 전체 API를 확인할 수 있습니다.

```
http://localhost:8000/docs
```

주요 엔드포인트:

| 경로 | 설명 |
|------|------|
| `POST /auth/login` | 로그인 (JWT 발급) |
| `GET /companies` | 계열사 목록 |
| `POST /companies?ai_budget=any` | 계열사 설립 (AI 예산 티어 지정) |
| `GET /org/group-tree` | 전체 조직도 트리 |
| `PATCH /org/nodes/{id}` | 조직원 AI 모델 변경 |
| `POST /chat/send` | AI 에이전트 대화 |
| `GET /approvals/inbox` | 결재 수신함 |
| `POST /simulation/run` | 시뮬레이션 실행 |
| `GET /market/reports` | 시장 분석 리포트 |
| `GET /memory` | 기업 메모리 조회 |
| `GET /models/catalog` | AI 모델 카탈로그 |
| `POST /models/recommend` | 역할별 AI 모델 추천 |
| `POST /approvals/{id}/ai-review` | 결재 AI 위험도 사전 검토 |
| `POST /data/auto-tag` | 수집 데이터 AI 자동 태깅 |
| `GET /kpi-links/{id}/history` | KPI 동기화 이력 조회 |
| `GET /competitors/trend` | 경쟁사 주간 트렌드 데이터 |
| `POST /strategy/items/{id}/diagnose` | 전략 아이템 AI 진단 |
| `GET /strategy/items/{id}/genealogy` | 격상 계보 트리 조회 |
| `GET /companies/health-scores` | 계열사 건강 스코어카드 |
| `POST /briefing/generate` | 그룹 주간 브리핑 AI 생성 |
| `POST /webhooks/collect` | 외부 웹훅 데이터 수집 트리거 |
| `GET /webhooks/tokens` | 웹훅 토큰 목록 (관리자) |

---

## 기본 포함 데이터

최초 실행 시 아래 데이터가 자동으로 생성됩니다.

- **계열사**: 없음 (빈 상태에서 시작, 직접 설립)
- **조직**: AI 회장 + 전략위원회, 투자위원회, 데이터위원회
- **AI 모델 카탈로그**: Claude Opus/Sonnet/Haiku, GPT-4o, GPT-4o-mini, Gemini 1.5 Flash, Llama 3.2, Mock
- **전략 이니셔티브** 2개 샘플
- **기업 메모리** 2개 샘플

---

## 문제 해결

**포트 충돌 시**

> `start.sh`는 실행 전에 포트 충돌을 자동 감지하고 해결 방법을 안내합니다.

```bash
# Linux/macOS — 포트 점유 프로세스 확인 및 종료
lsof -i :8000          # 백엔드 포트
fuser -k 8000/tcp      # 강제 종료

# Windows PowerShell
Get-NetTCPConnection -LocalPort 8000 -State Listen
Stop-Process -Id <PID> -Force
```

**Python 패키지 설치 오류 시**
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**npm 설치 오류 시**
```bash
npm cache clean --force
npm install
```

**DB 초기화 (데이터 리셋)**
```bash
rm backend/han_group.db
# 서버 재시작하면 자동으로 재생성됩니다
```
