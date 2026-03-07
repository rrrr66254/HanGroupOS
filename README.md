# HAN Group OS v27
**AI 기반 기업 운영 시스템 (AI Corporate Operating System)**

그룹사 전체를 AI 에이전트로 운영하는 통합 플랫폼입니다. 회장 AI부터 각 계열사 CEO까지 역할별 AI 에이전트를 배치하고, 경영 의사결정·승인·회의·전략·시장분석을 하나의 시스템에서 처리합니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **AI 회장실** | Claude/GPT-4o/Gemini 기반 전략 의사결정 |
| **조직도 관리** | 회장 → 위원회 → 계열사 → 직책 계층 구조 |
| **결재 워크플로우** | 요청 → 검토 → 승인/반려 파이프라인 |
| **회의 관리** | 일정 수립, AI 참여, 회의록 자동 생성 |
| **시장 분석** | 산업별 기회/위협 리포트 |
| **전략 트래킹** | 목표·이니셔티브·마일스톤·KPI 관리 |
| **비즈니스 시뮬레이션** | What-if 시나리오 분석 |
| **기업 메모리** | 의사결정·사실·교훈 등 기관 지식 축적 |
| **Live Office** | AI 에이전트 실시간 활동 모니터링 |
| **멀티 AI 프로바이더** | Claude, GPT-4o, Gemini, Ollama, Mock 전환 가능 |

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
- Ollama (로컬 Llama)
- Mock (API 키 없이 테스트)

---

## 실행 방법

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

# 로컬 AI (Ollama 사용 시)
OLLAMA_BASE_URL=http://localhost:11434
```

API 키 없이 시작하려면 `DEFAULT_PROVIDER=mock` 상태로 두면 됩니다.

---

## 프로젝트 구조

```
HanGroupOS/
├── start.sh                  # 통합 실행 스크립트 (Linux/Mac)
│
├── backend/
│   ├── main.py               # FastAPI 진입점
│   ├── requirements.txt      # Python 의존성
│   ├── core/
│   │   ├── config.py         # 환경변수 설정
│   │   ├── database.py       # DB 초기화
│   │   └── security.py       # JWT 인증
│   ├── models/
│   │   └── models.py         # 25개 DB 모델
│   ├── schemas/
│   │   └── schemas.py        # Pydantic 스키마
│   ├── services/
│   │   ├── ai_provider.py    # AI 프로바이더 추상화
│   │   └── org_service.py    # 조직 생성 로직
│   └── routers/              # API 엔드포인트 (13개)
│       ├── auth.py
│       ├── companies.py
│       ├── org.py
│       ├── chat.py
│       ├── approvals.py
│       ├── meetings.py
│       ├── market.py
│       ├── simulation.py
│       ├── ai_models.py
│       ├── memory.py
│       ├── strategy.py
│       └── knowledge.py
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx            # 라우팅
        ├── api/client.ts      # Axios 클라이언트
        ├── store/useStore.ts  # Zustand 전역 상태
        ├── components/        # 공통 컴포넌트
        │   ├── Layout.tsx
        │   ├── Sidebar.tsx
        │   ├── Header.tsx
        │   └── OrgChart.tsx
        └── pages/             # 12개 페이지
            ├── Dashboard.tsx
            ├── Chairman.tsx
            ├── Companies.tsx
            ├── Approvals.tsx
            ├── Meetings.tsx
            ├── Market.tsx
            ├── Strategy.tsx
            ├── Simulation.tsx
            ├── Memory.tsx
            ├── LiveOffice.tsx
            └── Admin.tsx
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
| `GET /org/group-tree` | 전체 조직도 트리 |
| `POST /chat/{session_id}/message` | AI 에이전트 대화 |
| `GET /approvals/inbox` | 결재 수신함 |
| `POST /simulation/run` | 시뮬레이션 실행 |
| `GET /market/reports` | 시장 분석 리포트 |
| `GET /memory` | 기업 메모리 조회 |

---

## 기본 포함 데이터

최초 실행 시 아래 데이터가 자동으로 생성됩니다.

- **계열사 3개**: 한미디어, 한소프트, 한데이터
- **조직**: AI 회장 + 전략위원회, 투자위원회, 데이터위원회
- **AI 모델 카탈로그**: Claude Opus/Sonnet/Haiku, GPT-4o, GPT-4o-mini, Gemini 1.5 Flash, Llama 3.2, Mock
- **전략 이니셔티브** 3개 샘플
- **기업 메모리** 2개 샘플

---

## 문제 해결

**포트 충돌 시**
```bash
# 8000번 포트 사용 프로세스 확인 (Windows)
netstat -ano | findstr :8000

# 5173번 포트 사용 프로세스 확인
netstat -ano | findstr :5173
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
