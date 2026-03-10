import { useEffect, useState } from 'react'
import {
  Gamepad2, TrendingUp, Lightbulb, FolderOpen, ShieldCheck,
  Search, RefreshCw, Save, Plus, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react'
import { gameApi, companiesApi } from '../api/client'
import type { Company } from '../types'

type TrendResult = { title: string; link: string; snippet: string; source: string }
type GameProject = {
  id: number; company_id: number; title: string; genre: string; platform: string
  status: string; description: string; idea_source: string; created_at: string
}
type GameIdea = {
  title: string; genre: string; platform: string; concept: string
  target_audience: string; unique_selling_point: string; monetization: string
  development_estimate: string
}
type Permit = { name: string; authority: string; description: string; url: string; required: boolean }

const STATUS_COLOR: Record<string, string> = {
  concept: 'badge-pending',
  development: 'bg-blue-400/15 text-blue-300 badge',
  released: 'badge-active',
  archived: 'badge-inactive',
}
const STATUS_LABEL: Record<string, string> = {
  concept: '기획', development: '개발중', released: '출시', archived: '보관',
}

export default function GameDashboard() {
  const [tab, setTab] = useState<'trending' | 'projects' | 'ideas' | 'permits'>('trending')
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)

  // trending
  const [trendQuery, setTrendQuery] = useState('')
  const [trendPlatform, setTrendPlatform] = useState('all')
  const [trendResults, setTrendResults] = useState<TrendResult[]>([])
  const [trendSource, setTrendSource] = useState('')
  const [trendLoading, setTrendLoading] = useState(false)

  // projects
  const [projects, setProjects] = useState<GameProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProject, setNewProject] = useState({ title: '', genre: '', platform: '', description: '' })
  const [savingProject, setSavingProject] = useState(false)

  // ideas
  const [ideaGenre, setIdeaGenre] = useState('')
  const [ideaPlatform, setIdeaPlatform] = useState('')
  const [ideaCount, setIdeaCount] = useState(3)
  const [ideas, setIdeas] = useState<GameIdea[]>([])
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [expandedIdea, setExpandedIdea] = useState<number | null>(null)
  const [savingIdea, setSavingIdea] = useState<number | null>(null)

  // permits
  const [permits, setPermits] = useState<Permit[]>([])
  const [permitsCountry, setPermitsCountry] = useState('KR')

  useEffect(() => {
    companiesApi.list().then((r) => {
      const all: Company[] = r.data
      setCompanies(all)
      if (all.length > 0) setSelectedCompanyId(all[0].id)
    })
  }, [])

  // auto load on tab change
  useEffect(() => {
    if (tab === 'trending') loadTrending()
    if (tab === 'projects' && selectedCompanyId) loadProjects(selectedCompanyId)
    if (tab === 'permits') loadPermits()
  }, [tab, selectedCompanyId])

  const loadTrending = async () => {
    setTrendLoading(true)
    try {
      const r = await gameApi.trending(trendQuery, trendPlatform)
      setTrendResults(r.data.results)
      setTrendSource(r.data.source)
    } finally {
      setTrendLoading(false)
    }
  }

  const loadProjects = async (companyId: number) => {
    setProjectsLoading(true)
    try {
      const r = await gameApi.projects(companyId)
      setProjects(r.data)
    } finally {
      setProjectsLoading(false)
    }
  }

  const loadPermits = async () => {
    const r = await gameApi.permits(permitsCountry)
    setPermits(r.data.permits)
  }

  const handleGenerateIdeas = async () => {
    if (!selectedCompanyId) return
    setIdeasLoading(true)
    setIdeas([])
    try {
      const r = await gameApi.generateIdeas(selectedCompanyId, ideaGenre, ideaPlatform, ideaCount)
      setIdeas(r.data.ideas)
    } finally {
      setIdeasLoading(false)
    }
  }

  const handleSaveIdea = async (idea: GameIdea, idx: number) => {
    if (!selectedCompanyId) return
    setSavingIdea(idx)
    try {
      await gameApi.saveIdea({
        company_id: selectedCompanyId,
        title: idea.title,
        genre: idea.genre,
        platform: idea.platform,
        description: `${idea.concept}\n\n타깃: ${idea.target_audience}\n차별화: ${idea.unique_selling_point}\n수익모델: ${idea.monetization}`,
      })
      if (tab === 'projects') loadProjects(selectedCompanyId)
    } finally {
      setSavingIdea(null)
    }
  }

  const handleCreateProject = async () => {
    if (!selectedCompanyId || !newProject.title) return
    setSavingProject(true)
    try {
      await gameApi.createProject({ company_id: selectedCompanyId, ...newProject })
      setShowNewProject(false)
      setNewProject({ title: '', genre: '', platform: '', description: '' })
      loadProjects(selectedCompanyId)
    } finally {
      setSavingProject(false)
    }
  }

  const handleStatusChange = async (project: GameProject, newStatus: string) => {
    await gameApi.updateProject(project.id, { status: newStatus })
    loadProjects(project.company_id)
  }

  const TABS = [
    { id: 'trending', label: '트렌딩', icon: TrendingUp },
    { id: 'projects', label: '프로젝트', icon: FolderOpen },
    { id: 'ideas',    label: 'AI 아이디어', icon: Lightbulb },
    { id: 'permits',  label: '필수 허가', icon: ShieldCheck },
  ] as const

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Gamepad2 size={16} className="text-brand-light" />
          <span className="text-sm font-semibold text-slate-200">게임 플랫폼</span>
        </div>

        {/* Company selector */}
        <select
          value={selectedCompanyId ?? ''}
          onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
          className="input ml-auto text-xs max-w-[180px]"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bg-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-brand text-brand-light'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── 트렌딩 탭 ─────────────────────────────────────────────────── */}
      {tab === 'trending' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-xs"
              placeholder="검색어 (예: roguelike, 퍼즐)"
              value={trendQuery}
              onChange={(e) => setTrendQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadTrending()}
            />
            <select
              value={trendPlatform}
              onChange={(e) => setTrendPlatform(e.target.value)}
              className="input text-xs w-28"
            >
              <option value="all">전체</option>
              <option value="steam">Steam</option>
              <option value="itch">Itch.io</option>
            </select>
            <button
              onClick={loadTrending}
              disabled={trendLoading}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              {trendLoading
                ? <RefreshCw size={12} className="animate-spin" />
                : <Search size={12} />}
              검색
            </button>
          </div>

          {trendSource && (
            <div className="text-[10px] text-slate-600">
              소스: {trendSource === 'serpapi' ? 'SerpAPI' : trendSource === 'google_news_rss' ? 'Google News RSS' : trendSource}
              {' '}· {trendResults.length}개 결과
            </div>
          )}

          <div className="space-y-2">
            {trendResults.length === 0 && !trendLoading && (
              <div className="card p-8 text-center text-slate-600 text-sm">
                검색 버튼을 눌러 트렌딩 게임을 조회하세요.
              </div>
            )}
            {trendResults.map((r, i) => (
              <div key={i} className="card p-3 hover:border-brand/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">{r.title}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{r.snippet}</div>
                  </div>
                  {r.link && (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-slate-600 hover:text-brand-light transition-colors"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 프로젝트 탭 ──────────────────────────────────────────────── */}
      {tab === 'projects' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setShowNewProject((v) => !v)}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <Plus size={12} /> 새 프로젝트
            </button>
          </div>

          {showNewProject && (
            <div className="card p-4 space-y-3 border-brand/30">
              <div className="text-xs font-medium text-slate-300">새 게임 프로젝트 등록</div>
              {[
                { label: '프로젝트명 *', key: 'title', placeholder: '예: 던전 어드벤처' },
                { label: '장르', key: 'genre', placeholder: '예: RPG, 퍼즐, 액션' },
                { label: '플랫폼', key: 'platform', placeholder: '예: PC, 모바일, 웹' },
                { label: '설명', key: 'description', placeholder: '프로젝트 설명' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[10px] text-slate-500 mb-1">{label}</label>
                  <input
                    className="input text-xs"
                    placeholder={placeholder}
                    value={newProject[key as keyof typeof newProject]}
                    onChange={(e) => setNewProject((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => setShowNewProject(false)} className="btn-ghost flex-1 text-xs">취소</button>
                <button
                  onClick={handleCreateProject}
                  disabled={!newProject.title || savingProject}
                  className="btn-primary flex-1 text-xs"
                >
                  {savingProject ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}

          {projectsLoading && (
            <div className="card p-8 text-center text-slate-600 text-sm">
              <RefreshCw size={16} className="animate-spin mx-auto mb-2" />
              로딩 중...
            </div>
          )}

          {!projectsLoading && projects.length === 0 && (
            <div className="card p-8 text-center text-slate-600 text-sm">
              등록된 게임 프로젝트가 없습니다.
            </div>
          )}

          {projects.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-100">{p.title}</span>
                    {p.idea_source === 'ai_generated' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-400/15 text-purple-300 border border-purple-400/20">
                        AI 생성
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {p.genre && `${p.genre} · `}{p.platform}
                  </div>
                  {p.description && (
                    <div className="text-[10px] text-slate-500 mt-1.5 line-clamp-2">{p.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={p.status}
                    onChange={(e) => handleStatusChange(p, e.target.value)}
                    className="input text-[10px] py-1 px-2 w-24"
                  >
                    {Object.entries(STATUS_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <span className={STATUS_COLOR[p.status] || 'badge-inactive'}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── AI 아이디어 탭 ──────────────────────────────────────────── */}
      {tab === 'ideas' && (
        <div className="space-y-3">
          <div className="card p-4 space-y-3">
            <div className="text-xs font-medium text-slate-300">AI 게임 아이디어 생성 조건</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">장르 (선택)</label>
                <input
                  className="input text-xs"
                  placeholder="예: RPG, 퍼즐"
                  value={ideaGenre}
                  onChange={(e) => setIdeaGenre(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">플랫폼 (선택)</label>
                <input
                  className="input text-xs"
                  placeholder="예: 모바일, PC"
                  value={ideaPlatform}
                  onChange={(e) => setIdeaPlatform(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">개수</label>
                <select
                  value={ideaCount}
                  onChange={(e) => setIdeaCount(Number(e.target.value))}
                  className="input text-xs"
                >
                  {[1, 2, 3, 5].map((n) => (
                    <option key={n} value={n}>{n}개</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleGenerateIdeas}
              disabled={ideasLoading || !selectedCompanyId}
              className="w-full btn-primary flex items-center justify-center gap-2 text-xs"
            >
              {ideasLoading
                ? <><RefreshCw size={12} className="animate-spin" /> 생성 중 (트렌드 분석 중...)&#8203;</>
                : <><Lightbulb size={12} /> AI 아이디어 생성</>}
            </button>
          </div>

          {ideas.length === 0 && !ideasLoading && (
            <div className="card p-8 text-center text-slate-600 text-sm">
              조건을 설정하고 생성 버튼을 누르세요.<br />
              <span className="text-[10px] mt-1 block text-slate-700">트렌딩 게임 데이터를 분석해 아이디어를 자동 생성합니다.</span>
            </div>
          )}

          {ideas.map((idea, i) => (
            <div key={i} className="card overflow-hidden">
              <div
                className="p-4 cursor-pointer flex items-start justify-between gap-3"
                onClick={() => setExpandedIdea(expandedIdea === i ? null : i)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-100">{idea.title}</span>
                    {idea.genre && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-400/15 text-indigo-300 border border-indigo-400/20">
                        {idea.genre}
                      </span>
                    )}
                    {idea.platform && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-400/15 text-cyan-300 border border-cyan-400/20">
                        {idea.platform}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{idea.concept}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSaveIdea(idea, i) }}
                    disabled={savingIdea === i}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-success/15 text-success hover:bg-success/25 transition-colors border border-success/20"
                  >
                    {savingIdea === i
                      ? <RefreshCw size={10} className="animate-spin" />
                      : <Save size={10} />}
                    저장
                  </button>
                  {expandedIdea === i ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
              </div>

              {expandedIdea === i && (
                <div className="border-t border-bg-border p-4 space-y-2 bg-bg-elevated/30">
                  {[
                    ['타깃 유저', idea.target_audience],
                    ['차별화 포인트', idea.unique_selling_point],
                    ['수익 모델', idea.monetization],
                    ['개발 규모', idea.development_estimate],
                  ].map(([label, value]) => value && (
                    <div key={label} className="flex gap-2">
                      <span className="text-[10px] text-slate-500 w-20 flex-shrink-0">{label}</span>
                      <span className="text-[10px] text-slate-300">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 필수 허가 탭 ─────────────────────────────────────────────── */}
      {tab === 'permits' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">국가</label>
            <select
              value={permitsCountry}
              onChange={(e) => { setPermitsCountry(e.target.value); setTimeout(loadPermits, 0) }}
              className="input text-xs w-24"
            >
              <option value="KR">한국 (KR)</option>
              <option value="US">미국 (US)</option>
            </select>
          </div>

          {permits.length === 0 && (
            <div className="card p-8 text-center text-slate-600 text-sm">
              <RefreshCw size={14} className="animate-spin mx-auto mb-2" />
              로딩 중...
            </div>
          )}

          {permits.map((p, i) => (
            <div key={i} className={`card p-4 ${p.required ? 'border-warning/20' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-100">{p.name}</span>
                    <span className={p.required ? 'badge-pending' : 'badge-inactive'}>
                      {p.required ? '필수' : '선택'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{p.authority}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5">{p.description}</div>
                </div>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-slate-600 hover:text-brand-light transition-colors"
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
