#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       HAN Group OS v27 — Startup             ║"
echo "║  AI Corporate Operating System               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Backend ───────────────────────────────────────────────────────────────────
echo "▶ 백엔드 설정 중..."

cd "$BACKEND"

# Create .env if not exists
if [ ! -f ".env" ]; then
  cat > .env <<EOF
SECRET_KEY=han-group-os-secret-key-change-in-production-v27
DATABASE_URL=sqlite:///./han_group.db
DEFAULT_PROVIDER=mock
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
EOF
  echo "  ✓ .env 파일 생성됨"
fi

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "  ✗ Python3가 설치되지 않았습니다."
  exit 1
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

if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js가 설치되지 않았습니다."
  kill $BACKEND_PID 2>/dev/null || true
  exit 1
fi

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
echo "  ✅ HAN Group OS v27 실행 중"
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
