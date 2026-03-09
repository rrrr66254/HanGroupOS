import { useState, useEffect } from 'react'
import { BarChart2, Play, Loader2, ExternalLink, Download, RefreshCw } from 'lucide-react'
import { companiesApi, sitesApi } from '../api/client'

interface Company { id: number; name: string; industry: string }

export default function IRReport() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedId, setSelectedId] = useState<number | ''>('')
  const [generating, setGenerating] = useState(false)
  const [html, setHtml] = useState('')
  const [savedReports, setSavedReports] = useState<{ companyId: number; name: string; html: string; ts: string }[]>([])

  useEffect(() => {
    companiesApi.list().then((r) => {
      const list = r.data as Company[]
      setCompanies(list)
      if (list.length > 0) setSelectedId(list[0].id)
    }).catch(() => {})
    try {
      const stored = sessionStorage.getItem('irReports')
      if (stored) setSavedReports(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const generate = async () => {
    if (!selectedId) return
    setGenerating(true)
    setHtml('')
    try {
      const r = await sitesApi.generateIR(selectedId as number)
      const newHtml = r.data.html as string
      setHtml(newHtml)
      const company = companies.find((c) => c.id === selectedId)
      setSavedReports((prev) => {
        const updated = [
          { companyId: selectedId as number, name: company?.name ?? '', html: newHtml, ts: new Date().toISOString() },
          ...prev.filter((p) => p.companyId !== selectedId),
        ].slice(0, 5)
        sessionStorage.setItem('irReports', JSON.stringify(updated))
        return updated
      })
    } catch { /* ignore */ } finally { setGenerating(false) }
  }

  const download = () => {
    if (!html) return
    const company = companies.find((c) => c.id === selectedId)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${company?.name ?? 'IR'}_report.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openInNewTab = () => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <BarChart2 size={18} className="text-brand-light" />
            IR 자료 자동 생성
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">AI가 계열사 성과 데이터를 투자자 프레젠테이션으로 자동 변환합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(Number(e.target.value)); setHtml('') }}
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
            {generating ? 'AI 생성 중…' : 'IR 자료 생성'}
          </button>
          {html && (
            <>
              <button
                onClick={openInNewTab}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' }}
              >
                <ExternalLink size={12} /> 새 탭
              </button>
              <button
                onClick={download}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa' }}
              >
                <Download size={12} /> 다운로드
              </button>
            </>
          )}
        </div>
      </div>

      {/* Saved chips */}
      {savedReports.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-600">저장된 보고서:</span>
          {savedReports.map((r, i) => (
            <button
              key={i}
              onClick={() => { setSelectedId(r.companyId); setHtml(r.html) }}
              className="text-[10px] px-2.5 py-1 rounded-full transition-all"
              style={{
                background: selectedId === r.companyId && html === r.html ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: selectedId === r.companyId && html === r.html ? '#a5b4fc' : '#64748b',
              }}
            >
              {r.name} · {new Date(r.ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            </button>
          ))}
        </div>
      )}

      {/* Generating */}
      {generating && (
        <div className="card p-8 text-center">
          <Loader2 size={32} className="animate-spin text-brand mx-auto mb-3" />
          <div className="text-sm text-slate-300 font-medium">AI가 IR 프레젠테이션을 제작하고 있습니다…</div>
          <div className="text-xs text-slate-600 mt-1">성과 데이터 수집 → AI 콘텐츠 생성 → 슬라이드 렌더링</div>
        </div>
      )}

      {/* Preview */}
      {html && !generating && (
        <div className="rounded-xl overflow-hidden border border-bg-border" style={{ height: 640 }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-bg-border bg-bg-elevated">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500/60" />
              <div className="w-2 h-2 rounded-full bg-amber-500/60" />
              <div className="w-2 h-2 rounded-full bg-green-500/60" />
              <span className="text-[10px] text-slate-600 ml-2">IR Presentation Preview</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={generate} className="text-[9px] text-slate-600 hover:text-slate-400 flex items-center gap-1">
                <RefreshCw size={9} /> 재생성
              </button>
            </div>
          </div>
          <iframe
            srcDoc={html}
            title="IR Report Preview"
            className="w-full"
            style={{ height: 596 }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}

      {/* Empty */}
      {!html && !generating && (
        <div className="card p-12 text-center">
          <BarChart2 size={40} className="mx-auto mb-4 text-slate-700" />
          <div className="text-slate-500 text-sm font-medium mb-1">IR 자료를 생성하세요</div>
          <div className="text-slate-700 text-xs">
            계열사를 선택하고 "IR 자료 생성" 버튼을 누르면<br />
            AI가 5개 슬라이드 분량의 투자자 프레젠테이션을 자동 제작합니다.
          </div>
        </div>
      )}
    </div>
  )
}
