import { useState, useEffect } from 'react'
import {
  Globe, Play, Zap, ExternalLink, Upload, Eye, Code2,
  CheckCircle, Clock, Loader2, ChevronDown, ChevronUp, Inbox, RefreshCw,
} from 'lucide-react'
import { companiesApi } from '../api/client'
import { sitesApi } from '../api/client'

interface Company { id: number; name: string; industry: string }
interface Site {
  id: number; company_id: number; company_name: string | null
  title: string; slug: string; status: string; template_type: string
  ai_score: number; ai_feedback: string; visits: number
  created_at: string | null; deployed_at: string | null
}
interface Submission {
  id: number; form_data: Record<string, string>; source: string; created_at: string
}

export default function SiteBuilder() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedId, setSelectedId] = useState<number | ''>('')
  const [site, setSite] = useState<Site | null>(null)
  const [generating, setGenerating] = useState(false)
  const [tab, setTab] = useState<'preview' | 'code' | 'submissions'>('preview')
  const [html, setHtml] = useState('')
  const [editingHtml, setEditingHtml] = useState('')
  const [savingHtml, setSavingHtml] = useState(false)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [deploying, setDeploying] = useState(false)

  useEffect(() => {
    companiesApi.list().then((r) => {
      const list = r.data as Company[]
      setCompanies(list)
      if (list.length > 0) setSelectedId(list[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setSite(null); setHtml(''); setSubmissions([])
    sitesApi.getCompanySite(selectedId as number)
      .then((r) => {
        const s = r.data as Site
        setSite(s)
        loadHtml(s.id)
      })
      .catch(() => {}) // no site yet
  }, [selectedId])

  const loadHtml = async (siteId: number) => {
    try {
      const r = await sitesApi.getHtml(siteId)
      setHtml(r.data.html)
      setEditingHtml(r.data.html)
    } catch { /* ignore */ }
  }

  const generate = async () => {
    if (!selectedId) return
    setGenerating(true)
    try {
      const r = await sitesApi.generate(selectedId as number)
      const s = r.data as Site
      setSite(s)
      await loadHtml(s.id)
      setTab('preview')
    } catch { /* ignore */ } finally { setGenerating(false) }
  }

  const deploy = async () => {
    if (!site) return
    setDeploying(true)
    try {
      await sitesApi.deploy(site.id)
      setSite((prev) => prev ? { ...prev, status: 'live' } : prev)
    } catch { /* ignore */ } finally { setDeploying(false) }
  }

  const undeploy = async () => {
    if (!site) return
    try {
      await sitesApi.undeploy(site.id)
      setSite((prev) => prev ? { ...prev, status: 'draft' } : prev)
    } catch { /* ignore */ }
  }

  const saveHtml = async () => {
    if (!site) return
    setSavingHtml(true)
    try {
      await sitesApi.updateHtml(site.id, editingHtml)
      setHtml(editingHtml)
    } catch { /* ignore */ } finally { setSavingHtml(false) }
  }

  const loadSubmissions = async () => {
    if (!site) return
    setLoadingSubs(true)
    try {
      const r = await sitesApi.submissions(site.id)
      setSubmissions(r.data as Submission[])
    } catch { /* ignore */ } finally { setLoadingSubs(false) }
  }

  useEffect(() => {
    if (tab === 'submissions' && site) loadSubmissions()
  }, [tab, site])

  const selectedCompany = companies.find((c) => c.id === selectedId)

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Globe size={18} className="text-brand-light" />
            계열사 웹사이트 빌더
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">AI가 계열사 웹사이트를 자동 생성·배포합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="text-xs bg-bg-elevated border border-bg-border rounded-lg px-3 py-1.5 text-slate-300"
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={generate}
            disabled={generating || !selectedId}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: generating ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc',
            }}
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {generating ? 'AI 생성 중…' : 'AI 웹사이트 생성'}
          </button>
        </div>
      </div>

      {/* Generating state */}
      {generating && (
        <div className="card p-8 text-center">
          <Loader2 size={32} className="animate-spin text-brand mx-auto mb-3" />
          <div className="text-sm text-slate-300 font-medium">AI가 웹사이트를 디자인하고 있습니다…</div>
          <div className="text-xs text-slate-600 mt-1">
            {selectedCompany?.name} · {selectedCompany?.industry} 산업 맞춤 콘텐츠 생성
          </div>
        </div>
      )}

      {/* Site panel */}
      {site && !generating && (
        <div className="space-y-4">
          {/* Site meta bar */}
          <div className="card p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-sm font-bold text-slate-100">{site.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={site.status === 'live'
                      ? { background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
                      : { background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}
                  >
                    {site.status === 'live' ? '● LIVE' : '○ 초안'}
                  </span>
                  <span className="text-[10px] text-slate-600 font-mono">/sites/{site.slug}</span>
                  {site.status === 'live' && (
                    <a
                      href={`/sites/${site.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-brand-light flex items-center gap-0.5 hover:underline"
                    >
                      <ExternalLink size={9} /> 열기
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-slate-600 mr-2">방문 {site.visits}회</div>
                {site.status === 'live' ? (
                  <button
                    onClick={undeploy}
                    className="text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                  >
                    배포 중지
                  </button>
                ) : (
                  <button
                    onClick={deploy}
                    disabled={deploying}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' }}
                  >
                    {deploying ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    배포
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-bg-border pb-0">
            {[
              { key: 'preview', label: '미리보기', icon: Eye },
              { key: 'code', label: 'HTML 편집', icon: Code2 },
              { key: 'submissions', label: '수집 데이터', icon: Inbox },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key as typeof tab)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px"
                style={{
                  borderColor: tab === key ? '#6366f1' : 'transparent',
                  color: tab === key ? '#a5b4fc' : '#64748b',
                }}
              >
                <Icon size={12} />{label}
              </button>
            ))}
          </div>

          {/* Preview */}
          {tab === 'preview' && html && (
            <div className="rounded-xl overflow-hidden border border-bg-border" style={{ height: 560 }}>
              <iframe
                srcDoc={html}
                title="Site Preview"
                className="w-full h-full"
                sandbox="allow-forms allow-scripts allow-same-origin"
              />
            </div>
          )}

          {/* Code editor */}
          {tab === 'code' && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">HTML 소스 직접 편집</span>
                <button
                  onClick={saveHtml}
                  disabled={savingHtml}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}
                >
                  {savingHtml ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                  저장
                </button>
              </div>
              <textarea
                value={editingHtml}
                onChange={(e) => setEditingHtml(e.target.value)}
                className="w-full h-96 text-[11px] font-mono bg-bg-elevated text-slate-300 border border-bg-border rounded-lg p-3 resize-none focus:outline-none focus:border-brand/50"
                spellCheck={false}
              />
            </div>
          )}

          {/* Submissions */}
          {tab === 'submissions' && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">수집된 문의 / 폼 데이터</span>
                <button onClick={loadSubmissions} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                  <RefreshCw size={12} className={loadingSubs ? 'animate-spin' : ''} />
                </button>
              </div>
              {loadingSubs ? (
                <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
              ) : submissions.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-sm">
                  아직 수집된 데이터가 없습니다.<br />
                  <span className="text-xs">사이트를 배포하고 문의 폼을 통해 데이터를 수집하세요.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {submissions.map((s) => (
                    <SubmissionCard key={s.id} sub={s} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!site && !generating && (
        <div className="card p-12 text-center">
          <Globe size={40} className="mx-auto mb-4 text-slate-700" />
          <div className="text-slate-500 text-sm font-medium mb-1">웹사이트가 없습니다</div>
          <div className="text-slate-700 text-xs">
            계열사를 선택하고 "AI 웹사이트 생성" 버튼을 누르면<br />
            AI가 자동으로 회사 맞춤 웹사이트를 제작합니다.
          </div>
        </div>
      )}
    </div>
  )
}

function SubmissionCard({ sub }: { sub: Submission }) {
  const [open, setOpen] = useState(false)
  const fields = Object.entries(sub.form_data || {})
  return (
    <div
      className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Inbox size={11} className="text-slate-500" />
          <span className="text-xs text-slate-400">{sub.form_data?.name || sub.form_data?.email || '익명'}</span>
          <span className="text-[10px] text-slate-600">{sub.source}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">
            {new Date(sub.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {open ? <ChevronUp size={11} className="text-slate-500" /> : <ChevronDown size={11} className="text-slate-500" />}
        </div>
      </div>
      {open && fields.length > 0 && (
        <div className="px-3 pb-3 border-t border-white/[0.04] pt-2 space-y-1">
          {fields.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[11px]">
              <span className="text-slate-600 min-w-[80px]">{k}</span>
              <span className="text-slate-300">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
