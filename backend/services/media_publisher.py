"""
Media Publishing Service
블로그 및 YouTube 콘텐츠 발행

지원 플랫폼:
  - WordPress   : REST API (URL + 사용자명 + 앱 비밀번호)
  - Tistory     : Open API (Access Token)
  - Blogger     : Google API (OAuth 2.0 Token + Blog ID)
  - YouTube     : Data API v3 (OAuth 2.0 Token) — 영상 업로드
"""
import httpx
import json
import base64
import os
from typing import Optional, List, Dict, Any
from datetime import datetime


# 플랫폼별 필요 자격증명 안내
PLATFORM_INFO = {
    "wordpress": {
        "name": "WordPress",
        "description": "WordPress 블로그에 포스트 발행",
        "required_fields": {
            "url": "WordPress 사이트 주소 (예: https://myblog.com)",
            "username": "WordPress 사용자명",
            "app_password": "애플리케이션 비밀번호 (WordPress 설정 > 사용자 > 프로필에서 생성)",
        },
        "guide": "https://wordpress.org/support/article/application-passwords/",
    },
    "tistory": {
        "name": "Tistory",
        "description": "티스토리 블로그에 포스트 발행",
        "required_fields": {
            "access_token": "Tistory OAuth Access Token",
            "blog_name": "티스토리 블로그 이름 (예: myblog → myblog.tistory.com)",
        },
        "guide": "https://www.tistory.com/guide/api/manage/register",
    },
    "blogger": {
        "name": "Google Blogger",
        "description": "Google Blogger에 포스트 발행",
        "required_fields": {
            "blog_id": "Blogger 블로그 ID (URL에서 확인)",
            "oauth_token": "Google OAuth 2.0 Access Token",
        },
        "guide": "https://developers.google.com/blogger/docs/3.0/using",
    },
    "youtube": {
        "name": "YouTube",
        "description": "YouTube에 영상 업로드",
        "required_fields": {
            "oauth_token": "Google OAuth 2.0 Access Token (YouTube 업로드 권한 포함)",
        },
        "optional_fields": {
            "client_id": "OAuth Client ID (토큰 갱신용)",
            "client_secret": "OAuth Client Secret (토큰 갱신용)",
            "refresh_token": "Refresh Token (장기 사용시)",
        },
        "guide": "https://developers.google.com/youtube/v3/guides/uploading_a_video",
        "scopes": ["https://www.googleapis.com/auth/youtube.upload"],
    },
}


class MediaPublisher:
    def __init__(self, credentials: Dict[str, Any] = None):
        """
        credentials 예시:
        {
            "wordpress": {"url": "...", "username": "...", "app_password": "..."},
            "tistory": {"access_token": "...", "blog_name": "..."},
            "blogger": {"blog_id": "...", "oauth_token": "..."},
            "youtube": {"oauth_token": "..."},
        }
        """
        self.credentials = credentials or {}

    # ── WordPress ─────────────────────────────────────────────────────────────
    def publish_wordpress(
        self,
        title: str,
        content: str,
        status: str = "publish",       # publish | draft | private
        tags: List[str] = None,
        categories: List[int] = None,
        excerpt: str = "",
    ) -> Dict[str, Any]:
        """WordPress REST API로 포스트 발행."""
        creds = self.credentials.get("wordpress", {})
        wp_url = creds.get("url", "").rstrip("/")
        username = creds.get("username", "")
        app_password = creds.get("app_password", "")

        if not all([wp_url, username, app_password]):
            return {
                "success": False,
                "error": "WordPress 인증 정보가 없습니다.",
                "requires_setup": True,
                "platform": "wordpress",
                "required_fields": PLATFORM_INFO["wordpress"]["required_fields"],
            }

        auth_str = base64.b64encode(f"{username}:{app_password}".encode()).decode()
        headers = {
            "Authorization": f"Basic {auth_str}",
            "Content-Type": "application/json",
        }

        payload: Dict[str, Any] = {
            "title": title,
            "content": content,
            "status": status,
            "excerpt": excerpt,
        }
        if tags:
            payload["tags"] = tags
        if categories:
            payload["categories"] = categories

        try:
            with httpx.Client(timeout=30) as client:
                r = client.post(
                    f"{wp_url}/wp-json/wp/v2/posts",
                    json=payload,
                    headers=headers,
                )
                r.raise_for_status()
                data = r.json()
            return {
                "success": True,
                "platform": "wordpress",
                "id": str(data.get("id", "")),
                "url": data.get("link", ""),
                "status": data.get("status", ""),
                "title": title,
                "published_at": data.get("date", ""),
            }
        except httpx.HTTPStatusError as e:
            return {"success": False, "platform": "wordpress", "error": str(e),
                    "detail": e.response.text[:500]}
        except Exception as e:
            return {"success": False, "platform": "wordpress", "error": str(e)}

    # ── Tistory ───────────────────────────────────────────────────────────────
    def publish_tistory(
        self,
        title: str,
        content: str,
        visibility: int = 3,           # 0=비공개, 1=보호, 3=공개
        category_id: int = 0,
        tag: str = "",
    ) -> Dict[str, Any]:
        """Tistory Open API로 포스트 발행."""
        creds = self.credentials.get("tistory", {})
        access_token = creds.get("access_token", "")
        blog_name = creds.get("blog_name", "")

        if not access_token or not blog_name:
            return {
                "success": False,
                "error": "Tistory 인증 정보가 없습니다.",
                "requires_setup": True,
                "platform": "tistory",
                "required_fields": PLATFORM_INFO["tistory"]["required_fields"],
            }

        try:
            with httpx.Client(timeout=30) as client:
                r = client.post(
                    "https://www.tistory.com/apis/post/write",
                    data={
                        "access_token": access_token,
                        "output": "json",
                        "blogName": blog_name,
                        "title": title,
                        "content": content,
                        "visibility": visibility,
                        "category": category_id,
                        "tag": tag,
                    },
                )
                r.raise_for_status()
                data = r.json()

            tistory_data = data.get("tistory", {})
            post_id = tistory_data.get("postId", "")
            return {
                "success": True,
                "platform": "tistory",
                "id": str(post_id),
                "url": f"https://{blog_name}.tistory.com/{post_id}",
                "title": title,
                "published_at": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            return {"success": False, "platform": "tistory", "error": str(e)}

    # ── Google Blogger ────────────────────────────────────────────────────────
    def publish_blogger(
        self,
        title: str,
        content: str,
        labels: List[str] = None,
        is_draft: bool = False,
    ) -> Dict[str, Any]:
        """Google Blogger API v3로 포스트 발행."""
        creds = self.credentials.get("blogger", {})
        blog_id = creds.get("blog_id", "")
        oauth_token = creds.get("oauth_token", "")

        if not blog_id or not oauth_token:
            return {
                "success": False,
                "error": "Blogger 인증 정보가 없습니다.",
                "requires_setup": True,
                "platform": "blogger",
                "required_fields": PLATFORM_INFO["blogger"]["required_fields"],
            }

        headers = {
            "Authorization": f"Bearer {oauth_token}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "kind": "blogger#post",
            "title": title,
            "content": content,
        }
        if labels:
            payload["labels"] = labels

        url = f"https://www.googleapis.com/blogger/v3/blogs/{blog_id}/posts/"
        if is_draft:
            url += "?isDraft=true"

        try:
            with httpx.Client(timeout=30) as client:
                r = client.post(url, json=payload, headers=headers)
                r.raise_for_status()
                data = r.json()
            return {
                "success": True,
                "platform": "blogger",
                "id": data.get("id", ""),
                "url": data.get("url", ""),
                "title": title,
                "published_at": data.get("published", ""),
            }
        except httpx.HTTPStatusError as e:
            return {"success": False, "platform": "blogger", "error": str(e),
                    "detail": e.response.text[:500]}
        except Exception as e:
            return {"success": False, "platform": "blogger", "error": str(e)}

    # ── YouTube ───────────────────────────────────────────────────────────────
    def upload_youtube(
        self,
        video_path: str,
        title: str,
        description: str = "",
        tags: List[str] = None,
        category_id: str = "22",       # 22=People & Blogs, 28=Science & Technology
        privacy: str = "private",      # private | unlisted | public
        language: str = "ko",
    ) -> Dict[str, Any]:
        """YouTube Data API v3로 영상 업로드."""
        creds = self.credentials.get("youtube", {})
        oauth_token = creds.get("oauth_token", "")

        if not oauth_token:
            return {
                "success": False,
                "error": "YouTube OAuth 토큰이 없습니다.",
                "requires_setup": True,
                "platform": "youtube",
                "required_fields": PLATFORM_INFO["youtube"]["required_fields"],
                "guide": PLATFORM_INFO["youtube"]["guide"],
            }

        if not os.path.exists(video_path):
            return {"success": False, "error": f"영상 파일을 찾을 수 없습니다: {video_path}"}

        metadata = {
            "snippet": {
                "title": title,
                "description": description,
                "tags": tags or [],
                "categoryId": category_id,
                "defaultLanguage": language,
            },
            "status": {
                "privacyStatus": privacy,
                "selfDeclaredMadeForKids": False,
            },
        }

        url = (
            "https://www.googleapis.com/upload/youtube/v3/videos"
            "?uploadType=multipart&part=snippet,status"
        )
        headers = {"Authorization": f"Bearer {oauth_token}"}
        boundary = "han_group_os_boundary"

        meta_part = (
            f"--{boundary}\r\n"
            f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
            f"{json.dumps(metadata, ensure_ascii=False)}\r\n"
            f"--{boundary}\r\n"
            f"Content-Type: video/*\r\n\r\n"
        ).encode("utf-8")
        end_part = f"\r\n--{boundary}--".encode("utf-8")

        try:
            with open(video_path, "rb") as f:
                video_bytes = f.read()

            body = meta_part + video_bytes + end_part
            headers["Content-Type"] = f"multipart/related; boundary={boundary}"

            with httpx.Client(timeout=600) as client:  # 10분 타임아웃 (대용량 파일)
                r = client.post(url, content=body, headers=headers)
                r.raise_for_status()
                data = r.json()

            video_id = data.get("id", "")
            return {
                "success": True,
                "platform": "youtube",
                "id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "title": title,
                "privacy": privacy,
                "upload_status": data.get("status", {}).get("uploadStatus", ""),
                "published_at": datetime.utcnow().isoformat(),
            }
        except httpx.HTTPStatusError as e:
            return {"success": False, "platform": "youtube", "error": str(e),
                    "detail": e.response.text[:500]}
        except Exception as e:
            return {"success": False, "platform": "youtube", "error": str(e)}

    def get_youtube_auth_url(self, client_id: str, redirect_uri: str = "urn:ietf:wg:oauth:2.0:oob") -> str:
        """YouTube OAuth 2.0 인증 URL 생성 (수동 인증 흐름)."""
        scope = "https://www.googleapis.com/auth/youtube.upload"
        return (
            f"https://accounts.google.com/o/oauth2/auth"
            f"?client_id={client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&scope={scope}"
            f"&response_type=code"
            f"&access_type=offline"
        )

    def exchange_youtube_code(self, code: str, client_id: str,
                               client_secret: str,
                               redirect_uri: str = "urn:ietf:wg:oauth:2.0:oob") -> Dict[str, Any]:
        """인증 코드를 OAuth 토큰으로 교환."""
        try:
            with httpx.Client(timeout=30) as client:
                r = client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                r.raise_for_status()
                return r.json()
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def get_platform_info() -> Dict[str, Any]:
        """플랫폼별 설정 안내 반환."""
        return PLATFORM_INFO
