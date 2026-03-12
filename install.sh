#!/usr/bin/env bash
# HAN Group OS — 설치 스크립트
#
# 사용법:
#   curl -fsSL https://raw.githubusercontent.com/rrrr66254/HanGroupOS/master/install.sh | bash
#
# 설치 후:
#   han start          # 서버 시작
#   han --version      # 버전 확인
#   han help           # 도움말

set -e

HAN_REPO="https://github.com/rrrr66254/HanGroupOS.git"
HAN_VERSION="30"
INSTALL_DIR="$HOME/HanGroupOS"
BIN_DIR="$HOME/.local/bin"

# ── 색상 ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     HAN Group OS v${HAN_VERSION} — 설치 프로그램       ║${NC}"
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

# ── git 체크 ──────────────────────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  echo -e "${RED}✗ git이 설치되지 않았습니다${NC}"
  echo ""
  echo -e "${YELLOW}▶ git 설치 방법:${NC}"
  case $OS in
    macos)  echo "  brew install git" ;;
    wsl|linux) echo "  sudo apt install -y git" ;;
    *) echo "  https://git-scm.com/downloads" ;;
  esac
  echo ""
  exit 1
fi

# ── 저장소 클론 또는 업데이트 ────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${BOLD}기존 설치 발견 — 업데이트 중...${NC}"
  cd "$INSTALL_DIR"
  git pull origin master --quiet
  echo -e "  ${GREEN}✓ 최신 버전으로 업데이트됨${NC}"
else
  echo -e "${BOLD}HAN Group OS 다운로드 중...${NC}"
  echo "  경로: $INSTALL_DIR"
  git clone --quiet "$HAN_REPO" "$INSTALL_DIR"
  echo -e "  ${GREEN}✓ 다운로드 완료${NC}"
fi

# ── han CLI 설치 ($HOME/.local/bin 고정) ─────────────────────────────────────
mkdir -p "$BIN_DIR"

HAN_CLI_SRC="$INSTALL_DIR/han"
HAN_CLI_DST="$BIN_DIR/han"

chmod +x "$HAN_CLI_SRC"
chmod +x "$INSTALL_DIR/start.sh"

cp "$HAN_CLI_SRC" "$HAN_CLI_DST"
chmod +x "$HAN_CLI_DST"

# HAN_DIR 설정 저장
mkdir -p "$HOME/.han"
echo "HAN_DIR=\"$INSTALL_DIR\"" > "$HOME/.han/config"

echo -e "  ${GREEN}✓ han CLI 설치됨: $HAN_CLI_DST${NC}"

# ── 설치 검증 ─────────────────────────────────────────────────────────────────
if "$HAN_CLI_DST" --version &>/dev/null; then
  VER_OUT=$("$HAN_CLI_DST" --version 2>/dev/null | head -1)
  echo -e "  ${GREEN}✓ CLI 실행 검증 완료: $VER_OUT${NC}"
else
  echo -e "  ${RED}✗ CLI 실행 실패 — 아래 명령으로 수동 실행 후 확인하세요:${NC}"
  echo "    $HAN_CLI_DST --version"
  exit 1
fi

# ── PATH 자동 등록 (프롬프트 없이 즉시 처리) ──────────────────────────────────
SHELL_RC=""
if [[ "$SHELL" == *"zsh"* ]]; then
  SHELL_RC="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
  SHELL_RC="$HOME/.bashrc"
else
  # 기본값: .bashrc
  SHELL_RC="$HOME/.bashrc"
fi

PATH_LINE="export PATH=\"\$HOME/.local/bin:\$PATH\""

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  # 아직 추가되지 않은 경우에만 rc 파일에 추가
  if ! grep -qF 'HOME/.local/bin' "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# HAN Group OS CLI" >> "$SHELL_RC"
    echo "$PATH_LINE" >> "$SHELL_RC"
    echo -e "  ${GREEN}✓ PATH 등록됨: $SHELL_RC${NC}"
  fi
  # 현재 세션에도 즉시 적용
  export PATH="$BIN_DIR:$PATH"
  echo -e "  ${GREEN}✓ PATH 현재 세션에 적용됨${NC}"
else
  echo -e "  ${GREEN}✓ PATH 이미 설정됨${NC}"
fi

# ── 환경 자동 점검 및 수정 ────────────────────────────────────────────────────
echo -e "${BOLD}🔍 환경 점검 중 (han init_check --fix)...${NC}"
echo ""
"$HAN_CLI_DST" init_check --fix || true   # 실패해도 설치 계속 진행
echo ""

# ── 완료 메시지 ───────────────────────────────────────────────────────────────
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ HAN Group OS v${HAN_VERSION} 설치 완료!${NC}"
echo ""
echo "  설치 경로: $INSTALL_DIR"
echo "  han CLI:   $HAN_CLI_DST"
echo ""

# ── PATH 적용 안내 (curl|bash 는 서브쉘이라 export가 부모 터미널에 전파 안 됨) ──
echo -e "${YELLOW}  ※ 'han' 명령을 바로 쓰려면 아래 중 하나를 실행하세요:${NC}"
echo ""
echo -e "  ${CYAN}방법 1) 현재 터미널에서 즉시 적용:${NC}"
echo "    source $SHELL_RC"
echo ""
echo -e "  ${CYAN}방법 2) 새 터미널을 열면 자동 적용됩니다.${NC}"
echo ""
echo -e "  ${CYAN}방법 3) 전체 경로로 바로 실행:${NC}"
echo "    $HAN_CLI_DST start --daemon"
echo ""
echo -e "${BOLD}  사용 방법 (PATH 적용 후):${NC}"
echo ""
echo "    han start --daemon  # 백그라운드 시작"
echo "    han status          # 실행 상태 확인"
echo "    han stop            # 서버 종료"
echo "    han logs            # 로그 보기"
echo "    han update          # 업데이트"
echo "    han help            # 전체 도움말"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""

# ── 서버 즉시 시작 여부 (--daemon, 전체 경로 사용) ───────────────────────────
if [ -t 0 ]; then
  read -r -p "  지금 바로 서버를 백그라운드로 시작하시겠습니까? (Y/n) > " START_NOW
  START_NOW="${START_NOW:-Y}"
  if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
    echo ""
    "$HAN_CLI_DST" start --daemon
    echo ""
    echo -e "  ${CYAN}서버 시작 후 터미널 PATH 적용: source $SHELL_RC${NC}"
  else
    echo ""
    echo -e "  시작하려면: ${CYAN}source $SHELL_RC && han start --daemon${NC}"
    echo -e "  또는      : ${CYAN}$HAN_CLI_DST start --daemon${NC}"
  fi
fi
