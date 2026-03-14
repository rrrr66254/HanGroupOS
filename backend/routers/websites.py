"""
Website Builder API — 계열사 웹사이트 생성, 배포, 도메인 관리.
"""
import asyncio
import re as _re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user
from models.models import (
    WebsiteProject, WebsiteDeploy, Company, User, ExternalApiKey,
)
from schemas.schemas import (
    WebsiteProjectCreate, WebsiteProjectUpdate, WebsiteProjectOut,
    WebsiteDeployOut, WebsiteGenerateRequest, DomainCheckRequest,
    DomainConnectRequest,
)
from services.website_builder import (
    generate_site_html, generate_ai_content,
    create_cf_pages_project, deploy_to_cf_pages, delete_cf_pages_project,
    connect_custom_domain, check_domain_availability, get_cf_zones,
)

router = APIRouter(prefix="/api/websites", tags=["websites"])


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[WebsiteProjectOut])
def list_websites(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(WebsiteProject)
    if company_id:
        q = q.filter(WebsiteProject.company_id == company_id)
    return q.order_by(WebsiteProject.created_at.desc()).all()


@router.get("/{project_id}", response_model=WebsiteProjectOut)
def get_website(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    project = db.query(WebsiteProject).filter(WebsiteProject.id == project_id).first()
    if not project:
        raise HTTPException(404, "Website project not found")
    return project


@router.post("", response_model=WebsiteProjectOut)
def create_website(
    req: WebsiteProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == req.company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    # slug 중복 체크
    existing = db.query(WebsiteProject).filter(WebsiteProject.slug == req.slug).first()
    if existing:
        raise HTTPException(400, f"Slug '{req.slug}' already exists")

    project = WebsiteProject(
        company_id=req.company_id,
        name=req.name,
        slug=req.slug,
        template=req.template,
        custom_domain=req.custom_domain,
        site_config=req.site_config or {},
        created_by=current_user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.patch("/{project_id}", response_model=WebsiteProjectOut)
def update_website(
    project_id: int,
    req: WebsiteProjectUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    project = db.query(WebsiteProject).filter(WebsiteProject.id == project_id).first()
    if not project:
        raise HTTPException(404, "Website project not found")

    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_website(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    project = db.query(WebsiteProject).filter(WebsiteProject.id == project_id).first()
    if not project:
        raise HTTPException(404, "Website project not found")

    # Cloudflare 프로젝트 삭제 (있으면)
    if project.cf_project_name:
        try:
            asyncio.get_event_loop().run_until_complete(
                delete_cf_pages_project(project.cf_project_name, db)
            )
        except Exception:
            pass

    db.query(WebsiteDeploy).filter(WebsiteDeploy.project_id == project_id).delete()
    db.delete(project)
    db.commit()
    return {"ok": True}


# ── AI 콘텐츠 생성 ──────────────────────────────────────────────────────────

@router.post("/{project_id}/generate-content")
def generate_content(
    project_id: int,
    req: WebsiteGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI로 웹사이트 콘텐츠 자동 생성."""
    project = db.query(WebsiteProject).filter(WebsiteProject.id == project_id).first()
    if not project:
        raise HTTPException(404, "Website project not found")

    company = db.query(Company).filter(Company.id == project.company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    # AI Provider
    from routers.chat import get_provider_from_db
    provider = get_provider_from_db(db, current_user.id)

    ai_content = generate_ai_content(
        company_name=company.name,
        industry=company.industry or "",
        provider=provider,
        description=req.description or "",
    )

    # HTML 생성
    html = generate_site_html(
        company_name=company.name,
        industry=company.industry or "",
        template=project.template,
        site_config=project.site_config or {},
        pages_data=project.pages_data or [],
        ai_content=ai_content,
    )

    # 저장
    config = dict(project.site_config or {})
    config["ai_content"] = ai_content
    config["generated_html"] = html
    project.site_config = config
    project.status = "building"
    db.commit()
    db.refresh(project)

    return {
        "ok": True,
        "ai_content": ai_content,
        "html_preview_length": len(html),
    }


# ── 배포 ─────────────────────────────────────────────────────────────────────

@router.post("/{project_id}/deploy", response_model=WebsiteDeployOut)
async def deploy_website(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cloudflare Pages에 배포."""
    project = db.query(WebsiteProject).filter(WebsiteProject.id == project_id).first()
    if not project:
        raise HTTPException(404, "Website project not found")

    html = (project.site_config or {}).get("generated_html", "")
    if not html:
        raise HTTPException(400, "먼저 콘텐츠를 생성해주세요 (generate-content)")

    # CF 프로젝트 이름
    cf_name = project.cf_project_name or f"han-{project.slug}"

    # 배포 레코드 생성
    deploy = WebsiteDeploy(
        project_id=project_id,
        deploy_type="manual",
        status="building",
    )
    db.add(deploy)
    db.commit()

    try:
        # 1. 프로젝트가 없으면 생성
        if not project.cf_project_name:
            create_result = await create_cf_pages_project(cf_name, db)
            if not create_result["success"]:
                deploy.status = "failed"
                deploy.error_message = str(create_result.get("error", "프로젝트 생성 실패"))
                project.status = "failed"
                db.commit()
                db.refresh(deploy)
                return deploy

            project.cf_project_name = cf_name

        # 2. 배포
        deploy_result = await deploy_to_cf_pages(cf_name, html, db)

        if deploy_result["success"]:
            deploy.status = "success"
            deploy.cf_deployment_id = deploy_result.get("deployment_id")
            deploy.cf_url = deploy_result.get("url")
            deploy.completed_at = datetime.utcnow()

            project.status = "deployed"
            project.cf_deployment_id = deploy_result.get("deployment_id")
            project.cf_deployment_url = deploy_result.get("url")
            project.deployed_at = datetime.utcnow()
        else:
            deploy.status = "failed"
            deploy.error_message = str(deploy_result.get("error", "배포 실패"))
            project.status = "failed"

    except Exception as e:
        deploy.status = "failed"
        deploy.error_message = str(e)
        project.status = "failed"

    db.commit()
    db.refresh(deploy)
    return deploy


@router.get("/{project_id}/deploys", response_model=List[WebsiteDeployOut])
def list_deploys(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(WebsiteDeploy)
        .filter(WebsiteDeploy.project_id == project_id)
        .order_by(WebsiteDeploy.created_at.desc())
        .limit(20)
        .all()
    )


# ── 도메인 관리 ──────────────────────────────────────────────────────────────

@router.post("/domain/check")
async def domain_check(
    req: DomainCheckRequest,
    _: User = Depends(get_current_user),
):
    """도메인 가용성 조회."""
    result = await check_domain_availability(req.domain)
    return result


@router.post("/{project_id}/domain/connect")
async def domain_connect(
    project_id: int,
    req: DomainConnectRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """커스텀 도메인 연결."""
    project = db.query(WebsiteProject).filter(WebsiteProject.id == project_id).first()
    if not project:
        raise HTTPException(404, "Website project not found")
    if not project.cf_project_name:
        raise HTTPException(400, "먼저 배포를 진행해주세요")

    result = await connect_custom_domain(project.cf_project_name, req.domain, db)

    if result["success"]:
        project.custom_domain = req.domain
        project.domain_status = "pending"
        db.commit()

    return result


@router.get("/cloudflare/zones")
async def list_zones(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Cloudflare에 등록된 도메인(Zone) 목록."""
    zones = await get_cf_zones(db)
    return {"zones": zones}


@router.get("/{project_id}/preview")
def preview_website(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """생성된 HTML 미리보기."""
    project = db.query(WebsiteProject).filter(WebsiteProject.id == project_id).first()
    if not project:
        raise HTTPException(404, "Website project not found")

    html = (project.site_config or {}).get("generated_html", "")
    if not html:
        raise HTTPException(400, "콘텐츠가 아직 생성되지 않았습니다")

    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)


# ── Cloudflare API 키 설정 ───────────────────────────────────────────────────

@router.get("/settings/cloudflare")
def get_cf_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Cloudflare API 설정 상태 조회."""
    token_row = db.query(ExternalApiKey).filter(
        ExternalApiKey.service == "cloudflare",
        ExternalApiKey.key_name == "cloudflare_api_token",
    ).first()
    account_row = db.query(ExternalApiKey).filter(
        ExternalApiKey.service == "cloudflare",
        ExternalApiKey.key_name == "cloudflare_account_id",
    ).first()

    return {
        "api_token_configured": bool(token_row and token_row.key_value),
        "account_id_configured": bool(account_row and account_row.key_value),
        "account_id": account_row.key_value if account_row else None,
    }


@router.post("/settings/cloudflare")
def save_cf_settings(
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Cloudflare API 키 저장."""
    for key_name in ["cloudflare_api_token", "cloudflare_account_id"]:
        value = data.get(key_name, "")
        if not value:
            continue
        row = db.query(ExternalApiKey).filter(
            ExternalApiKey.service == "cloudflare",
            ExternalApiKey.key_name == key_name,
        ).first()
        if row:
            row.key_value = value
        else:
            row = ExternalApiKey(
                service="cloudflare",
                key_name=key_name,
                key_value=value,
                description=f"Cloudflare {key_name}",
            )
            db.add(row)
    db.commit()
    return {"ok": True}
