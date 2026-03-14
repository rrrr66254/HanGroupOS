"""
Website Builder Service — Cloudflare Pages 배포 + DNS 도메인 관리.

기능:
- AI 기반 웹사이트 콘텐츠 자동 생성 (업종 맞춤)
- Cloudflare Pages API로 정적 사이트 배포
- Cloudflare DNS API로 커스텀 도메인 연결
- WHOIS 도메인 가용성 조회
"""
import os
import json
import logging
import tempfile
import shutil
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Cloudflare API 설정 ──────────────────────────────────────────────────────
CF_API_BASE = "https://api.cloudflare.com/client/v4"


def _get_cf_headers(db_session=None, user_id: int = 0) -> dict:
    """ExternalApiKey에서 Cloudflare API 토큰 조회."""
    token = os.getenv("CLOUDFLARE_API_TOKEN", "")
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")

    if db_session and (not token or not account_id):
        from models.models import ExternalApiKey
        for key_name, env_name in [
            ("cloudflare_api_token", "token"),
            ("cloudflare_account_id", "account_id"),
        ]:
            row = db_session.query(ExternalApiKey).filter(
                ExternalApiKey.service == "cloudflare",
                ExternalApiKey.key_name == key_name,
            ).first()
            if row:
                if env_name == "token":
                    token = row.key_value
                else:
                    account_id = row.key_value

    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }, account_id


# ── 템플릿 생성 ─────────────────────────────────────────────────────────────

TEMPLATE_STYLES = {
    "corporate": {
        "primary_color": "#1e40af",
        "sections": ["hero", "about", "services", "contact"],
    },
    "landing": {
        "primary_color": "#059669",
        "sections": ["hero", "features", "cta", "footer"],
    },
    "portfolio": {
        "primary_color": "#7c3aed",
        "sections": ["hero", "works", "about", "contact"],
    },
    "ecommerce": {
        "primary_color": "#dc2626",
        "sections": ["hero", "products", "about", "contact"],
    },
}


def generate_site_html(
    company_name: str,
    industry: str,
    template: str,
    site_config: dict,
    pages_data: list,
    ai_content: Optional[dict] = None,
) -> str:
    """정적 HTML 웹사이트 생성."""
    style = TEMPLATE_STYLES.get(template, TEMPLATE_STYLES["corporate"])
    primary = site_config.get("primary_color", style["primary_color"])
    tagline = site_config.get("tagline", f"{company_name} — {industry} 전문 기업")
    description = site_config.get("description", f"{company_name}은(는) {industry} 분야의 혁신적인 기업입니다.")

    if ai_content:
        tagline = ai_content.get("tagline", tagline)
        description = ai_content.get("description", description)

    services_html = ""
    if ai_content and "services" in ai_content:
        for svc in ai_content["services"][:6]:
            services_html += f"""
            <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
              <h3 style="font-size:1.25rem;font-weight:700;margin-bottom:8px;color:#1e293b">{svc.get('name','')}</h3>
              <p style="color:#64748b;line-height:1.6">{svc.get('description','')}</p>
            </div>"""
    else:
        for i in range(3):
            services_html += f"""
            <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
              <h3 style="font-size:1.25rem;font-weight:700;margin-bottom:8px;color:#1e293b">서비스 {i+1}</h3>
              <p style="color:#64748b;line-height:1.6">서비스 설명을 입력해주세요.</p>
            </div>"""

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>{company_name}</title>
  <meta name="description" content="{description}">
  <style>
    *{{margin:0;padding:0;box-sizing:border-box}}
    body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b}}
    .hero{{background:linear-gradient(135deg,{primary},#1e293b);color:#fff;padding:120px 24px;text-align:center}}
    .hero h1{{font-size:3rem;font-weight:800;margin-bottom:16px}}
    .hero p{{font-size:1.25rem;opacity:.9;max-width:600px;margin:0 auto 32px}}
    .hero a{{display:inline-block;background:#fff;color:{primary};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700}}
    .section{{max-width:1200px;margin:0 auto;padding:80px 24px}}
    .section h2{{font-size:2rem;font-weight:700;margin-bottom:40px;text-align:center}}
    .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}}
    .about{{background:#f8fafc;padding:80px 24px}}
    .about .inner{{max-width:800px;margin:0 auto;text-align:center}}
    .about p{{font-size:1.125rem;line-height:1.8;color:#475569}}
    .contact{{background:{primary};color:#fff;padding:80px 24px;text-align:center}}
    .contact h2{{color:#fff}}
    .contact p{{opacity:.9;margin-bottom:24px}}
    .contact a{{color:#fff;border:2px solid #fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600}}
    footer{{background:#0f172a;color:#94a3b8;text-align:center;padding:32px}}
  </style>
</head>
<body>
  <section class="hero">
    <h1>{company_name}</h1>
    <p>{tagline}</p>
    <a href="#contact">문의하기</a>
  </section>

  <section class="about">
    <div class="inner">
      <h2>회사 소개</h2>
      <p>{description}</p>
    </div>
  </section>

  <section class="section">
    <h2>서비스</h2>
    <div class="grid">{services_html}</div>
  </section>

  <section class="contact" id="contact">
    <h2>문의</h2>
    <p>{company_name}에 대해 더 알고 싶으시다면 연락주세요.</p>
    <a href="mailto:contact@{company_name.lower().replace(' ','-')}.com">이메일 보내기</a>
  </section>

  <footer>
    <p>&copy; {datetime.now().year} {company_name}. All rights reserved.</p>
    <p style="margin-top:8px;font-size:.75rem">Powered by HAN Group OS</p>
  </footer>
</body>
</html>"""
    return html


def generate_ai_content(company_name: str, industry: str, provider, description: str = "") -> dict:
    """AI로 웹사이트 콘텐츠 생성."""
    prompt = (
        f"회사명: {company_name}\n업종: {industry}\n"
        f"{'추가설명: ' + description if description else ''}\n\n"
        f"이 회사의 웹사이트 콘텐츠를 JSON으로 생성하세요:\n"
        f'{{"tagline":"회사 슬로건(1줄)","description":"회사 소개(3-4문장)",'
        f'"services":[{{"name":"서비스명","description":"설명"}}] (3-4개)}}'
    )
    try:
        raw = provider.chat(
            [{"role": "user", "content": prompt}],
            system="웹사이트 콘텐츠를 생성하는 마케팅 전문가입니다. JSON만 출력하세요.",
            session_type="website",
        )
        import re
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception as e:
        logger.warning(f"AI content generation failed: {e}")
    return {}


# ── Cloudflare Pages API ─────────────────────────────────────────────────────

async def create_cf_pages_project(project_name: str, db_session=None) -> dict:
    """Cloudflare Pages 프로젝트 생성."""
    headers, account_id = _get_cf_headers(db_session)
    if not account_id:
        return {"success": False, "error": "Cloudflare account_id가 설정되지 않았습니다."}

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{CF_API_BASE}/accounts/{account_id}/pages/projects",
            headers=headers,
            json={
                "name": project_name,
                "production_branch": "main",
            },
        )
        data = res.json()
        if data.get("success"):
            return {
                "success": True,
                "project": data["result"],
                "url": f"https://{project_name}.pages.dev",
            }
        return {"success": False, "error": data.get("errors", [{"message": "Unknown error"}])}


async def deploy_to_cf_pages(
    project_name: str,
    html_content: str,
    db_session=None,
) -> dict:
    """HTML을 Cloudflare Pages에 직접 배포 (Direct Upload)."""
    headers, account_id = _get_cf_headers(db_session)
    if not account_id:
        return {"success": False, "error": "Cloudflare account_id가 설정되지 않았습니다."}

    # 임시 디렉토리에 파일 생성
    tmp_dir = tempfile.mkdtemp(prefix="cf_deploy_")
    try:
        index_path = os.path.join(tmp_dir, "index.html")
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        # Cloudflare Pages Direct Upload API
        upload_headers = {
            "Authorization": headers["Authorization"],
        }

        async with httpx.AsyncClient(timeout=60) as client:
            with open(index_path, "rb") as f:
                res = await client.post(
                    f"{CF_API_BASE}/accounts/{account_id}/pages/projects/{project_name}/deployments",
                    headers=upload_headers,
                    files={"index.html": ("index.html", f, "text/html")},
                )
            data = res.json()
            if data.get("success"):
                result = data["result"]
                return {
                    "success": True,
                    "deployment_id": result.get("id"),
                    "url": result.get("url", f"https://{project_name}.pages.dev"),
                }
            return {"success": False, "error": data.get("errors", [{"message": "Deploy failed"}])}
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def delete_cf_pages_project(project_name: str, db_session=None) -> dict:
    """Cloudflare Pages 프로젝트 삭제."""
    headers, account_id = _get_cf_headers(db_session)
    if not account_id:
        return {"success": False, "error": "Cloudflare account_id가 설정되지 않았습니다."}

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.delete(
            f"{CF_API_BASE}/accounts/{account_id}/pages/projects/{project_name}",
            headers=headers,
        )
        data = res.json()
        return {"success": data.get("success", False)}


# ── Cloudflare DNS API ───────────────────────────────────────────────────────

async def get_cf_zones(db_session=None) -> list:
    """등록된 Cloudflare 도메인(Zone) 목록 조회."""
    headers, _ = _get_cf_headers(db_session)

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(f"{CF_API_BASE}/zones", headers=headers)
        data = res.json()
        if data.get("success"):
            return [
                {"id": z["id"], "name": z["name"], "status": z["status"]}
                for z in data.get("result", [])
            ]
    return []


async def add_dns_record(
    zone_id: str,
    record_type: str,
    name: str,
    content: str,
    proxied: bool = True,
    db_session=None,
) -> dict:
    """DNS 레코드 추가 (CNAME, A 등)."""
    headers, _ = _get_cf_headers(db_session)

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{CF_API_BASE}/zones/{zone_id}/dns_records",
            headers=headers,
            json={
                "type": record_type,
                "name": name,
                "content": content,
                "proxied": proxied,
            },
        )
        data = res.json()
        if data.get("success"):
            return {"success": True, "record": data["result"]}
        return {"success": False, "error": data.get("errors", [])}


async def connect_custom_domain(
    project_name: str,
    domain: str,
    db_session=None,
) -> dict:
    """Cloudflare Pages에 커스텀 도메인 연결.

    1. Pages 프로젝트에 커스텀 도메인 추가
    2. DNS CNAME 레코드 자동 생성 (Zone이 Cloudflare에 있는 경우)
    """
    headers, account_id = _get_cf_headers(db_session)
    if not account_id:
        return {"success": False, "error": "Cloudflare account_id 미설정"}

    result = {"success": False, "steps": []}

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Pages 프로젝트에 도메인 추가
        res = await client.post(
            f"{CF_API_BASE}/accounts/{account_id}/pages/projects/{project_name}/domains",
            headers=headers,
            json={"name": domain},
        )
        data = res.json()
        if data.get("success"):
            result["steps"].append({"action": "add_domain", "status": "ok"})
        else:
            result["steps"].append({"action": "add_domain", "status": "error", "detail": data.get("errors", [])})
            result["error"] = "도메인 추가 실패"
            return result

        # 2. Zone 자동 탐색 (도메인이 Cloudflare에 등록된 경우)
        root_domain = ".".join(domain.split(".")[-2:])
        zones = await get_cf_zones(db_session)
        zone = next((z for z in zones if z["name"] == root_domain), None)

        if zone:
            # CNAME 레코드 자동 생성
            dns_result = await add_dns_record(
                zone_id=zone["id"],
                record_type="CNAME",
                name=domain,
                content=f"{project_name}.pages.dev",
                proxied=True,
                db_session=db_session,
            )
            result["steps"].append({
                "action": "dns_cname",
                "status": "ok" if dns_result["success"] else "error",
                "detail": dns_result,
            })
        else:
            result["steps"].append({
                "action": "dns_cname",
                "status": "manual",
                "detail": f"도메인 '{root_domain}'이 Cloudflare에 등록되지 않음. 수동으로 CNAME {domain} → {project_name}.pages.dev 설정 필요.",
            })

    result["success"] = True
    return result


async def check_domain_availability(domain: str) -> dict:
    """WHOIS를 통해 도메인 가용성 조회."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"https://rdap.org/domain/{domain}",
                follow_redirects=True,
            )
            if res.status_code == 404:
                return {"domain": domain, "available": True}
            elif res.status_code == 200:
                return {"domain": domain, "available": False}
            return {"domain": domain, "available": None, "error": f"Status {res.status_code}"}
    except Exception as e:
        return {"domain": domain, "available": None, "error": str(e)}
