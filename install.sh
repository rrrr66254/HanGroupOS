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
BIN_CANDIDATES=("$HOME/.local/bin" "$HOME/bin")

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

# ── han CLI 설치할 경로 결정 (쓰기 가능한 사용자 경로 우선) ─────────────────
BIN_DIR=""
for candidate in "${BIN_CANDIDATES[@]}"; do
  if [ -w "$candidate" ] 2>/dev/null || ( mkdir -p "$candidate" 2>/dev/null && [ -w "$candidate" ] ); then
    BIN_DIR="$candidate"
    break
  fi
done

# 여전히 없으면 ~/.local/bin 생성
if [ -z "$BIN_DIR" ]; then
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
fi

# ── han 스크립트 설치 ─────────────────────────────────────────────────────────
HAN_CLI_SRC="$INSTALL_DIR/han"
HAN_CLI_DST="$BIN_DIR/han"

chmod +x "$HAN_CLI_SRC"
chmod +x "$INSTALL_DIR/start.sh"

# han CLI에 설치 경로 주입
cp "$HAN_CLI_SRC" "$HAN_CLI_DST"
chmod +x "$HAN_CLI_DST"

# HAN_DIR 설정 저장
mkdir -p "$HOME/.han"
echo "HAN_DIR=\"$INSTALL_DIR\"" > "$HOME/.han/config"

echo -e "  ${GREEN}✓ han CLI 설치됨: $HAN_CLI_DST${NC}"

# ── PATH 설정 안내 ────────────────────────────────────────────────────────────
PATH_UPDATE_NEEDED=false
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  PATH_UPDATE_NEEDED=true
  echo ""
  echo -e "${YELLOW}⚠ $BIN_DIR 이 PATH에 없습니다. 아래 명령을 실행해 추가하세요:${NC}"
  echo ""

  SHELL_RC=""
  if [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_RC="$HOME/.zshrc"
  elif [[ "$SHELL" == *"bash"* ]]; then
    SHELL_RC="$HOME/.bashrc"
  fi

  if [ -n "$SHELL_RC" ]; then
    echo -e "  ${CYAN}# 아래 줄을 $SHELL_RC 에 추가하세요:${NC}"
    echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> $SHELL_RC"
    echo "  source $SHELL_RC"

    # 자동 추가 여부 물어보기
    if [ -t 0 ]; then
      echo ""
      read -r -p "  지금 자동으로 추가할까요? (Y/n) > " AUTO_ADD
      AUTO_ADD="${AUTO_ADD:-Y}"
      if [[ "$AUTO_ADD" =~ ^[Yy]$ ]]; then
        echo "" >> "$SHELL_RC"
        echo "# HAN Group OS CLI" >> "$SHELL_RC"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
        export PATH="$HOME/.local/bin:$PATH"
        echo -e "  ${GREEN}✓ PATH 업데이트됨${NC}"
        PATH_UPDATE_NEEDED=false
      fi
    fi
  else
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
fi

# ── 완료 메시지 ───────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ HAN Group OS v${HAN_VERSION} 설치 완료!${NC}"
echo ""
echo "  설치 경로: $INSTALL_DIR"
echo "  han CLI:   $HAN_CLI_DST"
echo ""
echo -e "${BOLD}  사용 방법:${NC}"
echo ""
if [ "$PATH_UPDATE_NEEDED" = true ]; then
  echo -e "  ${YELLOW}※ 아직 PATH 설정이 필요합니다. 위 안내를 참고하세요.${NC}"
  echo "  그 전까지는 아래 방법으로 실행:"
  echo "    $INSTALL_DIR/han start"
  echo "    $INSTALL_DIR/han --version"
else
  echo "    han start           # 서버 시작"
  echo "    han start --daemon  # 백그라운드 시작"
  echo "    han status          # 실행 상태 확인"
  echo "    han stop            # 서버 종료"
  echo "    han logs            # 로그 보기"
  echo "    han update          # 업데이트"
  echo "    han reset           # DB 초기화"
  echo "    han --version       # 버전 확인"
  echo "    han help            # 전체 도움말"
fi
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""

# ── 바로 시작 여부 ────────────────────────────────────────────────────────────
if [ -t 0 ] && [ "$PATH_UPDATE_NEEDED" = false ]; then
  read -r -p "  지금 바로 서버를 시작하시겠습니까? (Y/n) > " START_NOW
  START_NOW="${START_NOW:-Y}"
  if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
    exec "$INSTALL_DIR/start.sh"
  fi
fi
