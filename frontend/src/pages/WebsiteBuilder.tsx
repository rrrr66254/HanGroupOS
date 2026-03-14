import { useState, useEffect, useCallback } from 'react'
import {
  Globe, Plus, Rocket, Eye, Trash2, Settings, Search,
  ExternalLink, CheckCircle, XCircle, Clock, Loader2,
  Sparkles, Link2, RefreshCw, Server,
} from 'lucide-react'
import { websitesApi, companiesApi } from '../api/client'

interface WebProject {
  id: number
  company_id: number
  name: string
  slug: string
  template: string
  status: string
  cf_project_name: string | null
  cf_deployment_url: string | null
  custom_domain: string | null
  domain_status: string
  ssl_status: string
  site_config: Record<string, unknown>
  pages_data: unknown[]
  created_at: string
  deployed_at: string | null
}

interface Company {
  id: number
  name: string
  industry: string
}

const TEMPLATES = [
  { id: 'corporate', name: '기업 소개', desc: '회사 소개, 서비스, 연락처' },
  { id: 'landing', name: '랜딩 페이지', desc: '제품/서비스 홍보 원페이지' },
  { id: 'portfolio', name: '포트폴리오', desc: '작품/프로젝트 갤러리' },
  { id: 'ecommerce', name: '커머스', desc: '상품 소개 + 구매 유도' },
]

const STATUS_BADGE: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  draft: { color: 'text-slate-400 bg-slate-500/10', icon: Clock, label: '초안' },
  building: { color: 'text-amber-400 bg-amber-500/10', icon: Loader2, label: '생성 중' },
  deployed: { color: 'text-emerald-400 bg-emerald-500/10', icon: CheckCircle, label: '배포됨' },
  failed: { color: 'text-red-400 bg-red-500/10', icon: XCircle, label: '실패' },
}

export default function WebsiteBuilder() {
  const [projects, setProjects] = useState<WebProject[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<WebProject | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Create form
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newCompany, setNewCompany] = useState<number | ''>('')
  const [newTemplate, setNewTemplate] = useState('corporate')

  // Domain
  const [domainInput, setDomainInput] = useState('')
  const [domainResult, setDomainResult] = useState<{ domain: string; available: boolean | null } | null>(null)

  // CF Settings
  const [showSettings, setShowSettings] = useState(false)
  const [cfToken, setCfToken] = useState('')
  const [cfAccountId, setCfAccountId] = useState('')
  const [cfConfigured, setCfConfigured] = useState(false)

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        websitesApi.list(),
        companiesApi.list(),
      ])
      setProjects(pRes.data as WebProject[])
      setCompanies(cRes.data as Company[])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  const loadCfSettings = useCallback(async () => {
    try {
      const res = await websitesApi.cfSettings()
      const d = res.data as { api_token_configured: boolean; account_id_configured: boolean; account_id: string | null }
      setCfConfigured(d.api_token_configured && d.account_id_configured)
      if (d.account_id) setCfAccountId(d.account_id)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load(); loadCfSettings() }, [load, loadCfSettings])

  const handleCreate = async () => {
    if (!newName || !newSlug || !newCompany) return
    setActionLoading('create')
    try {
      await websitesApi.create({
        company_id: newCompany,
        name: newName,
        slug: newSlug,
        template: newTemplate,
      })
      setShowCreate(false)
      setNewName('')
      setNewSlug('')
      setNewCompany('')
      await load()
    } catch { /* ignore */ } finally { setActionLoading(null) }
  }

  const handleGenerate = async (project: WebProject) => {
    setActionLoading(`gen-${project.id}`)
    try {
      await websitesApi.generateContent(project.id, {
        company_id: project.company_id,
        template: project.template,
      })
      await load()
    } catch { /* ignore */ } finally { setActionLoading(null) }
  }

  const handleDeploy = async (project: WebProject) => {
    setActionLoading(`deploy-${project.id}`)
    try {
      await websitesApi.deploy(project.id)
      await load()
    } catch { /* ignore */ } finally { setActionLoading(null) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await websitesApi.delete(id)
    setSelected(null)
    await load()
  }

  const handleDomainCheck = async () => {
    if (!domainInput) return
    setActionLoading('domain-check')
    try {
      const res = await websitesApi.domainCheck(domainInput)
      setDomainResult(res.data as { domain: string; available: boolean | null })
    } catch { /* ignore */ } finally { setActionLoading(null) }
  }

  const handleDomainConnect = async (project: WebProject) => {
    if (!domainInput) return
    setActionLoading('domain-connect')
    try {
      await websitesApi.domainConnect(project.id, domainInput)
      setDomainInput('')
      setDomainResult(null)
      await load()
    } catch { /* ignore */ } finally { setActionLoading(null) }
  }

  const handleSaveCfSettings = async () => {
    setActionLoading('cf-save')
    try {
      await websitesApi.saveCfSettings({
        cloudflare_api_token: cfToken,
        cloudflare_account_id: cfAccountId,
      })
      setCfToken('')
      await loadCfSettings()
      setShowSettings(false)
    } catch { /* ignore */ } finally { setActionLoading(null) }
  }

  const getCompanyName = (companyId: number) =>
    companies.find((c) => c.id === companyId)?.name ?? `회사 #${companyId}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-400" size={24} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe size={22} className="text-blue-400" />
          <h1 className="text-lg font-bold text-white">Website Builder</h1>
          <span className="text-xs text-slate-500">{projects.length}개 프로젝트</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <Settings size={13} /> Cloudflare 설정
            {cfConfigured && <CheckCircle size={11} className="text-emerald-400" />}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
          >
            <Plus size={14} /> 새 웹사이트
          </button>
        </div>
      </div>

      {/* CF 설정 미완료 경고 */}
      {!cfConfigured && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Server size={16} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Cloudflare API 설정이 필요합니다. <button onClick={() => setShowSettings(true)} className="underline font-semibold">설정하기</button>
          </p>
        </div>
      )}

      {/* 프로젝트 목록 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => {
          const badge = STATUS_BADGE[p.status] || STATUS_BADGE.draft
          const BadgeIcon = badge.icon
          return (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              className={`card p-4 cursor-pointer hover:border-blue-500/30 transition ${selected?.id === p.id ? 'border-blue-500/50 ring-1 ring-blue-500/20' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                  <p className="text-[10px] text-slate-500">{getCompanyName(p.company_id)}</p>
                </div>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.color}`}>
                  <BadgeIcon size={10} className={p.status === 'building' ? 'animate-spin' : ''} />
                  {badge.label}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Globe size={11} />
                  {p.cf_deployment_url ? (
                    <a href={p.cf_deployment_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {p.cf_deployment_url.replace('https://', '')}
                    </a>
                  ) : (
                    <span className="text-slate-600">미배포</span>
                  )}
                </div>
                {p.custom_domain && (
                  <div className="flex items-center gap-1.5">
                    <Link2 size={11} />
                    <span>{p.custom_domain}</span>
                    <span className={`text-[9px] ${p.domain_status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      ({p.domain_status})
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">{p.template}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">{p.slug}</span>
                </div>
              </div>
            </div>
          )
        })}

        {projects.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-600 text-sm">
            아직 웹사이트 프로젝트가 없습니다
          </div>
        )}
      </div>

      {/* 선택된 프로젝트 상세 */}
      {selected && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">{selected.name}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => handleGenerate(selected)}
                disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50 transition"
              >
                {actionLoading === `gen-${selected.id}` ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                AI 콘텐츠 생성
              </button>
              {!!(selected.site_config as Record<string, unknown>)?.generated_html && (
                <>
                  <a
                    href={websitesApi.preview(selected.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition"
                  >
                    <Eye size={12} /> 미리보기
                  </a>
                  <button
                    onClick={() => handleDeploy(selected)}
                    disabled={!!actionLoading || !cfConfigured}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50 transition"
                  >
                    {actionLoading === `deploy-${selected.id}` ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
                    배포
                  </button>
                </>
              )}
              <button
                onClick={() => handleDelete(selected.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition"
              >
                <Trash2 size={12} /> 삭제
              </button>
            </div>
          </div>

          {/* 배포 URL */}
          {selected.cf_deployment_url && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle size={14} className="text-emerald-400" />
              <span className="text-xs text-emerald-300">배포 완료:</span>
              <a href={selected.cf_deployment_url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">
                {selected.cf_deployment_url} <ExternalLink size={10} className="inline" />
              </a>
            </div>
          )}

          {/* 도메인 연결 */}
          {selected.status === 'deployed' && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Link2 size={12} /> 커스텀 도메인 연결
              </h3>
              <div className="flex gap-2">
                <input
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="example.com"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
                />
                <button
                  onClick={handleDomainCheck}
                  disabled={!!actionLoading || !domainInput}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 disabled:opacity-50 transition"
                >
                  {actionLoading === 'domain-check' ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                </button>
                <button
                  onClick={() => handleDomainConnect(selected)}
                  disabled={!!actionLoading || !domainInput}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50 transition"
                >
                  {actionLoading === 'domain-connect' ? <Loader2 size={12} className="animate-spin" /> : '연결'}
                </button>
              </div>
              {domainResult && (
                <p className={`text-[11px] ${domainResult.available ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {domainResult.domain}: {domainResult.available ? '사용 가능' : domainResult.available === false ? '이미 등록됨' : '확인 불가'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 새 프로젝트 생성 모달 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-[#1a1f2e] rounded-xl p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus size={16} /> 새 웹사이트 프로젝트
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">계열사</label>
                <select
                  value={newCompany}
                  onChange={(e) => setNewCompany(Number(e.target.value) || '')}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white outline-none"
                >
                  <option value="">선택하세요</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">프로젝트명</label>
                <input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-'))
                  }}
                  placeholder="회사 공식 웹사이트"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">URL Slug</label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-600">han-</span>
                  <input
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="my-company"
                    className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 outline-none"
                  />
                  <span className="text-[10px] text-slate-600">.pages.dev</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">템플릿</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setNewTemplate(t.id)}
                      className={`p-3 rounded-lg text-left transition ${
                        newTemplate === t.id
                          ? 'bg-blue-600/20 border border-blue-500/40'
                          : 'bg-white/5 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <p className="text-xs font-semibold text-white">{t.name}</p>
                      <p className="text-[10px] text-slate-500">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white transition"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName || !newSlug || !newCompany || !!actionLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 transition"
              >
                {actionLoading === 'create' ? <Loader2 size={12} className="animate-spin" /> : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cloudflare 설정 모달 */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
          <div className="bg-[#1a1f2e] rounded-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Settings size={16} /> Cloudflare API 설정
            </h2>
            <p className="text-[11px] text-slate-500">
              Cloudflare Pages 배포와 DNS 관리를 위해 API 토큰이 필요합니다.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Account ID</label>
                <input
                  value={cfAccountId}
                  onChange={(e) => setCfAccountId(e.target.value)}
                  placeholder="Cloudflare Account ID"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">API Token</label>
                <input
                  type="password"
                  value={cfToken}
                  onChange={(e) => setCfToken(e.target.value)}
                  placeholder="Cloudflare API Token"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 outline-none"
                />
                <p className="text-[9px] text-slate-600 mt-1">
                  Cloudflare 대시보드 &gt; My Profile &gt; API Tokens에서 생성
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white transition">
                취소
              </button>
              <button
                onClick={handleSaveCfSettings}
                disabled={!!actionLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 transition"
              >
                {actionLoading === 'cf-save' ? <Loader2 size={12} className="animate-spin" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
