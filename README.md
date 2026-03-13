# Group OS v31
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
| **AI 에이전트 성과 분석** | 에이전트별 응답 품질, 토큰 사용량, 처리 시간 대시보드 |
| **픽셀 AI 오피스** | AI 캐릭터가 실시간으로 움직이는 픽셀아트 사무실 |
| **역할별 AI 자동 배정** | 계열사 설립 시 직급·역할에 맞는 AI 모델 자동 배정 |
| **실시간 대시보드** | WebSocket 기반 실시간 KPI 변동, 승인 알림, 이벤트 반영 |
| **다국어 지원 (i18n)** | 한국어·영어·일본어 UI 전환 (헤더에서 즉시 변경) |
| **Docker Compose 배포** | 백엔드+프론트엔드+Ollama 원클릭 컨테이너 배포 |
| **pytest 테스트** | 인증·회사·승인·그룹설정 API 테스트 코드 |
| **조직도 관리** | 회장 → 위원회 → 계열사 → 직책 계층 구조 |
| **결재 워크플로우 + AI 사전 검토** | 요청 → AI 위험도 분석 → 승인/반려 파이프라인 |
| **시장 분석 + 경쟁사 트렌드** | 산업별 기회/위협 리포트, 경쟁사 주간 뉴스량 차트 |
| **전략 트래킹 + AI 진단** | 목표·이니셔티브·마일스톤·KPI 관리, AI 건강 진단 |
| **KPI 이력 + 스파크라인** | KPI 동기화 이력 추적, SVG 스파크라인 시각화 |
| **계열사 건강 스코어카드** | 진척률·KPI·데이터 종합 건강 점수 |
| **그룹 주간 브리핑** | 최근 7일 데이터 기반 AI 자동 마크다운 브리핑 생성 |
| **멀티 AI 프로바이더** | Claude, GPT-4o, Gemini, Ollama (무료 로컬), Mock |

---

## v31 업데이트 내역

### 1. 동적 그룹 이름 설정
- 하드코딩된 "HAN Group"/"한그룹" 완전 제거
- `GroupSettings` DB 모델로 그룹 이름/슬로건 저장
- `GET/PATCH /api/group-settings` API
- 관리자 페이지에 "그룹 설정" 탭 추가 (미리보기 포함)
- 로그인 화면, 사이드바, 헤더, 대시보드, 그룹홈 등 전체 UI 동적 반영

### 2. pytest 기반 API 테스트
- `backend/tests/` 디렉토리 생성
- `conftest.py` — 테스트용 인메모리 DB, FastAPI TestClient
- `test_auth.py` — 로그인, 인증 테스트
- `test_companies.py` — 회사 CRUD 테스트
- `test_approvals.py` — 승인 워크플로우 테스트
- `test_group_settings.py` — 그룹 설정 API 테스트

### 3. Docker Compose 배포
- `docker-compose.yml` — backend + frontend + Ollama GPU 지원
- `backend/Dockerfile` — Python 3.11 기반
- `frontend/Dockerfile` — Node 빌드 → Nginx 서빙
- `frontend/nginx.conf` — SPA 라우팅 + API/WS 프록시

### 4. 실시간 대시보드 WebSocket
- 대시보드에 WebSocket 연결 (`/ws/notifications`)
- 실시간 LIVE 상태 표시 (연결/해제)
- 알림 수신 시 KPI, 승인, 계열사 데이터 자동 갱신

### 5. 다국어(i18n) 지원
- `frontend/src/i18n/` — 한국어(ko), 영어(en), 일본어(ja) 번역 파일
- `useI18nStore` Zustand 스토어 (localStorage 영속화)
- 헤더에 언어 선택 드롭다운 추가 (즉시 전환)

### 6. AI 에이전트 성과 분석 대시보드
- `AiAgentMetrics` DB 모델 — 토큰, 응답시간, 품질 기록
- `GET /api/agent-metrics/summary` — 에이전트별/프로바이더별/일별 집계
- `GET /api/agent-metrics/recent` — 최근 호출 이력
- `/agent-performance` 페이지 — KPI 카드, 일별 추이 차트, 프로바이더 파이 차트, 에이전트 랭킹 바 차트

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

**배포**
- Docker Compose (backend + frontend + Ollama)
- Nginx (프론트엔드 서빙 + API 프록시)

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

```bash
cd backend
pip install pytest httpx
pytest tests/ -v
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
├── docker-compose.yml        # 컨테이너 배포 설정
├── frontend/
│   ├── Dockerfile            # 프론트엔드 컨테이너
│   ├── nginx.conf            # Nginx 설정
│   ├── src/
│   │   ├── i18n/             # 다국어 번역 (ko/en/ja)
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
    └── models/models.py       # GroupSettings, AiAgentMetrics 모델 추가
```

---

## API 문서

서버 실행 후: `http://localhost:8000/docs`

### 신규 API (v31)

| 경로 | 설명 |
|------|------|
| `GET /api/group-settings` | 그룹 설정 조회 |
| `PATCH /api/group-settings` | 그룹 설정 변경 (이름, 슬로건) |
| `GET /api/agent-metrics/summary` | AI 에이전트 성과 요약 |
| `GET /api/agent-metrics/recent` | 최근 AI 호출 이력 |

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
