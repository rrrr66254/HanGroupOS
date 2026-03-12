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
NC='\033[0m' # No Color

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

# ── 사전 요구사항 체크 ────────────────────────────────────────────────────────
echo -e "${BOLD}[ 1/2 ] 사전 요구사항 확인 중...${NC}"
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
    macos)
      echo "    python3 -m ensurepip --upgrade"
      ;;
    wsl|linux)
      echo "    sudo apt install -y python3-pip"
      ;;
    *)
      echo "    python3 -m ensurepip --upgrade"
      ;;
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
    echo "    # nvm 설치:"
    echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    echo "    source ~/.bashrc   # 또는 source ~/.zshrc"
    echo ""
    echo "    # Node.js 20 LTS 설치:"
    echo "    nvm install 20"
    echo "    nvm use 20"
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
      echo "    source ~/.bashrc"
      echo "    nvm install 20"
      echo "    nvm use 20"
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
  echo -e "  ${RED}✗ npm이 설치되지 않았습니다${NC}"
  echo ""
  echo -e "  ${YELLOW}▶ npm은 Node.js에 포함되어 있습니다. Node.js를 재설치해 주세요.${NC}"
  echo "    https://nodejs.org"
  echo ""
  MISSING=1
fi

# ── 누락된 요구사항이 있으면 종료 ─────────────────────────────────────────────
if [[ $MISSING -eq 1 ]]; then
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}  위 항목을 설치한 후 다시 ./start.sh 를 실행하세요.${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exit 1
fi

echo ""
echo -e "${BOLD}[ 2/2 ] 서버 시작 중...${NC}"
echo ""

# ── Backend ───────────────────────────────────────────────────────────────────
echo "▶ 백엔드 설정 중..."

cd "$BACKEND"

# Create .env if not exists
if [ ! -f ".env" ]; then
  cat > .env <<EOF
SECRET_KEY=han-group-os-secret-key-change-in-production-v30
DATABASE_URL=sqlite:///./han_group.db
DEFAULT_PROVIDER=mock
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
EOF
  echo "  ✓ .env 파일 생성됨"
fi

# Create virtualenv if not exists
if [ ! -d "venv" ]; then
  echo "  ✓ 가상환경 생성 중..."
  python3 -m venv venv
fi

# Activate and install
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

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '서버를 종료했습니다.'" EXIT INT TERM

wait
