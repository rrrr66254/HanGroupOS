"""
미디어 플랫폼 설정 가이드
블로그/YouTube 사용을 위한 단계별 튜토리얼

⚠️ 회원가입, 계정 생성, OAuth 인증 등은 사용자가 직접 브라우저에서 해야 합니다.
AI가 대신할 수 없는 작업이며, 이 가이드는 그 과정을 안내합니다.
"""

GUIDES = {
    "tistory": {
        "name": "Tistory (티스토리)",
        "description": "카카오가 운영하는 한국 대표 블로그 플랫폼",
        "ai_can_do": ["포스트 자동 작성", "발행", "카테고리 설정", "공개/비공개 설정"],
        "user_must_do": ["카카오 계정 생성", "티스토리 블로그 개설", "API 앱 등록", "Access Token 발급"],
        "steps": [
            {
                "step": 1,
                "title": "카카오 계정 만들기",
                "required": True,
                "description": "티스토리는 카카오 계정으로 로그인합니다.",
                "actions": [
                    "https://accounts.kakao.com/signup 에서 카카오 계정 가입",
                    "휴대폰 번호 인증 필요",
                    "이미 카카오 계정이 있다면 이 단계 건너뜀",
                ],
                "url": "https://accounts.kakao.com/signup",
            },
            {
                "step": 2,
                "title": "티스토리 블로그 개설",
                "required": True,
                "description": "블로그 주소와 이름을 설정합니다.",
                "actions": [
                    "https://www.tistory.com 접속 후 카카오 로그인",
                    "시작하기 → 블로그 만들기 클릭",
                    "블로그 주소 입력 (예: myblog → myblog.tistory.com)",
                    "블로그 이름 설정",
                    "블로그 주소(blog_name)를 기록해두세요. API 등록 시 필요합니다.",
                ],
                "url": "https://www.tistory.com",
                "important": "블로그 주소(예: myblog)를 반드시 기억하세요.",
            },
            {
                "step": 3,
                "title": "Tistory 앱 등록",
                "required": True,
                "description": "API 사용을 위한 앱을 등록합니다.",
                "actions": [
                    "https://www.tistory.com/guide/api/manage/register 접속",
                    "앱 이름: 원하는 이름 입력 (예: Group OS)",
                    "서비스 URL: http://localhost (로컬 테스트용)",
                    "CallBack: http://localhost (로컬 테스트용)",
                    "등록 후 App ID와 Secret Key 확인",
                ],
                "url": "https://www.tistory.com/guide/api/manage/register",
            },
            {
                "step": 4,
                "title": "Access Token 발급",
                "required": True,
                "description": "아래 URL을 브라우저에서 열어 토큰을 발급받습니다.",
                "actions": [
                    "아래 URL에서 {APP_ID}를 실제 App ID로 교체해서 브라우저에서 열기:",
                    "https://www.tistory.com/oauth/authorize?client_id={APP_ID}&redirect_uri=https://www.tistory.com/oauth/callback&response_type=token",
                    "카카오 로그인 후 '허용' 클릭",
                    "리다이렉트된 URL에서 access_token=XXXXX 부분 복사",
                    "복사한 토큰을 채팅에 입력: '티스토리 토큰 등록: {토큰값}, 블로그명: {블로그주소}'",
                ],
                "url_template": "https://www.tistory.com/oauth/authorize?client_id={APP_ID}&redirect_uri=https://www.tistory.com/oauth/callback&response_type=token",
                "important": "토큰 URL의 access_token= 이후 & 이전까지의 값이 토큰입니다.",
            },
            {
                "step": 5,
                "title": "시스템에 등록",
                "required": True,
                "description": "채팅에서 AI에게 토큰을 전달하면 자동 저장됩니다.",
                "actions": [
                    "회장 채팅에 아래 형식으로 입력:",
                    "'티스토리 액세스 토큰 등록해줘. 토큰: {access_token}, 블로그명: {blog_name}'",
                    "AI가 자동으로 DB에 저장하고 확인 메시지를 보냅니다.",
                ],
            },
        ],
    },

    "wordpress": {
        "name": "WordPress",
        "description": "전 세계 가장 많이 사용되는 CMS 블로그 플랫폼",
        "ai_can_do": ["포스트 자동 작성 및 발행", "태그/카테고리 설정", "공개/비공개/예약 발행"],
        "user_must_do": ["WordPress 사이트 구축 또는 호스팅 가입", "애플리케이션 비밀번호 생성"],
        "options": [
            {
                "name": "wordpress.com (호스팅 포함)",
                "description": "설치 없이 바로 사용. 무료 플랜 있음.",
                "url": "https://wordpress.com/start",
                "note": "무료 플랜은 API 기능이 제한될 수 있습니다. Business 플랜 권장.",
            },
            {
                "name": "WordPress.org (자체 호스팅)",
                "description": "직접 서버에 설치. 완전한 제어 가능.",
                "url": "https://wordpress.org/download/",
                "note": "카페24, 닷홈, AWS 등에 설치. 더 자유롭게 API 사용 가능.",
            },
        ],
        "steps": [
            {
                "step": 1,
                "title": "WordPress 사이트 준비",
                "required": True,
                "description": "이미 WordPress 사이트가 있다면 2단계로 바로 이동하세요.",
                "actions": [
                    "방법 A (쉬운 방법): https://wordpress.com/start 에서 계정 생성 및 블로그 개설",
                    "방법 B (자체 호스팅): 웹 호스팅 서비스 가입 후 WordPress 설치",
                    "사이트 주소를 기록 (예: https://myblog.wordpress.com 또는 https://myblog.com)",
                ],
            },
            {
                "step": 2,
                "title": "애플리케이션 비밀번호 생성",
                "required": True,
                "description": "WordPress 5.6+에서 지원하는 API 전용 비밀번호입니다.",
                "actions": [
                    "WordPress 관리자 대시보드 로그인 (yoursite.com/wp-admin)",
                    "좌측 메뉴: 사용자(Users) → 프로필(Profile) 클릭",
                    "페이지 하단의 '애플리케이션 비밀번호(Application Passwords)' 섹션으로 이동",
                    "새 애플리케이션 이름 입력 (예: Group OS)",
                    "'새 애플리케이션 비밀번호 추가' 버튼 클릭",
                    "생성된 비밀번호를 즉시 복사 (다시 볼 수 없음!)",
                ],
                "url": "https://wordpress.org/documentation/article/application-passwords/",
                "important": "애플리케이션 비밀번호는 생성 직후 한 번만 표시됩니다. 반드시 복사해두세요.",
            },
            {
                "step": 3,
                "title": "시스템에 등록",
                "required": True,
                "description": "채팅에서 AI에게 정보를 전달하면 자동 저장됩니다.",
                "actions": [
                    "회장 채팅에 아래 형식으로 입력:",
                    "'워드프레스 등록해줘. 주소: {사이트URL}, 아이디: {사용자명}, 앱비밀번호: {애플리케이션비밀번호}'",
                    "예: '워드프레스 등록. 주소: https://myblog.com, 아이디: admin, 앱비밀번호: abcd 1234 efgh'",
                ],
                "note": "애플리케이션 비밀번호의 공백은 자동으로 처리됩니다.",
            },
        ],
    },

    "blogger": {
        "name": "Google Blogger",
        "description": "Google이 운영하는 무료 블로그 서비스",
        "ai_can_do": ["포스트 작성 및 발행", "레이블(태그) 설정", "초안 저장"],
        "user_must_do": ["Google 계정 생성", "Blogger 블로그 개설", "Google Cloud 프로젝트 생성", "OAuth 2.0 인증"],
        "steps": [
            {
                "step": 1,
                "title": "Google 계정 및 Blogger 블로그 개설",
                "required": True,
                "actions": [
                    "https://blogger.com 에서 Google 계정으로 로그인",
                    "'새 블로그' 클릭 → 블로그 이름과 주소 설정",
                    "블로그 생성 후 URL에서 Blog ID 확인",
                    "예: https://www.blogger.com/blog/posts/1234567890 → ID는 1234567890",
                ],
                "url": "https://blogger.com",
                "important": "URL의 숫자 부분이 Blog ID입니다. 기록해두세요.",
            },
            {
                "step": 2,
                "title": "Google Cloud 프로젝트 생성",
                "required": True,
                "actions": [
                    "https://console.cloud.google.com 접속 (Google 계정 로그인)",
                    "상단 프로젝트 선택 → '새 프로젝트' 클릭",
                    "프로젝트 이름 입력 (예: Group OS) → 만들기",
                ],
                "url": "https://console.cloud.google.com/projectcreate",
            },
            {
                "step": 3,
                "title": "Blogger API 활성화",
                "required": True,
                "actions": [
                    "Google Cloud Console → API 및 서비스 → 라이브러리",
                    "'Blogger API' 검색 → 클릭 → '사용' 버튼",
                ],
                "url": "https://console.cloud.google.com/apis/library/blogger.googleapis.com",
            },
            {
                "step": 4,
                "title": "OAuth 2.0 자격증명 생성",
                "required": True,
                "actions": [
                    "API 및 서비스 → 사용자 인증 정보(Credentials) → '사용자 인증 정보 만들기'",
                    "'OAuth 클라이언트 ID' 선택",
                    "동의 화면 구성 (외부 선택 → 앱 이름, 이메일 입력 → 저장)",
                    "애플리케이션 유형: '웹 애플리케이션' 선택",
                    "승인된 리디렉션 URI: http://localhost 추가",
                    "만들기 → Client ID와 Client Secret 복사",
                ],
                "url": "https://console.cloud.google.com/apis/credentials",
            },
            {
                "step": 5,
                "title": "OAuth 토큰 발급",
                "required": True,
                "description": "아래 URL로 인증하여 Access Token을 발급받습니다.",
                "actions": [
                    "아래 URL을 브라우저에서 열기 ({CLIENT_ID} 교체):",
                    "https://accounts.google.com/o/oauth2/auth?client_id={CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/blogger&response_type=code",
                    "Google 계정 로그인 → 권한 허용",
                    "표시된 인증 코드(code) 복사",
                    "채팅에서: 'Blogger OAuth 코드 교환해줘. client_id: {ID}, client_secret: {SECRET}, code: {코드}'",
                    "또는 /api/media/youtube/token-exchange API로 토큰 교환",
                ],
                "url_template": "https://accounts.google.com/o/oauth2/auth?client_id={CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/blogger&response_type=code&access_type=offline",
            },
            {
                "step": 6,
                "title": "시스템에 등록",
                "required": True,
                "actions": [
                    "회장 채팅에 입력:",
                    "'Blogger 등록. blog_id: {블로그ID}, oauth_token: {액세스토큰}'",
                ],
            },
        ],
    },

    "youtube": {
        "name": "YouTube",
        "description": "Google의 동영상 플랫폼. 영상 업로드 자동화 가능.",
        "ai_can_do": ["영상 메타데이터 설정", "업로드", "공개/비공개/예약 설정", "설명 및 태그 자동 작성"],
        "user_must_do": ["Google/YouTube 계정 생성", "YouTube 채널 개설", "Google Cloud 프로젝트/API 설정", "OAuth 인증"],
        "steps": [
            {
                "step": 1,
                "title": "YouTube 채널 개설",
                "required": True,
                "actions": [
                    "https://www.youtube.com 에서 Google 계정으로 로그인",
                    "우측 상단 프로필 → '채널 만들기'",
                    "채널 이름 설정 (개인 또는 브랜드 계정 선택)",
                    "채널 기본 정보 설정 완료",
                ],
                "url": "https://www.youtube.com/channel_switcher",
            },
            {
                "step": 2,
                "title": "Google Cloud 프로젝트 및 YouTube API 설정",
                "required": True,
                "actions": [
                    "https://console.cloud.google.com 접속",
                    "프로젝트 생성 또는 기존 프로젝트 선택",
                    "API 및 서비스 → 라이브러리 → 'YouTube Data API v3' 검색 → 사용 설정",
                ],
                "url": "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
            },
            {
                "step": 3,
                "title": "OAuth 2.0 자격증명 생성",
                "required": True,
                "actions": [
                    "API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID",
                    "동의 화면 설정: 외부 → 앱 이름, 이메일 입력 → 스코프에 YouTube API 추가",
                    "'테스트 사용자' 섹션에 본인 Google 계정 이메일 추가 (중요!)",
                    "애플리케이션 유형: '데스크톱 앱' 선택",
                    "Client ID와 Client Secret 복사",
                ],
                "url": "https://console.cloud.google.com/apis/credentials",
                "important": "테스트 사용자에 본인 이메일을 추가하지 않으면 인증이 거부됩니다.",
            },
            {
                "step": 4,
                "title": "OAuth 인증 URL 생성 (시스템에서 자동 생성)",
                "required": True,
                "description": "아래 API를 호출하거나 채팅에서 요청하면 인증 URL이 생성됩니다.",
                "actions": [
                    "채팅에 입력: 'YouTube OAuth 인증 URL 만들어줘. client_id: {CLIENT_ID}'",
                    "또는 API: POST /api/media/youtube/auth-url 에 {client_id} 전송",
                    "반환된 URL을 브라우저에서 열기",
                    "Google 계정 로그인 → YouTube 권한 허용",
                    "표시된 인증 코드 복사",
                ],
            },
            {
                "step": 5,
                "title": "인증 코드를 토큰으로 교환",
                "required": True,
                "description": "채팅에서 토큰 교환을 요청하면 시스템이 자동 처리합니다.",
                "actions": [
                    "채팅에 입력:",
                    "'YouTube 토큰 교환해줘. client_id: {ID}, client_secret: {SECRET}, code: {코드}'",
                    "시스템이 자동으로 /api/media/youtube/token-exchange 를 호출해 토큰 저장",
                ],
            },
            {
                "step": 6,
                "title": "영상 업로드",
                "required": False,
                "description": "설정 완료 후 AI가 영상을 자동 업로드할 수 있습니다.",
                "actions": [
                    "채팅에 입력: '영상 업로드해줘. 파일: /path/to/video.mp4, 제목: 영상 제목'",
                    "또는 API: POST /api/media/youtube/upload",
                    "비공개(private)로 먼저 업로드 후 확인 권장",
                ],
                "note": "업로드 후 YouTube Studio에서 썸네일 설정, 자막 추가 등 추가 작업은 직접 진행하세요.",
            },
        ],
    },

    "serpapi": {
        "name": "SerpAPI (Google 웹 검색)",
        "description": "Google 검색 결과를 API로 수집",
        "ai_can_do": ["웹 검색 자동화", "검색 결과 DB 저장", "경쟁사 분석", "시장 조사"],
        "user_must_do": ["SerpAPI 계정 생성", "API 키 복사"],
        "steps": [
            {
                "step": 1,
                "title": "SerpAPI 계정 생성",
                "required": True,
                "actions": [
                    "https://serpapi.com/users/sign_up 에서 계정 생성",
                    "이메일 인증",
                    "무료 플랜: 월 100회 검색 (신용카드 불필요)",
                ],
                "url": "https://serpapi.com/users/sign_up",
            },
            {
                "step": 2,
                "title": "API 키 복사",
                "required": True,
                "actions": [
                    "로그인 후 https://serpapi.com/dashboard 접속",
                    "Your Private API Key 복사",
                    "채팅에 입력: 'SerpAPI 키 등록해줘. 키: {API_KEY}'",
                ],
                "url": "https://serpapi.com/dashboard",
            },
        ],
    },

    "newsapi": {
        "name": "NewsAPI (뉴스 수집)",
        "description": "전세계 뉴스 기사 API. 개인 무료 100회/일.",
        "ai_can_do": ["뉴스 자동 수집", "키워드 모니터링", "시장 뉴스 분석", "DB 저장"],
        "user_must_do": ["NewsAPI 계정 생성", "API 키 복사"],
        "note": "⚠️ 무료 플랜은 개인/개발 목적만 허용. 상업적 사용은 유료 플랜 필요.",
        "steps": [
            {
                "step": 1,
                "title": "NewsAPI 계정 생성",
                "required": True,
                "actions": [
                    "https://newsapi.org/register 에서 계정 생성",
                    "이메일 인증",
                    "무료 플랜: 1일 100회, 최근 1개월 기사 (개인/개발용)",
                ],
                "url": "https://newsapi.org/register",
            },
            {
                "step": 2,
                "title": "API 키 복사",
                "required": True,
                "actions": [
                    "로그인 후 https://newsapi.org/account 에서 API 키 확인",
                    "채팅에 입력: 'NewsAPI 키 등록해줘. 키: {API_KEY}'",
                ],
                "url": "https://newsapi.org/account",
            },
        ],
    },
}

# 공통 OAuth 안내
OAUTH_GUIDE = """
=== Google OAuth 2.0 인증 공통 안내 ===

Google 서비스(Blogger, YouTube)를 사용하려면 OAuth 2.0 인증이 필요합니다.
이는 Google이 제3자 앱에 계정 접근을 허용하는 표준 방식입니다.

⚠️ AI가 직접 인증할 수 없습니다. 사용자가 브라우저에서 직접 진행해야 합니다.

[인증 흐름]
1. Client ID/Secret 발급 (Google Cloud Console)
2. 시스템에서 인증 URL 생성
3. 사용자가 브라우저에서 URL 접속 → Google 로그인 → 권한 허용
4. 인증 코드(code) 반환
5. 시스템이 코드를 access_token으로 교환 후 저장

[토큰 유효 기간]
- access_token: 1시간 (만료 시 refresh_token으로 갱신 필요)
- refresh_token: 장기 유효 (Google Cloud Console에서 취소하기 전까지)
"""


def get_guide(platform: str) -> dict:
    """플랫폼 가이드 반환."""
    return GUIDES.get(platform, {})


def get_all_guides_summary() -> dict:
    """모든 플랫폼의 요약 정보 반환."""
    summary = {}
    for key, guide in GUIDES.items():
        summary[key] = {
            "name": guide["name"],
            "description": guide["description"],
            "total_steps": len(guide["steps"]),
            "ai_can_do": guide.get("ai_can_do", []),
            "user_must_do": guide.get("user_must_do", []),
        }
    return summary


def get_quick_checklist(platform: str) -> list:
    """플랫폼 설정 체크리스트 반환."""
    guide = GUIDES.get(platform, {})
    checklist = []
    for step in guide.get("steps", []):
        checklist.append({
            "step": step["step"],
            "title": step["title"],
            "required": step.get("required", True),
            "url": step.get("url", ""),
            "important": step.get("important", ""),
        })
    return checklist
