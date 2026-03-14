"""IR 자료 자동 생성 서비스 — AI가 계열사 성과 데이터를 HTML 프레젠테이션으로 변환"""
import json
import re
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models.models import Company, OrgNode, WorkLog, CompanySite, AgentMessage
from services.ai_provider import get_provider_from_db


IR_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{company_name} — IR 보고서</title>
<style>
:root {{ --primary: {primary}; --bg: #0a0d14; --card: #131720; --border: rgba(255,255,255,0.07); --text: #e2e8f0; --muted: #64748b; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }}
.slide {{ min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 4rem 6rem; border-bottom: 2px solid var(--border); position: relative; overflow: hidden; }}
.slide::before {{ content:''; position:absolute; width:500px; height:500px; border-radius:50%; background:radial-gradient(circle, {primary}15, transparent 70%); top:-100px; right:-100px; pointer-events:none; }}
.tag {{ display:inline-block; background:{primary}20; border:1px solid {primary}40; color:{primary}; border-radius:6px; padding:4px 12px; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; margin-bottom:1rem; }}
h1 {{ font-size:3.5rem; font-weight:800; line-height:1.1; margin-bottom:1rem; }}
h1 span {{ color:{primary}; }}
h2 {{ font-size:2rem; font-weight:700; margin-bottom:2rem; }}
h3 {{ font-size:1.1rem; font-weight:600; color:{primary}; margin-bottom:0.5rem; }}
.subtitle {{ font-size:1.2rem; color:var(--muted); max-width:600px; line-height:1.6; }}
.grid-2 {{ display:grid; grid-template-columns:1fr 1fr; gap:2rem; margin-top:2rem; }}
.grid-3 {{ display:grid; grid-template-columns:repeat(3,1fr); gap:1.5rem; margin-top:2rem; }}
.grid-4 {{ display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-top:2rem; }}
.card {{ background:var(--card); border:1px solid var(--border); border-radius:16px; padding:1.5rem; }}
.kpi-card {{ background:var(--card); border:1px solid {primary}25; border-radius:16px; padding:1.5rem; text-align:center; }}
.kpi-value {{ font-size:2.5rem; font-weight:800; color:{primary}; }}
.kpi-label {{ font-size:0.8rem; color:var(--muted); margin-top:0.25rem; }}
.bar-row {{ display:flex; align-items:center; gap:1rem; margin-bottom:0.75rem; }}
.bar-label {{ width:120px; font-size:0.85rem; color:var(--muted); flex-shrink:0; }}
.bar-track {{ flex:1; height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; }}
.bar-fill {{ height:100%; border-radius:4px; background:{primary}; }}
.bar-val {{ width:40px; text-align:right; font-size:0.85rem; font-weight:600; }}
ul.feature-list {{ list-style:none; space-y:0.5rem; }}
ul.feature-list li {{ padding:0.6rem 0; border-bottom:1px solid var(--border); font-size:0.95rem; color:#cbd5e1; display:flex; align-items:flex-start; gap:0.75rem; }}
ul.feature-list li::before {{ content:'→'; color:{primary}; font-weight:700; flex-shrink:0; }}
.footer {{ padding:2rem 6rem; display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--border); }}
.footer-logo {{ font-size:1rem; font-weight:700; color:{primary}; }}
.page-num {{ font-size:0.8rem; color:var(--muted); }}
</style>
</head>
<body>

<!-- Slide 1: Cover -->
<div class="slide" style="text-align:center; align-items:center;">
  <div class="tag">Investor Relations {year}</div>
  <h1>{company_name}<br/><span>{tagline}</span></h1>
  <p class="subtitle">{intro}</p>
  <div style="margin-top:2rem; font-size:0.85rem; color:var(--muted);">{industry} · {date}</div>
</div>

<!-- Slide 2: KPI Overview -->
<div class="slide">
  <div class="tag">Performance</div>
  <h2>핵심 성과 지표</h2>
  <div class="grid-4">
    <div class="kpi-card"><div class="kpi-value">{kpi_members}</div><div class="kpi-label">AI 조직원</div></div>
    <div class="kpi-card"><div class="kpi-value">{kpi_cycles}</div><div class="kpi-label">업무 사이클</div></div>
    <div class="kpi-card"><div class="kpi-value">{kpi_messages}</div><div class="kpi-label">AI 대화</div></div>
    <div class="kpi-card"><div class="kpi-value">{kpi_visitors}</div><div class="kpi-label">웹 방문자</div></div>
  </div>
  <div class="grid-2" style="margin-top:2rem;">
    <div class="card">
      <h3>업무 역량 분포</h3>
      {capability_bars}
    </div>
    <div class="card">
      <h3>AI 시스템 현황</h3>
      <ul class="feature-list">
        {ai_features}
      </ul>
    </div>
  </div>
</div>

<!-- Slide 3: Business Model -->
<div class="slide">
  <div class="tag">Business</div>
  <h2>비즈니스 모델</h2>
  <div class="grid-3">
    {biz_cards}
  </div>
</div>

<!-- Slide 4: Vision & Strategy -->
<div class="slide">
  <div class="tag">Strategy</div>
  <h2>비전 및 전략 방향</h2>
  <p class="subtitle" style="margin-bottom:2rem;">{vision}</p>
  <div class="grid-2">
    <div class="card">
      <h3>단기 목표 (6개월)</h3>
      <ul class="feature-list">{short_term}</ul>
    </div>
    <div class="card">
      <h3>중장기 목표</h3>
      <ul class="feature-list">{long_term}</ul>
    </div>
  </div>
</div>

<!-- Slide 5: Investment Ask -->
<div class="slide" style="text-align:center; align-items:center;">
  <div class="tag">Investment</div>
  <h2>투자 제안</h2>
  <div class="grid-3" style="max-width:800px;">
    {investment_points}
  </div>
  <div style="margin-top:3rem; padding:2rem; background:var(--card); border-radius:16px; border:1px solid {primary}30; max-width:600px; text-align:left;">
    <h3 style="margin-bottom:0.75rem;">Contact</h3>
    <p style="color:var(--muted); font-size:0.95rem;">{contact}</p>
  </div>
</div>

<div class="footer">
  <div class="footer-logo">{company_name}</div>
  <div class="page-num">© {year} {company_name}. Confidential.</div>
</div>

</body>
</html>"""


def _primary_for_industry(industry: str) -> str:
    mapping = {
        "미디어": "#e879f9", "media": "#e879f9",
        "소프트웨어": "#6366f1", "software": "#6366f1", "saas": "#6366f1",
        "데이터": "#0ea5e9", "data": "#0ea5e9",
        "금융": "#f59e0b", "finance": "#f59e0b",
        "헬스": "#10b981", "health": "#10b981",
        "교육": "#f97316", "education": "#f97316",
    }
    for k, v in mapping.items():
        if k in industry.lower():
            return v
    return "#818cf8"


def generate_ir_report(db: Session, company_id: int, user_id: int) -> str | None:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return None

    # Collect real data
    members = db.query(OrgNode).filter(OrgNode.company_id == company_id).count()
    since_30d = datetime.utcnow() - timedelta(days=30)
    cycles = (
        db.query(WorkLog.cycle_id)
        .filter(WorkLog.company_id == company_id, WorkLog.created_at > since_30d)
        .distinct()
        .count()
    )
    messages = (
        db.query(WorkLog)
        .filter(WorkLog.company_id == company_id, WorkLog.created_at > since_30d)
        .count()
    )
    site = db.query(CompanySite).filter(CompanySite.company_id == company_id).first()
    visitors = site.visits if site else 0

    level_counts = {}
    for level in ["ceo", "chief", "team_lead", "specialist"]:
        cnt = db.query(OrgNode).filter(
            OrgNode.company_id == company_id, OrgNode.level == level
        ).count()
        level_counts[level] = cnt
    total = max(members, 1)

    # AI generates content
    prompt = f"""계열사 IR 자료 콘텐츠를 JSON으로 생성하세요.
회사: {company.name}
산업: {company.industry or '일반'}
설명: {company.description or ''}
비전: {company.vision or ''}

데이터:
- AI 조직원: {members}명
- 최근 30일 업무 사이클: {cycles}회
- AI 대화: {messages}건
- 웹 방문자: {visitors}명

JSON 형식:
{{
  "tagline": "핵심 슬로건 (5-8단어)",
  "intro": "회사 소개 (2-3문장)",
  "biz_items": [
    {{"title": "수익 모델 제목", "desc": "설명"}}
  ],
  "short_term": ["목표1", "목표2", "목표3"],
  "long_term": ["목표1", "목표2", "목표3"],
  "investment_points": [
    {{"title": "투자 포인트", "desc": "설명"}}
  ],
  "contact": "투자 문의 및 연락처 설명",
  "ai_features": ["특징1", "특징2", "특징3", "특징4"]
}}"""

    provider = get_provider_from_db(db, user_id)
    raw = provider.chat(
        [{"role": "user", "content": prompt}],
        system="당신은 VC 피칭 전문 컨설턴트입니다. JSON만 반환하세요.",
        session_type="general",
    )

    default_content = {
        "tagline": f"AI로 만드는 {company.industry or ''} 혁신",
        "intro": f"{company.name}은 AI 기반 {company.industry or ''} 기업입니다. {company.description or ''}",
        "biz_items": [
            {"title": "AI 자율 운영", "desc": "AI 조직이 24시간 자율 업무"},
            {"title": "데이터 수익화", "desc": "운영 데이터를 인사이트로 전환"},
            {"title": "확장 가능 조직", "desc": "AI 인력으로 빠른 스케일업"},
        ],
        "short_term": ["AI 업무 효율 50% 향상", "웹사이트 방문자 1만 달성", "파트너십 3건 체결"],
        "long_term": ["글로벌 시장 진출", "AI 특허 10건 확보", "그룹 내 시너지 극대화"],
        "investment_points": [
            {"title": "AI 퍼스트", "desc": "전 조직원이 AI로 운영"},
            {"title": "빠른 성장", "desc": "30일 업무 사이클 " + str(cycles) + "회 달성"},
            {"title": "검증된 팀", "desc": "그룹 계열사 네트워크"},
        ],
        "contact": f"{company.name} 투자 문의: ir@{company.name.lower().replace(' ', '')}.ai",
        "ai_features": ["24시간 자율 업무 실행", "AI CEO 전략 지휘", "실시간 성과 분석", "계열사 시너지 연동"],
    }

    try:
        m = re.search(r"\{[\s\S]*\}", raw)
        content = json.loads(m.group()) if m else default_content
    except Exception:
        content = default_content

    # Build HTML components
    level_labels = {"ceo": "CEO", "chief": "C레벨", "team_lead": "팀장", "specialist": "전문가"}
    bars = ""
    for level, cnt in level_counts.items():
        pct = int(cnt / total * 100)
        bars += f'<div class="bar-row"><div class="bar-label">{level_labels[level]}</div><div class="bar-track"><div class="bar-fill" style="width:{pct}%"></div></div><div class="bar-val">{cnt}명</div></div>'

    ai_features_html = "".join(f"<li>{f}</li>" for f in content.get("ai_features", []))

    biz_cards_html = "".join(
        f'<div class="card"><h3>{b["title"]}</h3><p style="color:#94a3b8; margin-top:0.5rem; font-size:0.9rem;">{b["desc"]}</p></div>'
        for b in content.get("biz_items", [])[:3]
    )

    short_term_html = "".join(f"<li>{t}</li>" for t in content.get("short_term", []))
    long_term_html = "".join(f"<li>{t}</li>" for t in content.get("long_term", []))

    invest_html = "".join(
        f'<div class="kpi-card"><div style="font-size:1.5rem; margin-bottom:0.5rem;">💡</div><h3>{p["title"]}</h3><p style="color:#94a3b8; font-size:0.85rem; margin-top:0.5rem;">{p["desc"]}</p></div>'
        for p in content.get("investment_points", [])[:3]
    )

    primary = _primary_for_industry(company.industry or "")
    return IR_TEMPLATE.format(
        company_name=company.name,
        primary=primary,
        year=datetime.utcnow().year,
        date=datetime.utcnow().strftime("%Y.%m"),
        industry=company.industry or "일반",
        tagline=content.get("tagline", "AI 기반 혁신 기업"),
        intro=content.get("intro", ""),
        vision=company.vision or content.get("intro", ""),
        kpi_members=members,
        kpi_cycles=cycles,
        kpi_messages=messages,
        kpi_visitors=visitors,
        capability_bars=bars,
        ai_features=ai_features_html,
        biz_cards=biz_cards_html,
        short_term=short_term_html,
        long_term=long_term_html,
        investment_points=invest_html,
        contact=content.get("contact", "ir@group.ai"),
    )
