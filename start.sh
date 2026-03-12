#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ── 색상 정의 ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── OS 감지 ───────────────────────────────────────────────────────────────────
detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    echo "wsl"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "linux"
  else
    echo "unknown"
  fi
}
OS=$(detect_os)

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       HAN Group OS v30 — Startup             ║"
echo "║  AI Corporate Operating System               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1단계: 사전 요구사항 체크 ─────────────────────────────────────────────────
echo -e "${BOLD}[ 1/3 ] 사전 요구사항 확인 중...${NC}"
echo ""

MISSING=0

# ── Python 체크 ───────────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
  PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
  PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
  PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
  if [[ $PY_MAJOR -lt 3 || ($PY_MAJOR -eq 3 && $PY_MINOR -lt 9) ]]; then
    echo -e "  ${RED}✗ Python $PY_VER 감지 — 3.9 이상 필요${NC}"
    echo ""
    echo -e "  ${YELLOW}▶ Python 업그레이드 방법:${NC}"
    case $OS in
      macos)
        echo "    brew install python@3.11"
        ;;
      wsl|linux)
        echo "    sudo apt update && sudo apt install -y python3.11 python3.11-venv python3-pip"
        echo "    sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1"
        ;;
      *)
        echo "    https://www.python.org/downloads/ 에서 3.11+ 다운로드"
        ;;
    esac
    echo ""
    MISSING=1
  else
    echo -e "  ${GREEN}✓ Python $PY_VER${NC}"
  fi
else
  echo -e "  ${RED}✗ Python3가 설치되지 않았습니다${NC}"
  echo ""
  echo -e "  ${YELLOW}▶ Python 설치 방법:${NC}"
  case $OS in
    macos)
      echo "    # Homebrew가 없다면 먼저 설치:"
      echo "    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      echo ""
      echo "    # Python 설치:"
      echo "    brew install python@3.11"
      ;;
    wsl|linux)
      echo "    sudo apt update"
      echo "    sudo apt install -y python3 python3-venv python3-pip"
      ;;
    *)
      echo "    1. https://www.python.org/downloads/ 접속"
      echo "    2. 'Download Python 3.11.x' 클릭 후 설치"
      echo "    3. 설치 시 ☑ 'Add Python to PATH' 체크 필수"
      ;;
  esac
  echo ""
  MISSING=1
fi

# ── pip 체크 ──────────────────────────────────────────────────────────────────
if command -v python3 &>/dev/null && ! python3 -m pip --version &>/dev/null 2>&1; then
  echo -e "  ${RED}✗ pip가 설치되지 않았습니다${NC}"
  echo ""
  echo -e "  ${YELLOW}▶ pip 설치 방법:${NC}"
  case $OS in
    macos)     echo "    python3 -m ensurepip --upgrade" ;;
    wsl|linux) echo "    sudo apt install -y python3-pip" ;;
    *)         echo "    python3 -m ensurepip --upgrade" ;;
  esac
  echo ""
  MISSING=1
fi

# ── Node.js 체크 ──────────────────────────────────────────────────────────────
if command -v node &>/dev/null; then
  NODE_VER=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [[ $NODE_MAJOR -lt 18 ]]; then
    echo -e "  ${RED}✗ Node.js v$NODE_VER 감지 — v18 이상 필요${NC}"
    echo ""
    echo -e "  ${YELLOW}▶ Node.js 업그레이드 방법 (nvm 사용 권장):${NC}"
    echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    echo "    source ~/.bashrc   # 또는 source ~/.zshrc"
    echo "    nvm install 20 && nvm use 20"
    echo ""
    MISSING=1
  else
    echo -e "  ${GREEN}✓ Node.js v$NODE_VER${NC}"
  fi
else
  echo -e "  ${RED}✗ Node.js가 설치되지 않았습니다${NC}"
  echo ""
  echo -e "  ${YELLOW}▶ Node.js 설치 방법:${NC}"
  case $OS in
    macos)
      echo "    # 방법 1 — Homebrew (권장):"
      echo "    brew install node@20"
      echo ""
      echo "    # 방법 2 — 공식 사이트:"
      echo "    https://nodejs.org → 'LTS' 버전 다운로드"
      ;;
    wsl|linux)
      echo "    # nvm으로 설치 (권장):"
      echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
      echo "    source ~/.bashrc && nvm install 20 && nvm use 20"
      echo ""
      echo "    # 또는 apt로 설치:"
      echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
      echo "    sudo apt install -y nodejs"
      ;;
    *)
      echo "    1. https://nodejs.org 접속"
      echo "    2. 'LTS' 버전 다운로드 및 설치"
      ;;
  esac
  echo ""
  MISSING=1
fi

# ── npm 체크 ──────────────────────────────────────────────────────────────────
if command -v node &>/dev/null && ! command -v npm &>/dev/null; then
  echo -e "  ${RED}✗ npm이 설치되지 않았습니다 — Node.js를 재설치하세요${NC}"
  echo "    https://nodejs.org"
  echo ""
  MISSING=1
fi

# ── 누락 항목 있으면 종료 ─────────────────────────────────────────────────────
if [[ $MISSING -eq 1 ]]; then
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}  위 항목을 설치한 후 다시 ./start.sh 를 실행하세요${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 1
fi

# ── 2단계: 포트 충돌 감지 ─────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[ 2/3 ] 포트 사용 현황 확인 중...${NC}"
echo ""

port_in_use() {
  local port=$1
  if command -v lsof &>/dev/null; then
    lsof -ti:"$port" &>/dev/null
  elif command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep -q ":$port "
  elif command -v netstat &>/dev/null; then
    netstat -tlnp 2>/dev/null | grep -q ":$port "
  fi
}

port_process() {
  local port=$1
  if command -v lsof &>/dev/null; then
    lsof -ti:"$port" 2>/dev/null | head -1 | xargs -I{} ps -p {} -o comm= 2>/dev/null || echo "알 수 없는 프로세스"
  else
    echo "알 수 없는 프로세스"
  fi
}

PORT_BLOCKED=0

for PORT in 8000 5173; do
  if port_in_use $PORT; then
    PROC=$(port_process $PORT)
    echo -e "  ${RED}✗ 포트 $PORT 이미 사용 중 — $PROC${NC}"
    echo ""
    echo -e "  ${YELLOW}▶ 해결 방법:${NC}"
    if [[ "$OS" == "macos" ]]; then
      echo "    # 포트 점유 프로세스 확인:"
      echo "    lsof -i :$PORT"
      echo "    # 강제 종료 (PID 확인 후):"
      echo "    kill -9 \$(lsof -ti:$PORT)"
    else
      echo "    # 포트 점유 프로세스 확인:"
      echo "    ss -tlnp | grep :$PORT"
      echo "    # 강제 종료 (PID 확인 후):"
      echo "    fuser -k ${PORT}/tcp"
    fi
    echo ""
    PORT_BLOCKED=1
  else
    echo -e "  ${GREEN}✓ 포트 $PORT 사용 가능${NC}"
  fi
done

if [[ $PORT_BLOCKED -eq 1 ]]; then
  # 터미널이 대화형이면 계속 진행할지 물어보기
  if [ -t 0 ]; then
    echo -e "  ${YELLOW}포트 충돌이 있습니다. 그래도 계속 시작하시겠습니까? (y/N)${NC}"
    read -r -p "  > " CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
      echo ""
      echo "  포트 충돌을 해결한 후 다시 실행하세요."
      exit 1
    fi
  else
    echo -e "  ${RED}포트 충돌로 인해 시작을 중단합니다.${NC}"
    exit 1
  fi
fi

# ── 3단계: 환경 설정 (.env 최초 생성 시 인터랙티브 설정) ────────────────────
echo ""
echo -e "${BOLD}[ 3/3 ] 서버 시작 중...${NC}"
echo ""

cd "$BACKEND"

if [ ! -f ".env" ]; then
  if [ -t 0 ]; then
    # 인터랙티브 터미널일 때만 대화형 설정
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  최초 실행입니다. AI 프로바이더를 설정합니다.${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  사용할 AI 프로바이더를 선택하세요:"
    echo ""
    echo "  1) Mock       — API 키 불필요, 즉시 시작 (테스트용)"
    echo "  2) Ollama     — 로컬 무료 LLM (설치 필요: https://ollama.com)"
    echo "  3) Claude     — Anthropic API 키 필요 (고성능)"
    echo "  4) GPT-4o     — OpenAI API 키 필요 (고성능)"
    echo "  5) Gemini     — Google API 키 필요"
    echo ""
    read -r -p "  선택 [기본값: 1] > " PROVIDER_CHOICE
    PROVIDER_CHOICE="${PROVIDER_CHOICE:-1}"

    ANTHROPIC_KEY=""
    OPENAI_KEY=""
    GEMINI_KEY=""
    OLLAMA_MODEL="llama3.2"
    DEFAULT_PROVIDER="mock"

    case "$PROVIDER_CHOICE" in
      2)
        DEFAULT_PROVIDER="ollama"
        echo ""
        echo "  설치된 Ollama 모델명을 입력하세요."
        read -r -p "  모델명 [기본값: llama3.2] > " INPUT_MODEL
        OLLAMA_MODEL="${INPUT_MODEL:-llama3.2}"
        ;;
      3)
        DEFAULT_PROVIDER="anthropic"
        echo ""
        read -r -p "  Anthropic API 키 (sk-ant-...) > " ANTHROPIC_KEY
        if [[ -z "$ANTHROPIC_KEY" ]]; then
          echo -e "  ${YELLOW}⚠ API 키를 입력하지 않아 Mock 모드로 설정됩니다.${NC}"
          DEFAULT_PROVIDER="mock"
        fi
        ;;
      4)
        DEFAULT_PROVIDER="openai"
        echo ""
        read -r -p "  OpenAI API 키 (sk-...) > " OPENAI_KEY
        if [[ -z "$OPENAI_KEY" ]]; then
          echo -e "  ${YELLOW}⚠ API 키를 입력하지 않아 Mock 모드로 설정됩니다.${NC}"
          DEFAULT_PROVIDER="mock"
        fi
        ;;
      5)
        DEFAULT_PROVIDER="gemini"
        echo ""
        read -r -p "  Google Gemini API 키 > " GEMINI_KEY
        if [[ -z "$GEMINI_KEY" ]]; then
          echo -e "  ${YELLOW}⚠ API 키를 입력하지 않아 Mock 모드로 설정됩니다.${NC}"
          DEFAULT_PROVIDER="mock"
        fi
        ;;
      *)
        DEFAULT_PROVIDER="mock"
        ;;
    esac

    cat > .env <<EOF
SECRET_KEY=han-group-os-secret-key-change-in-production-v30
DATABASE_URL=sqlite:///./han_group.db
DEFAULT_PROVIDER=${DEFAULT_PROVIDER}
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
OPENAI_API_KEY=${OPENAI_KEY}
GEMINI_API_KEY=${GEMINI_KEY}
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=${OLLAMA_MODEL}
EOF
    echo ""
    echo -e "  ${GREEN}✓ .env 생성됨 (프로바이더: ${DEFAULT_PROVIDER})${NC}"
    echo -e "  ${CYAN}  나중에 backend/.env 파일을 직접 수정해 변경할 수 있습니다.${NC}"
    echo ""
  else
    # 비대화형 환경 (파이프, 스크립트 등) — 기본값으로 생성
    cat > .env <<EOF
SECRET_KEY=han-group-os-secret-key-change-in-production-v30
DATABASE_URL=sqlite:///./han_group.db
DEFAULT_PROVIDER=mock
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
EOF
    echo "  ✓ .env 파일 생성됨 (Mock 모드)"
  fi
fi

# ── 가상환경 + 의존성 ─────────────────────────────────────────────────────────
echo "▶ 백엔드 설정 중..."

if [ ! -d "venv" ]; then
  echo "  ✓ 가상환경 생성 중..."
  python3 -m venv venv
fi

source venv/bin/activate
echo "  ✓ 의존성 설치 중..."
pip install -q -r requirements.txt

echo "  ✓ 백엔드 서버 시작 (http://localhost:8000)"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "▶ 프론트엔드 설정 중..."
cd "$FRONTEND"

if [ ! -d "node_modules" ]; then
  echo "  ✓ npm 패키지 설치 중..."
  npm install --silent
fi

echo "  ✓ 프론트엔드 서버 시작 (http://localhost:5173)"
npm run dev &
FRONTEND_PID=$!

# ── Ready ─────────────────────────────────────────────────────────────────────
sleep 3
echo ""
echo "════════════════════════════════════════════════"
echo "  ✅ HAN Group OS v30 실행 중"
echo ""
echo "  🌐 앱:       http://localhost:5173"
echo "  🔧 API:      http://localhost:8000"
echo "  📖 API Docs: http://localhost:8000/docs"
echo ""
echo "  기본 로그인: admin / admin1234"
echo ""
echo "  종료하려면 Ctrl+C를 누르세요."
echo "════════════════════════════════════════════════"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '서버를 종료했습니다.'" EXIT INT TERM

wait
