import { useEffect, useState } from 'react'
import {
  FileText, Download, Copy, Check, Loader, ChevronRight,
  BarChart2, TrendingUp, Calendar, Building2,
} from 'lucide-react'
import { docsApi, companiesApi, workApi } from '../api/client'
import MarkdownMessage from '../components/MarkdownMessage'
import type { Company } from '../types'

interface DocType {
  id: string
  name: string
  description: string
  icon: string
  format: string
  color: string
}

interface DocResult {
  type: string
  company_name: string
  format: string
  content: string
  generated_at: string
  data_sources?: Record<string, number | boolean>
}

const COLOR_MAP: Record<string, string> = {
  brand: 'border-brand/40 bg-brand/10 text-brand-light',
  success: 'border-success/40 bg-success/10 text-success',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
}

export default function DocGenerator() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DocResult | null>(null)
  const [htmlContent, setHtmlContent] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    companiesApi.list().then((r) => setCompanies(r.data))
    docsApi.types().then((r) => setDocTypes(r.data.types)).catch(() => {
      setDocTypes([
        { id: 'ir', name: 'IR 보고서', description: '투자자용 HTML 슬라이드', icon: '📊', format: 'html', color: 'brand' },
        { id: 'business_plan', name: '사업계획서', description: '전략 기반 Markdown 사업계획서', icon: '📋', format: 'markdown', color: 'success' },
        { id: 'market_brief', name: '시장 분석 브리핑', description: '수집 데이터 기반 시장 분석', icon: '📈', format: 'markdown', color: 'accent' },
        { id: 'weekly_report', name: '주간 업무 보고', description: '업무 로그 기반 주간 보고서', icon: '📅', format: 'markdown', color: 'amber' },
      ])
    })
  }, [])

  const generate = async () => {
    if (!selectedCompany || !selectedType) return
    const cid = parseInt(selectedCompany)
    setLoading(true)
    setResult(null)
    setHtmlContent('')
    try {
      if (selectedType === 'ir') {
        const r = await docsApi.ir(cid)
        setHtmlContent(r.data)
        const company = companies.find((c) => c.id === cid)
        setResult({
          type: 'ir', company_name: company?.name || '', format: 'html',
          content: '', generated_at: new Date().toISOString(),
        })
      } else if (selectedType === 'business_plan') {
        const r = await docsApi.businessPlan(cid)
        setResult(r.data)
      } else if (selectedType === 'market_brief') {
        const r = await docsApi.marketBrief(cid)
        setResult(r.data)
      } else if (selectedType === 'weekly_report') {
        const r = await workApi.weeklyReport(cid)
        const company = companies.find((c) => c.id === cid)
        setResult({
          type: 'weekly_report', company_name: company?.name || '',
          format: 'markdown', content: r.data.report || r.data.content || JSON.stringify(r.data),
          generated_at: new Date().toISOString(),
        })
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '문서 생성 실패'
      setResult({
        type: selectedType, company_name: '', format: 'markdown',
        content: `❌ 오류: ${msg}`, generated_at: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  const copyContent = () => {
    const text = result?.format === 'html' ? htmlContent : result?.content || ''
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadContent = () => {
    const docType = docTypes.find((d) => d.id === selectedType)
    const ext = result?.format === 'html' ? 'html' : 'md'
    const text = result?.format === 'html' ? htmlContent : result?.content || ''
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result?.company_name || 'doc'}_${docType?.name || selectedType}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const typeIcons: Record<string, JSX.Element> = {
    ir: <BarChart2 size={18} />,
    business_plan: <FileText size={18} />,
    market_brief: <TrendingUp size={18} />,
    weekly_report: <Calendar size={18} />,
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileText size={20} className="text-brand-light" />
        <div>
          <h2 className="text-base font-semibold text-slate-100">AI 문서 자동 생성기</h2>
          <p className="text-xs text-slate-500">기존 DB 데이터로 원클릭 문서 생성</p>
        </div>
      </div>

      {/* 설정 */}
      <div className="card p-5 space-y-5">
        {/* 회사 선택 */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Building2 size={12} /> 회사 선택
          </label>
          <select
            className="input"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
          >
            <option value="">회사를 선택하세요</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* 문서 타입 선택 */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">문서 유형</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {docTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedType === type.id
                    ? (COLOR_MAP[type.color] || 'border-brand/40 bg-brand/10')
                    : 'border-bg-border bg-bg-elevated hover:border-slate-600'
                }`}
              >
                <div className="text-xl mb-1.5">{type.icon}</div>
                <div className="text-xs font-semibold text-slate-100">{type.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{type.description}</div>
                <div className="text-[9px] text-slate-600 mt-1 uppercase tracking-wide">{type.format}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 생성 버튼 */}
        <button
          onClick={generate}
          disabled={!selectedCompany || !selectedType || loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading ? (
            <><Loader size={14} className="animate-spin" /> 생성 중...</>
          ) : (
            <><ChevronRight size={14} /> 문서 생성</>
          )}
        </button>
      </div>

      {/* 결과 */}
      {(result || htmlContent) && (
        <div className="card overflow-hidden">
          {/* 결과 헤더 */}
          <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              {typeIcons[result?.type || selectedType]}
              <span className="text-sm font-semibold text-slate-100">
                {result?.company_name} — {docTypes.find((d) => d.id === result?.type)?.name}
              </span>
              {result?.data_sources && (
                <div className="flex gap-2 ml-3">
                  {Object.entries(result.data_sources).map(([k, v]) => (
                    <span key={k} className="text-[10px] text-slate-500 bg-bg-elevated px-1.5 py-0.5 rounded">
                      {k}: {typeof v === 'boolean' ? (v ? '✓' : '✗') : v}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyContent}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-bg-elevated border border-bg-border hover:border-slate-600 transition-colors"
              >
                {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                {copied ? '복사됨' : '복사'}
              </button>
              <button
                onClick={downloadContent}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-bg-elevated border border-bg-border hover:border-slate-600 transition-colors"
              >
                <Download size={12} />
                다운로드
              </button>
            </div>
          </div>

          {/* 콘텐츠 뷰어 */}
          <div className="p-4">
            {result?.format === 'html' || htmlContent ? (
              <iframe
                srcDoc={htmlContent}
                className="w-full rounded-lg border border-bg-border"
                style={{ height: '70vh' }}
                title="IR Report"
              />
            ) : (
              <div className="prose prose-invert prose-sm max-w-none">
                <MarkdownMessage content={result?.content || ''} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
