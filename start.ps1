# HAN Group OS v30 — Windows PowerShell Startup Script
# 사용법: PowerShell 관리자 권한으로 실행
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\start.ps1

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BACKEND = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"

# ── 배너 ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       HAN Group OS v30 — Startup             ║" -ForegroundColor Cyan
Write-Host "║  AI Corporate Operating System               ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1단계: 사전 요구사항 체크 ─────────────────────────────────────────────────
Write-Host "[ 1/3 ] 사전 요구사항 확인 중..." -ForegroundColor White
Write-Host ""

$MISSING = $false

# ── Python 체크 ───────────────────────────────────────────────────────────────
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 9) {
                Write-Host "  ✓ Python $major.$minor" -ForegroundColor Green
                $pythonCmd = $cmd
                break
            } else {
                Write-Host "  ✗ Python $major.$minor 감지 — 3.9 이상 필요" -ForegroundColor Red
                Write-Host ""
                Write-Host "  ▶ Python 업그레이드 방법:" -ForegroundColor Yellow
                Write-Host "    1. https://www.python.org/downloads/ 접속"
                Write-Host "    2. 'Download Python 3.11.x' 다운로드 및 설치"
                Write-Host "    3. 설치 시 ☑ 'Add Python to PATH' 반드시 체크"
                Write-Host "    4. 설치 후 PowerShell 재시작"
                Write-Host ""
                $MISSING = $true
                break
            }
        }
    } catch { continue }
}

if (-not $pythonCmd -and -not $MISSING) {
    Write-Host "  ✗ Python이 설치되지 않았습니다" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ▶ Python 설치 방법:" -ForegroundColor Yellow
    Write-Host "    1. https://www.python.org/downloads/ 접속"
    Write-Host "    2. 'Download Python 3.11.x' 클릭"
    Write-Host "    3. 설치 시 ☑ 'Add Python to PATH' 체크 필수"
    Write-Host "    4. 설치 완료 후 PowerShell 재시작"
    Write-Host ""
    Write-Host "    또는 winget으로 설치 (Windows 10 이상):"
    Write-Host "    winget install Python.Python.3.11"
    Write-Host ""
    $MISSING = $true
}

# ── Node.js 체크 ──────────────────────────────────────────────────────────────
try {
    $nodeVer = & node --version 2>&1
    if ($nodeVer -match "v(\d+)\.") {
        $nodeMajor = [int]$Matches[1]
        if ($nodeMajor -ge 18) {
            Write-Host "  ✓ Node.js $nodeVer" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Node.js $nodeVer 감지 — v18 이상 필요" -ForegroundColor Red
            Write-Host ""
            Write-Host "  ▶ Node.js 업그레이드 방법:" -ForegroundColor Yellow
            Write-Host "    1. https://nodejs.org 접속"
            Write-Host "    2. 'LTS' 버전 다운로드 (현재 Node.js 20 LTS 권장)"
            Write-Host "    3. 설치 완료 후 PowerShell 재시작"
            Write-Host ""
            Write-Host "    또는 winget으로 설치:"
            Write-Host "    winget install OpenJS.NodeJS.LTS"
            Write-Host ""
            $MISSING = $true
        }
    }
} catch {
    Write-Host "  ✗ Node.js가 설치되지 않았습니다" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ▶ Node.js 설치 방법:" -ForegroundColor Yellow
    Write-Host "    방법 1 — 공식 사이트 (권장):"
    Write-Host "    1. https://nodejs.org 접속"
    Write-Host "    2. 'LTS' 버전 다운로드 및 설치"
    Write-Host "    3. 설치 완료 후 PowerShell 재시작"
    Write-Host ""
    Write-Host "    방법 2 — winget (Windows 10 이상):"
    Write-Host "    winget install OpenJS.NodeJS.LTS"
    Write-Host ""
    $MISSING = $true
}

# ── npm 체크 ──────────────────────────────────────────────────────────────────
try {
    $null = & npm --version 2>&1
    Write-Host "  ✓ npm $(& npm --version)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ npm이 없습니다 — Node.js를 재설치하세요: https://nodejs.org" -ForegroundColor Red
    $MISSING = $true
}

# ── 누락 항목 있으면 종료 ─────────────────────────────────────────────────────
if ($MISSING) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host "  위 항목을 설치한 후 PowerShell을 재시작하고" -ForegroundColor Red
    Write-Host "  다시 .\start.ps1 을 실행하세요." -ForegroundColor Red
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ── 2단계: 포트 충돌 감지 ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 2/3 ] 포트 사용 현황 확인 중..." -ForegroundColor White
Write-Host ""

$PORT_BLOCKED = $false

foreach ($port in @(8000, 5173)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pid_ = $conn[0].OwningProcess
        $proc = (Get-Process -Id $pid_ -ErrorAction SilentlyContinue).Name
        if (-not $proc) { $proc = "알 수 없는 프로세스 (PID: $pid_)" }
        Write-Host "  ✗ 포트 $port 이미 사용 중 — $proc (PID: $pid_)" -ForegroundColor Red
        Write-Host ""
        Write-Host "  ▶ 해결 방법:" -ForegroundColor Yellow
        Write-Host "    # 프로세스 강제 종료:"
        Write-Host "    Stop-Process -Id $pid_ -Force"
        Write-Host "    # 또는 작업 관리자(Ctrl+Shift+Esc)에서 '$proc' 종료"
        Write-Host ""
        $PORT_BLOCKED = $true
    } else {
        Write-Host "  ✓ 포트 $port 사용 가능" -ForegroundColor Green
    }
}

if ($PORT_BLOCKED) {
    $ans = Read-Host "  포트 충돌이 있습니다. 그래도 계속 시작하시겠습니까? (y/N)"
    if ($ans -notmatch "^[Yy]$") {
        Write-Host "  포트 충돌을 해결한 후 다시 실행하세요."
        exit 1
    }
}

# ── 3단계: 환경 설정 (.env 최초 생성 시 인터랙티브 설정) ─────────────────────
Write-Host ""
Write-Host "[ 3/3 ] 서버 시작 중..." -ForegroundColor White
Write-Host ""

Set-Location $BACKEND

if (-not (Test-Path ".env")) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  최초 실행입니다. AI 프로바이더를 설정합니다." -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  사용할 AI 프로바이더를 선택하세요:"
    Write-Host ""
    Write-Host "  1) Mock       — API 키 불필요, 즉시 시작 (테스트용)"
    Write-Host "  2) Ollama     — 로컬 무료 LLM (https://ollama.com)"
    Write-Host "  3) Claude     — Anthropic API 키 필요 (고성능)"
    Write-Host "  4) GPT-4o     — OpenAI API 키 필요 (고성능)"
    Write-Host "  5) Gemini     — Google API 키 필요"
    Write-Host ""
    $choice = Read-Host "  선택 [기본값: 1]"
    if (-not $choice) { $choice = "1" }

    $provider = "mock"
    $anthropicKey = ""
    $openaiKey = ""
    $geminiKey = ""
    $ollamaModel = "llama3.2"

    switch ($choice) {
        "2" {
            $provider = "ollama"
            $inputModel = Read-Host "  Ollama 모델명 [기본값: llama3.2]"
            if ($inputModel) { $ollamaModel = $inputModel }
        }
        "3" {
            $provider = "anthropic"
            $anthropicKey = Read-Host "  Anthropic API 키 (sk-ant-...)"
            if (-not $anthropicKey) {
                Write-Host "  ⚠ API 키 미입력 — Mock 모드로 설정됩니다." -ForegroundColor Yellow
                $provider = "mock"
            }
        }
        "4" {
            $provider = "openai"
            $openaiKey = Read-Host "  OpenAI API 키 (sk-...)"
            if (-not $openaiKey) {
                Write-Host "  ⚠ API 키 미입력 — Mock 모드로 설정됩니다." -ForegroundColor Yellow
                $provider = "mock"
            }
        }
        "5" {
            $provider = "gemini"
            $geminiKey = Read-Host "  Google Gemini API 키"
            if (-not $geminiKey) {
                Write-Host "  ⚠ API 키 미입력 — Mock 모드로 설정됩니다." -ForegroundColor Yellow
                $provider = "mock"
            }
        }
    }

    @"
SECRET_KEY=han-group-os-secret-key-change-in-production-v30
DATABASE_URL=sqlite:///./han_group.db
DEFAULT_PROVIDER=$provider
ANTHROPIC_API_KEY=$anthropicKey
OPENAI_API_KEY=$openaiKey
GEMINI_API_KEY=$geminiKey
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=$ollamaModel
"@ | Set-Content ".env" -Encoding UTF8

    Write-Host "  ✓ .env 생성됨 (프로바이더: $provider)" -ForegroundColor Green
    Write-Host "  나중에 backend\.env 파일을 직접 수정해 변경할 수 있습니다." -ForegroundColor Cyan
    Write-Host ""
}

# ── Backend 시작 ──────────────────────────────────────────────────────────────
Write-Host "▶ 백엔드 설정 중..."

if (-not (Test-Path "venv")) {
    Write-Host "  ✓ 가상환경 생성 중..."
    & $pythonCmd -m venv venv
}

Write-Host "  ✓ 의존성 설치 중..."
& ".\venv\Scripts\pip.exe" install -q -r requirements.txt

Write-Host "  ✓ 백엔드 서버 시작 (http://localhost:8000)"
$backendProc = Start-Process -FilePath ".\venv\Scripts\uvicorn.exe" `
    -ArgumentList "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload" `
    -PassThru -WindowStyle Minimized

# ── Frontend 시작 ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "▶ 프론트엔드 설정 중..."
Set-Location $FRONTEND

if (-not (Test-Path "node_modules")) {
    Write-Host "  ✓ npm 패키지 설치 중..."
    & npm install --silent
}

Write-Host "  ✓ 프론트엔드 서버 시작 (http://localhost:5173)"
$frontendProc = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -PassThru -WindowStyle Minimized

# ── Ready ─────────────────────────────────────────────────────────────────────
Start-Sleep -Seconds 3
Write-Host ""
Write-Host "════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ HAN Group OS v30 실행 중" -ForegroundColor Green
Write-Host ""
Write-Host "  🌐 앱:       http://localhost:5173"
Write-Host "  🔧 API:      http://localhost:8000"
Write-Host "  📖 API Docs: http://localhost:8000/docs"
Write-Host ""
Write-Host "  기본 로그인: admin / admin1234"
Write-Host ""
Write-Host "  종료하려면 이 창을 닫거나 Ctrl+C를 누르세요."
Write-Host "════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

# 브라우저 자동 열기
Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"

# 종료 시 프로세스 정리
try {
    Wait-Process -Id $backendProc.Id -ErrorAction SilentlyContinue
} finally {
    Write-Host "서버를 종료합니다..."
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
}
