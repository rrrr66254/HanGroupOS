"""
미디어 발행 라우터
블로그(WordPress, Tistory, Blogger) 및 YouTube 영상 업로드
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import os
import tempfile

from core.database import get_db
from core.security import get_current_user
from models.models import ExternalApiKey, MediaPost, User
from schemas.schemas import (
    WordpressPublishRequest, TistoryPublishRequest,
    BloggerPublishRequest, YouTubeUploadRequest,
    YouTubeAuthRequest, YouTubeTokenExchangeRequest,
    MediaPostOut,
)
from services.media_publisher import MediaPublisher, PLATFORM_INFO
from services.platform_guides import (
    GUIDES, get_guide, get_all_guides_summary, get_quick_checklist, OAUTH_GUIDE
)

router = APIRouter(prefix="/api/media", tags=["media-publishing"])


# ── 헬퍼: DB에서 플랫폼 자격증명 로드 ────────────────────────────────────────
def _load_credentials(db: Session) -> dict:
    """DB에 저장된 미디어 플랫폼 자격증명 로드."""
    credentials = {}
    platforms = ["wordpress", "tistory", "blogger", "youtube"]
    for platform in platforms:
        row = (db.query(ExternalApiKey)
               .filter(ExternalApiKey.service == platform, ExternalApiKey.is_active == True)
               .first())
        if row:
            creds = dict(row.extra_config or {})
            if row.api_key:
                # 플랫폼별 주요 키 이름으로 매핑
                key_name_map = {
                    "wordpress": "app_password",
                    "tistory": "access_token",
                    "blogger": "oauth_token",
                    "youtube": "oauth_token",
                }
                creds[key_name_map.get(platform, "api_key")] = row.api_key
            credentials[platform] = creds
    return credentials


def _get_publisher(db: Session) -> MediaPublisher:
    return MediaPublisher(credentials=_load_credentials(db))


def _save_media_post(
    db: Session,
    platform: str,
    title: str,
    content: str,
    result: dict,
    company_id: Optional[int] = None,
) -> MediaPost:
    """발행 결과를 DB에 저장."""
    obj = MediaPost(
        company_id=company_id,
        platform=platform,
        title=title[:500],
        content=content[:50000],
        external_id=str(result.get("id", "")),
        external_url=result.get("url", ""),
        status="published" if result.get("success") else "failed",
        platform_meta=result,
        published_at=datetime.utcnow() if result.get("success") else None,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


# ══════════════════════════════════════════════════════════════════════════════
# 플랫폼 설정 안내
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/platforms", summary="지원 미디어 플랫폼 목록 및 설정 안내")
def list_platforms():
    """
    지원하는 미디어 플랫폼 목록과 각 플랫폼에서 필요한 자격증명 안내를 반환합니다.
    """
    return {"platforms": PLATFORM_INFO}


# ══════════════════════════════════════════════════════════════════════════════
# 플랫폼 설정 튜토리얼 가이드
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/guides", summary="전체 플랫폼 설정 가이드 요약")
def list_guides(_: User = Depends(get_current_user)):
    """
    모든 지원 플랫폼의 설정 가이드 요약을 반환합니다.
    AI가 할 수 있는 것과 사용자가 직접 해야 하는 것을 구분합니다.
    """
    return {
        "guides": get_all_guides_summary(),
        "oauth_guide": OAUTH_GUIDE,
        "note": "회원가입, 계정 생성, OAuth 인증은 사용자가 브라우저에서 직접 진행해야 합니다.",
    }


@router.get("/guides/{platform}", summary="특정 플랫폼 단계별 설정 가이드")
def get_platform_guide(
    platform: str,
    _: User = Depends(get_current_user),
):
    """
    특정 플랫폼의 상세 단계별 설정 가이드를 반환합니다.
    platform: tistory | wordpress | blogger | youtube | serpapi | newsapi
    """
    guide = get_guide(platform)
    if not guide:
        raise HTTPException(
            404,
            detail={
                "message": f"'{platform}' 플랫폼 가이드를 찾을 수 없습니다.",
                "available": list(GUIDES.keys()),
            }
        )
    return {
        "platform": platform,
        "guide": guide,
        "checklist": get_quick_checklist(platform),
    }


@router.get("/guides/{platform}/checklist", summary="플랫폼 설정 체크리스트")
def get_platform_checklist(
    platform: str,
    _: User = Depends(get_current_user),
):
    """설정에 필요한 단계를 체크리스트 형태로 반환합니다."""
    guide = get_guide(platform)
    if not guide:
        raise HTTPException(404, f"'{platform}' 가이드를 찾을 수 없습니다.")
    return {
        "platform": platform,
        "name": guide["name"],
        "checklist": get_quick_checklist(platform),
        "ai_can_do": guide.get("ai_can_do", []),
        "user_must_do": guide.get("user_must_do", []),
    }


@router.get("/platforms/status", summary="플랫폼별 설정 완료 여부")
def platforms_status(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """각 플랫폼의 자격증명이 등록되어 있는지 확인합니다."""
    status = {}
    for platform in ["wordpress", "tistory", "blogger", "youtube"]:
        row = (db.query(ExternalApiKey)
               .filter(ExternalApiKey.service == platform, ExternalApiKey.is_active == True)
               .first())
        status[platform] = {
            "configured": row is not None,
            "label": row.label if row else "",
            "info": PLATFORM_INFO.get(platform, {}),
        }
    return status


# ══════════════════════════════════════════════════════════════════════════════
# 블로그 발행
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/blog/wordpress", response_model=MediaPostOut, summary="WordPress 포스트 발행")
def publish_wordpress(
    req: WordpressPublishRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    WordPress 블로그에 포스트를 발행합니다.
    사전에 '외부 API 키 관리'에서 WordPress 자격증명을 등록해야 합니다.
    (service: wordpress, extra_config: {url, username}, api_key: app_password)
    """
    publisher = _get_publisher(db)
    result = publisher.publish_wordpress(
        title=req.title,
        content=req.content,
        status=req.status,
        tags=req.tags or [],
        categories=req.categories or [],
        excerpt=req.excerpt,
    )

    if result.get("requires_setup"):
        raise HTTPException(
            400,
            detail={
                "message": "WordPress 자격증명이 등록되지 않았습니다.",
                "action": "관리자 > 외부 API 키에서 service='wordpress'로 등록해주세요.",
                "required_fields": result.get("required_fields", {}),
            }
        )

    saved = _save_media_post(db, "wordpress", req.title, req.content, result, req.company_id)
    return saved


@router.post("/blog/tistory", response_model=MediaPostOut, summary="Tistory 포스트 발행")
def publish_tistory(
    req: TistoryPublishRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    티스토리 블로그에 포스트를 발행합니다.
    사전에 '외부 API 키 관리'에서 Tistory 자격증명을 등록해야 합니다.
    (service: tistory, api_key: access_token, extra_config: {blog_name})
    """
    publisher = _get_publisher(db)
    result = publisher.publish_tistory(
        title=req.title,
        content=req.content,
        visibility=req.visibility,
        category_id=req.category_id,
        tag=req.tag,
    )

    if result.get("requires_setup"):
        raise HTTPException(
            400,
            detail={
                "message": "Tistory 자격증명이 등록되지 않았습니다.",
                "action": "관리자 > 외부 API 키에서 service='tistory'로 등록해주세요.",
                "required_fields": result.get("required_fields", {}),
            }
        )

    saved = _save_media_post(db, "tistory", req.title, req.content, result, req.company_id)
    return saved


@router.post("/blog/blogger", response_model=MediaPostOut, summary="Google Blogger 포스트 발행")
def publish_blogger(
    req: BloggerPublishRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Google Blogger에 포스트를 발행합니다.
    (service: blogger, api_key: oauth_token, extra_config: {blog_id})
    """
    publisher = _get_publisher(db)
    result = publisher.publish_blogger(
        title=req.title,
        content=req.content,
        labels=req.labels or [],
        is_draft=req.is_draft,
    )

    if result.get("requires_setup"):
        raise HTTPException(
            400,
            detail={
                "message": "Blogger 자격증명이 등록되지 않았습니다.",
                "action": "관리자 > 외부 API 키에서 service='blogger'로 등록해주세요.",
            }
        )

    saved = _save_media_post(db, "blogger", req.title, req.content, result, req.company_id)
    return saved


# ══════════════════════════════════════════════════════════════════════════════
# YouTube 업로드
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/youtube/upload", response_model=MediaPostOut, summary="YouTube 영상 업로드")
def upload_youtube(
    req: YouTubeUploadRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    YouTube에 영상을 업로드합니다.
    video_path: 서버 내 영상 파일 경로
    OAuth 토큰이 필요합니다. /api/media/youtube/auth 엔드포인트로 인증하세요.
    """
    publisher = _get_publisher(db)
    result = publisher.upload_youtube(
        video_path=req.video_path,
        title=req.title,
        description=req.description,
        tags=req.tags or [],
        category_id=req.category_id,
        privacy=req.privacy,
        language=req.language,
    )

    if result.get("requires_setup"):
        raise HTTPException(
            400,
            detail={
                "message": "YouTube OAuth 토큰이 등록되지 않았습니다.",
                "action": "관리자 > 외부 API 키에서 service='youtube'로 등록해주세요.",
                "auth_guide": "/api/media/youtube/auth 엔드포인트로 인증 URL을 받으세요.",
            }
        )

    saved = _save_media_post(db, "youtube", req.title, req.description, result, req.company_id)
    return saved


@router.post("/youtube/upload-file", response_model=MediaPostOut, summary="YouTube 영상 파일 업로드")
async def upload_youtube_file(
    file: UploadFile = File(...),
    title: str = "새 영상",
    description: str = "",
    privacy: str = "private",
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    파일을 직접 업로드하여 YouTube에 게시합니다.
    파일을 임시 저장 후 업로드합니다.
    """
    publisher = _get_publisher(db)

    # 임시 파일에 저장
    suffix = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = publisher.upload_youtube(
            video_path=tmp_path,
            title=title,
            description=description,
            privacy=privacy,
        )
    finally:
        os.unlink(tmp_path)

    if result.get("requires_setup"):
        raise HTTPException(
            400,
            detail={"message": "YouTube OAuth 토큰이 등록되지 않았습니다."}
        )

    saved = _save_media_post(db, "youtube", title, description, result, company_id)
    return saved


@router.post("/youtube/auth-url", summary="YouTube OAuth 인증 URL 생성")
def get_youtube_auth_url(
    req: YouTubeAuthRequest,
    _: User = Depends(get_current_user),
):
    """
    YouTube OAuth 2.0 인증 URL을 생성합니다.
    1. 이 URL을 브라우저에서 열어 Google 계정으로 로그인
    2. 표시된 코드를 복사
    3. /api/media/youtube/token-exchange 에 코드를 제출하여 토큰 획득
    4. 획득한 oauth_token을 외부 API 키에 등록
    """
    publisher = MediaPublisher()
    url = publisher.get_youtube_auth_url(req.client_id, req.redirect_uri)
    return {
        "auth_url": url,
        "instructions": [
            "1. 위 URL을 브라우저에서 엽니다.",
            "2. Google 계정으로 로그인하고 YouTube 업로드 권한을 허용합니다.",
            "3. 표시된 인증 코드를 복사합니다.",
            "4. POST /api/media/youtube/token-exchange 에 코드를 제출합니다.",
            "5. 반환된 access_token을 외부 API 키 (service=youtube)에 등록합니다.",
        ],
    }


@router.post("/youtube/token-exchange", summary="YouTube 인증 코드를 토큰으로 교환")
def exchange_youtube_token(
    req: YouTubeTokenExchangeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Google에서 받은 인증 코드를 access_token으로 교환하고 자동 저장합니다.
    refresh_token이 있으면 extra_config에 함께 저장하여 자동 갱신 지원.
    """
    publisher = MediaPublisher()
    result = publisher.exchange_youtube_code(
        code=req.code,
        client_id=req.client_id,
        client_secret=req.client_secret,
        redirect_uri=req.redirect_uri,
    )
    if "error" in result:
        raise HTTPException(400, detail=result)

    # 자동으로 DB에 저장 (access_token + refresh_token)
    access_token = result.get("access_token", "")
    refresh_token = result.get("refresh_token", "")
    if access_token:
        existing = db.query(ExternalApiKey).filter(ExternalApiKey.service == "youtube").first()
        extra = dict(existing.extra_config or {}) if existing else {}
        extra.update({
            "client_id": req.client_id,
            "client_secret": req.client_secret,
        })
        if refresh_token:
            extra["refresh_token"] = refresh_token
        if existing:
            existing.api_key = access_token
            existing.extra_config = extra
            existing.is_active = True
            existing.updated_at = datetime.utcnow()
        else:
            obj = ExternalApiKey(
                service="youtube",
                label="YouTube OAuth",
                api_key=access_token,
                extra_config=extra,
                is_active=True,
            )
            db.add(obj)
        db.commit()

    return {
        **result,
        "auto_saved": bool(access_token),
        "refresh_token_saved": bool(refresh_token),
        "message": "토큰이 자동으로 저장되었습니다." if access_token else "저장 실패: access_token 없음",
    }


@router.post("/youtube/refresh-token", summary="YouTube access_token 자동 갱신")
def refresh_youtube_token(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    저장된 refresh_token으로 YouTube access_token을 자동 갱신합니다.
    extra_config에 client_id, client_secret, refresh_token이 있어야 합니다.
    """
    import requests as _req

    row = db.query(ExternalApiKey).filter(
        ExternalApiKey.service == "youtube",
        ExternalApiKey.is_active == True,
    ).first()
    if not row:
        raise HTTPException(404, "YouTube 자격증명이 없습니다.")

    extra = row.extra_config or {}
    refresh_token = extra.get("refresh_token")
    client_id = extra.get("client_id")
    client_secret = extra.get("client_secret")

    if not all([refresh_token, client_id, client_secret]):
        raise HTTPException(400, detail={
            "message": "refresh_token, client_id, client_secret 중 일부가 없습니다.",
            "missing": [k for k in ["refresh_token", "client_id", "client_secret"] if not extra.get(k)],
        })

    try:
        r = _req.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        new_token = data.get("access_token")
        if not new_token:
            raise HTTPException(400, f"갱신 실패: {data}")
        row.api_key = new_token
        row.updated_at = datetime.utcnow()
        db.commit()
        return {"ok": True, "message": "YouTube access_token 갱신 완료", "expires_in": data.get("expires_in")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"토큰 갱신 오류: {str(e)[:200]}")


# ══════════════════════════════════════════════════════════════════════════════
# 발행 기록 조회
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/posts", response_model=List[MediaPostOut], summary="발행된 미디어 포스트 목록")
def list_media_posts(
    platform: Optional[str] = None,
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(MediaPost)
    if platform:
        q = q.filter(MediaPost.platform == platform)
    if company_id:
        q = q.filter(MediaPost.company_id == company_id)
    if status:
        q = q.filter(MediaPost.status == status)
    return q.order_by(MediaPost.created_at.desc()).limit(limit).all()


@router.get("/posts/{post_id}", response_model=MediaPostOut, summary="발행 포스트 상세")
def get_media_post(
    post_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    obj = db.query(MediaPost).filter(MediaPost.id == post_id).first()
    if not obj:
        raise HTTPException(404, "포스트를 찾을 수 없습니다.")
    return obj
