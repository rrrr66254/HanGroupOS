"""
Site Service: AI-powered website generation and evaluation for subsidiaries.
"""
import re
import json
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from models.models import Company, CompanySite, SiteSubmission, SitePage, ProviderConfig, OrgNode
from services.ai_provider import AIProvider


# ── HTML Template ─────────────────────────────────────────────────────────────
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  :root {{
    --primary: {primary_color};
    --bg: #0f1117;
    --bg2: #161a24;
    --card: #1e2233;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --border: rgba(255,255,255,0.08);
  }}
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }}
  a {{ color: var(--primary); text-decoration: none; }}

  /* Nav */
  nav {{ position: fixed; top:0; left:0; right:0; z-index:100; backdrop-filter: blur(16px);
         background: rgba(15,17,23,0.85); border-bottom: 1px solid var(--border);
         padding: 0 2rem; display: flex; align-items: center; justify-content: space-between; height: 64px; }}
  .logo {{ font-size: 1.25rem; font-weight: 700; color: var(--primary); }}
  .nav-links {{ display: flex; gap: 2rem; }}
  .nav-links a {{ color: var(--muted); font-size: 0.9rem; transition: color 0.2s; }}
  .nav-links a:hover {{ color: var(--text); }}
  .nav-cta {{ background: var(--primary); color: #fff !important; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 600; }}

  /* Hero */
  .hero {{ min-height: 100vh; display: flex; align-items: center; justify-content: center;
           text-align: center; padding: 6rem 2rem 4rem; position: relative; overflow: hidden; }}
  .hero::before {{ content: ''; position: absolute; width: 600px; height: 600px; border-radius: 50%;
                   background: radial-gradient(circle, {primary_color}22, transparent 70%);
                   top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; }}
  .hero-badge {{ display: inline-block; background: {primary_color}20; border: 1px solid {primary_color}40;
                 color: var(--primary); font-size: 0.8rem; font-weight: 600; padding: 0.35rem 1rem;
                 border-radius: 999px; margin-bottom: 1.5rem; letter-spacing: 0.05em; }}
  .hero h1 {{ font-size: clamp(2.2rem, 5vw, 4rem); font-weight: 800; line-height: 1.15;
              background: linear-gradient(135deg, #fff 0%, var(--muted) 100%);
              -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 1.5rem; }}
  .hero p {{ font-size: 1.15rem; color: var(--muted); max-width: 640px; margin: 0 auto 2.5rem; }}
  .hero-btns {{ display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }}
  .btn-primary {{ background: var(--primary); color: #fff; padding: 0.85rem 2rem; border-radius: 10px;
                  font-weight: 700; font-size: 1rem; border: none; cursor: pointer; transition: opacity 0.2s; }}
  .btn-primary:hover {{ opacity: 0.85; }}
  .btn-outline {{ background: transparent; color: var(--text); padding: 0.85rem 2rem; border-radius: 10px;
                  font-weight: 600; font-size: 1rem; border: 1px solid var(--border); cursor: pointer;
                  transition: border-color 0.2s; }}
  .btn-outline:hover {{ border-color: var(--primary); }}

  /* Section */
  section {{ padding: 5rem 2rem; max-width: 1200px; margin: 0 auto; }}
  .section-label {{ font-size: 0.8rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
                    color: var(--primary); margin-bottom: 0.75rem; }}
  .section-title {{ font-size: clamp(1.8rem, 3vw, 2.8rem); font-weight: 800; margin-bottom: 1rem; }}
  .section-desc {{ color: var(--muted); font-size: 1.05rem; max-width: 640px; margin-bottom: 3rem; }}

  /* Stats */
  .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1.5rem; margin: 3rem 0; }}
  .stat {{ text-align: center; padding: 2rem; background: var(--card); border-radius: 16px; border: 1px solid var(--border); }}
  .stat-value {{ font-size: 2.5rem; font-weight: 800; color: var(--primary); }}
  .stat-label {{ font-size: 0.85rem; color: var(--muted); margin-top: 0.25rem; }}

  /* Services */
  .services {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }}
  .service-card {{ background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 2rem;
                   transition: border-color 0.2s, transform 0.2s; }}
  .service-card:hover {{ border-color: var(--primary); transform: translateY(-4px); }}
  .service-icon {{ width: 48px; height: 48px; background: {primary_color}20; border-radius: 12px;
                   display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1.25rem; }}
  .service-card h3 {{ font-size: 1.15rem; font-weight: 700; margin-bottom: 0.75rem; }}
  .service-card p {{ color: var(--muted); font-size: 0.9rem; line-height: 1.7; }}

  /* Features grid */
  .features {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }}
  @media (max-width: 640px) {{ .features {{ grid-template-columns: 1fr; }} }}
  .feature {{ display: flex; gap: 1rem; align-items: flex-start; padding: 1.25rem; background: var(--card);
              border-radius: 12px; border: 1px solid var(--border); }}
  .feature-icon {{ width: 36px; height: 36px; background: {primary_color}20; border-radius: 8px;
                   flex-shrink: 0; display: flex; align-items: center; justify-content: center; }}
  .feature h4 {{ font-size: 0.95rem; font-weight: 700; margin-bottom: 0.3rem; }}
  .feature p {{ color: var(--muted); font-size: 0.85rem; }}

  /* Contact form */
  .contact-section {{ background: var(--bg2); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }}
  .contact-inner {{ max-width: 680px; margin: 0 auto; padding: 5rem 2rem; }}
  .form-group {{ margin-bottom: 1.25rem; }}
  label {{ display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--muted); }}
  input, textarea, select {{ width: 100%; background: var(--card); border: 1px solid var(--border);
                              border-radius: 10px; padding: 0.75rem 1rem; color: var(--text); font-size: 0.95rem;
                              outline: none; transition: border-color 0.2s; font-family: inherit; }}
  input:focus, textarea:focus, select:focus {{ border-color: var(--primary); }}
  textarea {{ height: 140px; resize: vertical; }}
  .form-row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }}
  @media (max-width: 520px) {{ .form-row {{ grid-template-columns: 1fr; }} }}
  #form-msg {{ display: none; margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 8px;
               background: {primary_color}15; border: 1px solid {primary_color}40; color: var(--primary); font-size: 0.9rem; }}

  /* Footer */
  footer {{ text-align: center; padding: 2.5rem; color: var(--muted); font-size: 0.85rem;
            border-top: 1px solid var(--border); }}
  footer span {{ color: var(--primary); }}

  /* Divider */
  .divider {{ width: 100%; max-width: 1200px; margin: 0 auto; height: 1px; background: var(--border); }}

  /* Powered badge */
  .ai-badge {{ display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(99,102,241,0.1);
               border: 1px solid rgba(99,102,241,0.25); border-radius: 999px; padding: 0.3rem 0.9rem;
               font-size: 0.75rem; color: #a5b4fc; margin-top: 1rem; }}
</style>
</head>
<body>

<!-- Navigation -->
<nav>
  <div class="logo">{company_name}</div>
  <div class="nav-links">
    <a href="#about">소개</a>
    <a href="#services">서비스</a>
    <a href="#contact" class="nav-cta">문의하기</a>
  </div>
</nav>

<!-- Hero -->
<div class="hero">
  <div>
    <div class="hero-badge">{industry} · AI-Powered Company</div>
    <h1>{tagline}</h1>
    <p>{hero_desc}</p>
    <div class="hero-btns">
      <button class="btn-primary" onclick="document.getElementById('contact').scrollIntoView({{behavior:'smooth'}})">무료 상담 신청</button>
      <button class="btn-outline" onclick="document.getElementById('services').scrollIntoView({{behavior:'smooth'}})">서비스 보기</button>
    </div>
    <div class="ai-badge">⚡ Powered by HAN Group AI OS</div>
  </div>
</div>

<!-- Stats -->
<div style="background: var(--bg2); padding: 1px 0;">
  <section>
    <div class="stats">
      {stats_html}
    </div>
  </section>
</div>

<!-- About -->
<section id="about">
  <div class="section-label">회사 소개</div>
  <div class="section-title">{about_title}</div>
  <div class="section-desc">{about_desc}</div>
  <div class="features">
    {features_html}
  </div>
</section>

<div class="divider"></div>

<!-- Services -->
<section id="services">
  <div class="section-label">핵심 서비스</div>
  <div class="section-title">{services_title}</div>
  <div class="section-desc">{services_desc}</div>
  <div class="services">
    {services_html}
  </div>
</section>

<!-- Contact -->
<div class="contact-section" id="contact">
  <div class="contact-inner">
    <div class="section-label">문의</div>
    <div class="section-title" style="font-size: 2rem;">{contact_title}</div>
    <div class="section-desc">{contact_desc}</div>
    <form id="contact-form">
      <div class="form-row">
        <div class="form-group">
          <label>이름 *</label>
          <input type="text" name="name" placeholder="홍길동" required>
        </div>
        <div class="form-group">
          <label>이메일 *</label>
          <input type="email" name="email" placeholder="example@email.com" required>
        </div>
      </div>
      <div class="form-group">
        <label>회사명</label>
        <input type="text" name="company" placeholder="소속 회사">
      </div>
      <div class="form-group">
        <label>문의 유형</label>
        <select name="inquiry_type">
          <option value="general">일반 문의</option>
          <option value="partnership">파트너십</option>
          <option value="service">서비스 도입</option>
          <option value="investment">투자 제안</option>
        </select>
      </div>
      <div class="form-group">
        <label>문의 내용 *</label>
        <textarea name="message" placeholder="궁금하신 내용을 입력해주세요..." required></textarea>
      </div>
      <button type="submit" class="btn-primary" style="width:100%; font-size: 1rem; padding: 1rem;">
        문의 전송
      </button>
      <div id="form-msg">✅ 문의가 성공적으로 접수되었습니다! 빠른 시일 내에 연락드리겠습니다.</div>
    </form>
  </div>
</div>

<!-- Footer -->
<footer>
  <div style="margin-bottom: 0.5rem;">
    <strong style="color: var(--text);">{company_name}</strong> — {industry}
  </div>
  <div>© 2025 {company_name}. Powered by <span>HAN Group AI OS</span></div>
</footer>

<script>
document.getElementById('contact-form').addEventListener('submit', async function(e) {{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.textContent = '전송 중...'; btn.disabled = true;
  const data = Object.fromEntries(new FormData(e.target));
  try {{
    const resp = await fetch('/sites/{slug}/submit', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify(data)
    }});
    if (resp.ok) {{
      document.getElementById('form-msg').style.display = 'block';
      e.target.reset();
    }}
  }} catch(err) {{}}
  btn.textContent = '문의 전송'; btn.disabled = false;
}});
</script>
</body>
</html>"""


# ── AI Content Generator ──────────────────────────────────────────────────────
SITE_GEN_SYSTEM = """당신은 기업 웹사이트 콘텐츠 전문가입니다.
회사 정보를 바탕으로 매력적인 웹사이트 콘텐츠를 JSON 형식으로 생성합니다.
반드시 유효한 JSON만 출력하세요. 마크다운 코드 블록 없이 순수 JSON만 출력하세요."""


def _get_ai(db: Session) -> AIProvider:
    config = db.query(ProviderConfig).filter(ProviderConfig.is_active == True).first()
    return AIProvider(
        provider=config.provider if config else "ollama",
        api_key=config.api_key if config else None,
        model=config.model_override if config and config.model_override else None,
        base_url=config.base_url if config else None,
    )


def _color_for_industry(industry: str) -> str:
    colors = {
        "기술": "#6366f1", "tech": "#6366f1", "소프트웨어": "#6366f1",
        "콘텐츠": "#ec4899", "미디어": "#ec4899",
        "금융": "#10b981", "투자": "#10b981", "finance": "#10b981",
        "헬스": "#14b8a6", "의료": "#14b8a6", "health": "#14b8a6",
        "교육": "#f59e0b", "education": "#f59e0b",
        "물류": "#f97316", "제조": "#f97316",
        "데이터": "#8b5cf6", "ai": "#8b5cf6", "data": "#8b5cf6",
        "게임": "#06b6d4", "엔터": "#06b6d4",
    }
    low = industry.lower()
    for key, color in colors.items():
        if key in low:
            return color
    return "#6366f1"


def _slugify(text: str) -> str:
    import re, uuid
    slug = re.sub(r'[^\w\s-]', '', text.lower()).strip()
    slug = re.sub(r'[\s_-]+', '-', slug)
    slug = slug[:40] or "company"
    return slug


def generate_site_content(db: Session, company: Company) -> Dict[str, Any]:
    """Ask AI to generate website content for a company; returns parsed JSON."""
    ai = _get_ai(db)

    prompt = f"""다음 회사 정보를 바탕으로 웹사이트 콘텐츠를 생성하세요.

회사명: {company.name}
산업: {company.industry}
설명: {company.description or '미정'}
비전: {company.vision or '미정'}

다음 JSON 구조로 출력하세요 (모든 텍스트는 한국어):
{{
  "tagline": "강렬한 슬로건 (15자 이내)",
  "hero_desc": "히어로 섹션 설명 (60자 이내)",
  "stats": [
    {{"value": "숫자+단위", "label": "설명"}},
    {{"value": "숫자+단위", "label": "설명"}},
    {{"value": "숫자+단위", "label": "설명"}},
    {{"value": "숫자+단위", "label": "설명"}}
  ],
  "about_title": "소개 섹션 제목",
  "about_desc": "소개 설명 (80자 이내)",
  "features": [
    {{"icon": "이모지", "title": "특징 제목", "desc": "설명 (40자 이내)"}},
    {{"icon": "이모지", "title": "특징 제목", "desc": "설명 (40자 이내)"}},
    {{"icon": "이모지", "title": "특징 제목", "desc": "설명 (40자 이내)"}},
    {{"icon": "이모지", "title": "특징 제목", "desc": "설명 (40자 이내)"}}
  ],
  "services_title": "서비스 섹션 제목",
  "services_desc": "서비스 설명 (60자 이내)",
  "services": [
    {{"icon": "이모지", "title": "서비스명", "desc": "설명 (60자 이내)"}},
    {{"icon": "이모지", "title": "서비스명", "desc": "설명 (60자 이내)"}},
    {{"icon": "이모지", "title": "서비스명", "desc": "설명 (60자 이내)"}}
  ],
  "contact_title": "문의 섹션 제목 (20자 이내)",
  "contact_desc": "문의 설명 (50자 이내)"
}}"""

    raw = ai.chat(
        messages=[{"role": "user", "content": prompt}],
        system=SITE_GEN_SYSTEM,
        max_tokens=1200,
    )

    # Extract JSON from response
    try:
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            return json.loads(match.group())
    except Exception:
        pass

    # Fallback defaults
    return {
        "tagline": f"{company.name}이 미래를 만듭니다",
        "hero_desc": f"{company.industry} 분야의 혁신을 선도하는 AI 기업입니다.",
        "stats": [
            {"value": "100+", "label": "프로젝트"},
            {"value": "50+", "label": "파트너사"},
            {"value": "99%", "label": "고객 만족도"},
            {"value": "24/7", "label": "AI 운영"},
        ],
        "about_title": f"{company.name}의 혁신 스토리",
        "about_desc": f"{company.vision or company.description or f'{company.industry} 분야를 선도하는 AI 기업'}",
        "features": [
            {"icon": "🤖", "title": "AI 자동화", "desc": "AI가 반복 업무를 자동 처리합니다"},
            {"icon": "📊", "title": "데이터 분석", "desc": "실시간 데이터 기반 의사결정"},
            {"icon": "🌐", "title": "글로벌 확장", "desc": "세계 시장 진출을 지원합니다"},
            {"icon": "🔒", "title": "보안 강화", "desc": "기업급 보안으로 데이터를 보호"},
        ],
        "services_title": "핵심 서비스",
        "services_desc": "AI 기술로 비즈니스 성장을 가속합니다",
        "services": [
            {"icon": "⚡", "title": "AI 컨설팅", "desc": "비즈니스에 최적화된 AI 도입 전략을 제공합니다"},
            {"icon": "🛠", "title": "솔루션 개발", "desc": "맞춤형 AI 솔루션을 개발합니다"},
            {"icon": "📈", "title": "성과 분석", "desc": "데이터 기반 성과 지표 분석 및 개선"},
        ],
        "contact_title": "함께 시작하세요",
        "contact_desc": "지금 바로 문의하시면 전문가가 24시간 이내 답변드립니다.",
    }


def build_html(company: Company, content: Dict[str, Any], slug: str) -> str:
    """Render content dict into the HTML template."""
    color = _color_for_industry(company.industry)

    stats_html = "\n".join(
        f'<div class="stat"><div class="stat-value">{s["value"]}</div><div class="stat-label">{s["label"]}</div></div>'
        for s in content.get("stats", [])
    )
    features_html = "\n".join(
        f'<div class="feature"><div class="feature-icon">{f["icon"]}</div><div><h4>{f["title"]}</h4><p>{f["desc"]}</p></div></div>'
        for f in content.get("features", [])
    )
    services_html = "\n".join(
        f'<div class="service-card"><div class="service-icon">{s["icon"]}</div><h3>{s["title"]}</h3><p>{s["desc"]}</p></div>'
        for s in content.get("services", [])
    )

    return HTML_TEMPLATE.format(
        title=company.name,
        company_name=company.name,
        industry=company.industry,
        primary_color=color,
        slug=slug,
        tagline=content.get("tagline", company.name),
        hero_desc=content.get("hero_desc", ""),
        stats_html=stats_html,
        about_title=content.get("about_title", "소개"),
        about_desc=content.get("about_desc", ""),
        features_html=features_html,
        services_title=content.get("services_title", "서비스"),
        services_desc=content.get("services_desc", ""),
        services_html=services_html,
        contact_title=content.get("contact_title", "문의하기"),
        contact_desc=content.get("contact_desc", ""),
    )


def generate_and_save_site(db: Session, company_id: int, template_type: str = "corporate") -> CompanySite:
    """Full pipeline: generate content → build HTML → save CompanySite."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise ValueError("Company not found")

    content = generate_site_content(db, company)

    # Determine unique slug
    base_slug = _slugify(company.name)
    slug = base_slug
    count = 0
    while db.query(CompanySite).filter(CompanySite.slug == slug, CompanySite.id != -1).first():
        count += 1
        slug = f"{base_slug}-{count}"

    html = build_html(company, content, slug)

    # Upsert: one site per company
    site = db.query(CompanySite).filter(CompanySite.company_id == company_id).first()
    if site:
        site.html_content = html
        site.title = company.name
        site.slug = slug
        site.description = content.get("hero_desc", "")
        site.template_type = template_type
    else:
        site = CompanySite(
            company_id=company_id,
            title=company.name,
            slug=slug,
            description=content.get("hero_desc", ""),
            html_content=html,
            status="draft",
            template_type=template_type,
        )
        db.add(site)

    db.commit()
    db.refresh(site)
    return site


def _build_page_html(company: Company, slug: str, page_slug: str, page_title: str, body_html: str) -> str:
    """멀티페이지용 공통 레이아웃 HTML 빌더."""
    color = _color_for_industry(company.industry)
    pages = [
        ("home", "홈"), ("about", "소개"), ("services", "서비스"), ("contact", "문의"),
    ]
    nav_links = "\n".join(
        f'<a href="/sites/{slug}/{p}" class="{"active" if p == page_slug else ""}">{label}</a>'
        for p, label in pages
    )
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{page_title} — {company.name}</title>
<style>
  :root {{ --primary: {color}; --bg: #0f1117; --bg2: #161a24; --card: #1e2233;
           --text: #e2e8f0; --muted: #94a3b8; --border: rgba(255,255,255,0.08); }}
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }}
  a {{ color: var(--primary); text-decoration: none; }}
  nav {{ position: fixed; top:0; left:0; right:0; z-index:100; backdrop-filter: blur(16px);
         background: rgba(15,17,23,0.85); border-bottom: 1px solid var(--border);
         padding: 0 2rem; display: flex; align-items: center; justify-content: space-between; height: 64px; }}
  .logo {{ font-size: 1.25rem; font-weight: 700; color: var(--primary); }}
  .nav-links {{ display: flex; gap: 2rem; }}
  .nav-links a {{ color: var(--muted); font-size: 0.9rem; transition: color 0.2s; }}
  .nav-links a:hover, .nav-links a.active {{ color: var(--text); }}
  .page-wrap {{ padding: 5rem 2rem 4rem; max-width: 1100px; margin: 0 auto; }}
  h1 {{ font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 800; margin-bottom: 1rem;
        background: linear-gradient(135deg, #fff 0%, var(--muted) 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
  h2 {{ font-size: 1.5rem; font-weight: 700; margin: 2rem 0 1rem; color: var(--text); }}
  p {{ color: var(--muted); margin-bottom: 1rem; }}
  .card-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.5rem; margin: 2rem 0; }}
  .card {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }}
  .card .icon {{ font-size: 2rem; margin-bottom: 0.75rem; }}
  .card h3 {{ font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text); }}
  .card p {{ font-size: 0.9rem; }}
  .btn {{ display: inline-block; background: var(--primary); color: #fff; padding: 0.75rem 1.75rem;
           border-radius: 10px; font-weight: 700; border: none; cursor: pointer; margin-top: 1rem; }}
  form {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 2rem; max-width: 540px; }}
  input, textarea {{ width: 100%; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px;
                      padding: 0.75rem 1rem; color: var(--text); font-size: 0.95rem; margin-bottom: 1rem; }}
  textarea {{ min-height: 120px; resize: vertical; }}
</style>
</head>
<body>
<nav>
  <span class="logo">{company.name}</span>
  <div class="nav-links">{nav_links}</div>
</nav>
<div class="page-wrap">
{body_html}
</div>
</body>
</html>"""


def generate_multipage_site(db: Session, site_id: int) -> list:
    """사이트의 4개 페이지(home/about/services/contact) AI 생성 후 SitePage 목록 반환."""
    site = db.query(CompanySite).filter(CompanySite.id == site_id).first()
    if not site:
        raise ValueError("Site not found")

    company = db.query(Company).filter(Company.id == site.company_id).first()
    if not company:
        raise ValueError("Company not found")

    content = generate_site_content(db, company)
    slug = site.slug

    page_defs = [
        {
            "slug": "home",
            "title": "홈",
            "order": 0,
            "body": f"""
<h1>{content.get("tagline", company.name)}</h1>
<p style="font-size:1.15rem">{content.get("hero_desc", "")}</p>
<a href="/sites/{slug}/services" class="btn">서비스 보기</a>
<h2>핵심 역량</h2>
<div class="card-grid">
{"".join(f'<div class="card"><div class="icon">{f["icon"]}</div><h3>{f["title"]}</h3><p>{f["desc"]}</p></div>' for f in content.get("features", []))}
</div>""",
        },
        {
            "slug": "about",
            "title": "소개",
            "order": 1,
            "body": f"""
<h1>{content.get("about_title", "회사 소개")}</h1>
<p style="font-size:1.05rem;max-width:720px">{content.get("about_desc", company.description or "")}</p>
<h2>비전 & 미션</h2>
<div class="card-grid">
  <div class="card"><div class="icon">🎯</div><h3>비전</h3><p>{company.vision or "글로벌 AI 기업으로 성장"}</p></div>
  <div class="card"><div class="icon">🏭</div><h3>산업</h3><p>{company.industry}</p></div>
  <div class="card"><div class="icon">🤝</div><h3>핵심 가치</h3><p>혁신 · 신뢰 · 성장</p></div>
</div>""",
        },
        {
            "slug": "services",
            "title": "서비스",
            "order": 2,
            "body": f"""
<h1>{content.get("services_title", "서비스")}</h1>
<p>{content.get("services_desc", "")}</p>
<div class="card-grid">
{"".join(f'<div class="card"><div class="icon">{s["icon"]}</div><h3>{s["title"]}</h3><p>{s["desc"]}</p></div>' for s in content.get("services", []))}
</div>""",
        },
        {
            "slug": "contact",
            "title": "문의",
            "order": 3,
            "body": f"""
<h1>{content.get("contact_title", "문의하기")}</h1>
<p>{content.get("contact_desc", "")}</p>
<form method="POST" action="/sites/{slug}/submit">
  <input type="text" name="name" placeholder="이름" required>
  <input type="email" name="email" placeholder="이메일" required>
  <input type="text" name="company" placeholder="회사명">
  <textarea name="message" placeholder="문의 내용을 입력하세요" required></textarea>
  <button type="submit" class="btn">문의 보내기</button>
</form>""",
        },
    ]

    created = []
    for pd in page_defs:
        html = _build_page_html(company, slug, pd["slug"], pd["title"], pd["body"])
        # Upsert by (site_id, slug)
        existing = db.query(SitePage).filter(
            SitePage.site_id == site_id, SitePage.slug == pd["slug"]
        ).first()
        if existing:
            existing.html_content = html
            existing.title = pd["title"]
            existing.page_order = pd["order"]
        else:
            existing = SitePage(
                site_id=site_id,
                slug=pd["slug"],
                title=pd["title"],
                html_content=html,
                page_order=pd["order"],
            )
            db.add(existing)
        db.commit()
        db.refresh(existing)
        created.append(existing)

    return created


def evaluate_all_sites(db: Session) -> list:
    """AI evaluates each live site and assigns a score + feedback."""
    ai = _get_ai(db)
    sites = db.query(CompanySite).filter(CompanySite.status == "live").all()

    results = []
    for site in sites:
        company = db.query(Company).filter(Company.id == site.company_id).first()
        company_name = company.name if company else "Unknown"

        prompt = (
            f"다음 회사 웹사이트를 평가하세요.\n\n"
            f"회사: {company_name} ({company.industry if company else ''})\n"
            f"사이트 설명: {site.description}\n\n"
            f"다음 기준으로 100점 만점 평가:\n"
            f"- 브랜딩 명확성 (25점)\n"
            f"- 콘텐츠 품질 (25점)\n"
            f"- 서비스 차별성 (25점)\n"
            f"- 전환 유도력 (25점)\n\n"
            f"반드시 JSON으로만 출력: {{\"score\": 점수(정수), \"feedback\": \"2~3문장 평가\"}}"
        )

        raw = ai.chat(
            messages=[{"role": "user", "content": prompt}],
            system="당신은 기업 웹사이트 전문 평가자입니다. 반드시 유효한 JSON만 출력하세요.",
            max_tokens=300,
        )

        try:
            m = re.search(r'\{[\s\S]*?\}', raw)
            data = json.loads(m.group()) if m else {}
            score = float(data.get("score", 70))
            feedback = data.get("feedback", "평가 완료")
        except Exception:
            score, feedback = 70.0, "AI 평가 완료"

        site.ai_score = score
        site.ai_feedback = feedback
        db.commit()
        results.append({
            "site_id": site.id,
            "company_id": site.company_id,
            "company_name": company_name,
            "slug": site.slug,
            "score": score,
            "feedback": feedback,
            "visits": site.visits,
        })

    return results
