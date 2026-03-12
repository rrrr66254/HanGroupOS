# HAN Group OS — Windows PowerShell 설치 스크립트
# 사용법 (PowerShell에서):
#   irm https://raw.githubusercontent.com/rrrr66254/HanGroupOS/master/install.ps1 | iex

$ErrorActionPreference = "Stop"

$HAN_VERSION = "30"
$HAN_REPO    = "https://github.com/rrrr66254/HanGroupOS.git"
$INSTALL_DIR = "$env:USERPROFILE\HanGroupOS"
$HAN_CFG_DIR = "$env:USERPROFILE\.han"
$HAN_BIN     = "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps"

# ── 배너 ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   HAN Group OS v$HAN_VERSION — Windows 설치 프로그램  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 필수 프로그램 체크 ────────────────────────────────────────────────────────
Write-Host "[ 1/3 ] 필수 프로그램 확인 중..." -ForegroundColor White
Write-Host ""

$MISSING = $false

# Git 체크
try {
    $gitVer = & git --version 2>&1
    Write-Host "  ✓ $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  ✗ git 미설치" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ▶ git 설치 방법:" -ForegroundColor Yellow
    Write-Host "    winget install Git.Git"
    Write-Host "    또는 https://git-scm.com/downloads"
    Write-Host ""
    $MISSING = $true
}

# Python 체크
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]; $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 9) {
                Write-Host "  ✓ Python $major.$minor" -ForegroundColor Green
                $pythonCmd = $cmd; break
            } else {
                Write-Host "  ✗ Python $major.$minor — 3.9+ 필요" -ForegroundColor Red
                Write-Host ""
                Write-Host "  ▶ Python 업그레이드:" -ForegroundColor Yellow
                Write-Host "    winget install Python.Python.3.11"
                Write-Host "    또는 https://www.python.org/downloads/ (☑ Add to PATH 체크)"
                Write-Host ""
                $MISSING = $true; break
            }
        }
    } catch { continue }
}

if (-not $pythonCmd -and -not $MISSING) {
    Write-Host "  ✗ Python 미설치" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ▶ Python 설치:" -ForegroundColor Yellow
    Write-Host "    winget install Python.Python.3.11"
    Write-Host "    또는 https://www.python.org/downloads/"
    Write-Host "    ※ 설치 시 ☑ 'Add Python to PATH' 반드시 체크"
    Write-Host ""
    $MISSING = $true
}

# Node.js 체크
try {
    $nodeVer = & node --version 2>&1
    if ($nodeVer -match "v(\d+)\.") {
        $nodeMajor = [int]$Matches[1]
        if ($nodeMajor -ge 18) {
            Write-Host "  ✓ Node.js $nodeVer" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Node.js $nodeVer — v18+ 필요" -ForegroundColor Red
            Write-Host ""
            Write-Host "  ▶ Node.js 업그레이드:" -ForegroundColor Yellow
            Write-Host "    winget install OpenJS.NodeJS.LTS"
            Write-Host "    또는 https://nodejs.org (LTS 버전)"
            Write-Host ""
            $MISSING = $true
        }
    }
} catch {
    Write-Host "  ✗ Node.js 미설치" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ▶ Node.js 설치:" -ForegroundColor Yellow
    Write-Host "    winget install OpenJS.NodeJS.LTS"
    Write-Host "    또는 https://nodejs.org (LTS 버전)"
    Write-Host ""
    $MISSING = $true
}

if ($MISSING) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host "  위 항목 설치 후 PowerShell을 재시작하고 다시 실행하세요." -ForegroundColor Red
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    exit 1
}

# ── 저장소 클론 / 업데이트 ───────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 2/3 ] HAN Group OS 다운로드 중..." -ForegroundColor White
Write-Host ""

if (Test-Path (Join-Path $INSTALL_DIR ".git")) {
    Write-Host "  기존 설치 발견 — 업데이트 중..."
    Set-Location $INSTALL_DIR
    & git pull origin master --quiet
    Write-Host "  ✓ 최신 버전으로 업데이트됨" -ForegroundColor Green
} else {
    Write-Host "  경로: $INSTALL_DIR"
    & git clone --quiet $HAN_REPO $INSTALL_DIR
    Write-Host "  ✓ 다운로드 완료" -ForegroundColor Green
}

# ── han.cmd 래퍼 생성 (PATH에 추가) ─────────────────────────────────────────
Write-Host ""
Write-Host "[ 3/3 ] han 명령어 등록 중..." -ForegroundColor White
Write-Host ""

New-Item -ItemType Directory -Force -Path $HAN_CFG_DIR | Out-Null

# config 저장
"HAN_DIR=`"$INSTALL_DIR`"" | Set-Content "$HAN_CFG_DIR\config" -Encoding UTF8

# han.cmd 생성 — bash가 있으면 bash han 호출, 없으면 start.ps1 호출
$HAN_CMD_PATH = "$INSTALL_DIR\han.cmd"
@"
@echo off
where bash >nul 2>&1
if %ERRORLEVEL% == 0 (
    bash "%~dp0han" %*
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
)
"@ | Set-Content $HAN_CMD_PATH -Encoding ASCII

# PATH 등록 (User scope)
$UserPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$INSTALL_DIR*") {
    [System.Environment]::SetEnvironmentVariable(
        "PATH",
        "$INSTALL_DIR;$UserPath",
        "User"
    )
    Write-Host "  ✓ PATH에 $INSTALL_DIR 추가됨" -ForegroundColor Green
    Write-Host "  ※ 새 PowerShell 창을 열어야 han 명령이 인식됩니다." -ForegroundColor Yellow
} else {
    Write-Host "  ✓ PATH 이미 설정됨" -ForegroundColor Green
}

# ── 완료 ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ HAN Group OS v$HAN_VERSION 설치 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "  설치 경로: $INSTALL_DIR"
Write-Host ""
Write-Host "  PowerShell을 새로 열고 아래 명령어를 사용하세요:" -ForegroundColor White
Write-Host ""
Write-Host "    han start           # 서버 시작"
Write-Host "    han start --daemon  # 백그라운드 시작"
Write-Host "    han status          # 실행 상태"
Write-Host "    han stop            # 서버 종료"
Write-Host "    han init_check      # 환경 점검"
Write-Host "    han update          # 업데이트"
Write-Host "    han --version       # 버전 확인"
Write-Host "    han help            # 전체 도움말"
Write-Host ""
Write-Host "  ※ bash/WSL이 없는 환경에서는 .\start.ps1 을 직접 실행하세요." -ForegroundColor DarkGray
Write-Host "════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

# 지금 바로 시작 여부
$ans = Read-Host "  지금 바로 서버를 시작하시겠습니까? (Y/n)"
if (-not $ans -or $ans -match "^[Yy]$") {
    Set-Location $INSTALL_DIR
    & powershell -ExecutionPolicy Bypass -File ".\start.ps1"
}
