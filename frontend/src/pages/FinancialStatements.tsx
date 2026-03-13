import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, FileText, TrendingUp, TrendingDown, DollarSign,
  BarChart2, Loader2, Brain, ChevronDown, PieChart, AlertTriangle,
} from 'lucide-react'
import { financialApi, companiesApi } from '../api/client'
import { useAppStore } from '../store/useStore'
import type { Company } from '../types'

interface FinancialStatement {
  id: number
  company_id: number
  period: string
  statement_type: string
  revenue: number
  cost_of_sales: number
  operating_expense: number
  operating_income: number
  net_income: number
  total_assets: number
  total_liabilities: number
  total_equity: number
  cash_flow: number
  raw_data: Record<string, unknown>
  ai_analysis: string
  created_at: string
  updated_at: string
}

const FMT = (n: number) => {
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}억`
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}만`
  return n.toLocaleString()
}

export default function FinancialStatements() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null)
  const [statements, setStatements] = useState<FinancialStatement[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState<number | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [viewDetail, setViewDetail] = useState<FinancialStatement | null>(null)
  const addToast = useAppStore((s) => s.addToast)

  const [form, setForm] = useState({
    period: '2026-Q1', statement_type: 'income',
    revenue: 0, cost_of_sales: 0, operating_expense: 0,
    operating_income: 0, net_income: 0,
    total_assets: 0, total_liabilities: 0, total_equity: 0, cash_flow: 0,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, fRes] = await Promise.allSettled([
      companiesApi.list(),
      financialApi.list(selectedCompany || undefined),
    ])
    if (cRes.status === 'fulfilled') setCompanies(cRes.value.data)
    if (fRes.status === 'fulfilled') setStatements(fRes.value.data)
    setLoading(false)
  }, [selectedCompany])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!selectedCompany) { addToast({ type: 'error', title: '계열사를 선택하세요' }); return }
    await financialApi.create({ ...form, company_id: selectedCompany })
    addToast({ type: 'success', title: '재무 데이터 저장됨' })
    setShowForm(false)
    load()
  }

  const analyze = async (id: number) => {
    setAnalyzing(id)
    try {
      const res = await financialApi.analyze(id)
      setStatements((p) => p.map((s) => s.id === id ? { ...s, ai_analysis: res.data.analysis } : s))
      addToast({ type: 'success', title: 'AI 분석 완료' })
    } catch { addToast({ type: 'error', title: '분석 실패' }) }
    setAnalyzing(null)
  }

  const generateReport = async () => {
    if (!selectedCompany) return
    setReportLoading(true)
    try {
      const res = await financialApi.companyReport(selectedCompany)
      setReport(res.data)
    } catch { addToast({ type: 'error', title: '리포트 생성 실패' }) }
    setReportLoading(false)
  }

  const del = async (id: number) => {
    await financialApi.delete(id)
    setStatements((p) => p.filter((s) => s.id !== id))
  }

  // 요약 통계
  const latestByCompany = statements.reduce<Record<number, FinancialStatement>>((acc, s) => {
    if (!acc[s.company_id] || s.period > acc[s.company_id].period) acc[s.company_id] = s
    return acc
  }, {})
  const totalRevenue = Object.values(latestByCompany).reduce((s, f) => s + f.revenue, 0)
  const totalNetIncome = Object.values(latestByCompany).reduce((s, f) => s + f.net_income, 0)
  const totalAssets = Object.values(latestByCompany).reduce((s, f) => s + f.total_assets, 0)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <DollarSign size={22} className="text-emerald-400" /> 재무제표 관리
          </h1>
          <p className="text-xs text-slate-500 mt-1">계열사 재무 데이터 입력 + AI 경영 분석 리포트</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedCompany || ''}
            onChange={(e) => setSelectedCompany(e.target.value ? Number(e.target.value) : null)}
            className="bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
          >
            <option value="">전체 계열사</option>
            {companies.filter((c) => !c.status || c.status === 'active').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedCompany && (
            <button onClick={generateReport} disabled={reportLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors">
              {reportLoading ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />}
              AI 종합리포트
            </button>
          )}
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-brand/15 text-brand-light hover:bg-brand/25 transition-colors">
            <Plus size={13} /> 데이터 입력
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '총 매출', value: FMT(totalRevenue), icon: TrendingUp, color: 'text-emerald-400' },
          { label: '총 순이익', value: FMT(totalNetIncome), icon: totalNetIncome >= 0 ? TrendingUp : TrendingDown, color: totalNetIncome >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: '총 자산', value: FMT(totalAssets), icon: PieChart, color: 'text-blue-400' },
          { label: '재무제표 수', value: `${statements.length}건`, icon: FileText, color: 'text-slate-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-bg-card border border-bg-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
              <Icon size={14} className={color} />
            </div>
            <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* AI Report */}
      {report && (
        <div className="bg-purple-500/5 border border-purple-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-purple-300">AI 종합 재무 리포트</span>
            {(report.report as Record<string, unknown>)?.grade && (
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold">
                등급: {String((report.report as Record<string, unknown>).grade)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {typeof report.report === 'object' ? String((report.report as Record<string, unknown>).summary || JSON.stringify(report.report)) : String(report.report)}
          </p>
          {(report.report as Record<string, unknown>)?.recommendations && (
            <div className="mt-3 space-y-1">
              <span className="text-[10px] text-slate-500">추천 사항</span>
              {((report.report as Record<string, unknown>).recommendations as string[]).map((r, i) => (
                <p key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                  <span className="text-purple-400 font-bold">{i + 1}.</span> {r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-500" size={24} /></div>
      ) : statements.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <DollarSign size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">재무 데이터를 입력하세요</p>
        </div>
      ) : (
        <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-elevated text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">기간</th>
                <th className="text-left px-4 py-2.5">계열사</th>
                <th className="text-right px-4 py-2.5">매출</th>
                <th className="text-right px-4 py-2.5">영업이익</th>
                <th className="text-right px-4 py-2.5">순이익</th>
                <th className="text-right px-4 py-2.5">영업이익률</th>
                <th className="text-center px-4 py-2.5">AI 분석</th>
                <th className="text-center px-4 py-2.5">액션</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => {
                const margin = s.revenue ? (s.operating_income / s.revenue * 100).toFixed(1) : '0.0'
                const companyName = companies.find((c) => c.id === s.company_id)?.name || '-'
                return (
                  <tr key={s.id} className="border-t border-bg-border hover:bg-bg-elevated/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-300 font-mono">{s.period}</td>
                    <td className="px-4 py-3 text-xs text-slate-200">{companyName}</td>
                    <td className="px-4 py-3 text-xs text-slate-300 text-right font-mono">{FMT(s.revenue)}</td>
                    <td className={`px-4 py-3 text-xs text-right font-mono ${s.operating_income >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {FMT(s.operating_income)}
                    </td>
                    <td className={`px-4 py-3 text-xs text-right font-mono ${s.net_income >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {FMT(s.net_income)}
                    </td>
                    <td className={`px-4 py-3 text-xs text-right font-mono ${Number(margin) >= 10 ? 'text-emerald-400' : Number(margin) >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {margin}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.ai_analysis ? (
                        <button onClick={() => setViewDetail(s)} className="text-[10px] text-purple-400 hover:underline">보기</button>
                      ) : (
                        <button onClick={() => analyze(s.id)} disabled={analyzing === s.id}
                          className="text-[10px] text-brand-light hover:underline flex items-center gap-1 mx-auto">
                          {analyzing === s.id ? <Loader2 size={10} className="animate-spin" /> : <Brain size={10} />}분석
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => del(s.id)} className="p-1 rounded text-slate-500 hover:text-red-400"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Input Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-bg-card border border-bg-border rounded-2xl w-[600px] max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Plus size={16} className="text-brand-light" /> 재무 데이터 입력
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">기간</label>
                <input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}
                  className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-brand"
                  placeholder="예: 2026-Q1" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">유형</label>
                <select value={form.statement_type} onChange={(e) => setForm({ ...form, statement_type: e.target.value })}
                  className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 outline-none">
                  <option value="income">손익계산서</option>
                  <option value="balance">재무상태표</option>
                  <option value="cashflow">현금흐름표</option>
                </select>
              </div>
              {[
                { key: 'revenue', label: '매출' },
                { key: 'cost_of_sales', label: '매출원가' },
                { key: 'operating_expense', label: '영업비용' },
                { key: 'operating_income', label: '영업이익' },
                { key: 'net_income', label: '순이익' },
                { key: 'total_assets', label: '총자산' },
                { key: 'total_liabilities', label: '총부채' },
                { key: 'total_equity', label: '자기자본' },
                { key: 'cash_flow', label: '현금흐름' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[10px] text-slate-500 block mb-1">{label}</label>
                  <input type="number" value={(form as Record<string, unknown>)[key] as number}
                    onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
                    className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-brand" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:bg-bg-elevated">취소</button>
              <button onClick={submit} className="px-4 py-2 rounded-lg text-xs font-medium bg-brand/15 text-brand-light hover:bg-brand/25">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {viewDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setViewDetail(null)}>
          <div className="bg-bg-card border border-bg-border rounded-2xl w-[600px] max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-100 mb-3">AI 경영 분석 — {viewDetail.period}</h3>
            <div className="prose prose-invert prose-xs max-w-none">
              <pre className="whitespace-pre-wrap text-xs text-slate-300 bg-bg-base p-4 rounded-xl">{viewDetail.ai_analysis}</pre>
            </div>
            <button onClick={() => setViewDetail(null)} className="mt-4 px-4 py-2 rounded-lg text-xs text-slate-400 hover:bg-bg-elevated">닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
