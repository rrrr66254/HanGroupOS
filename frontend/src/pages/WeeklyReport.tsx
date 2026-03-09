import { useState, useEffect } from 'react'
import { FileText, Play, Loader2, RefreshCw, Building2, Calendar, Users, MessageCircle } from 'lucide-react'
import { workApi, companiesApi } from '../api/client'

interface Company { id: number; name: string; industry: string }

interface ReportData {
  company_id: number
  company_name: string
  company_industry: string
  period_days: number
  total_cycles: number
  total_logs: number
  p2p_messages: number
  report: string
  generated_at: string
}

// ── Simple markdown renderer (bold, headers, lists) ────────────────────────────
function renderMd(md: string) {
  const lines = md.split('\n')
  const out: JSX.Element[] = []
  let listBuf: string[] = []

  const flushList = (key: string) => {
    if (!listBuf.length) return
    out.push(
      <ul key={key} className="space-y-1 mb-3 pl-4">
        {listBuf.map((item, i) => (
          <li key={i} className="text-sm text-slate-300 list-disc"
            dangerouslySetInnerHTML={{ __html: inlineMd(item) }} />
        ))}
      </ul>
    )
    listBuf = []
  }

  lines.forEach((line, i) => {
    const key = String(i)
    if (line.startsWith('## ')) {
      flushList(key + 'f')
      out.push(<h2 key={key} className="text-base font-bold text-slate-100 mt-5 mb-2 flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-brand inline-block" />{line.slice(3)}
      </h2>)
    } else if (line.startsWith('### ')) {
      flushList(key + 'f')
      out.push(<h3 key={key} className="text-sm font-semibold text-slate-200 mt-4 mb-1.5">{line.slice(4)}</h3>)
    } else if (line.startsWith('# ')) {
      flushList(key + 'f')
      out.push(<h1 key={key} className="text-lg font-bold text-white mt-4 mb-3">{line.slice(2)}</h1>)
    } else if (/^[-*]\s/.test(line)) {
      listBuf.push(line.slice(2))
    } else if (/^\d+\.\s/.test(line)) {
      listBuf.push(line.replace(/^\d+\.\s/, ''))
    } else if (line.trim() === '') {
      flushList(key + 'f')
      out.push(<div key={key} className="h-1" />)
    } else {
      flushList(key + 'f')
      out.push(<p key={key} className="text-sm text-slate-300 leading-relaxed mb-1.5"
        dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />)
    }
  })
  flushList('end')
  return out
}

function inlineMd(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-slate-200">$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-bg-elevated text-brand-light px-1 rounded text-[11px]">$1</code>')
}

export default function WeeklyReport() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedId, setSelectedId] = useState<number | ''>('')
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<ReportData | null>(null)
  const [savedReports, setSavedReports] = useState<ReportData[]>([])
  const [selectedSaved, setSelectedSaved] = useState<ReportData | null>(null)

  useEffect(() => {
    companiesApi.list().then((res) => {
      const list = res.data as Company[]
      setCompanies(list)
      if (list.length > 0) setSelectedId(list[0].id)
    }).catch(() => {})
    // Load from session storage
    try {
      const stored = sessionStorage.getItem('weeklyReports')
      if (stored) setSavedReports(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const generate = async () => {
    if (!selectedId) return
    setGenerating(true)
    setReport(null)
    try {
      const res = await workApi.weeklyReport(selectedId as number)
      const data = res.data as ReportData
      setReport(data)
      // Save to session storage (last 5)
      setSavedReports((prev) => {
        const updated = [data, ...prev.filter((r) => r.company_id !== data.company_id)].slice(0, 5)
        sessionStorage.setItem('weeklyReports', JSON.stringify(updated))
        return updated
      })
    } catch { /* ignore */ } finally { setGenerating(false) }
  }

  const displayed = selectedSaved || report
  const selectedCompany = companies.find((c) => c.id === selectedId)

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <FileText size={18} className="text-brand-light" />
            주간 경영 보고서
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">최근 7일 업무 루프 결과를 AI가 종합 분석합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(Number(e.target.value)); setReport(null); setSelectedSaved(null) }}
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
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {generating ? '보고서 생성 중…' : '보고서 생성'}
          </button>
        </div>
      </div>

      {/* Saved report chips */}
      {savedReports.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-600">저장된 보고서:</span>
          {savedReports.map((r, i) => (
            <button
              key={i}
              onClick={() => { setSelectedSaved(r); setReport(null) }}
              className="text-[10px] px-2.5 py-1 rounded-full transition-all"
              style={{
                background: selectedSaved?.generated_at === r.generated_at
                  ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: selectedSaved?.generated_at === r.generated_at ? '#a5b4fc' : '#64748b',
              }}
            >
              {r.company_name} · {new Date(r.generated_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {generating && (
        <div className="card p-8 text-center">
          <Loader2 size={32} className="animate-spin text-brand mx-auto mb-3" />
          <div className="text-sm text-slate-300 font-medium">AI가 주간 데이터를 분석하고 있습니다…</div>
          <div className="text-xs text-slate-600 mt-1">업무 로그 종합 → 부문 분석 → 인사이트 도출</div>
        </div>
      )}

      {/* Report display */}
      {displayed && !generating && (
        <div className="space-y-4">
          {/* Meta bar */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-bold text-slate-100">{displayed.company_name}</div>
                <div className="text-[10px] text-slate-500">{displayed.company_industry}</div>
              </div>
              <div className="text-[10px] text-slate-600 flex items-center gap-1">
                <Calendar size={10} />
                {new Date(displayed.generated_at).toLocaleString('ko-KR')} 생성
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: Calendar, label: '분석 기간', value: `최근 ${displayed.period_days}일`, color: '#60a5fa' },
                { icon: RefreshCw, label: '업무 사이클', value: `${displayed.total_cycles}회`, color: '#34d399' },
                { icon: Users, label: 'AI 보고서', value: `${displayed.total_logs}건`, color: '#a78bfa' },
                { icon: MessageCircle, label: 'P2P 메시지', value: `${displayed.p2p_messages}건`, color: '#fbbf24' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="rounded-lg p-3 text-center"
                  style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                  <Icon size={14} className="mx-auto mb-1" style={{ color }} />
                  <div className="text-base font-bold" style={{ color }}>{value}</div>
                  <div className="text-[9px] text-slate-600 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Report body */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-bg-border">
              <Building2 size={14} className="text-brand-light" />
              <span className="text-xs font-semibold text-slate-200">{displayed.company_name} 주간 경영보고서</span>
            </div>
            <div className="prose-sm max-w-none">
              {renderMd(displayed.report)}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!displayed && !generating && (
        <div className="card p-12 text-center">
          <FileText size={40} className="mx-auto mb-4 text-slate-700" />
          <div className="text-slate-500 text-sm font-medium mb-1">보고서를 생성하세요</div>
          <div className="text-slate-700 text-xs">
            계열사를 선택하고 "보고서 생성" 버튼을 누르면<br />
            최근 7일 업무 데이터를 AI가 분석합니다.
          </div>
        </div>
      )}
    </div>
  )
}
