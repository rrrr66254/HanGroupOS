import { useEffect, useState } from 'react'
import { Building2, Plus, X, RefreshCw } from 'lucide-react'
import { companiesApi } from '../api/client'
import type { Company, OrgNode } from '../types'
import OrgChart from '../components/OrgChart'

function CompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', industry: '', vision: '' })
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!form.name) return
    setLoading(true)
    try {
      await companiesApi.create(form, true)
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-100">새 계열사 설립</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>
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
          <button onClick={handleCreate} disabled={!form.name || loading} className="flex-1 btn-primary">
            {loading ? '설립 중...' : '설립'}
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_MAP: Record<string, string> = {
  active: '활성',
  inactive: '비활성',
  planning: '계획중',
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [orgTree, setOrgTree] = useState<OrgNode[]>([])
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('')

  const load = () => companiesApi.list().then((r) => setCompanies(r.data))

  useEffect(() => { load() }, [])

  const selectCompany = async (c: Company) => {
    setSelected(c)
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
          <RefreshCw size={13} />
          새로고침
        </button>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 ml-auto">
          <Plus size={14} />
          계열사 설립
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Company list */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-xs text-slate-500 font-medium px-1">
            {filtered.length}개 계열사
          </h3>
          {filtered.length === 0 && (
            <div className="card p-8 text-center text-slate-600 text-sm">
              계열사가 없습니다.
            </div>
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

        {/* Org tree */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">{selected.name} — 조직도</div>
                  <div className="text-xs text-slate-500 mt-0.5">{selected.vision}</div>
                </div>
                <span className={`badge ${selected.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                  {STATUS_MAP[selected.status]}
                </span>
              </div>
              <OrgChart tree={orgTree} className="max-h-[500px]" />
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
        <CompanyModal
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}
