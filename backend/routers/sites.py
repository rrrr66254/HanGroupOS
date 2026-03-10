from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime
from core.database import get_db
from core.security import get_current_user
from models.models import CompanySite, SitePage, SiteSubmission, Company
from services.site_service import generate_and_save_site, generate_multipage_site, evaluate_all_sites

router = APIRouter()


# ── Public: serve multipage site ─────────────────────────────────────────────
@router.get("/sites/{slug}/{page_slug}", response_class=HTMLResponse, include_in_schema=False)
def serve_site_page(slug: str, page_slug: str, db: Session = Depends(get_db)):
    site = db.query(CompanySite).filter(
        CompanySite.slug == slug,
        CompanySite.status == "live",
    ).first()
    if not site:
        return HTMLResponse("<h1>404 — Site not found or not yet deployed</h1>", status_code=404)
    page = db.query(SitePage).filter(
        SitePage.site_id == site.id,
        SitePage.slug == page_slug,
        SitePage.is_active == True,
    ).first()
    if not page:
        return HTMLResponse("<h1>404 — Page not found</h1>", status_code=404)
    site.visits = (site.visits or 0) + 1
    db.commit()
    return HTMLResponse(page.html_content)


# ── Public: serve site HTML ───────────────────────────────────────────────────
@router.get("/sites/{slug}", response_class=HTMLResponse, include_in_schema=False)
def serve_site(slug: str, db: Session = Depends(get_db)):
    site = db.query(CompanySite).filter(
        CompanySite.slug == slug,
        CompanySite.status == "live"
    ).first()
    if not site:
        return HTMLResponse("<h1>404 — Site not found or not yet deployed</h1>", status_code=404)
    site.visits = (site.visits or 0) + 1
    db.commit()
    return HTMLResponse(site.html_content)


# ── Public: submit contact form ───────────────────────────────────────────────
@router.post("/sites/{slug}/submit", include_in_schema=False)
async def submit_form(slug: str, request_body: dict = None, db: Session = Depends(get_db)):
    site = db.query(CompanySite).filter(CompanySite.slug == slug).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    submission = SiteSubmission(
        site_id=site.id,
        company_id=site.company_id,
        form_data=request_body or {},
        source="contact",
    )
    db.add(submission)
    db.commit()
    return {"ok": True, "message": "제출 완료"}


# ── API: generate site for a company ─────────────────────────────────────────
@router.post("/api/sites/generate/{company_id}")
def generate_site(
    company_id: int,
    template_type: str = Query("corporate"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    site = generate_and_save_site(db, company_id, template_type)
    if not site:
        raise HTTPException(status_code=404, detail="Company not found")
    company = db.query(Company).filter(Company.id == company_id).first()
    return _site_dict(site, company.name if company else None)


# ── API: list all sites ───────────────────────────────────────────────────────
@router.get("/api/sites")
def list_sites(
    status: str = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(CompanySite, Company.name).join(
        Company, Company.id == CompanySite.company_id, isouter=True
    )
    if status:
        q = q.filter(CompanySite.status == status)
    rows = q.order_by(CompanySite.created_at.desc()).all()
    return [_site_dict(s, cname) for s, cname in rows]


# ── API: get company site ─────────────────────────────────────────────────────
@router.get("/api/sites/company/{company_id}")
def get_company_site(
    company_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(CompanySite, Company.name).join(
        Company, Company.id == CompanySite.company_id, isouter=True
    ).filter(CompanySite.company_id == company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No site for this company")
    site, cname = row
    return _site_dict(site, cname)


# ── API: get site HTML ────────────────────────────────────────────────────────
@router.get("/api/sites/{site_id}/html")
def get_site_html(
    site_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    site = db.query(CompanySite).filter(CompanySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return {"html": site.html_content}


# ── API: update HTML manually ─────────────────────────────────────────────────
@router.patch("/api/sites/{site_id}/html")
def update_site_html(
    site_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    site = db.query(CompanySite).filter(CompanySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    site.html_content = body.get("html", site.html_content)
    db.commit()
    return _site_dict(site)


# ── API: deploy site ──────────────────────────────────────────────────────────
@router.post("/api/sites/{site_id}/deploy")
def deploy_site(
    site_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    site = db.query(CompanySite).filter(CompanySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    site.status = "live"
    site.deployed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "slug": site.slug, "url": f"/sites/{site.slug}"}


# ── API: undeploy site ────────────────────────────────────────────────────────
@router.post("/api/sites/{site_id}/undeploy")
def undeploy_site(
    site_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    site = db.query(CompanySite).filter(CompanySite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    site.status = "draft"
    db.commit()
    return {"ok": True}


# ── API: view submissions ─────────────────────────────────────────────────────
@router.get("/api/sites/{site_id}/submissions")
def get_submissions(
    site_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    subs = db.query(SiteSubmission).filter(
        SiteSubmission.site_id == site_id
    ).order_by(SiteSubmission.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "form_data": s.form_data,
            "source": s.source,
            "created_at": s.created_at.isoformat(),
        }
        for s in subs
    ]


# ── API: AI evaluate all live sites ──────────────────────────────────────────
@router.post("/api/sites/evaluate")
def run_evaluation(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    results = evaluate_all_sites(db)
    return {"evaluated": len(results), "results": results}


# ── helper ────────────────────────────────────────────────────────────────────
def _site_dict(s: CompanySite, company_name: str = None):
    return {
        "id": s.id,
        "company_id": s.company_id,
        "company_name": company_name,
        "title": s.title,
        "slug": s.slug,
        "status": s.status,
        "template_type": s.template_type,
        "ai_score": s.ai_score,
        "ai_feedback": s.ai_feedback,
        "visits": s.visits or 0,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "deployed_at": s.deployed_at.isoformat() if s.deployed_at else None,
    }


# ── API: Multipage site ───────────────────────────────────────────────────────
@router.post("/api/sites/{site_id}/pages/generate")
def generate_pages(
    site_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """사이트의 4개 페이지(홈/소개/서비스/문의)를 AI로 생성합니다."""
    try:
        pages = generate_multipage_site(db, site_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"generated": len(pages), "pages": [_page_dict(p) for p in pages]}


@router.get("/api/sites/{site_id}/pages")
def list_pages(
    site_id: int,
    include_html: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """사이트의 페이지 목록을 반환합니다. include_html=true이면 HTML도 포함."""
    pages = (
        db.query(SitePage)
        .filter(SitePage.site_id == site_id)
        .order_by(SitePage.page_order)
        .all()
    )
    return [_page_dict(p, include_html=include_html) for p in pages]


@router.get("/api/sites/{site_id}/pages/{page_id}/html")
def get_page_html(
    site_id: int,
    page_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    page = db.query(SitePage).filter(
        SitePage.id == page_id, SitePage.site_id == site_id
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"html": page.html_content}


@router.patch("/api/sites/{site_id}/pages/{page_id}")
def update_page(
    site_id: int,
    page_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """페이지 HTML을 수동으로 수정합니다."""
    page = db.query(SitePage).filter(
        SitePage.id == page_id, SitePage.site_id == site_id
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if "html" in body:
        page.html_content = body["html"]
    if "title" in body:
        page.title = body["title"]
    db.commit()
    return _page_dict(page)


def _page_dict(p: SitePage, include_html: bool = False) -> dict:
    d = {
        "id": p.id,
        "site_id": p.site_id,
        "slug": p.slug,
        "title": p.title,
        "page_order": p.page_order,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
    if include_html:
        d["html_content"] = p.html_content
    return d


# ── API: generate IR presentation ─────────────────────────────────────────────
@router.post("/api/sites/ir/{company_id}")
def generate_ir(
    company_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from services.ir_service import generate_ir_report
    html = generate_ir_report(db, company_id, current_user.id)
    if not html:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"html": html, "company_id": company_id}
