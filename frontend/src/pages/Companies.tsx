import { useEffect, useState } from 'react'
import { Building2, Plus, X, RefreshCw, ChevronRight, ChevronLeft, Bot, Check } from 'lucide-react'
import { companiesApi, orgApi, modelsApi } from '../api/client'
import type { Company, OrgNode } from '../types'
import OrgChart from '../components/OrgChart'

// ── AI tier mapping (mirrors backend/services/org_service.py) ─────────────
type Budget = 'any' | 'low' | 'free'
const AI_TIER: Record<string, Record<Budget, [string, string]>> = {
  ceo:        { any: ['anthropic', 'claude-sonnet-4-6'],       low: ['openai', 'gpt-4o-mini'], free: ['ollama', 'llama3.2'] },
  chief:      { any: ['anthropic', 'claude-haiku-4-5-20251001'], low: ['openai', 'gpt-4o-mini'], free: ['ollama', 'llama3.2'] },
  team_lead:  { any: ['openai', 'gpt-4o-mini'],               low: ['ollama', 'llama3.2'],   free: ['ollama', 'qwen2.5'] },
  specialist: { any: ['ollama', 'qwen2.5'],                    low: ['ollama', 'qwen2.5'],    free: ['ollama', 'qwen2.5'] },
}

const INDUSTRY_PREVIEW: Record<string, { level: string; label: string }[]> = {
  software: [
    { level: 'ceo',       label: 'CEO' },
    { level: 'chief',     label: 'Chief (제품·개발·성장)' },
    { level: 'team_lead', label: '팀장 (PM·BE·FE·마케팅)' },
  ],
  media: [
    { level: 'ceo',       label: 'CEO' },
    { level: 'chief',     label: 'Chief (콘텐츠·기술)' },
    { level: 'team_lead', label: '팀장 (콘텐츠·배포·개발)' },
  ],
  data: [
    { level: 'ceo',       label: 'CEO' },
    { level: 'chief',     label: 'Chief (데이터·전략)' },
    { level: 'team_lead', label: '팀장 (분석·엔지니어링·인사이트)' },
  ],
  general: [
    { level: 'ceo',       label: 'CEO' },
    { level: 'chief',     label: 'Chief (운영·성장)' },
    { level: 'team_lead', label: '팀장 (운영·마케팅)' },
  ],
}

function getIndustryKey(industry: string): string {
  const map: Record<string, string> = {
    '미디어': 'media', 'media': 'media',
    '소프트웨어': 'software', 'software': 'software', 'saas': 'software',
    '데이터': 'data', 'data': 'data',
  }
  return map[industry?.toLowerCase()] ?? 'general'
}

const BUDGET_OPTIONS: { value: Budget; label: string; sub: string }[] = [
  { value: 'free', label: '무료',      sub: 'Ollama qwen2.5 (API 키 불필요)' },
  { value: 'low',  label: '절약',      sub: 'GPT-4o-mini + Llama 3.2' },
  { value: 'any',  label: '최고 성능', sub: 'Claude Sonnet + GPT-4o' },
]

// ── CompanyModal ──────────────────────────────────────────────────────────
function CompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', description: '', industry: '', vision: '' })
  const [budget, setBudget] = useState<Budget>('any')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!form.name) return
    setLoading(true)
    try {
      await companiesApi.create(form, true, budget)
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const preview = INDUSTRY_PREVIEW[getIndustryKey(form.industry)]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              {step === 1 ? '새 계열사 설립' : 'AI 설정'}
            </h2>
            <div className="flex gap-1">
              {[1, 2].map((s) => (
                <div key={s} className={`w-1.5 h-1.5 rounded-full ${step === s ? 'bg-brand' : 'bg-slate-700'}`} />
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        {step === 1 ? (
          <>
            <div className="space-y-3">
              {[
                { label: '회사명 *', key: 'name', placeholder: '예: 한리서치' },
                { label: '산업 분야', key: 'industry', placeholder: '예: 미디어, 소프트웨어, 데이터' },
                { label: '설명', key: 'description', placeholder: '회사 설명' },
                { label: '비전', key: 'vision', placeholder: '회사 비전 및 목표' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <input
                    className="input"
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                  />
                </div>
              ))}
              <p className="text-[10px] text-slate-600">* 조직도가 산업에 맞게 자동 생성됩니다.</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={onClose} className="flex-1 btn-ghost border border-bg-border">취소</button>
              <button
                onClick={() => setStep(2)}
                disabled={!form.name}
                className="flex-1 btn-primary flex items-center justify-center gap-1"
              >
                다음 <ChevronRight size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Budget selector */}
            <div className="space-y-2 mb-4">
              <p className="text-xs text-slate-400 mb-2">임원·팀장 AI 모델 예산 선택</p>
              {BUDGET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBudget(opt.value)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    budget === opt.value
                      ? 'border-brand/60 bg-brand/10'
                      : 'border-bg-border hover:border-brand/30'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                    budget === opt.value ? 'border-brand bg-brand' : 'border-slate-600'
                  }`} />
                  <div>
                    <div className="text-sm font-medium text-slate-200">{opt.label}</div>
                    <div className="text-[10px] text-slate-500">{opt.sub}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* AI assignment preview */}
            <div className="border border-bg-border rounded-lg p-3 mb-4">
              <div className="text-[10px] text-slate-500 font-medium mb-2 uppercase tracking-wide">
                배정 미리보기 — {form.industry || '기본'}
              </div>
              <div className="space-y-2">
                {preview.map((row) => {
                  const [provider, model] = AI_TIER[row.level][budget]
                  return (
                    <div key={row.level} className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{row.label}</span>
                      <span className="text-[10px] font-mono text-slate-300">
                        {model}{' '}
                        <span className="text-slate-600">({provider})</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 btn-ghost border border-bg-border flex items-center justify-center gap-1"
              >
                <ChevronLeft size={14} /> 뒤로
              </button>
              <button onClick={handleCreate} disabled={loading} className="flex-1 btn-primary">
                {loading ? '설립 중...' : '설립'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── AI Edit Panel ─────────────────────────────────────────────────────────
type ModelCatalog = { id: number; name: string; provider: string; model_id: string }

function AiEditPanel({ companyId }: { companyId: number }) {
  const [nodes, setNodes] = useState<OrgNode[]>([])
  const [catalog, setCatalog] = useState<ModelCatalog[]>([])
  const [editing, setEditing] = useState<Record<number, { ai_provider: string; ai_model: string }>>({})
  const [saving, setSaving] = useState<number | null>(null)

  useEffect(() => {
    orgApi.nodes(companyId).then((r) => setNodes(r.data))
    modelsApi.catalog().then((r) => setCatalog(r.data))
  }, [companyId])

  const handleProviderChange = (nodeId: number, provider: string) => {
    const firstModel = catalog.find((m) => m.provider === provider)?.model_id ?? ''
    setEditing((prev) => ({ ...prev, [nodeId]: { ai_provider: provider, ai_model: firstModel } }))
  }

  const handleModelChange = (nodeId: number, model: string) => {
    setEditing((prev) => ({
      ...prev,
      [nodeId]: { ...(prev[nodeId] ?? { ai_provider: nodes.find((n) => n.id === nodeId)?.ai_provider ?? '' }), ai_model: model },
    }))
  }

  const handleSave = async (node: OrgNode) => {
    const patch = editing[node.id]
    if (!patch) return
    setSaving(node.id)
    try {
      await orgApi.updateNode(node.id, patch)
      setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, ...patch } : n))
      setEditing((prev) => { const next = { ...prev }; delete next[node.id]; return next })
    } finally {
      setSaving(null)
    }
  }

  const LEVEL_LABEL: Record<string, string> = {
    ceo: 'CEO', chief: 'Chief', team_lead: '팀장', specialist: '전문가',
  }

  const providerOptions = [...new Set(catalog.map((m) => m.provider))]

  return (
    <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
      {nodes.length === 0 && (
        <div className="text-center text-slate-600 text-xs py-8">조직원 없음</div>
      )}
      {nodes.map((node) => {
        const cur = editing[node.id] ?? { ai_provider: node.ai_provider, ai_model: node.ai_model }
        const filteredModels = catalog.filter((m) => m.provider === cur.ai_provider)
        const isDirty = !!editing[node.id]

        return (
          <div key={node.id} className="flex items-center gap-2 p-2 rounded-lg bg-bg-card border border-bg-border">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                  {LEVEL_LABEL[node.level] ?? node.level}
                </span>
                <span className="text-xs font-medium text-slate-200 truncate">{node.name}</span>
              </div>
              <div className="text-[10px] text-slate-500 truncate mt-0.5">{node.role}</div>
            </div>
            <select
              value={cur.ai_provider}
              onChange={(e) => handleProviderChange(node.id, e.target.value)}
              className="input text-[10px] py-1 px-2 w-24"
            >
              {providerOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={cur.ai_model}
              onChange={(e) => handleModelChange(node.id, e.target.value)}
              className="input text-[10px] py-1 px-2 w-36"
            >
              {filteredModels.map((m) => (
                <option key={m.model_id} value={m.model_id}>{m.model_id}</option>
              ))}
            </select>
            <button
              onClick={() => handleSave(node)}
              disabled={!isDirty || saving === node.id}
              className={`p-1.5 rounded transition-all ${
                isDirty
                  ? 'bg-brand/20 text-brand-light hover:bg-brand/30'
                  : 'text-slate-700 cursor-default'
              }`}
            >
              {saving === node.id ? (
                <span className="text-[10px]">...</span>
              ) : (
                <Check size={12} />
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Status ────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, string> = {
  active: '활성', inactive: '비활성', planning: '계획중',
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [orgTree, setOrgTree] = useState<OrgNode[]>([])
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<'chart' | 'ai'>('chart')

  const load = () => companiesApi.list().then((r) => setCompanies(r.data))

  useEffect(() => { load() }, [])

  const selectCompany = async (c: Company) => {
    setSelected(c)
    setTab('chart')
    const res = await companiesApi.orgTree(c.id)
    setOrgTree(res.data.tree)
  }

  const filtered = companies.filter(
    (c) => c.name.includes(filter) || c.industry.includes(filter)
  )

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="계열사 검색..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button onClick={load} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={13} /> 새로고침
        </button>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 ml-auto">
          <Plus size={14} /> 계열사 설립
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Company list */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-xs text-slate-500 font-medium px-1">{filtered.length}개 계열사</h3>
          {filtered.length === 0 && (
            <div className="card p-8 text-center text-slate-600 text-sm">계열사가 없습니다.</div>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => selectCompany(c)}
              className={`card p-4 cursor-pointer transition-all hover:border-brand/40 ${
                selected?.id === c.id ? 'border-brand/60 bg-brand/5' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-brand/10 rounded-lg flex items-center justify-center">
                    <Building2 size={14} className="text-brand-light" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{c.name}</div>
                    <div className="text-[10px] text-slate-500">{c.industry}</div>
                  </div>
                </div>
                <span className={`badge ${c.status === 'active' ? 'badge-active' : c.status === 'planning' ? 'badge-pending' : 'badge-inactive'}`}>
                  {STATUS_MAP[c.status] || c.status}
                </span>
              </div>
              {c.description && (
                <p className="text-xs text-slate-500 mt-2 line-clamp-2">{c.description}</p>
              )}
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">{selected.name} — 조직도</div>
                  <div className="text-xs text-slate-500 mt-0.5">{selected.vision}</div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Tab switcher */}
                  <div className="flex rounded-lg border border-bg-border overflow-hidden text-xs">
                    <button
                      onClick={() => setTab('chart')}
                      className={`px-3 py-1.5 transition-colors ${tab === 'chart' ? 'bg-brand/20 text-brand-light' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      조직도
                    </button>
                    <button
                      onClick={() => setTab('ai')}
                      className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${tab === 'ai' ? 'bg-brand/20 text-brand-light' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      <Bot size={11} /> AI 편집
                    </button>
                  </div>
                  <span className={`badge ${selected.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {STATUS_MAP[selected.status]}
                  </span>
                </div>
              </div>
              {tab === 'chart'
                ? <OrgChart tree={orgTree} className="max-h-[500px]" />
                : <AiEditPanel companyId={selected.id} />
              }
            </div>
          ) : (
            <div className="card p-12 flex flex-col items-center justify-center text-slate-600 gap-3">
              <Building2 size={40} className="text-slate-700" />
              <p className="text-sm">계열사를 선택하면 조직도가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <CompanyModal onClose={() => setShowModal(false)} onCreated={load} />
      )}
    </div>
  )
}
