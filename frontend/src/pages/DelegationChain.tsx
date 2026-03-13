import { useState, useEffect } from 'react'
import { GitMerge, Send, Loader2, ChevronRight, Users } from 'lucide-react'
import { delegationApi, companiesApi } from '../api/client'

interface ExpertResponse {
  role_key: string
  role: string
  response: string
}

interface DelegationResult {
  question: string
  ceo_initial: string
  delegated_to: { key: string; role: string }[]
  expert_responses: ExpertResponse[]
  final_summary: string
}

export default function DelegationChain() {
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([])
  const [selectedCompany, setSelectedCompany] = useState<number>(0)
  const [question, setQuestion] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DelegationResult | null>(null)
  const [preview, setPreview] = useState<{ key: string; role: string }[]>([])

  useEffect(() => {
    companiesApi.list().then((r) => {
      const list = r.data?.companies || r.data || []
      setCompanies(list)
      if (list.length > 0) setSelectedCompany(list[0].id)
    }).catch(() => {})
  }, [])

  const detectTargets = async (q: string) => {
    if (q.length < 3) { setPreview([]); return }
    try {
      const r = await delegationApi.detect(q, selectedCompany)
      setPreview(r.data.targets)
    } catch { /* ignore */ }
  }

  const run = async () => {
    if (!question.trim() || !selectedCompany) return
    setRunning(true)
    setResult(null)
    try {
      const r = await delegationApi.run(question, selectedCompany)
      setResult(r.data)
    } catch { /* ignore */ }
    setRunning(false)
  }

  const ROLE_COLORS: Record<string, string> = {
    cto: 'text-cyan-400 bg-cyan-500/10',
    cfo: 'text-emerald-400 bg-emerald-500/10',
    cmo: 'text-pink-400 bg-pink-500/10',
    coo: 'text-amber-400 bg-amber-500/10',
    cpo: 'text-purple-400 bg-purple-500/10',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <GitMerge size={20} className="text-indigo-400" /> 자동 위임 체인
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          CEO가 전문 질문을 CTO/CFO/CMO에게 자동 위임하고 종합 보고
        </p>
      </div>

      {/* 입력 */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-3">
          <select value={selectedCompany} onChange={(e) => setSelectedCompany(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300 w-48">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <input value={question}
            onChange={(e) => { setQuestion(e.target.value); detectTargets(e.target.value) }}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="전문가 위임이 필요한 질문을 입력하세요..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200" />
          <button onClick={run} disabled={running || !question.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs flex items-center gap-1 disabled:opacity-50">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {running ? '분석 중...' : '실행'}
          </button>
        </div>

        {/* 위임 대상 미리보기 */}
        {preview.length > 0 && !result && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Users size={12} /> 예상 위임:
            {preview.map((t) => (
              <span key={t.key} className={`px-2 py-0.5 rounded-full text-[10px] ${ROLE_COLORS[t.key] || 'text-slate-400 bg-slate-800'}`}>
                {t.role}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 결과 */}
      {running && (
        <div className="card p-8 text-center">
          <Loader2 size={24} className="animate-spin text-indigo-400 mx-auto mb-2" />
          <div className="text-xs text-slate-500">CEO 초기 분석 → 전문가 위임 → 종합 보고 진행 중...</div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* CEO 초기 */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] rounded-full">CEO 초기 분석</span>
              {result.delegated_to.length > 0 && (
                <>
                  <ChevronRight size={12} className="text-slate-600" />
                  {result.delegated_to.map((t) => (
                    <span key={t.key} className={`px-2 py-0.5 rounded-full text-[10px] ${ROLE_COLORS[t.key] || 'text-slate-400 bg-slate-800'}`}>
                      {t.role}
                    </span>
                  ))}
                </>
              )}
            </div>
            <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{result.ceo_initial}</div>
          </div>

          {/* 전문가 응답 */}
          {result.expert_responses.length > 0 && (
            <div className="grid grid-cols-1 gap-3">
              {result.expert_responses.map((er) => (
                <div key={er.role_key} className="card p-4">
                  <div className={`text-xs font-bold mb-2 ${ROLE_COLORS[er.role_key]?.split(' ')[0] || 'text-slate-400'}`}>
                    {er.role}
                  </div>
                  <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{er.response}</div>
                </div>
              ))}
            </div>
          )}

          {/* 최종 종합 */}
          <div className="card p-4 border border-indigo-500/30">
            <div className="text-xs font-bold text-indigo-400 mb-2 flex items-center gap-1">
              <GitMerge size={12} /> CEO 종합 보고
            </div>
            <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{result.final_summary}</div>
          </div>
        </div>
      )}
    </div>
  )
}
