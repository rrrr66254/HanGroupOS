#!/usr/bin/env bash
# HAN Group OS — 스마트 설치/업데이트 스크립트
#
# 사용법:
#   curl -fsSL https://raw.githubusercontent.com/rrrr66254/HanGroupOS/master/install.sh | bash
#
# 동작:
#   신규 설치  — 클론 + 의존성 + .env 생성
#   재실행(업데이트) — 변경된 부분만 처리, 기존 .env/DB 보존

set -e

HAN_REPO="https://github.com/rrrr66254/HanGroupOS.git"
HAN_VERSION="32"
INSTALL_DIR="$HOME/HanGroupOS"
BIN_DIR="$HOME/.local/bin"
GROUP_DISPLAY_NAME="${GROUP_NAME:-Group OS}"  # 환경변수로 그룹명 오버라이드 가능

# ── 색상 ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     ${GROUP_DISPLAY_NAME} v${HAN_VERSION} — 설치 프로그램       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── OS 감지 ───────────────────────────────────────────────────────────────────
detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then echo "macos"
  elif grep -qi microsoft /proc/version 2>/dev/null; then echo "wsl"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then echo "linux"
  else echo "unknown"
  fi
}
OS=$(detect_os)

# ── 파일 해시 (Linux: sha256sum, macOS: shasum -a 256) ───────────────────────
_file_hash() {
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" 2>/dev/null | cut -d' ' -f1
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1
  else
    echo ""
  fi
}

# ── .env 기본 키 템플릿 ───────────────────────────────────────────────────────
# 새 버전에서 키가 추가될 경우 여기에만 추가하면 기존 설치에 자동 병합됨
ENV_DEFAULTS=(
  "SECRET_KEY=han-group-os-secret-key-change-in-production"
  "DATABASE_URL=sqlite:///./han_group.db"
  "DEFAULT_PROVIDER=mock"
  "ANTHROPIC_API_KEY="
  "OPENAI_API_KEY="
  "GEMINI_API_KEY="
  "OLLAMA_BASE_URL=http://localhost:11434"
  "OLLAMA_MODEL=qwen2.5"
)

# .env 병합: 존재하지 않는 키만 기본값으로 추가, 기존 값은 절대 덮어쓰지 않음
_merge_env() {
  local ENV_FILE="$1"
  local ADDED=0

  if [ ! -f "$ENV_FILE" ]; then
    # 신규 생성
    touch "$ENV_FILE"
    for entry in "${ENV_DEFAULTS[@]}"; do
      echo "$entry" >> "$ENV_FILE"
    done
    echo -e "  ${GREEN}✓ .env 생성됨${NC}"
    return
  fi

  # 기존 파일 — 누락된 키만 추가
  for entry in "${ENV_DEFAULTS[@]}"; do
    local KEY="${entry%%=*}"
    if ! grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
      echo "$entry" >> "$ENV_FILE"
      echo -e "  ${CYAN}  + 새 키 추가: ${KEY}${NC}"
      ADDED=$((ADDED+1))
    fi
  done

  if [ "$ADDED" -eq 0 ]; then
    echo -e "  ${GREEN}✓ .env 최신 상태 (기존 설정 유지)${NC}"
  else
    echo -e "  ${GREEN}✓ .env 에 ${ADDED}개 새 키 추가됨 (기존 값 보존)${NC}"
  fi
}

# ── git 체크 ──────────────────────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  echo -e "${RED}✗ git이 설치되지 않았습니다${NC}"
  echo ""
  echo -e "${YELLOW}▶ git 설치 방법:${NC}"
  case $OS in
    macos)     echo "  brew install git" ;;
    wsl|linux) echo "  sudo apt install -y git" ;;
    *)         echo "  https://git-scm.com/downloads" ;;
  esac
  echo ""
  exit 1
fi

# ── 모드 감지 및 변경 추적 ────────────────────────────────────────────────────
INSTALL_MODE="fresh"    # fresh | update
NEEDS_PIP=true
NEEDS_NPM=true
OLD_HAN_VER=""
BEFORE_COMMIT=""

if [ -d "$INSTALL_DIR/.git" ]; then
  INSTALL_MODE="update"
  OLD_HAN_VER=$(grep '^HAN_VERSION=' "$INSTALL_DIR/han" 2>/dev/null | cut -d'"' -f2 || echo "?")
  BEFORE_COMMIT=$(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "")

  # 의존성 파일 해시 저장 (git pull 전)
  OLD_REQS_HASH=$(_file_hash "$INSTALL_DIR/backend/requirements.txt")
  OLD_PKG_HASH=$(_file_hash "$INSTALL_DIR/frontend/package.json")

  echo -e "${BOLD}기존 설치 발견 (v${OLD_HAN_VER}) — 스마트 업데이트 모드${NC}"
  echo ""
fi

# ── 저장소 클론 또는 git pull ────────────────────────────────────────────────
if [ "$INSTALL_MODE" = "update" ]; then
  echo -e "${BOLD}[ 1/5 ] 소스 코드 업데이트${NC}"
  echo ""
  cd "$INSTALL_DIR"

  if ! git fetch origin master --quiet 2>/dev/null; then
    echo -e "  ${RED}✗ 원격 저장소 연결 실패 — 네트워크를 확인하세요.${NC}"
    exit 1
  fi

  REMOTE_COMMIT=$(git rev-parse origin/master 2>/dev/null || echo "")
  if [ "$BEFORE_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo -e "  ${GREEN}✓ 이미 최신 버전 (${BEFORE_COMMIT})${NC}"
    AFTER_COMMIT="$BEFORE_COMMIT"
  else
    git pull origin master --quiet
    AFTER_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "")
    echo -e "  ${GREEN}✓ 업데이트됨${NC}  ${BEFORE_COMMIT} → ${AFTER_COMMIT}"
    echo ""
    echo -e "  ${DIM}변경된 커밋:${NC}"
    git log "${BEFORE_COMMIT}..HEAD" --oneline 2>/dev/null | head -10 \
      | while IFS= read -r line; do echo "    $line"; done
    echo ""
  fi

  # 의존성 변경 감지 (git pull 후 해시 비교)
  NEW_REQS_HASH=$(_file_hash "$INSTALL_DIR/backend/requirements.txt")
  NEW_PKG_HASH=$(_file_hash "$INSTALL_DIR/frontend/package.json")

  if [ "$OLD_REQS_HASH" = "$NEW_REQS_HASH" ] && [ -d "$INSTALL_DIR/backend/venv" ]; then
    NEEDS_PIP=false
  fi
  if [ "$OLD_PKG_HASH" = "$NEW_PKG_HASH" ] && [ -d "$INSTALL_DIR/frontend/node_modules" ]; then
    NEEDS_NPM=false
  fi
  # venv/node_modules 없으면 강제 설치
  [ ! -d "$INSTALL_DIR/backend/venv" ]         && NEEDS_PIP=true
  [ ! -d "$INSTALL_DIR/frontend/node_modules" ] && NEEDS_NPM=true

else
  echo -e "${BOLD}[ 1/5 ] 소스 코드 다운로드${NC}"
  echo ""
  echo "  경로: $INSTALL_DIR"
  git clone --quiet "$HAN_REPO" "$INSTALL_DIR"
  echo -e "  ${GREEN}✓ 다운로드 완료${NC}"
  echo ""
fi

# ── han CLI 설치 ──────────────────────────────────────────────────────────────
echo -e "${BOLD}[ 2/5 ] han CLI 설치${NC}"
echo ""
mkdir -p "$BIN_DIR"

HAN_CLI_SRC="$INSTALL_DIR/han"
HAN_CLI_DST="$BIN_DIR/han"

chmod +x "$HAN_CLI_SRC"
chmod +x "$INSTALL_DIR/start.sh"
cp "$HAN_CLI_SRC" "$HAN_CLI_DST"
chmod +x "$HAN_CLI_DST"

mkdir -p "$HOME/.han"
echo "HAN_DIR=\"$INSTALL_DIR\"" > "$HOME/.han/config"
echo -e "  ${GREEN}✓ han CLI 설치됨: $HAN_CLI_DST${NC}"

# 실행 검증
if "$HAN_CLI_DST" --version &>/dev/null; then
  VER_OUT=$("$HAN_CLI_DST" --version 2>/dev/null | head -1)
  echo -e "  ${GREEN}✓ 실행 검증 완료: $VER_OUT${NC}"
else
  echo -e "  ${RED}✗ CLI 실행 실패${NC}"
  echo "    $HAN_CLI_DST --version"
  exit 1
fi
echo ""

# ── PATH 자동 등록 ────────────────────────────────────────────────────────────
echo -e "${BOLD}[ 3/5 ] PATH 설정${NC}"
echo ""

SHELL_RC="$HOME/.bashrc"
[[ "$SHELL" == *"zsh"* ]] && SHELL_RC="$HOME/.zshrc"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  if ! grep -qF 'HOME/.local/bin' "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# Group OS CLI" >> "$SHELL_RC"
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
    echo -e "  ${GREEN}✓ PATH 등록됨: $SHELL_RC${NC}"
  else
    echo -e "  ${GREEN}✓ PATH 이미 rc 파일에 존재${NC}"
  fi
  export PATH="$BIN_DIR:$PATH"
  echo -e "  ${GREEN}✓ PATH 현재 세션 즉시 적용됨${NC}"
else
  echo -e "  ${GREEN}✓ PATH 이미 설정됨${NC}"
fi
echo ""

# ── 스마트 의존성 설치 ────────────────────────────────────────────────────────
echo -e "${BOLD}[ 4/5 ] 의존성 설치${NC}"
echo ""

# Python venv + pip
if $NEEDS_PIP; then
  if [ ! -d "$INSTALL_DIR/backend/venv" ]; then
    echo -e "  ${CYAN}▸ Python 가상환경 생성 중...${NC}"
    if python3 -m venv "$INSTALL_DIR/backend/venv"; then
      echo -e "  ${GREEN}✓ venv 생성됨${NC}"
    else
      echo -e "  ${RED}✗ venv 생성 실패 (python3 확인 필요)${NC}"
    fi
  fi
  if [ -d "$INSTALL_DIR/backend/venv" ]; then
    echo -e "  ${CYAN}▸ pip install -r requirements.txt ...${NC}"
    if "$INSTALL_DIR/backend/venv/bin/pip" install -q -r "$INSTALL_DIR/backend/requirements.txt"; then
      echo -e "  ${GREEN}✓ 백엔드 패키지 설치 완료${NC}"
    else
      echo -e "  ${RED}✗ pip install 실패${NC}"
    fi
  fi
else
  echo -e "  ${GREEN}✓ 백엔드 의존성 변경 없음 — 건너뜀${NC}"
fi

# npm install
if $NEEDS_NPM; then
  echo -e "  ${CYAN}▸ npm install ...${NC}"
  if (cd "$INSTALL_DIR/frontend" && npm install --silent); then
    echo -e "  ${GREEN}✓ npm install 완료${NC}"
  else
    echo -e "  ${RED}✗ npm install 실패${NC}"
  fi
else
  echo -e "  ${GREEN}✓ 프론트엔드 의존성 변경 없음 — 건너뜀${NC}"
fi
echo ""

# ── .env 스마트 처리 (보존 + 신규 키 병합) ───────────────────────────────────
echo -e "${BOLD}[ 5/5 ] 설정 파일 (.env)${NC}"
echo ""
ENV_FILE="$INSTALL_DIR/backend/.env"

if [ "$INSTALL_MODE" = "update" ] && [ -f "$ENV_FILE" ]; then
  echo -e "  기존 .env 보존 — 누락된 키만 추가합니다"
  _merge_env "$ENV_FILE"
else
  _merge_env "$ENV_FILE"
fi

# DB 파일 존재 여부 확인
DB_FILE="$INSTALL_DIR/backend/han_group.db"
if [ -f "$DB_FILE" ]; then
  DB_SIZE=$(du -sh "$DB_FILE" 2>/dev/null | cut -f1)
  echo -e "  ${GREEN}✓ 기존 DB 보존됨${NC} ($DB_SIZE — $DB_FILE)"
fi
echo ""

# ── 완료 메시지 ───────────────────────────────────────────────────────────────
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
if [ "$INSTALL_MODE" = "update" ]; then
  echo -e "${GREEN}  ✅ ${GROUP_DISPLAY_NAME} 업데이트 완료! (v${OLD_HAN_VER} → v${HAN_VERSION})${NC}"
else
  echo -e "${GREEN}  ✅ ${GROUP_DISPLAY_NAME} v${HAN_VERSION} 설치 완료!${NC}"
fi
echo ""
echo "  설치 경로: $INSTALL_DIR"
echo "  han CLI:   $HAN_CLI_DST"
echo ""

# PATH 안내 (curl|bash는 서브쉘이라 부모 터미널에 export 전파 안 됨)
echo -e "${YELLOW}  ※ 'han' 명령을 현재 터미널에서 쓰려면:${NC}"
echo "    source $SHELL_RC        (현재 터미널 즉시 적용)"
echo "    또는 새 터미널을 열면 자동 적용됩니다."
echo ""
echo -e "  PATH 적용 전 전체 경로 실행:"
echo "    $HAN_CLI_DST start --daemon"
echo ""
echo -e "${BOLD}  주요 명령 (PATH 적용 후):${NC}"
echo "    han start --daemon   han stop   han status"
echo "    han update           han logs   han help"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""

# ── 서버 즉시 시작 여부 ───────────────────────────────────────────────────────
if [ -t 0 ]; then
  read -r -p "  지금 바로 서버를 백그라운드로 시작하시겠습니까? (Y/n) > " START_NOW
  START_NOW="${START_NOW:-Y}"
  if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
    echo ""
    "$HAN_CLI_DST" start --daemon
    echo ""
    echo -e "  ${CYAN}PATH 적용: source $SHELL_RC${NC}"
  else
    echo ""
    echo -e "  시작: ${CYAN}source $SHELL_RC && han start --daemon${NC}"
    echo -e "  또는: ${CYAN}$HAN_CLI_DST start --daemon${NC}"
  fi
fi
